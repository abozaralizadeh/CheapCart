// Local load test for POST /api/compare. Sample data only, run against your own copy.
// Usage: npx tsx scripts/loadtest.ts [baseUrl] [seconds] [virtualUsers]
// Each virtual user sends from its own x-forwarded-for, so the rate limiter does not block the run.
export {};

const base = process.argv[2] ?? "http://localhost:3100";
const seconds = Number(process.argv[3] ?? 10);
const users = Number(process.argv[4] ?? 20);

const lists = [
  ["milk", "eggs", "butter", "bread"],
  ["rice", "pasta", "tomatoes", "bananas", "apples", "chicken"],
  ["milk 2", "coffee", "sugar", "flour", "olive oil", "yoghurt", "cheese", "onions"],
];

const times: number[] = [];
let ok = 0;
let failed = 0;
let limited = 0;
const end = Date.now() + seconds * 1000;

async function user(n: number) {
  let i = 0;
  while (Date.now() < end) {
    const started = performance.now();
    try {
      const res = await fetch(`${base}/api/compare`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.0.${n >> 8}.${n & 255}` },
        body: JSON.stringify({ lines: lists[i++ % lists.length], lat: 10.0, lng: -30.0, radiusKm: 3, areaId: "sample-town" }),
      });
      await res.arrayBuffer();
      if (res.status === 200) ok++;
      else if (res.status === 429) limited++;
      else failed++;
    } catch {
      failed++;
    }
    times.push(performance.now() - started);
  }
}

await Promise.all(Array.from({ length: users }, (_, n) => user(n)));
times.sort((a, b) => a - b);
const at = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))]?.toFixed(1);
console.log(`users ${users}, ${seconds}s, requests ${times.length} (${(times.length / seconds).toFixed(0)}/s)`);
console.log(`ok ${ok}, rate limited ${limited}, failed ${failed}`);
console.log(`ms: median ${at(0.5)}, p95 ${at(0.95)}, p99 ${at(0.99)}, max ${times.at(-1)?.toFixed(1)}`);
process.exit(failed > 0 ? 1 : 0);
