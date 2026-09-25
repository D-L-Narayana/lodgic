import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AvailabilityIndex, MinSegmentTree } from "../src/core/availability.js";
import { LruCache } from "../src/core/cache.js";
import { dayToIso, isoToDay, mergeRanges, nightsBetween, parseAvailabilityCalendar, validateStay } from "../src/core/calendar.js";
import { dedupeOffers, mergeSortedFeeds, MinHeap, normaliseHotelName } from "../src/core/feeds.js";
import { allocate, convert, roundHalfUp, scale } from "../src/core/money.js";
import { luhnValid, MockPaymentGateway, TEST_CARDS } from "../src/core/payments.js";
import { DEFAULT_PRICING, demandUplift, lengthOfStayDiscountRate, quote } from "../src/core/pricing.js";
import { explain, featureVector, scoreCandidate } from "../src/core/ranking.js";
import { seedHotels } from "../src/core/seed.js";
import type { RoomType, SupplierRate } from "../src/core/types.js";

const room: RoomType = { id: "r1", hotelId: "h1", name: "Standard Room", capacity: 2, totalUnits: 5, baseRate: 400_000, refundable: true, breakfastIncluded: false };

describe("money", () => {
  it("rounds half away from zero", () => {
    assert.equal(roundHalfUp(2.5), 3);
    assert.equal(roundHalfUp(-2.5), -3);
    assert.equal(roundHalfUp(2.4999), 2);
    assert.equal(scale(1005, 1.005), 1010); // 1010.025 -> 1010
  });
  it("converts with the target currency's minor unit (JPY 0, KWD 3)", () => {
    assert.equal(convert(100_000, "INR", "JPY"), 1780); // ₹1,000 -> ¥1,780
    assert.equal(convert(100_000, "INR", "KWD"), 3700); // ₹1,000 -> 3.700 KWD in fils
    assert.equal(convert(123, "INR", "INR"), 123);
    assert.equal(convert(convert(1_000_000, "INR", "USD"), "USD", "INR"), 1_000_000);
  });
  it("allocates a total across nights without losing a paise", () => {
    const parts = allocate(1000, [1, 1, 1]);
    assert.deepEqual(parts, [334, 333, 333]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
    for (let total = 1; total < 200; total++) {
      const p = allocate(total, [3, 5, 7, 11]);
      assert.equal(p.reduce((a, b) => a + b, 0), total);
    }
  });
});

describe("calendar", () => {
  it("indexes days and round-trips", () => {
    assert.equal(isoToDay("2026-01-01"), 0);
    assert.equal(isoToDay("2026-03-01"), 59);
    assert.equal(dayToIso(59), "2026-03-01");
    assert.equal(nightsBetween("2026-12-30", "2027-01-02"), 3);
    assert.throws(() => isoToDay("2026-02-30"), RangeError);
  });
  it("merges overlapping ranges and parses supplier calendars", () => {
    assert.deepEqual(
      mergeRanges([
        { start: 5, end: 8 },
        { start: 1, end: 3 },
        { start: 2, end: 6 },
        { start: 10, end: 12 },
        { start: 8, end: 10 },
      ]),
      [
        { start: 1, end: 12 },
      ],
    );
    assert.deepEqual(parseAvailabilityCalendar(" 2026-03-01..2026-03-05, 2026-03-10 ,2026-03-04..2026-03-06"), [
      { start: 59, end: 64 },
      { start: 68, end: 69 },
    ]);
    assert.throws(() => parseAvailabilityCalendar("2026-03-05..2026-03-01"), RangeError);
  });
  it("validates stays", () => {
    assert.throws(() => validateStay("2026-05-02", "2026-05-01"), /after checkIn/);
    assert.throws(() => validateStay("2025-12-31", "2026-01-02"), /past/);
    assert.throws(() => validateStay("2026-05-01", "2026-06-05"), /30 nights/);
    validateStay("2026-05-01", "2026-05-04");
  });
});

describe("segment tree", () => {
  it("matches a brute-force array on random range-add / range-min operations", () => {
    let s = 12345;
    const rnd = (n: number): number => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s % n;
    };
    const n = 257;
    const ref = new Array<number>(n).fill(7);
    const t = new MinSegmentTree(ref);
    for (let i = 0; i < 5000; i++) {
      const l = rnd(n);
      const r = l + 1 + rnd(n - l);
      if (i % 2 === 0) {
        const d = rnd(5) - 2;
        t.rangeAdd(l, r, d);
        for (let k = l; k < r; k++) ref[k]! += d;
      } else {
        assert.equal(t.rangeMin(l, r), Math.min(...ref.slice(l, r)));
      }
    }
    assert.deepEqual(t.toArray(), ref);
  });
});

