import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, pickAutocompletePrefix } from './config.js';

// Autocomplete load — fires per-keystroke, so RPS is intentionally higher
// than the fulltext scenario. Each request runs the same slow LIKE '%kw%'
// WHERE clause TWICE (top-5 fetch + total count), so this scenario amplifies
// the seq-scan cost more sharply than the fulltext one.
//
// Threshold reflects UX expectation: dropdown must feel instant.
//
// Tunables (env vars):
//   AUTOCOMPLETE_RPS       (default 50)
//   AUTOCOMPLETE_PRE_VUS   (default 50)
//   AUTOCOMPLETE_MAX_VUS   (default 400)
//   DURATION               (default 3m)

export const options = {
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'p(99)', 'min', 'max', 'avg'],
  scenarios: {
    autocomplete: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.AUTOCOMPLETE_RPS || 50),
      timeUnit: '1s',
      duration: __ENV.DURATION || '3m',
      preAllocatedVUs: Number(__ENV.AUTOCOMPLETE_PRE_VUS || 50),
      maxVUs: Number(__ENV.AUTOCOMPLETE_MAX_VUS || 400),
      gracefulStop: '0s',
      tags: { endpoint: 'autocomplete' },
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<150', 'p(99)<300'],
  },
};

export default function () {
  const q = pickAutocompletePrefix();
  const url = `${BASE_URL}/api/articles/autocomplete?q=${encodeURIComponent(q)}`;
  const res = http.get(url, { tags: { endpoint: 'autocomplete' } });
  check(res, {
    'status 200': (r) => r.status === 200,
    'has suggestions': (r) => r.json('suggestions') !== undefined,
    'has totalMatches': (r) => r.json('totalMatches') !== undefined,
  });
}
