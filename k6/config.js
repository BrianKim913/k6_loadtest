export const BASE_URL = __ENV.BASE_URL || 'http://devport.kr';

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const SEARCH_KEYWORDS = [
  'react', 'python', 'kubernetes', 'llm', 'docker',
  'rust', 'typescript', 'postgres', 'ai', 'agent',
  'golang', 'vector', 'embedding', 'redis', 'graphql',
];

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