describe("availability index", () => {
  it("holds are atomic and all-or-nothing; releases restore inventory", () => {
    const idx = new AvailabilityIndex();
    idx.addRoomType("r1", 2, 30);
    assert.deepEqual(idx.hold("r1", 3, 6, 1), { ok: true, unitsLeft: 1 });
    assert.deepEqual(idx.hold("r1", 5, 7, 1), { ok: true, unitsLeft: 0 });
    // night 5 is now sold out, so any stay touching it fails and nothing is decremented
    assert.deepEqual(idx.hold("r1", 0, 10, 1), { ok: false, unitsLeft: 0 });
    assert.equal(idx.unitsLeft("r1", 0, 3), 2);
    idx.release("r1", 5, 7, 1);
    assert.equal(idx.unitsLeft("r1", 3, 6), 1);
    assert.throws(() => idx.release("r1", 0, 30, 5), /double release/);
    assert.throws(() => idx.hold("r1", 0, 2, 0), RangeError);
  });
  it("stop-sell closes inventory and occupancy reflects sold units", () => {
    const idx = new AvailabilityIndex();
    idx.addRoomType("r1", 4, 30);
    idx.stopSell("r1", 10, 12);
    assert.equal(idx.unitsLeft("r1", 9, 11), 0);
    assert.equal(idx.unitsLeft("r1", 0, 10), 4);
    idx.hold("r1", 0, 5, 3);
    assert.equal(idx.occupancy("r1", 0, 5), 0.75);
  });
});

describe("pricing", () => {
  it("is deterministic and applies weekend, season, demand and LOS rules", () => {
    const fri = isoToDay("2026-05-01"); // 2026-05-01 is a Friday
    const q1 = quote(room, "INR", fri, fri + 1, 1, 0);
    const q2 = quote(room, "INR", fri, fri + 1, 1, 0);
    assert.deepEqual(q1, q2);
    assert.equal(q1.nightly[0], scale(400_000, 0.9 * 1.15)); // May season 0.9 × weekend 1.15
    const mon = isoToDay("2026-05-04");
    assert.equal(quote(room, "INR", mon, mon + 1, 1, 0).nightly[0], scale(400_000, 0.9));
    assert.equal(demandUplift(0.5), 0);
    assert.ok(Math.abs(demandUplift(1) - DEFAULT_PRICING.maxDemandUplift) < 1e-12);
    assert.ok(quote(room, "INR", mon, mon + 1, 1, 0.95).nightly[0]! > quote(room, "INR", mon, mon + 1, 1, 0.2).nightly[0]!);
    assert.equal(lengthOfStayDiscountRate(2), 0);
    assert.equal(lengthOfStayDiscountRate(3), 0.05);
    assert.equal(lengthOfStayDiscountRate(9), 0.1);
  });
  it("breakdown always sums to total and converts currency once per component", () => {
    const d = isoToDay("2026-06-10");
    for (const ccy of ["INR", "USD", "JPY", "KWD"] as const) {
      const q = quote(room, "INR", d, d + 7, 2, 0.6, ccy);
      assert.equal(q.roomsSubtotal + q.lengthOfStayDiscount + q.taxesAndFees, q.total);
      assert.equal(q.roomsSubtotal, q.nightly.reduce((a, b) => a + b, 0) * 2);
      assert.ok(Number.isInteger(q.total));
      assert.equal(q.currency, ccy);
    }
  });
});

describe("feeds", () => {
  const rate = (supplier: string, hotelName: string, nightlyRate: number, lat = 12.97, lng = 77.59, roomName = "Standard Room"): SupplierRate => ({
    supplier,
    hotelName,
    location: { lat, lng },
    roomName,
    nightlyRate,
    currency: "INR",
  });
  it("heap orders items", () => {
    const h = new MinHeap<number>((a, b) => a < b);
    for (const v of [5, 3, 9, 1, 7, 3]) h.push(v);
    const out: number[] = [];
    while (h.size) out.push(h.pop()!);
    assert.deepEqual(out, [1, 3, 3, 5, 7, 9]);
  });
  it("k-way merge equals concatenate-and-sort and is stable across feeds", () => {
    const feeds = [
      [rate("A", "x", 100), rate("A", "x", 300), rate("A", "x", 300)],
      [rate("B", "y", 50), rate("B", "y", 300), rate("B", "y", 900)],
      [],
      [rate("C", "z", 200)],
    ];
    const merged = mergeSortedFeeds(feeds);
    assert.deepEqual(
      merged.map((r) => r.nightlyRate),
      feeds
        .flat()
        .map((r) => r.nightlyRate)
        .sort((a, b) => a - b),
    );
    const ties = merged.filter((r) => r.nightlyRate === 300).map((r) => r.supplier);
    assert.deepEqual(ties, ["A", "A", "B"]);
  });
  it("de-duplicates the same property across suppliers keeping the cheapest offer", () => {
    assert.equal(normaliseHotelName("The Grand Lotus Hotel & Spa"), "grand lotus and spa");
    const rows = [
      rate("A", "The Grand Lotus Hotel", 5000, 12.9716, 77.5946),
      rate("B", "Grand Lotus", 4500, 12.9718, 77.5944),
      rate("C", "GRAND LOTUS HOTEL", 4800, 12.9715, 77.5947),
      rate("A", "Grand Lotus", 4400, 12.9716, 77.5946, "Deluxe Room"),
      rate("B", "Palm Court", 3000, 13.0, 77.6),
    ];
    const out = dedupeOffers(rows);
    assert.equal(out.length, 3);
    const lotus = out.find((o) => o.key.startsWith("grand lotus|standard room|"))!;
    assert.equal(lotus.offers, 3);
    assert.equal(lotus.best.supplier, "B");
    assert.equal(lotus.best.nightlyRate, 4500);
  });
});

