import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, SEARCH_KEYWORDS, pick } from './config.js';

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '5m',  target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

export default function () {
  const q = pick(SEARCH_KEYWORDS);
  const page = Math.floor(Math.random() * 3);
  const url = `${BASE_URL}/api/articles/search/fulltext?q=${encodeURIComponent(q)}&page=${page}&size=20`;
  const res = http.get(url);
  check(res, { 'status 200': (r) => r.status === 200 });
}
