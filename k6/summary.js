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

function barWidth(value, max) {
  if (!max || max <= 0) return '0%';
  return `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
}

function endpointRow(data, metricName, label) {
  const duration = safeMetric(data, `http_req_duration{endpoint:${metricName}}`);
  const requests = safeMetric(data, `http_reqs{endpoint:${metricName}}`);
  const failures = safeMetric(data, `http_req_failed{endpoint:${metricName}}`);

  return {
    label,
    rps: safeValue(requests, 'rate'),
    total: safeValue(requests, 'count'),
    p50: safeValue(duration, 'med'),
    p95: safeValue(duration, 'p(95)'),
    p99: safeValue(duration, 'p(99)'),
    max: safeValue(duration, 'max'),
    errorRate: safeValue(failures, 'rate'),
  };
}

function buildBenchmark(data) {
  const rows = [
    endpointRow(data, 'list_main', 'Articles List Main'),
    endpointRow(data, 'list_category', 'Articles List Category'),
    endpointRow(data, 'ticker', 'Trending Ticker'),
    endpointRow(data, 'search', 'Articles Search'),
  ];

  const httpReqs = safeMetric(data, 'http_reqs');
  const httpReqDuration = safeMetric(data, 'http_req_duration');
  const httpReqFailed = safeMetric(data, 'http_req_failed');
  const iterationDuration = safeMetric(data, 'iteration_duration');

  return {
    buildLabel: __ENV.BUILD_LABEL || 'unknown-build',
    runName: __ENV.RUN_NAME || 'profile-mix',
    baseUrl: __ENV.BASE_URL || 'http://devport.kr',
    duration: data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs : 0,
    totals: {
      rps: safeValue(httpReqs, 'rate'),
      requests: safeValue(httpReqs, 'count'),
      errorRate: safeValue(httpReqFailed, 'rate'),
      p50: safeValue(httpReqDuration, 'med'),
      p95: safeValue(httpReqDuration, 'p(95)'),
      p99: safeValue(httpReqDuration, 'p(99)'),
      max: safeValue(httpReqDuration, 'max'),
      iterP95: safeValue(iterationDuration, 'p(95)'),
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

export function makeHandleSummary(prefix = 'profile-mix') {
  return function handleSummary(data) {
    const report = buildBenchmark(data);
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
        '',
      ].join('\n'),
      [`${base}.json`]: JSON.stringify(report, null, 2),
      [`${base}.html`]: renderHtml(report),
    };
  };
}