describe("lru cache", () => {
  it("evicts least-recently-used and expires by TTL", () => {
    let now = 0;
    const c = new LruCache<string, number>(2, 100, () => now);
    c.set("a", 1);
    c.set("b", 2);
    assert.equal(c.get("a"), 1); // a is now most recent
    c.set("c", 3); // evicts b
    assert.equal(c.get("b"), undefined);
    assert.equal(c.get("c"), 3);
    now = 150;
    assert.equal(c.get("a"), undefined); // expired
    const s = c.stats();
    assert.equal(s.evictions, 1);
    assert.equal(s.expirations, 1);
    assert.equal(s.hits, 2);
    assert.equal(s.misses, 2);
    assert.equal(s.hitRate, 0.5);
  });
});

describe("ranking", () => {
  it("prefers cheaper, better-rated, closer hotels all else equal", () => {
    const [hotel] = seedHotels({ hotelsPerCity: 1 });
    const r = hotel!.roomTypes[0]!;
    const d = isoToDay("2026-04-10");
    const cheap = quote({ ...r, baseRate: 200_000 }, hotel!.currency, d, d + 2, 1, 0.3);
    const dear = quote({ ...r, baseRate: 900_000 }, hotel!.currency, d, d + 2, 1, 0.3);
    const sCheap = scoreCandidate(featureVector(hotel!, r, cheap)).score;
    const sDear = scoreCandidate(featureVector(hotel!, r, dear)).score;
    assert.ok(sCheap > sDear);
    const near = scoreCandidate(featureVector({ ...hotel!, distanceToCentreKm: 0.5 }, r, cheap)).score;
    const far = scoreCandidate(featureVector({ ...hotel!, distanceToCentreKm: 12 }, r, cheap)).score;
    assert.ok(near > far);
    const good = scoreCandidate(featureVector({ ...hotel!, rating: 9.4 }, r, cheap)).score;
    const bad = scoreCandidate(featureVector({ ...hotel!, rating: 5.1 }, r, cheap)).score;
    assert.ok(good > bad);
    // budget travellers weigh price even more
    const budgetGap = scoreCandidate(featureVector(hotel!, r, cheap), undefined, "budget").score - scoreCandidate(featureVector(hotel!, r, dear), undefined, "budget").score;
    assert.ok(budgetGap > sCheap - sDear);
    assert.equal(explain(scoreCandidate(featureVector(hotel!, r, cheap))).length, 2);
  });
});

describe("payments", () => {
  it("is idempotent, validates cards and injects failures", () => {
    const g = new MockPaymentGateway(() => 1000);
    assert.ok(luhnValid(TEST_CARDS.success));
    assert.ok(!luhnValid("4242424242424241"));
    const a = g.createIntent({ idempotencyKey: "k1", amount: 500, currency: "INR", card: TEST_CARDS.success });
    const b = g.createIntent({ idempotencyKey: "k1", amount: 500, currency: "INR", card: TEST_CARDS.success });
    assert.equal(a.id, b.id);
    assert.equal(g.confirm(a.id).status, "succeeded");
    assert.equal(g.confirm(a.id).status, "succeeded");
    const bad = g.createIntent({ idempotencyKey: "k2", amount: 500, currency: "INR", card: TEST_CARDS.declined });
    assert.equal(g.confirm(bad.id).status, "failed");
    assert.throws(() => g.refund(bad.id), /cannot refund/);
    assert.equal(g.refund(a.id).status, "refunded");
    assert.throws(() => g.createIntent({ idempotencyKey: "k3", amount: 0, currency: "INR", card: TEST_CARDS.success }), RangeError);
    assert.throws(() => g.createIntent({ idempotencyKey: "k4", amount: 10, currency: "INR", card: "1234" }), RangeError);
  });
});
