import http from 'k6/http';
import { check } from 'k6';
import { makeHandleSummary } from './summary.js';
import {
  BASE_URL,
  CATEGORIES,
  SEARCH_KEYWORDS,
  pickListPage,
  pick,
} from './config.js';

export const handleSummary = makeHandleSummary('profile-mix');

// Mixed read-heavy workload for the PGO profiling run.
// IMPORTANT: this must mirror the traffic shape you will benchmark with.
// If you profile one mix and benchmark a different one, PGO can hurt you.
//
// Mix rationale:
//   ticker  — cheap read, high RPS, exercises controller + Jackson hot path
//   list    — paginated DB read, exercises JPA + pageable + serialization
//   search  — fulltext, exercises QueryDSL path
//
// Default rates target roughly 70 RPS total on small app-direct benchmark boxes
// such as 2 vCPU / 2 GB EC2 instances. Scale them with env vars once you find
// the stable comparison point for your current build.

export const options = {
  scenarios: {
    ticker: {
      executor: 'constant-arrival-rate',
      exec: 'ticker',
      rate: Number(__ENV.TICKER_RPS || 12),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.TICKER_PRE_VUS || 8),
      maxVUs: Number(__ENV.TICKER_MAX_VUS || 32),
      tags: { endpoint: 'ticker' },
    },
    listMain: {
      executor: 'constant-arrival-rate',
      exec: 'listMain',
      rate: Number(__ENV.LIST_MAIN_RPS || 45),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.LIST_MAIN_PRE_VUS || 16),
      maxVUs: Number(__ENV.LIST_MAIN_MAX_VUS || 64),
      tags: { endpoint: 'list_main' },
    },
    listCategory: {
      executor: 'constant-arrival-rate',
      exec: 'listCategory',
      rate: Number(__ENV.LIST_CATEGORY_RPS || 7),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.LIST_CATEGORY_PRE_VUS || 6),
      maxVUs: Number(__ENV.LIST_CATEGORY_MAX_VUS || 24),
      tags: { endpoint: 'list_category' },
    },
    search: {
      executor: 'constant-arrival-rate',
      exec: 'search',
      rate: Number(__ENV.SEARCH_RPS || 6),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.SEARCH_PRE_VUS || 6),
      maxVUs: Number(__ENV.SEARCH_MAX_VUS || 24),
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
  check(res, { 'ticker 200': (r) => r.status === 200 });
}

export function listMain() {
  const page = pickListPage();
  const res = http.get(
    `${BASE_URL}/api/articles?page=${page}&size=9`,
    { tags: { endpoint: 'list_main' } },
  );
  check(res, { 'list main 200': (r) => r.status === 200 });
}

export function listCategory() {
  const category = pick(CATEGORIES);
  const page = pickListPage();
  const res = http.get(
    `${BASE_URL}/api/articles?category=${category}&page=${page}&size=9`,
    { tags: { endpoint: 'list_category' } },
  );
  check(res, { 'list category 200': (r) => r.status === 200 });
}

export function search() {
  const q = pick(SEARCH_KEYWORDS);
  const page = Math.floor(Math.random() * 3);
  const res = http.get(
    `${BASE_URL}/api/articles/search/fulltext?q=${encodeURIComponent(q)}&page=${page}&size=20`,
    { tags: { endpoint: 'search' } },
  );
  check(res, { 'search 200': (r) => r.status === 200 });
}
