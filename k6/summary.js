function safeMetric(data, name) {
  return data.metrics && data.metrics[name] ? data.metrics[name] : null;
}

function safeValue(metric, key, fallback = 0) {
  if (!metric || !metric.values || metric.values[key] === undefined || metric.values[key] === null) {
    return fallback;
  }
  return metric.values[key];
}

function fmtNumber(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function fmtPercent(value) {
  return `${fmtNumber((value || 0) * 100, 2)}%`;
}

function formatStatusCounts(statusCounts) {
  const entries = Object.entries(statusCounts);
  if (!entries.length) {
    return '-';
  }

  return entries
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([status, count]) => `${status}:${count}`)
    .join(' ');
}

function barWidth(value, max) {
  if (!max || max <= 0) return '0%';
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
}

function collectStatusCounts(data, endpoint) {
  const counts = {};
  const knownStatuses = ['200', '400', '401', '403', '404', '429', '500', '502', '503', '504'];

  for (const status of knownStatuses) {
    const metric = safeMetric(data, `response_status_${endpoint}_${status}`);
    const count = safeValue(metric, 'count');
    if (count > 0) {
      counts[status] = count;
    }
  }

  return counts;
}

function endpointRow(data, metricName, label, durationMs) {
  const duration = safeMetric(data, `http_req_duration{endpoint:${metricName}}`);
  const requests = safeMetric(data, `http_reqs{endpoint:${metricName}}`);
  const failures = safeMetric(data, `http_req_failed{endpoint:${metricName}}`);
  const statusCounts = collectStatusCounts(data, metricName);

  const totalFromStatus = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const errorCountFromStatus = Object.entries(statusCounts)
    .filter(([status]) => Number(status) >= 400)
    .reduce((sum, [, count]) => sum + count, 0);
  const total = safeValue(requests, 'count') || totalFromStatus;
  const rps = safeValue(requests, 'rate') || (durationMs > 0 ? total / (durationMs / 1000) : 0);
  const errorRate = safeValue(failures, 'rate') || (total > 0 ? errorCountFromStatus / total : 0);

  return {
    label,
    rps,
    total,
    p50: safeValue(duration, 'med'),
    p95: safeValue(duration, 'p(95)'),
    p99: safeValue(duration, 'p(99)'),
    max: safeValue(duration, 'max'),
    errorRate,
    statusCounts,
    statusSummary: formatStatusCounts(statusCounts),
  };
}

const DEFAULT_ENDPOINTS = [
  { metric: 'list_main', label: 'Articles List Main' },
  { metric: 'list_category', label: 'Articles List Category' },
  { metric: 'ticker', label: 'Trending Ticker' },
  { metric: 'search', label: 'Articles Search' },
];

function buildBenchmark(data, endpoints, runName) {
  const durationMs = data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs : 0;
  const rows = endpoints.map(({ metric, label }) =>
    endpointRow(data, metric, label, durationMs)
  );

  const httpReqs = safeMetric(data, 'http_reqs');
  const httpReqDuration = safeMetric(data, 'http_req_duration');
  const httpReqFailed = safeMetric(data, 'http_req_failed');
  const iterationDuration = safeMetric(data, 'iteration_duration');
  const overallStatusCounts = {};

  for (const row of rows) {
    for (const [status, count] of Object.entries(row.statusCounts)) {
      overallStatusCounts[status] = (overallStatusCounts[status] || 0) + count;
    }
  }

  return {
    buildLabel: __ENV.BUILD_LABEL || 'unknown-build',
    runName: __ENV.RUN_NAME || runName,
    baseUrl: __ENV.BASE_URL || 'http://devport.kr',
    duration: durationMs,
    totals: {
      rps: safeValue(httpReqs, 'rate'),
      requests: safeValue(httpReqs, 'count'),
      errorRate: safeValue(httpReqFailed, 'rate'),
      p50: safeValue(httpReqDuration, 'med'),
      p95: safeValue(httpReqDuration, 'p(95)'),
      p99: safeValue(httpReqDuration, 'p(99)'),
      max: safeValue(httpReqDuration, 'max'),
      iterP95: safeValue(iterationDuration, 'p(95)'),
      statusCounts: overallStatusCounts,
      statusSummary: formatStatusCounts(overallStatusCounts),
    },
    endpoints: rows,
    thresholds: data.root_group && data.root_group.checks ? data.root_group.checks : [],
  };
}

function renderTableRows(rows) {
  return rows.map((row) => `
    <tr>
      <td>${row.label}</td>
      <td>${fmtNumber(row.rps)}</td>
      <td>${fmtNumber(row.total, 0)}</td>
      <td>${fmtNumber(row.p50)} ms</td>
      <td>${fmtNumber(row.p95)} ms</td>
      <td>${fmtNumber(row.p99)} ms</td>
      <td>${fmtPercent(row.errorRate)}</td>
      <td>${row.statusSummary}</td>
    </tr>
  `).join('');
}

