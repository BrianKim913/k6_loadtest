import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, pickListPage } from './config.js';

export const options = {
  scenarios: {
    ramp: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.LIST_MAIN_RPS || 30),
      timeUnit: '1s',
      duration: __ENV.DURATION || '6m',
      preAllocatedVUs: Number(__ENV.LIST_MAIN_PRE_VUS || 20),
      maxVUs: Number(__ENV.LIST_MAIN_MAX_VUS || 100),
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<400', 'p(99)<800'],
  },
};

export default function () {
  const page = pickListPage();
  const url = `${BASE_URL}/api/articles?page=${page}&size=9`;
  const res = http.get(url);
  check(res, { 'status 200': (r) => r.status === 200 });
}
