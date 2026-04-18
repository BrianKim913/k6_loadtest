import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { makeHandleSummary } from './summary.js';
import {
  BASE_URL,
  CATEGORIES,
  SEARCH_KEYWORDS,
  pickListPage,
  pick,
} from './config.js';

export const handleSummary = makeHandleSummary('profile-mix');
const KNOWN_ENDPOINTS = ['list_main', 'list_category', 'ticker', 'search'];
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

// Mixed read-heavy workload for the PGO profiling run.
// IMPORTANT: this must mirror the traffic shape you will benchmark with.
// If you profile one mix and benchmark a different one, PGO can hurt you.
//
// Mix rationale:
//   ticker  — cheap read, high RPS, exercises controller + Jackson hot path
//   list    — paginated DB read, exercises JPA + pageable + serialization
//   search  — fulltext, exercises QueryDSL path
//
// Default rates target roughly 50 RPS total on small app-direct benchmark boxes
// such as 2 vCPU / 2 GB EC2 instances. Scale them with env vars once you find
// the stable comparison point for your current build.

export const options = {
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'min', 'max', 'avg'],
  scenarios: {
    ticker: {
      executor: 'constant-arrival-rate',
      exec: 'ticker',
      rate: Number(__ENV.TICKER_RPS || 9),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.TICKER_PRE_VUS || 8),
      maxVUs: Number(__ENV.TICKER_MAX_VUS || 32),
      gracefulStop: '0s',
      tags: { endpoint: 'ticker' },
    },
    listMain: {
      executor: 'constant-arrival-rate',
      exec: 'listMain',
      rate: Number(__ENV.LIST_MAIN_RPS || 32),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.LIST_MAIN_PRE_VUS || 16),
      maxVUs: Number(__ENV.LIST_MAIN_MAX_VUS || 64),
      gracefulStop: '0s',
      tags: { endpoint: 'list_main' },
    },
    listCategory: {
      executor: 'constant-arrival-rate',
      exec: 'listCategory',
      rate: Number(__ENV.LIST_CATEGORY_RPS || 5),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.LIST_CATEGORY_PRE_VUS || 6),
      maxVUs: Number(__ENV.LIST_CATEGORY_MAX_VUS || 24),
      gracefulStop: '0s',
      tags: { endpoint: 'list_category' },
    },
    search: {
      executor: 'constant-arrival-rate',
      exec: 'search',
      rate: Number(__ENV.SEARCH_RPS || 4),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.SEARCH_PRE_VUS || 6),
      maxVUs: Number(__ENV.SEARCH_MAX_VUS || 24),
      gracefulStop: '0s',
      tags: { endpoint: 'search' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:ticker}': ['p(99)<500'],
    'http_req_duration{endpoint:list_main}': ['p(99)<1000'],
    'http_req_duration{endpoint:list_category}': ['p(99)<1000'],
    'http_req_duration{endpoint:search}': ['p(99)<2000'],
  },
};

export function ticker() {
  const res = http.get(`${BASE_URL}/api/articles/trending-ticker?limit=20`,
    { tags: { endpoint: 'ticker' } });
  recordStatus('ticker', res);
  check(res, { 'ticker 200': (r) => r.status === 200 });
}

export function listMain() {
  const page = pickListPage();
  const res = http.get(
    `${BASE_URL}/api/articles?page=${page}&size=9`,
    { tags: { endpoint: 'list_main' } },
  );
  recordStatus('list_main', res);
  check(res, { 'list main 200': (r) => r.status === 200 });
}

export function listCategory() {
  const category = pick(CATEGORIES);
  const page = pickListPage();
  const res = http.get(
    `${BASE_URL}/api/articles?category=${category}&page=${page}&size=9`,
    { tags: { endpoint: 'list_category' } },
  );
  recordStatus('list_category', res);
  check(res, { 'list category 200': (r) => r.status === 200 });
}

export function search() {
  const q = pick(SEARCH_KEYWORDS);
  const page = Math.floor(Math.random() * 3);
  const res = http.get(
    `${BASE_URL}/api/articles/search/fulltext?q=${encodeURIComponent(q)}&page=${page}&size=20`,
    { tags: { endpoint: 'search' } },
  );
  recordStatus('search', res);
  check(res, { 'search 200': (r) => r.status === 200 });
}
