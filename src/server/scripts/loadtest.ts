import "dotenv/config";

/**
 * Simple concurrent read load test against a running server.
 *   npm run loadtest -- [concurrency] [totalRequests] [baseUrl]
 * Defaults: 100 concurrent readers, 2000 requests, APP_BASE_URL or localhost.
 */
const concurrency = Number(process.argv[2] ?? "100");
const total = Number(process.argv[3] ?? "2000");
const base =
  process.argv[4] ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

const endpoints = ["/api/hotspots", "/api/incidents?limit=100"];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  const latencies: Record<string, number[]> = {};
  for (const e of endpoints) latencies[e] = [];
  let issued = 0;
  let errors = 0;

  const worker = async () => {
    while (issued < total) {
      const i = issued++;
      const endpoint = endpoints[i % endpoints.length];
      const t = Date.now();
      try {
        const r = await fetch(base + endpoint);
        await r.arrayBuffer();
        if (!r.ok) errors++;
      } catch {
        errors++;
      }
      latencies[endpoint].push(Date.now() - t);
    }
  };

  const t0 = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = Date.now() - t0;

  console.info(
    `\nLoad test: ${total} requests, concurrency ${concurrency}, ${elapsed}ms (${(
      (total / elapsed) *
      1000
    ).toFixed(0)} req/s), errors: ${errors}\n`,
  );
  for (const e of endpoints) {
    const s = latencies[e].slice().sort((a, b) => a - b);
    console.info(
      `${e}\n  n=${s.length} p50=${percentile(s, 50)}ms p95=${percentile(
        s,
        95,
      )}ms p99=${percentile(s, 99)}ms max=${s[s.length - 1] ?? 0}ms`,
    );
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
