export const BASE_URL = __ENV.BASE_URL || 'http://devport.kr';

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const SEARCH_KEYWORDS = [
  'react', 'python', 'kubernetes', 'llm', 'docker',
  'rust', 'typescript', 'postgres', 'ai', 'agent',
  'golang', 'vector', 'embedding', 'redis', 'graphql',
  '리액트', '파이썬', '쿠버네티스', '도커', '인공지능',
  '머신러닝', '백엔드', '클라우드', '데이터베이스', '오픈소스',
];

export const AUTOCOMPLETE_KEYWORDS = SEARCH_KEYWORDS;

export const CATEGORIES = ['AI_LLM', 'DEVOPS_SRE', 'BACKEND', 'INFRA_CLOUD', 'OTHER'];

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickListPage() {
  const r = Math.random();

  if (r < 0.50) return 0;
  if (r < 0.75) return 1;
  if (r < 0.90) return 2;
  return 3 + Math.floor(Math.random() * 2);
}

// Simulate keystroke-style autocomplete traffic: pick a keyword, then take a
// random prefix of length >= 2 (the controller rejects shorter queries with
// 400). This produces a realistic mix of partial and full queries instead of
// always sending the full word.
export function pickAutocompletePrefix() {
  const word = pick(AUTOCOMPLETE_KEYWORDS);
  const minLen = 2;
  if (word.length <= minLen) return word;
  const len = minLen + Math.floor(Math.random() * (word.length - minLen + 1));
  return word.slice(0, len);
}
