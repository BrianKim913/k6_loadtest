import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, CATEGORIES, pick, pickListPage } from './config.js';

export const options = {
  scenarios: {
    ramp: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.LIST_CATEGORY_RPS || 12),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.LIST_CATEGORY_PRE_VUS || 10),
      maxVUs: Number(__ENV.LIST_CATEGORY_MAX_VUS || 60),
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<400', 'p(99)<800'],
  },
};

export default function () {
  const category = pick(CATEGORIES);
  const page = pickListPage();
  const url = `${BASE_URL}/api/articles?category=${category}&page=${page}&size=9`;
  const res = http.get(url);
  check(res, { 'status 200': (r) => r.status === 200 });
}
