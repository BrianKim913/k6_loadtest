# k6 Benchmark Workflow

This document records the practical commands used to run app-direct DevPort API benchmarks, save raw k6 output, and generate `RPS over time` charts.

## Repo path on EC2

```bash
cd /opt/k6_loadtest
```

## One-time ownership fix

If `git pull` or writing to `results/` fails because the repo is owned by `root`, fix ownership first.
If the EC2 instance was recreated, rerun this section.

```bash
sudo chown -R ssm-user:ssm-user /opt/k6_loadtest
git config --global --add safe.directory /opt/k6_loadtest
```

Verify writes work:

```bash
cd /opt/k6_loadtest
touch results/write-test.txt
echo ok > results/write-test.txt
cat results/write-test.txt
rm results/write-test.txt
```

## Pull latest k6 changes

```bash
cd /opt/k6_loadtest
git pull origin main
```

## Default full benchmark run

This uses the default `profile-mix.js` rates currently defined in the repo.

```bash
cd /opt/k6_loadtest && \
BASE_URL=http://10.0.2.251:8080 BUILD_LABEL=native \
k6 run --out json=results/raw-native.json k6/profile-mix.js && \
python3 scripts/generate_k6_timeseries_report.py \
  results/raw-native.json \
  --output results/rps-over-time-native.html \
  --build-label native \
  --run-name profile-mix
```

## Short smoke test

Useful to verify end-to-end output without waiting 6 minutes.

```bash
cd /opt/k6_loadtest && \
BASE_URL=http://10.0.2.251:8080 BUILD_LABEL=native-smoke DURATION=10s \
k6 run --out json=results/raw-native-smoke.json k6/profile-mix.js && \
python3 scripts/generate_k6_timeseries_report.py \
  results/raw-native-smoke.json \
  --output results/rps-over-time-native-smoke.html \
  --build-label native-smoke \
  --run-name profile-mix-10s
```

## Regenerate chart from existing raw JSON

No need to rerun k6 if only the chart generator changed.

```bash
cd /opt/k6_loadtest
python3 scripts/generate_k6_timeseries_report.py \
  results/raw-native.json \
  --output results/rps-over-time-native.html \
  --build-label native \
  --run-name profile-mix
```

## Delete old result files

Run this from inside `/opt/k6_loadtest/results`:

```bash
rm -f \
  profile-mix-native-smoke.html \
  profile-mix-native.json \
  rps-over-time-native-smoke.html \
  profile-mix-native-smoke.json \
  raw-native-smoke.json \
  rps-over-time-native.html \
  profile-mix-native.html \
  raw-native.json
```

## Override load without changing code

If the default RPS is too high or too low, override with env vars:

```bash
cd /opt/k6_loadtest && \
BASE_URL=http://10.0.2.251:8080 BUILD_LABEL=native-45 \
LIST_MAIN_RPS=30 TICKER_RPS=7 LIST_CATEGORY_RPS=4 SEARCH_RPS=4 \
k6 run --out json=results/raw-native-45.json k6/profile-mix.js && \
python3 scripts/generate_k6_timeseries_report.py \
  results/raw-native-45.json \
  --output results/rps-over-time-native-45.html \
  --build-label native-45 \
  --run-name profile-mix
```

## Python installation

Check whether Python 3 exists:

```bash
python3 --version
```

Install if missing:

```bash
sudo dnf install -y python3
```

If `dnf` is unavailable:

```bash
sudo yum install -y python3
```

## Notes

- `raw-*.json` contains raw k6 event output.
- `profile-mix-*.json` and `profile-mix-*.html` are the aggregate k6 summaries from `handleSummary()`.
- `rps-over-time-*.html` is the time-series chart generated from the raw JSON.
- `Ctrl+C` aborts the run but k6 may still emit a partial summary.
- For benchmark comparisons, prefer full uninterrupted runs with distinct `BUILD_LABEL` values such as `hotspot`, `native`, and `native-pgo`.
