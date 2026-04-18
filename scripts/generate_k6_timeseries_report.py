#!/usr/bin/env python3

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def parse_time(value):
    value = value.strip()
    match = re.match(
        r"^(?P<date>\d{4}-\d{2}-\d{2})T"
        r"(?P<time>\d{2}:\d{2}:\d{2})"
        r"(?:\.(?P<fraction>\d+))?"
        r"(?P<tz>Z|[+-]\d{2}:\d{2})$",
        value,
    )
    if not match:
        raise ValueError(f"Unsupported timestamp format: {value}")

    fraction = (match.group("fraction") or "0")[:6].ljust(6, "0")
    timezone = "+0000" if match.group("tz") == "Z" else match.group("tz").replace(":", "")
    normalized = f"{match.group('date')}T{match.group('time')}.{fraction}{timezone}"
    return datetime.strptime(normalized, "%Y-%m-%dT%H:%M:%S.%f%z")


def load_series(input_path, bucket_ms=100):
    total_counts = defaultdict(int)
    endpoint_counts = defaultdict(lambda: defaultdict(int))
    first_ts = None
    last_ts = None
    total_requests = 0

    with input_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue

            row = json.loads(line)
            if row.get("type") != "Point" or row.get("metric") != "http_reqs":
                continue

            data = row.get("data", {})
            timestamp = data.get("time")
            if not timestamp:
                continue

            dt = parse_time(timestamp)
            bucket = (int(dt.timestamp() * 1000) // bucket_ms) * bucket_ms
            total_counts[bucket] += 1
            total_requests += 1

            endpoint = (data.get("tags") or {}).get("endpoint")
            if endpoint:
                endpoint_counts[endpoint][bucket] += 1

            if first_ts is None or dt < first_ts:
                first_ts = dt
            if last_ts is None or dt > last_ts:
                last_ts = dt

    if first_ts is None or last_ts is None:
        raise ValueError("No http_reqs points found in the input file.")

    start_bucket = (int(first_ts.timestamp() * 1000) // bucket_ms) * bucket_ms
    end_bucket = (int(last_ts.timestamp() * 1000) // bucket_ms) * bucket_ms
    buckets = list(range(start_bucket, end_bucket + bucket_ms, bucket_ms))
    bucket_sec = bucket_ms / 1000
    labels = [round((b - start_bucket) / 1000, 3) for b in buckets]

    # Scale counts to RPS (counts per bucket → requests per second)
    scale = 1000 / bucket_ms
    total_series = [round(total_counts.get(b, 0) * scale, 2) for b in buckets]

    endpoint_series = {}
    for endpoint, counts in sorted(endpoint_counts.items()):
        endpoint_series[endpoint] = [round(counts.get(b, 0) * scale, 2) for b in buckets]

    duration_seconds = (end_bucket - start_bucket) / 1000 + bucket_sec

    return {
        "labels": labels,
        "total_series": total_series,
        "endpoint_series": endpoint_series,
        "start_iso": first_ts.isoformat(),
        "end_iso": last_ts.isoformat(),
        "duration_seconds": round(duration_seconds, 1),
        "total_requests": total_requests,
        "avg_rps": round(total_requests / max(duration_seconds, 1), 2),
        "peak_rps": max(total_series) if total_series else 0,
    }


def moving_average(values, window):
    if window <= 1:
        return values

    averaged = []
    running_sum = 0.0
    for index, value in enumerate(values):
        running_sum += value
        if index >= window:
            running_sum -= values[index - window]
        width = min(index + 1, window)
        averaged.append(round(running_sum / width, 2))
    return averaged


def build_report(dataset, build_label, run_name):
    total_smoothed = moving_average(dataset["total_series"], 5)
    endpoint_smoothed = {
        endpoint: moving_average(series, 5)
        for endpoint, series in dataset["endpoint_series"].items()
    }

    return {
        "build_label": build_label,
        "run_name": run_name,
        "labels": dataset["labels"],
        "total_series": dataset["total_series"],
        "total_smoothed": total_smoothed,
        "endpoint_series": endpoint_smoothed,
        "start_iso": dataset["start_iso"],
        "end_iso": dataset["end_iso"],
        "duration_seconds": dataset["duration_seconds"],
        "total_requests": dataset["total_requests"],
        "avg_rps": round(dataset["avg_rps"], 2),
        "peak_rps": dataset["peak_rps"],
    }


def render_html(report):
    payload = json.dumps(report, separators=(",", ":"))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>k6 RPS Over Time</title>
  <style>
    :root {{
      --bg: #060606;
      --panel: #101010;
      --grid: rgba(255, 255, 255, 0.14);
      --text: #f5f5f5;
      --muted: #a3a3a3;
      --accent: #f4df45;
      --fill: rgba(244, 223, 69, 0.42);
      --line2: #6ee7b7;
      --line3: #60a5fa;
      --line4: #fb7185;
      --line5: #c084fc;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 24px;
      font-family: "SF Pro Display", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }}
    .wrap {{
      max-width: 1280px;
      margin: 0 auto;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-end;
      margin-bottom: 20px;
    }}
    .title {{
      font-size: 30px;
      font-weight: 700;
      margin: 0 0 6px;
    }}
    .subtitle {{
      color: var(--muted);
      margin: 0;
    }}
    .stats {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }}
    .stat {{
      background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 16px;
    }}
    .stat-label {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }}
    .stat-value {{
      font-size: 28px;
      font-weight: 700;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 18px 18px 12px;
      margin-bottom: 18px;
    }}
    .panel h2 {{
      margin: 0 0 14px;
      font-size: 18px;
      font-weight: 600;
    }}
    .legend {{
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin: 0 0 10px;
      color: var(--muted);
      font-size: 13px;
    }}
    .legend span {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }}
    .legend i {{
      width: 12px;
      height: 12px;
      border-radius: 999px;
      display: inline-block;
    }}
    svg {{
      width: 100%;
      height: auto;
      display: block;
    }}
    .footer {{
      color: var(--muted);
      font-size: 13px;
      margin-top: 10px;
    }}
    @media (max-width: 860px) {{
      body {{ padding: 16px; }}
      .header {{ display: block; }}
      .stats {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <h1 class="title">{escape_html(report["build_label"])} RPS Over Time</h1>
        <p class="subtitle">{escape_html(report["run_name"])} | {escape_html(report["start_iso"])} to {escape_html(report["end_iso"])}</p>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Average RPS</div>
        <div class="stat-value">{report["avg_rps"]}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Peak RPS</div>
        <div class="stat-value">{report["peak_rps"]}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Duration</div>
        <div class="stat-value">{report["duration_seconds"]}s</div>
      </div>
      <div class="stat">
        <div class="stat-label">Requests</div>
        <div class="stat-value">{report["total_requests"]}</div>
      </div>
    </div>

    <div class="panel">
      <h2>Total RPS</h2>
      <div class="legend">
        <span><i style="background: var(--accent)"></i>5-second moving average</span>
      </div>
      <svg id="total-chart" viewBox="0 0 1200 480" preserveAspectRatio="none"></svg>
    </div>

    <div class="panel">
      <h2>Endpoint RPS</h2>
      <div class="legend" id="endpoint-legend"></div>
      <svg id="endpoint-chart" viewBox="0 0 1200 480" preserveAspectRatio="none"></svg>
      <div class="footer">Endpoint chart also uses a 5-second moving average to reduce k6 per-second jitter.</div>
    </div>
  </div>

  <script>
    const report = {payload};

    function css(name) {{
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }}

    function escapeXml(value) {{
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
    }}

    function buildChart(svgId, seriesMap, options = {{ area: false }}) {{
      const svg = document.getElementById(svgId);
      const width = 1200;
      const height = 480;
      const margin = {{ top: 18, right: 18, bottom: 64, left: 64 }};
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;
      const labels = report.labels;
      const colors = [css('--accent'), css('--line2'), css('--line3'), css('--line4'), css('--line5')];
      const names = Object.keys(seriesMap);
      const allValues = names.flatMap((name) => seriesMap[name]);
      const maxY = Math.max(...allValues, 1);
      const yMax = Math.ceil(maxY / 5) * 5;
      const xMax = Math.max(labels.length - 1, 1);
      const yTicks = 5;

      let content = '';

      for (let i = 0; i <= yTicks; i++) {{
        const value = yMax * (i / yTicks);
        const y = margin.top + innerHeight - (value / yMax) * innerHeight;
        content += `<line x1="${{margin.left}}" y1="${{y}}" x2="${{width - margin.right}}" y2="${{y}}" stroke="${{css('--grid')}}" stroke-dasharray="4 4" />`;
        content += `<text x="${{margin.left - 12}}" y="${{y + 4}}" text-anchor="end" fill="${{css('--muted')}}" font-size="12">${{Math.round(value)}}</text>`;
      }}

      const xTickCount = Math.min(6, labels.length - 1 || 1);
      for (let i = 0; i <= xTickCount; i++) {{
        const ratio = i / xTickCount;
        const x = margin.left + ratio * innerWidth;
        const labelIndex = Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1)));
        content += `<line x1="${{x}}" y1="${{margin.top}}" x2="${{x}}" y2="${{height - margin.bottom}}" stroke="${{css('--grid')}}" stroke-dasharray="4 4" />`;
        content += `<text x="${{x}}" y="${{height - 30}}" text-anchor="middle" fill="${{css('--muted')}}" font-size="12">${{labels[labelIndex]}}s</text>`;
      }}

      content += `<text x="${{margin.left - 42}}" y="${{margin.top + innerHeight / 2}}" transform="rotate(-90 ${{margin.left - 42}} ${{margin.top + innerHeight / 2}})" text-anchor="middle" fill="${{css('--text')}}" font-size="16">RPS</text>`;
      content += `<text x="${{margin.left + innerWidth / 2}}" y="${{height - 8}}" text-anchor="middle" fill="${{css('--text')}}" font-size="16">Time since start (seconds)</text>`;

      names.forEach((name, index) => {{
        const values = seriesMap[name];
        const color = colors[index % colors.length];
        const points = values.map((value, i) => {{
          const x = margin.left + (i / xMax) * innerWidth;
          const y = margin.top + innerHeight - (value / yMax) * innerHeight;
          return `${{x.toFixed(2)}},${{y.toFixed(2)}}`;
        }}).join(' ');

        if (options.area && index === 0) {{
          const areaPoints = [
            `${{margin.left}},${{height - margin.bottom}}`,
            points,
            `${{width - margin.right}},${{height - margin.bottom}}`,
          ].join(' ');
          content += `<polygon points="${{areaPoints}}" fill="${{css('--fill')}}" />`;
        }}

        content += `<polyline points="${{points}}" fill="none" stroke="${{color}}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" />`;
      }});

      svg.innerHTML = content;
    }}

    const totalSeries = {{ 'Total RPS': report.total_smoothed }};
    buildChart('total-chart', totalSeries, {{ area: true }});

    const endpointSeries = report.endpoint_series;
    buildChart('endpoint-chart', endpointSeries, {{ area: false }});

    const endpointLegend = document.getElementById('endpoint-legend');
    const endpointColors = [css('--accent'), css('--line2'), css('--line3'), css('--line4'), css('--line5')];
    endpointLegend.innerHTML = Object.keys(endpointSeries).map((name, index) =>
      `<span><i style="background:${{endpointColors[index % endpointColors.length]}}"></i>${{escapeXml(name)}}</span>`
    ).join('');
  </script>
</body>
</html>
"""


def escape_html(value):
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def main():
    parser = argparse.ArgumentParser(description="Generate a self-contained k6 RPS-over-time HTML report from k6 raw JSON output.")
    parser.add_argument("input", help="Path to the k6 raw JSON output file produced with --out json=...")
    parser.add_argument("-o", "--output", required=True, help="Path to the output HTML file")
    parser.add_argument("--build-label", default="unknown-build", help="Build label shown in the chart title")
    parser.add_argument("--run-name", default="profile-mix", help="Logical run name shown in the subtitle")
    parser.add_argument("--bucket", type=float, default=0.1, help="Bucket size in seconds (e.g. 0.1, 0.5, 1). Default: 0.1")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    bucket_ms = max(1, int(args.bucket * 1000))
    dataset = load_series(input_path, bucket_ms=bucket_ms)
    report = build_report(dataset, args.build_label, args.run_name)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_html(report), encoding="utf-8")

    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
