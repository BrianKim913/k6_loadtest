import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 20 },
        { duration: '5s',  target: 20 },
        { duration: '5s', target: 0 },
      ],
      // stages: [
      //   { duration: '30s', target: 20 },
      //   { duration: '5m',  target: 20 },
      //   { duration: '30s', target: 0 },
      // ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<200', 'p(99)<400'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/articles/trending-ticker?limit=20`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
