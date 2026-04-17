# k6 Load Test

This repo contains app-direct k6 workloads for DevPort API benchmarking and GraalVM PGO training.

## Main workload

Use `k6/profile-mix.js` for the mixed read-heavy production-shaped workload.

Default rates are intentionally conservative for a small `2 vCPU / 2 GB` EC2 box:

- `listMain`: `20 RPS`
- `ticker`: `6 RPS`
- `listCategory`: `3 RPS`
- `search`: `2 RPS`

The script also writes aggregate benchmark summaries to `results/` through `handleSummary()`.

## Aggregate summary run

```bash
BASE_URL=http://10.0.2.251:8080 BUILD_LABEL=native k6 run k6/profile-mix.js
```

This writes:

- `results/profile-mix-native.json`
- `results/profile-mix-native.html`

## RPS over time chart

To generate a Grafana-style `RPS over time` chart, export raw k6 metrics first:

```bash
BASE_URL=http://10.0.2.251:8080 BUILD_LABEL=native \
k6 run --out json=results/raw-native.json k6/profile-mix.js
```

Then render the time-series HTML report:

```bash
python3 scripts/generate_k6_timeseries_report.py \
  results/raw-native.json \
  --output results/rps-over-time-native.html \
  --build-label native \
  --run-name profile-mix
```

That report contains:

- total `RPS over time`
- endpoint `RPS over time`
- average RPS
- peak RPS
- total requests

The time-series report is generated from `http_reqs` points in the raw k6 JSON output, bucketed by second and smoothed with a 5-second moving average.
