import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Engine, type EngineOptions } from "../core/engine.js";
import { ReservationError } from "../core/reservations.js";
import type { Amenity, CurrencyCode, SearchQuery, SortOrder, TravellerProfile } from "../core/types.js";

/** Minimal dependency-free JSON API over the engine. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}
interface Ctx {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  requestId: string;
}

const SORTS: readonly SortOrder[] = ["recommended", "price_asc", "price_desc", "rating_desc", "distance_asc"];
const CURRENCIES: readonly CurrencyCode[] = ["INR", "USD", "EUR", "GBP", "JPY", "KWD", "SGD", "AED"];
const PROFILES: readonly TravellerProfile[] = ["leisure", "business", "family", "budget"];
const AMENITIES: readonly Amenity[] = ["wifi", "breakfast", "pool", "gym", "parking", "spa", "airport_shuttle", "pet_friendly", "restaurant", "bar"];

function int(v: string | null, name: string, fallback?: number): number | undefined {
  if (v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new HttpError(400, "BAD_REQUEST", `${name} must be an integer`);
  return n;
}
function oneOf<T extends string>(v: string | null, allowed: readonly T[], name: string): T | undefined {
  if (v === null || v === "") return undefined;
  if (!allowed.includes(v as T)) throw new HttpError(400, "BAD_REQUEST", `${name} must be one of ${allowed.join(", ")}`);
  return v as T;
}
function str(o: Record<string, unknown>, k: string, required = true): string | undefined {
  const v = o[k];
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, "BAD_REQUEST", `${k} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new HttpError(400, "BAD_REQUEST", `${k} must be a string`);
  return v;
}

export interface Metrics {
  requests: number;
  errors: number;
  byRoute: Record<string, { count: number; totalMs: number; p50?: number; p95?: number }>;
  latenciesMs: number[];
}

export class App {
  readonly engine: Engine;
  readonly startedAt = Date.now();
  readonly metrics: Metrics = { requests: 0, errors: 0, byRoute: {}, latenciesMs: [] };
  private readonly routes: Route[] = [];

  constructor(opts: EngineOptions = {}) {
    this.engine = new Engine(opts);
    const e = this.engine;

    this.route("GET", "/health", () => ({ ok: true, uptimeSec: Math.round((Date.now() - this.startedAt) / 1000), hotels: e.hotels.length }));
    this.route("GET", "/cities", () => ({ cities: e.search.cities() }));

    this.route("GET", "/search", ({ query: q }) => {
      const city = q.get("city");
      if (!city) throw new HttpError(400, "BAD_REQUEST", "city is required");
      const amenities = q.getAll("amenity").map((a) => oneOf(a, AMENITIES, "amenity")!) as Amenity[];
      const sq: SearchQuery = {
        city,
        checkIn: q.get("checkIn") ?? "",
        checkOut: q.get("checkOut") ?? "",
        guests: int(q.get("guests"), "guests", 2)!,
        rooms: int(q.get("rooms"), "rooms", 1)!,
        page: int(q.get("page"), "page", 1)!,
        pageSize: int(q.get("pageSize"), "pageSize", 10)!,
        ...(oneOf(q.get("currency"), CURRENCIES, "currency") ? { currency: oneOf(q.get("currency"), CURRENCIES, "currency")! } : {}),
        ...(int(q.get("minStars"), "minStars") !== undefined ? { minStars: int(q.get("minStars"), "minStars")! } : {}),
        ...(int(q.get("maxNightlyPrice"), "maxNightlyPrice") !== undefined ? { maxNightlyPrice: int(q.get("maxNightlyPrice"), "maxNightlyPrice")! } : {}),
        ...(amenities.length ? { amenities } : {}),
        ...(q.get("freeCancellation") === "true" ? { freeCancellation: true } : {}),
        ...(oneOf(q.get("sort"), SORTS, "sort") ? { sort: oneOf(q.get("sort"), SORTS, "sort")! } : {}),
        ...(oneOf(q.get("traveller"), PROFILES, "traveller") ? { traveller: oneOf(q.get("traveller"), PROFILES, "traveller")! } : {}),
      };
      try {
        const res = e.search.search(sq);
        // Do not ship full hotel objects for every hit; keep the payload lean.
        return {
          ...res,
          hits: res.hits.map((h) => ({
            hotelId: h.hotel.id,
            name: h.hotel.name,
            stars: h.hotel.stars,
            rating: h.hotel.rating,
            reviewCount: h.hotel.reviewCount,
            distanceToCentreKm: h.hotel.distanceToCentreKm,
            amenities: h.hotel.amenities,
            roomTypeId: h.roomType.id,
            roomName: h.roomType.name,
            refundable: h.roomType.refundable,
            breakfastIncluded: h.roomType.breakfastIncluded,
            unitsLeft: h.unitsLeft,
            score: Math.round(h.score * 1000) / 1000,
            explanation: h.explanation,
            quote: h.quote,
          })),
        };
      } catch (err) {
        if (err instanceof RangeError) throw new HttpError(400, "BAD_REQUEST", err.message);
        throw err;
      }
    });

    this.route("GET", "/hotels/:id", ({ params }) => {
      const h = e.hotelById.get(params.id!);
      if (!h) throw new HttpError(404, "NOT_FOUND", `unknown hotel ${params.id}`);
      return h;
    });

    this.route("POST", "/reservations", ({ body, req }) => {
      const b = asObject(body);
      const idem = req.headers["idempotency-key"];
      const idempotencyKey = typeof idem === "string" && idem ? idem : str(b, "idempotencyKey", false);
      if (!idempotencyKey) throw new HttpError(400, "BAD_REQUEST", "Idempotency-Key header (or idempotencyKey) is required");
      const guest = asObject(b.guest);
      try {
        return e.reservations.create({
          idempotencyKey,
          roomTypeId: str(b, "roomTypeId")!,
          checkIn: str(b, "checkIn")!,
          checkOut: str(b, "checkOut")!,
          guests: numberField(b, "guests"),
          ...(b.rooms !== undefined ? { rooms: numberField(b, "rooms") } : {}),
          guest: { name: str(guest, "name")!, email: str(guest, "email")! },
          ...(b.currency !== undefined ? { currency: oneOf(str(b, "currency")!, CURRENCIES, "currency")! } : {}),
        });
      } catch (err) {
        throw mapReservationError(err);
      }
    });

    this.route("GET", "/reservations", () => ({ reservations: e.reservations.list() }));
    this.route("GET", "/reservations/:id", ({ params }) => {
      const r = e.reservations.get(params.id!);
      if (!r) throw new HttpError(404, "NOT_FOUND", `unknown reservation ${params.id}`);
      return r;
    });

    this.route("POST", "/reservations/:id/confirm", ({ params, body }) => {
      const b = asObject(body);
      try {
        return e.reservations.confirm(params.id!, str(b, "paymentIntentId")!);
      } catch (err) {
        throw mapReservationError(err);
      }
    });

    this.route("POST", "/reservations/:id/cancel", ({ params }) => {
      try {
        return e.reservations.cancel(params.id!);
      } catch (err) {
        throw mapReservationError(err);
      }
    });

    this.route("POST", "/payments/intents", ({ body, req }) => {
      const b = asObject(body);
      const idem = req.headers["idempotency-key"];
      const idempotencyKey = typeof idem === "string" && idem ? idem : str(b, "idempotencyKey", false);
      if (!idempotencyKey) throw new HttpError(400, "BAD_REQUEST", "Idempotency-Key header (or idempotencyKey) is required");
      try {
        return e.payments.createIntent({
          idempotencyKey,
          amount: numberField(b, "amount"),
          currency: oneOf(str(b, "currency")!, CURRENCIES, "currency")!,
          card: str(b, "card")!,
        });
      } catch (err) {
        if (err instanceof RangeError) throw new HttpError(400, "BAD_REQUEST", err.message);
        throw err;
      }
    });

    this.route("GET", "/metrics", () => this.snapshotMetrics());
  }

  private route(method: string, path: string, handler: Handler): void {
    const keys: string[] = [];
    const pattern = new RegExp(
      "^" +
        path.replace(/:([a-zA-Z]+)/g, (_m, k: string) => {
          keys.push(k);
          return "([^/]+)";
        }) +
        "/?$",
    );
    this.routes.push({ method, pattern, keys, handler });
  }

  snapshotMetrics() {
    const lat = [...this.metrics.latenciesMs].sort((a, b) => a - b);
    const pct = (p: number): number => (lat.length ? lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))]! : 0);
    return {
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      latencyMs: { p50: pct(50), p95: pct(95), p99: pct(99), max: lat[lat.length - 1] ?? 0 },
      byRoute: this.metrics.byRoute,
      cache: this.engine.search.cacheStats(),
      reservations: this.engine.reservations.list().length,
    };
  }

  /** Node http listener. */
  handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const t0 = performance.now();
    const requestId = randomUUID();
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = (req.method ?? "GET").toUpperCase();
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    let routeName = "unmatched";
    try {
      if (method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      const match = this.match(method, url.pathname);
      if (!match) throw new HttpError(404, "NOT_FOUND", `no route for ${method} ${url.pathname}`);
      routeName = `${method} ${match.route.pattern.source}`;
      const body = method === "POST" ? await readJson(req) : undefined;
      const out = await match.route.handler({ req, params: match.params, query: url.searchParams, body, requestId });
      const json = JSON.stringify(out);
      res.writeHead(method === "POST" ? 201 : 200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json) });
      res.end(json);
    } catch (err) {
      const e = err instanceof HttpError ? err : new HttpError(500, "INTERNAL", "internal error");
      if (e.status >= 500) console.error(JSON.stringify({ level: "error", requestId, err: String(err) }));
      this.metrics.errors++;
      const json = JSON.stringify({ error: { code: e.code, message: e.message, requestId } });
      res.writeHead(e.status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json) });
      res.end(json);
    } finally {
      const ms = performance.now() - t0;
      this.metrics.requests++;
      if (this.metrics.latenciesMs.length < 100_000) this.metrics.latenciesMs.push(ms);
      const r = (this.metrics.byRoute[routeName] ??= { count: 0, totalMs: 0 });
      r.count++;
      r.totalMs += ms;
      if (process.env.LOG_REQUESTS === "1") console.log(JSON.stringify({ level: "info", requestId, method, path: url.pathname, status: res.statusCode, ms: Math.round(ms * 100) / 100 }));
    }
  };

  private match(method: string, pathname: string): { route: Route; params: Record<string, string> } | undefined {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      return { route, params };
    }
    return undefined;
  }
}

function asObject(v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) throw new HttpError(400, "BAD_REQUEST", "JSON body required");
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, "BAD_REQUEST", "JSON object expected");
  return v as Record<string, unknown>;
}
function numberField(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new HttpError(400, "BAD_REQUEST", `${k} must be a number`);
  return v;
}
function mapReservationError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof ReservationError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "SOLD_OUT" ? 409 : err.code === "BAD_STATE" || err.code === "HOLD_EXPIRED" ? 409 : err.code === "PAYMENT_FAILED" ? 402 : 400;
    return new HttpError(status, err.code, err.message);
  }
  if (err instanceof RangeError) return new HttpError(400, "BAD_REQUEST", err.message);
  return new HttpError(500, "INTERNAL", "internal error");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "body over 64 KiB");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "malformed JSON");
  }
}