function renderRpsChart(rows) {
  const maxRps = Math.max(...rows.map((row) => row.rps), 1);
  return rows.map((row) => `
    <div class="chart-row">
      <div class="chart-label">${row.label}</div>
      <div class="bar-wrap">
        <div class="bar rps" style="width:${barWidth(row.rps, maxRps)}"></div>
      </div>
      <div class="chart-value">${fmtNumber(row.rps)} RPS</div>
    </div>
  `).join('');
}

function renderLatencyChart(rows) {
  const maxP95 = Math.max(...rows.map((row) => row.p95), 1);
  return rows.map((row) => `
    <div class="chart-row">
      <div class="chart-label">${row.label}</div>
      <div class="bar-wrap">
        <div class="bar latency" style="width:${barWidth(row.p95, maxP95)}"></div>
      </div>
      <div class="chart-value">${fmtNumber(row.p95)} ms p95</div>
    </div>
  `).join('');
}

function renderHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>k6 Benchmark Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 32px;
      color: #111827;
      background: #f8fafc;
    }
    h1, h2 { margin: 0 0 12px; }
    p { margin: 4px 0; }
    .meta, .panel {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .stat {
      background: #f8fafc;
      border-radius: 10px;
      padding: 14px;
    }
    .stat-label {
      color: #6b7280;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      margin-top: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }
    th {
      color: #4b5563;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .chart-row {
      display: grid;
      grid-template-columns: 180px 1fr 120px;
      gap: 12px;
      align-items: center;
      margin: 10px 0;
    }
    .chart-label, .chart-value {
      font-size: 14px;
    }
    .bar-wrap {
      height: 18px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar {
      height: 100%;
      border-radius: 999px;
    }
    .bar.rps { background: linear-gradient(90deg, #0f766e, #14b8a6); }
    .bar.latency { background: linear-gradient(90deg, #b45309, #f59e0b); }
  </style>
</head>
<body>
  <div class="meta">
    <h1>k6 Benchmark Report</h1>
    <p><strong>Build:</strong> ${report.buildLabel}</p>
    <p><strong>Run:</strong> ${report.runName}</p>
    <p><strong>Base URL:</strong> ${report.baseUrl}</p>
    <p><strong>Duration:</strong> ${fmtNumber(report.duration / 1000)} s</p>
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Total RPS</div>
        <div class="stat-value">${fmtNumber(report.totals.rps)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">P95</div>
        <div class="stat-value">${fmtNumber(report.totals.p95)} ms</div>
      </div>
      <div class="stat">
        <div class="stat-label">P99</div>
        <div class="stat-value">${fmtNumber(report.totals.p99)} ms</div>
      </div>
      <div class="stat">
        <div class="stat-label">Error Rate</div>
        <div class="stat-value">${fmtPercent(report.totals.errorRate)}</div>
      </div>
    </div>
    <p><strong>Status Counts:</strong> ${report.totals.statusSummary}</p>
  </div>

  <div class="panel">
    <h2>Endpoint Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>RPS</th>
          <th>Total Requests</th>
          <th>P50</th>
          <th>P95</th>
          <th>P99</th>
          <th>Error Rate</th>
          <th>Status Counts</th>
        </tr>
      </thead>
      <tbody>
        ${renderTableRows(report.endpoints)}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Throughput by Endpoint</h2>
    ${renderRpsChart(report.endpoints)}
  </div>

  <div class="panel">
    <h2>P95 Latency by Endpoint</h2>
    ${renderLatencyChart(report.endpoints)}
  </div>
</body>
</html>`;
}

export function makeHandleSummary(prefix = 'profile-mix', endpoints = DEFAULT_ENDPOINTS) {
  return function handleSummary(data) {
    const report = buildBenchmark(data, endpoints, prefix);
    const base = `results/${prefix}-${report.buildLabel}`;

    return {
      stdout: [
        '',
        `Benchmark report: ${report.runName} / ${report.buildLabel}`,
        `Base URL: ${report.baseUrl}`,
        `Total RPS: ${fmtNumber(report.totals.rps)}`,
        `Total requests: ${fmtNumber(report.totals.requests, 0)}`,
        `P95: ${fmtNumber(report.totals.p95)} ms`,
        `P99: ${fmtNumber(report.totals.p99)} ms`,
        `Error rate: ${fmtPercent(report.totals.errorRate)}`,
        `Status counts: ${report.totals.statusSummary}`,
        ...report.endpoints.map((row) => `${row.label} statuses: ${row.statusSummary}`),
        '',
      ].join('\n'),
      [`${base}.json`]: JSON.stringify(report, null, 2),
      [`${base}.html`]: renderHtml(report),
    };
  };
}
