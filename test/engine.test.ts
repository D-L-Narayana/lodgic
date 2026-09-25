import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { Engine } from "../src/core/engine.js";
import { TEST_CARDS } from "../src/core/payments.js";
import { ReservationError } from "../src/core/reservations.js";
import { App } from "../src/server/app.js";

const TODAY = "2026-01-01";

function fixedClock(start = 1_700_000_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe("engine: search", () => {
  const clock = fixedClock();
  const engine = new Engine({ hotelsPerCity: 30, today: TODAY, now: clock.now, preloadOccupancy: 0.3 });

  it("returns ranked, paginated, available hotels and caches repeated queries", () => {
    const q = { city: "Bengaluru", checkIn: "2026-03-10", checkOut: "2026-03-13", guests: 2, pageSize: 5 } as const;
    const r1 = engine.search.search(q);
    assert.equal(r1.cache, "miss");
    assert.ok(r1.total > 0 && r1.total <= 30);
    assert.equal(r1.hits.length, 5);
    for (let i = 1; i < r1.hits.length; i++) assert.ok(r1.hits[i - 1]!.score >= r1.hits[i]!.score);
    for (const h of r1.hits) {
      assert.ok(h.unitsLeft >= 1);
      assert.ok(h.roomType.capacity >= 2);
      assert.equal(h.quote.nights, 3);
      assert.equal(h.explanation.length, 2);
    }
    const r2 = engine.search.search({ ...q, city: "  bengaluru " });
    assert.equal(r2.cache, "hit");
    assert.deepEqual(r2.hits.map((h) => h.hotel.id), r1.hits.map((h) => h.hotel.id));
    const page2 = engine.search.search({ ...q, page: 2 });
    assert.ok(!page2.hits.some((h) => r1.hits.some((x) => x.hotel.id === h.hotel.id)));
  });

  it("applies filters, sorts and currency conversion", () => {
    const base = { city: "Goa", checkIn: "2026-02-01", checkOut: "2026-02-03", guests: 4 } as const;
    const byPrice = engine.search.search({ ...base, sort: "price_asc", pageSize: 50 });
    for (let i = 1; i < byPrice.hits.length; i++) assert.ok(byPrice.hits[i - 1]!.quote.total <= byPrice.hits[i]!.quote.total);
    for (const h of byPrice.hits) assert.ok(h.roomType.capacity >= 4 || h.quote.rooms > 1);

    const stars4 = engine.search.search({ ...base, minStars: 4, pageSize: 50 });
    for (const h of stars4.hits) assert.ok(h.hotel.stars >= 4);

    const pool = engine.search.search({ ...base, amenities: ["pool", "wifi"], pageSize: 50 });
    for (const h of pool.hits) assert.ok(h.hotel.amenities.includes("pool") && h.hotel.amenities.includes("wifi"));

    const refundable = engine.search.search({ ...base, freeCancellation: true, pageSize: 50 });
    for (const h of refundable.hits) assert.ok(h.roomType.refundable);

    const usd = engine.search.search({ ...base, currency: "USD", pageSize: 3 });
    for (const h of usd.hits) assert.equal(h.quote.currency, "USD");

    const twoRooms = engine.search.search({ ...base, rooms: 2, guests: 4, pageSize: 3 });
    for (const h of twoRooms.hits) assert.equal(h.quote.rooms, 2);
  });

  it("rejects invalid queries", () => {
    assert.throws(() => engine.search.search({ city: "Goa", checkIn: "2026-02-03", checkOut: "2026-02-01", guests: 2 }), RangeError);
    assert.throws(() => engine.search.search({ city: "Goa", checkIn: "2026-02-01", checkOut: "2026-02-02", guests: 0 }), RangeError);
    assert.equal(engine.search.search({ city: "Atlantis", checkIn: "2026-02-01", checkOut: "2026-02-02", guests: 2 }).total, 0);
  });
});

describe("engine: reservations", () => {
  it("holds, confirms with matching payment, and prevents double booking", () => {
    const clock = fixedClock();
    const engine = new Engine({ hotelsPerCity: 5, today: TODAY, now: clock.now });
    const hotel = engine.hotels[0]!;
    const room = hotel.roomTypes[0]!;
    const stay = { checkIn: "2026-04-01", checkOut: "2026-04-04" };

    // Sell every unit but one so the race is on the last unit.
    for (let i = 0; i < room.totalUnits - 1; i++) {
      engine.reservations.create({ idempotencyKey: `pre-${i}`, roomTypeId: room.id, ...stay, guests: 1, guest: { name: "Pre Sold", email: "p@x.io" } });
    }
    assert.equal(engine.availability.unitsLeft(room.id, 90, 93), 1);

    const r = engine.reservations.create({ idempotencyKey: "k-1", roomTypeId: room.id, ...stay, guests: 2, guest: { name: "Asha", email: "asha@example.com" } });
    assert.equal(r.status, "HELD");
    assert.equal(engine.availability.unitsLeft(room.id, 90, 93), 0);

    // same idempotency key => same reservation, no second hold
    const again = engine.reservations.create({ idempotencyKey: "k-1", roomTypeId: room.id, ...stay, guests: 2, guest: { name: "Asha", email: "asha@example.com" } });
    assert.equal(again.id, r.id);

    // anyone else is told it is sold out
    assert.throws(
      () => engine.reservations.create({ idempotencyKey: "k-2", roomTypeId: room.id, ...stay, guests: 2, guest: { name: "Bo", email: "bo@example.com" } }),
      (e: unknown) => e instanceof ReservationError && e.code === "SOLD_OUT",
    );

    // search must no longer show this room type for overlapping dates
    const res = engine.search.search({ city: hotel.city, checkIn: "2026-04-02", checkOut: "2026-04-03", guests: 1, pageSize: 50 });
    assert.ok(!res.hits.some((h) => h.roomType.id === room.id));

    // payment must match the quote exactly
    const wrong = engine.payments.createIntent({ idempotencyKey: "p-wrong", amount: r.quote.total - 1, currency: r.quote.currency, card: TEST_CARDS.success });
    assert.throws(() => engine.reservations.confirm(r.id, wrong.id), (e: unknown) => e instanceof ReservationError && e.code === "AMOUNT_MISMATCH");

    const declined = engine.payments.createIntent({ idempotencyKey: "p-declined", amount: r.quote.total, currency: r.quote.currency, card: TEST_CARDS.declined });
    assert.throws(() => engine.reservations.confirm(r.id, declined.id), (e: unknown) => e instanceof ReservationError && e.code === "PAYMENT_FAILED");
    assert.equal(engine.reservations.get(r.id)!.status, "HELD");

    const ok = engine.payments.createIntent({ idempotencyKey: "p-ok", amount: r.quote.total, currency: r.quote.currency, card: TEST_CARDS.success });
    const confirmed = engine.reservations.confirm(r.id, ok.id);
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(engine.reservations.confirm(r.id, ok.id).status, "CONFIRMED"); // idempotent

    // cancelling a confirmed booking refunds and releases the unit
    const cancelled = engine.reservations.cancel(r.id);
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(engine.payments.get(ok.id)!.status, "refunded");
    assert.equal(engine.availability.unitsLeft(room.id, 90, 93), 1);
  });

  it("expires holds and releases inventory", () => {
    const clock = fixedClock();
    const engine = new Engine({ hotelsPerCity: 2, today: TODAY, now: clock.now, reservations: { holdMinutes: 10 } });
    const room = engine.hotels[0]!.roomTypes[0]!;
    const before = engine.availability.unitsLeft(room.id, 10, 12);
    const r = engine.reservations.create({ idempotencyKey: "e-1", roomTypeId: room.id, checkIn: "2026-01-11", checkOut: "2026-01-13", guests: 1, guest: { name: "Exp", email: "e@x.io" } });
    assert.equal(engine.availability.unitsLeft(room.id, 10, 12), before - 1);
    clock.advance(11 * 60_000);
    assert.equal(engine.reservations.sweepExpiredHolds(), 1);
    assert.equal(engine.reservations.get(r.id)!.status, "EXPIRED");
    assert.equal(engine.availability.unitsLeft(room.id, 10, 12), before);
    const pi = engine.payments.createIntent({ idempotencyKey: "e-p", amount: r.quote.total, currency: r.quote.currency, card: TEST_CARDS.success });
    assert.throws(() => engine.reservations.confirm(r.id, pi.id), (e: unknown) => e instanceof ReservationError && e.code === "BAD_STATE");
  });

  it("validates input", () => {
    const engine = new Engine({ hotelsPerCity: 2, today: TODAY });
    const room = engine.hotels[0]!.roomTypes[0]!;
    const g = { name: "V", email: "v@x.io" };
    const bad = (input: Parameters<typeof engine.reservations.create>[0], code: string): void =>
      assert.throws(() => engine.reservations.create(input), (e: unknown) => e instanceof ReservationError && e.code === code);
    bad({ idempotencyKey: "", roomTypeId: room.id, checkIn: "2026-02-01", checkOut: "2026-02-02", guests: 1, guest: g }, "INVALID");
    bad({ idempotencyKey: "a", roomTypeId: "nope", checkIn: "2026-02-01", checkOut: "2026-02-02", guests: 1, guest: g }, "NOT_FOUND");
    bad({ idempotencyKey: "b", roomTypeId: room.id, checkIn: "2026-02-02", checkOut: "2026-02-01", guests: 1, guest: g }, "INVALID");
    bad({ idempotencyKey: "c", roomTypeId: room.id, checkIn: "2026-02-01", checkOut: "2026-02-02", guests: room.capacity + 1, guest: g }, "INVALID");
    bad({ idempotencyKey: "d", roomTypeId: room.id, checkIn: "2026-02-01", checkOut: "2026-02-02", guests: 1, guest: { name: "", email: "x" } }, "INVALID");
  });
});

describe("http api", () => {
  let server: Server;
  let base: string;
  const app = new App({ hotelsPerCity: 20, today: TODAY, preloadOccupancy: 0.2 });

  before(async () => {
    server = createServer(app.handle);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    base = `http://127.0.0.1:${addr.port}`;
  });
  after(() => server.close());

  const json = async (path: string, init?: RequestInit): Promise<{ status: number; body: any; headers: Headers }> => {
    const res = await fetch(base + path, init);
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    json(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("serves health, search with validation and hotel lookup", async () => {
    const h = await json("/health");
    assert.equal(h.status, 200);
    assert.ok(h.headers.get("x-request-id"));
    const s = await json("/search?city=Mumbai&checkIn=2026-03-01&checkOut=2026-03-04&guests=2&sort=price_asc&currency=USD&pageSize=5");
    assert.equal(s.status, 200);
    assert.equal(s.body.hits.length, 5);
    assert.equal(s.body.hits[0].quote.currency, "USD");
    assert.ok(!("hotel" in s.body.hits[0]), "payload is trimmed");
    const bad = await json("/search?city=Mumbai&checkIn=2026-03-04&checkOut=2026-03-01&guests=2");
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, "BAD_REQUEST");
    assert.equal((await json("/search?checkIn=2026-03-01&checkOut=2026-03-02")).status, 400);
    assert.equal((await json("/search?city=Mumbai&checkIn=2026-03-01&checkOut=2026-03-02&guests=2&sort=bogus")).status, 400);
    assert.equal((await json("/hotels/nope")).status, 404);
    assert.equal((await json(`/hotels/${s.body.hits[0].hotelId}`)).status, 200);
    assert.equal((await json("/nope")).status, 404);
  });

  it("books end to end: hold -> pay -> confirm -> cancel, with idempotency", async () => {
    const s = await json("/search?city=Jaipur&checkIn=2026-05-10&checkOut=2026-05-12&guests=2&pageSize=1");
    const hit = s.body.hits[0];
    const body = { roomTypeId: hit.roomTypeId, checkIn: "2026-05-10", checkOut: "2026-05-12", guests: 2, guest: { name: "Dev", email: "dev@example.com" } };
    const r1 = await post("/reservations", body, { "Idempotency-Key": "http-k1" });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.status, "HELD");
    assert.equal(r1.body.quote.total, hit.quote.total);
    const r2 = await post("/reservations", body, { "Idempotency-Key": "http-k1" });
    assert.equal(r2.body.id, r1.body.id);
    assert.equal((await post("/reservations", body)).status, 400, "missing idempotency key");

    const pi = await post("/payments/intents", { amount: r1.body.quote.total, currency: r1.body.quote.currency, card: "4242 4242 4242 4242" }, { "Idempotency-Key": "http-p1" });
    assert.equal(pi.status, 201);
    const c = await post(`/reservations/${r1.body.id}/confirm`, { paymentIntentId: pi.body.id });
    assert.equal(c.status, 201);
    assert.equal(c.body.status, "CONFIRMED");
    const got = await json(`/reservations/${r1.body.id}`);
    assert.equal(got.body.status, "CONFIRMED");
    const x = await post(`/reservations/${r1.body.id}/cancel`, {});
    assert.equal(x.body.status, "CANCELLED");
    const m = await json("/metrics");
    assert.ok(m.body.requests > 5);
    assert.ok(m.body.cache.misses >= 1);
  });

  it("never double-books under 500 concurrent requests for the last unit", async () => {
    const engine = app.engine;
    const hotel = engine.hotels.find((h) => h.city === "Hyderabad")!;
    const room = hotel.roomTypes[0]!;
    const checkIn = "2026-09-01";
    const checkOut = "2026-09-03";
    const left = engine.availability.unitsLeft(room.id, 243, 245);
    assert.ok(left >= 1);
    for (let i = 0; i < left - 1; i++) {
      engine.reservations.create({ idempotencyKey: `race-pre-${i}`, roomTypeId: room.id, checkIn, checkOut, guests: 1, guest: { name: "Pre", email: "pre@x.io" } });
    }
    assert.equal(engine.availability.unitsLeft(room.id, 243, 245), 1);

    const attempts = 500;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        post("/reservations", { roomTypeId: room.id, checkIn, checkOut, guests: 1, guest: { name: `Racer ${i}`, email: `racer${i}@example.com` } }, { "Idempotency-Key": `race-${i}` }),
      ),
    );
    const held = results.filter((r) => r.status === 201);
    const soldOut = results.filter((r) => r.status === 409 && r.body.error.code === "SOLD_OUT");
    assert.equal(held.length, 1, "exactly one winner");
    assert.equal(soldOut.length, attempts - 1);
    assert.equal(engine.availability.unitsLeft(room.id, 243, 245), 0);
  });
});
