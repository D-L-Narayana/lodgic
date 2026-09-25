/**
 * Engine micro-benchmarks. Run: npm run bench:engine
 * Prints JSON so results can be pasted into README.md.
 */
import { AvailabilityIndex, MinSegmentTree } from "../src/core/availability.js";
import { Engine } from "../src/core/engine.js";
import { CITIES } from "../src/core/seed.js";

function bench(name: string, iterations: number, fn: (i: number) => void): { name: string; iterations: number; opsPerSec: number; avgUs: number } {
  for (let i = 0; i < Math.min(200, iterations); i++) fn(i); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  const ms = performance.now() - t0;
  return { name, iterations, opsPerSec: Math.round(iterations / (ms / 1000)), avgUs: Math.round((ms * 1000) / iterations * 100) / 100 };
}

const engine = new Engine({ hotelsPerCity: 120, today: "2026-01-01", preloadOccupancy: 0.35, search: { cacheCapacity: 10_000, cacheTtlMs: 60_000 } });
// TTL 0 => every lookup expires immediately, so this instance measures the full compute path.
const uncached = new Engine({ hotelsPerCity: 120, today: "2026-01-01", preloadOccupancy: 0.35, search: { cacheCapacity: 10, cacheTtlMs: 0 } });
const cities = CITIES.map((c) => c.name);
const dates: [string, string][] = [];
for (let d = 0; d < 300; d++) {
  const s = new Date(Date.UTC(2026, 1, 1) + d * 86_400_000);
  const e = new Date(s.getTime() + (1 + (d % 5)) * 86_400_000);
  dates.push([s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]);
}
const results = [];
results.push(
  bench("search uncached (120 hotels/city: filter + availability + quote + rank + facets)", 3000, (i) => {
    const [ci, co] = dates[i % dates.length]!;
    uncached.search.search({ city: cities[i % cities.length]!, checkIn: ci, checkOut: co, guests: 1 + (i % 4), sort: "recommended", page: 1, pageSize: 10, currency: i % 3 === 0 ? "USD" : undefined } as never);
  }),
);
results.push(
  bench("search cached (same 300 queries)", 30_000, (i) => {
    const [ci, co] = dates[i % 300]!;
    engine.search.search({ city: cities[i % cities.length]!, checkIn: ci, checkOut: co, guests: 1 + (i % 4), sort: "recommended", page: 1, pageSize: 10 });
  }),
);
results.push({ cacheStatsWarm: engine.search.cacheStats(), cacheStatsUncached: uncached.search.cacheStats() });

// Availability: segment tree vs linear scan for min-over-stay on a 730-day horizon.
const horizon = 730;
const linear = new Int32Array(horizon).fill(5);
const tree = new MinSegmentTree(linear);
let sink = 0;
results.push(
  bench("availability rangeMin: segment tree (log n)", 1_000_000, (i) => {
    const s = i % (horizon - 31);
    sink += tree.rangeMin(s, s + 1 + (i % 30));
  }),
);
results.push(
  bench("availability rangeMin: linear scan (n)", 1_000_000, (i) => {
    const s = i % (horizon - 31);
    let m = 1e9;
    for (let d = s; d < s + 1 + (i % 30); d++) if (linear[d]! < m) m = linear[d]!;
    sink += m;
  }),
);
results.push(
  bench("rangeMin over 365 nights (occupancy report): segment tree", 1_000_000, (i) => {
    const s = i % (horizon - 365);
    sink += tree.rangeMin(s, s + 365);
  }),
);
results.push(
  bench("rangeMin over 365 nights (occupancy report): linear scan", 1_000_000, (i) => {
    const s = i % (horizon - 365);
    let m = 1e9;
    for (let d = s; d < s + 365; d++) if (linear[d]! < m) m = linear[d]!;
    sink += m;
  }),
);
const idx = new AvailabilityIndex();
idx.addRoomType("r", 1_000_000);
results.push(
  bench("availability hold+release (3 nights)", 1_000_000, (i) => {
    const s = i % (horizon - 3);
    idx.hold("r", s, s + 3, 1);
    idx.release("r", s, s + 3, 1);
  }),
);
results.push(
  bench("reservation create (idempotent, held)", 100_000, (i) => {
    const room = engine.hotels[i % engine.hotels.length]!.roomTypes[0]!;
    try {
      engine.reservations.create({ idempotencyKey: `b-${i}`, roomTypeId: room.id, checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 1, guest: { name: "B", email: "b@x.io" } });
    } catch {
      /* sold out is expected once inventory runs dry */
    }
  }),
);
console.log(JSON.stringify({ node: process.version, hotels: engine.hotels.length, roomTypes: engine.hotels.reduce((n, h) => n + h.roomTypes.length, 0), results, sink: sink > 0 }, null, 2));
