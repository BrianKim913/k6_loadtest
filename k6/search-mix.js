import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { makeHandleSummary } from './summary.js';
import {
  BASE_URL,
  SEARCH_KEYWORDS,
  pick,
  pickListPage,
  pickAutocompletePrefix,
} from './config.js';

// Search-only mixed workload — exercises the two slow article search APIs
// in their realistic call ratio:
//   autocomplete  — fires per keystroke, dominates volume
//   fulltext      — fires once when the user submits, lower volume
//
// Both endpoints hit the same slow path (LIKE '%kw%' + Seq Scan on `articles`),
// but autocomplete amplifies the cost: same WHERE clause is evaluated TWICE
// per request (top-5 fetch + total count).
//
// Default rates (autocomplete:fulltext ≈ 5:1) mirror typical search UX traffic
// where every dropdown keystroke beats the DB but only one in N actually
// commits to a fulltext search. Tune via env vars below.

export const handleSummary = makeHandleSummary('search-mix', [
  { metric: 'autocomplete', label: 'Autocomplete' },
  { metric: 'fulltext', label: 'Fulltext Search' },
]);

const KNOWN_ENDPOINTS = ['autocomplete', 'fulltext'];
const KNOWN_STATUSES = ['200', '400', '401', '403', '404', '429', '500', '502', '503', '504'];
const statusCounters = {};

for (const endpoint of KNOWN_ENDPOINTS) {
  for (const status of KNOWN_STATUSES) {
    statusCounters[`${endpoint}_${status}`] = new Counter(`response_status_${endpoint}_${status}`);
  }
}

function recordStatus(endpoint, res) {
  const status = String(res.status);
  const counter = statusCounters[`${endpoint}_${status}`];
  if (counter) {
    counter.add(1);
  }
}

export const options = {
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'min', 'max', 'avg'],
  scenarios: {
    autocomplete: {
      executor: 'constant-arrival-rate',
      exec: 'autocomplete',
      rate: Number(__ENV.AUTOCOMPLETE_RPS || 50),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.AUTOCOMPLETE_PRE_VUS || 50),
      maxVUs: Number(__ENV.AUTOCOMPLETE_MAX_VUS || 400),
      gracefulStop: '0s',
      tags: { endpoint: 'autocomplete' },
    },
    fulltext: {
      executor: 'constant-arrival-rate',
      exec: 'fulltext',
      rate: Number(__ENV.FULLTEXT_RPS || 10),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.FULLTEXT_PRE_VUS || 30),
      maxVUs: Number(__ENV.FULLTEXT_MAX_VUS || 200),
      gracefulStop: '0s',
      tags: { endpoint: 'fulltext' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:autocomplete}': ['p(95)<150', 'p(99)<300'],
    'http_req_duration{endpoint:fulltext}':     ['p(95)<800', 'p(99)<1500'],
  },
};

export function autocomplete() {
  const q = pickAutocompletePrefix();
  const res = http.get(
    `${BASE_URL}/api/articles/autocomplete?q=${encodeURIComponent(q)}`,
    { tags: { endpoint: 'autocomplete' } },
  );
  recordStatus('autocomplete', res);
  check(res, {
    'autocomplete 200': (r) => r.status === 200,
    'autocomplete has suggestions': (r) => r.json('suggestions') !== undefined,
  });
}

export function fulltext() {
  const q = pick(SEARCH_KEYWORDS);
  const page = pickListPage();
  const res = http.get(
    `${BASE_URL}/api/articles/search/fulltext?q=${encodeURIComponent(q)}&page=${page}&size=20`,
    { tags: { endpoint: 'fulltext' } },
  );
  recordStatus('fulltext', res);
  check(res, {
    'fulltext 200': (r) => r.status === 200,
    'fulltext has content': (r) => r.json('content') !== undefined,
  });
}
