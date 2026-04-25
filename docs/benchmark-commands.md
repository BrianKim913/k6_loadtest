# Benchmark Commands — JVM vs Native vs PGO Native

**Target:** 500 RPS | **Duration:** 6 minutes | **Search:** 1 RPS (kept low to avoid DB noise)

---

## JVM

```bash
BASE_URL=http://10.0.2.251:18080 BUILD_LABEL=jvm DURATION=6m \
  LIST_MAIN_RPS=325 TICKER_RPS=85 LIST_CATEGORY_RPS=50 SEARCH_RPS=1 \
  k6 run --out json=results/raw-jvm-500.json k6/profile-mix.js; \
  python3 scripts/generate_k6_timeseries_report.py \
  results/raw-jvm-500.json \
  -o results/timeseries-jvm-500.html \
  --build-label jvm \
  --run-name profile-mix
```

> JVM needs 6 minutes to show the JIT warmup curve. Expect high latency for first ~90s then it drops.

---

## Native Image

```bash
BASE_URL=http://10.0.2.251:18080 BUILD_LABEL=native DURATION=6m \
  LIST_MAIN_RPS=325 TICKER_RPS=85 LIST_CATEGORY_RPS=50 SEARCH_RPS=1 \
  k6 run --out json=results/raw-native-500.json k6/profile-mix.js; \
  python3 scripts/generate_k6_timeseries_report.py \
  results/raw-native-500.json \
  -o results/timeseries-native-500.html \
  --build-label native \
  --run-name profile-mix
```

---

## PGO Native Image

```bash
BASE_URL=http://10.0.2.251:18080 BUILD_LABEL=pgo DURATION=6m \
  LIST_MAIN_RPS=325 TICKER_RPS=85 LIST_CATEGORY_RPS=50 SEARCH_RPS=1 \
  k6 run --out json=results/raw-pgo-500.json k6/profile-mix.js; \
  python3 scripts/generate_k6_timeseries_report.py \
  results/raw-pgo-500.json \
  -o results/timeseries-pgo-500.html \
  --build-label pgo \
  --run-name profile-mix
```

---

## What to Compare

| Metric | JVM | Native | PGO Native |
|--------|-----|--------|------------|
| P50 at steady state | good (after JIT) | better | best |
| P95 at steady state | good (after JIT) | better | best |
| Warmup curve (timeseries) | high → drops | flat | flat |
| CPU at 500 RPS | higher | lower | lowest |
