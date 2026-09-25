// HTTP load test with autocannon against a running server (npm start).
// Usage: node bench/load.mjs [baseUrl] [connections] [durationSec] [hot|cold|all]
// For the cold-path number start the server with SEARCH_CACHE_TTL_MS=0 and pass "cold".
import autocannon from "autocannon";

const base = process.argv[2] ?? "http://127.0.0.1:8080";
const connections = Number(process.argv[3] ?? 50);
const duration = Number(process.argv[4] ?? 15);
const mode = process.argv[5] ?? "all"; // hot | cold | all
const cities = ["Bengaluru", "Goa", "Mumbai", "New Delhi", "Jaipur", "Hyderabad", "Amsterdam", "London", "Singapore", "Dubai", "Tokyo", "Visakhapatnam"];

function run(title, opts) {
  return new Promise((resolve, reject) => {
    const inst = autocannon({ url: base, connections, duration, ...opts }, (err, res) => {
      if (err) return reject(err);
      const out = {
        title,
        requests_per_sec: res.requests.average,
        latency_ms: { p50: res.latency.p50, p97_5: res.latency.p97_5, p99: res.latency.p99, max: res.latency.max },
        non2xx: res.non2xx,
        errors: res.errors,
        total: res.requests.total,
      };
      console.log(JSON.stringify(out));
      resolve(out);
    });
    autocannon.track(inst, { renderProgressBar: false, renderResultsTable: false });
  });
}

const searchPath = (n, m) => {
  const s = new Date(Date.UTC(2026, 1, 1) + n * 86_400_000);
  const e = new Date(s.getTime() + (1 + (m % 4)) * 86_400_000);
  return `/search?city=${encodeURIComponent(cities[m % cities.length])}&checkIn=${s.toISOString().slice(0, 10)}&checkOut=${e.toISOString().slice(0, 10)}&guests=${1 + (m % 4)}&sort=recommended`;
};
// 48 distinct queries => cache warm after the first pass (typical "popular searches" traffic)
const hot = mode === "cold" ? null : await run("GET /search — 48 distinct popular queries (cache warm)", {
  requests: [{ method: "GET", setupRequest: (req) => ({ ...req, path: searchPath(Math.floor(Math.random() * 4) * 7, Math.floor(Math.random() * 12)) }) }],
});
// 300 dates x 12 cities x 4 guests = 14,400 combinations => run this against a server started with SEARCH_CACHE_TTL_MS=0 for a true cold path
const cold = mode === "hot" ? null : await run("GET /search — random dates/cities/guests (cache-cold path when SEARCH_CACHE_TTL_MS=0)", {
  requests: [{ method: "GET", setupRequest: (req) => ({ ...req, path: searchPath(Math.floor(Math.random() * 300), Math.floor(Math.random() * 48)) }) }],
});
const health = mode === "cold" ? null : await run("GET /health", { requests: [{ method: "GET", path: "/health" }] });
console.log(JSON.stringify({ connections, duration, hot, cold, health }, null, 2));
