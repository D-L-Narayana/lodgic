import { createServer } from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
import { App } from "./app.js";

/**
 * Entry point: `npm start` (PORT, HOTELS_PER_CITY, PRELOAD_OCCUPANCY, SEARCH_CACHE_TTL_MS, TODAY, LOG_REQUESTS=1).
 * Reservation state changes are appended to data/reservations.jsonl as an audit log.
 */
const port = Number(process.env.PORT ?? 8080);
const hotelsPerCity = Number(process.env.HOTELS_PER_CITY ?? 120);
const preloadOccupancy = Number(process.env.PRELOAD_OCCUPANCY ?? 0.35);
const today = process.env.TODAY ?? new Date().toISOString().slice(0, 10);
const cacheTtlMs = Number(process.env.SEARCH_CACHE_TTL_MS ?? 30_000);

await mkdir("data", { recursive: true });
const app = new App({
  hotelsPerCity,
  preloadOccupancy,
  today,
  search: { cacheTtlMs },
  onReservationChange: (r) => {
    void appendFile("data/reservations.jsonl", JSON.stringify({ at: Date.now(), ...r }) + "\n").catch((e) => console.error(String(e)));
  },
});

const sweeper = setInterval(() => app.engine.reservations.sweepExpiredHolds(), 15_000);
sweeper.unref();

const server = createServer(app.handle);
server.keepAliveTimeout = 65_000;
server.listen(port, () => {
  console.log(JSON.stringify({ level: "info", msg: "lodgic listening", port, hotels: app.engine.hotels.length, today }));
});

const shutdown = (): void => {
  clearInterval(sweeper);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
