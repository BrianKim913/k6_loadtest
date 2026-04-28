#!/usr/bin/env node
// Re-render the HTML/JSON report from an existing k6 --summary-export JSON,
// using the same summary.js logic that handleSummary uses at run time.
//
// Usage:
//   node scripts/rerender_summary.mjs <input.json> [--prefix=search-mix] \
//        [--build-label=jvm] [--run-name=search-mix] [--base-url=http://...]
//
// Endpoint mapping is auto-selected from --prefix:
//   profile-mix → list_main / list_category / ticker / search
//   search-mix  → autocomplete / fulltext
//
// Outputs:
//   results/<prefix>-<build-label>.html
//   results/<prefix>-<build-label>.json

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scripts/rerender_summary.mjs <input.json> [--prefix=...] [--build-label=...] [--run-name=...] [--base-url=...]');
  process.exit(1);
}

const inputPath = args[0];
const flags = Object.fromEntries(
  args.slice(1)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    })
);

const prefix = flags.prefix || 'search-mix';
const buildLabel = flags['build-label'] || 'unknown-build';
const runName = flags['run-name'] || prefix;
const baseUrl = flags['base-url'] || 'http://devport.kr';

const ENDPOINT_PRESETS = {
  'profile-mix': [
    { metric: 'list_main', label: 'Articles List Main' },
    { metric: 'list_category', label: 'Articles List Category' },
    { metric: 'ticker', label: 'Trending Ticker' },
    { metric: 'search', label: 'Articles Search' },
  ],
  'search-mix': [
    { metric: 'autocomplete', label: 'Autocomplete' },
    { metric: 'fulltext', label: 'Fulltext Search' },
  ],
};

const endpoints = ENDPOINT_PRESETS[prefix] || ENDPOINT_PRESETS['search-mix'];

// summary.js references __ENV (k6 global). Mock it for plain node.
globalThis.__ENV = { BUILD_LABEL: buildLabel, RUN_NAME: runName, BASE_URL: baseUrl };

const summaryPath = pathToFileURL(path.resolve('k6/summary.js')).href;
const summary = await import(summaryPath);

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// Heuristic guard — handleSummary expects the post-test summary shape, not
// the per-event NDJSON written by `--out json=...`.
if (!data.metrics || typeof data.metrics !== 'object') {
  console.error('Input JSON has no `metrics` object — this looks like a per-event JSON');
  console.error('(from --out json=...), not a summary export. Cannot re-render.');
  process.exit(2);
}

const handler = summary.makeHandleSummary(prefix, endpoints);
const result = handler(data);

const resultsDir = 'results';
fs.mkdirSync(resultsDir, { recursive: true });

for (const [outPath, content] of Object.entries(result)) {
  if (outPath === 'stdout') {
    process.stdout.write(content);
    continue;
  }
  fs.writeFileSync(outPath, content);
  console.log(`wrote ${outPath}`);
}
