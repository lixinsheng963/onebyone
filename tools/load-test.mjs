import { performance } from 'node:perf_hooks';

const base = process.env.LOAD_BASE_URL || 'http://127.0.0.1:3000';
const total = Number(process.env.LOAD_REQUESTS || 250);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 50);
if (!Number.isInteger(total) || total < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error('LOAD_REQUESTS / LOAD_CONCURRENCY must be positive integers');
}

const health = await fetch(`${base}/healthz`);
if (!health.ok) throw new Error(`healthz failed: ${health.status}`);

const latencies = [];
const statuses = new Map();
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= total) return;
    const start = performance.now();
    try {
      const response = await fetch(`${base}/api/v1/feed?scope=recommend&page=1`, {
        headers: { 'x-load-test': '1' }
      });
      await response.arrayBuffer();
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
    } catch {
      statuses.set('network-error', (statuses.get('network-error') || 0) + 1);
    } finally {
      latencies.push(performance.now() - start);
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsed = performance.now() - started;
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)] || 0;
const failed = [...statuses.entries()].filter(([status]) => status !== 200).reduce((sum, [, count]) => sum + count, 0);
const result = {
  base,
  total,
  concurrency,
  elapsedMs: Math.round(elapsed),
  rps: Number((total / (elapsed / 1000)).toFixed(1)),
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  p99Ms: Number(percentile(0.99).toFixed(1)),
  statuses: Object.fromEntries(statuses),
  errors: failed
};
console.log(JSON.stringify(result, null, 2));
if (failed / total > 0.01) {
  console.error('load test failed: error rate > 1%');
  process.exit(1);
}
