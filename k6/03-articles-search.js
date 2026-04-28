import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, SEARCH_KEYWORDS, pick, pickListPage } from './config.js';

// Fulltext search load — exercises the slow path:
//   summary_ko_title / summary_ko_body / title_en  with `LIKE '%kw%'`
// Title has only a B-tree index (useless for leading-wildcard LIKE), and body
// has no index at all, so every request triggers a Seq Scan on `articles`.
// Each request also evaluates the same WHERE twice (content + count).
//
// Tunables (env vars):
//   FULLTEXT_RPS         (default 15)  — sustained requests per second
//   FULLTEXT_PRE_VUS     (default 30)
//   FULLTEXT_MAX_VUS     (default 200)
//   DURATION             (default 5m)

export const options = {
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'min', 'max', 'avg'],
  scenarios: {
    fulltext: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.FULLTEXT_RPS || 15),
      timeUnit: '1s',
      duration: __ENV.DURATION || '5m',
      preAllocatedVUs: Number(__ENV.FULLTEXT_PRE_VUS || 30),
      maxVUs: Number(__ENV.FULLTEXT_MAX_VUS || 200),
      gracefulStop: '0s',
      tags: { endpoint: 'fulltext' },
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

export default function () {
  const q = pick(SEARCH_KEYWORDS);
  const page = pickListPage();
  const url = `${BASE_URL}/api/articles/search/fulltext?q=${encodeURIComponent(q)}&page=${page}&size=20`;
  const res = http.get(url, { tags: { endpoint: 'fulltext' } });
  check(res, {
    'status 200': (r) => r.status === 200,
    'has content field': (r) => r.json('content') !== undefined,
  });
}
