import type { AvailabilityIndex } from "./availability.js";
import { LruCache } from "./cache.js";
import { isoToDay, validateStay } from "./calendar.js";
import { quote } from "./pricing.js";
import { explain, featureVector, scoreCandidate } from "./ranking.js";
import type { Hotel, SearchFacets, SearchHit, SearchQuery, SearchResult, SortOrder } from "./types.js";

export interface SearchServiceOptions {
  readonly cacheCapacity?: number;
  readonly cacheTtlMs?: number;
  readonly today?: string;
  readonly now?: () => number;
}

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 50;

/** Canonical cache key: same query in any field order/casing hits the same entry. */
export function cacheKey(q: SearchQuery): string {
  const amen = [...(q.amenities ?? [])].sort().join("+");
  return [
    q.city.trim().toLowerCase(),
    q.checkIn,
    q.checkOut,
    q.guests,
    q.rooms ?? 1,
    q.currency ?? "",
    q.minStars ?? 0,
    q.maxNightlyPrice ?? 0,
    amen,
    q.freeCancellation ? 1 : 0,
    q.sort ?? "recommended",
    q.traveller ?? "",
  ].join("|");
}

function normalise(q: SearchQuery): Required<Pick<SearchQuery, "rooms" | "sort" | "page" | "pageSize">> & SearchQuery {
  const rooms = q.rooms ?? 1;
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, q.pageSize ?? PAGE_SIZE_DEFAULT));
  return { ...q, rooms, sort: q.sort ?? "recommended", page: Math.max(1, q.page ?? 1), pageSize };
}

const comparators: Record<SortOrder, (a: SearchHit, b: SearchHit) => number> = {
  recommended: (a, b) => b.score - a.score || a.quote.total - b.quote.total,
  price_asc: (a, b) => a.quote.total - b.quote.total || b.score - a.score,
  price_desc: (a, b) => b.quote.total - a.quote.total || b.score - a.score,
  rating_desc: (a, b) => b.hotel.rating - a.hotel.rating || b.score - a.score,
  distance_asc: (a, b) => a.hotel.distanceToCentreKm - b.hotel.distanceToCentreKm || b.score - a.score,
};

export class SearchService {
  private readonly byCity = new Map<string, Hotel[]>();
  private readonly cache: LruCache<string, readonly SearchHit[]>;
  private readonly today: string;
  private readonly now: () => number;

  constructor(
    hotels: readonly Hotel[],
    private readonly availability: AvailabilityIndex,
    opts: SearchServiceOptions = {},
  ) {
    for (const h of hotels) {
      const key = h.city.toLowerCase();
      const list = this.byCity.get(key);
      if (list) list.push(h);
      else this.byCity.set(key, [h]);
    }
    this.cache = new LruCache(opts.cacheCapacity ?? 5_000, opts.cacheTtlMs ?? 30_000, opts.now);
    this.today = opts.today ?? "2026-01-01";
    this.now = opts.now ?? (() => Date.now());
  }

  cities(): string[] {
    return [...this.byCity.values()].map((l) => l[0]!.city).sort();
  }

  cacheStats() {
    return this.cache.stats();
  }

  /** Drop cached searches that could show stale availability for this city. */
  invalidateCity(city: string): number {
    const prefix = `${city.trim().toLowerCase()}|`;
    return this.cache.invalidateWhere((k) => k.startsWith(prefix));
  }

  search(input: SearchQuery): SearchResult {
    const t0 = this.now();
    const q = normalise(input);
    validateStay(q.checkIn, q.checkOut, this.today);
    if (!Number.isInteger(q.guests) || q.guests < 1 || q.guests > 16) throw new RangeError("guests must be 1..16");
    if (!Number.isInteger(q.rooms) || q.rooms < 1 || q.rooms > 8) throw new RangeError("rooms must be 1..8");

    const key = cacheKey(q);
    let hits = this.cache.get(key);
    let cacheState: "hit" | "miss" = "hit";
    if (!hits) {
      cacheState = "miss";
      hits = this.compute(q);
      this.cache.set(key, hits);
    }

    const start = (q.page - 1) * q.pageSize;
    return {
      query: q,
      total: hits.length,
      page: q.page,
      pageSize: q.pageSize,
      hits: hits.slice(start, start + q.pageSize),
      facets: facets(hits),
      cache: cacheState,
      tookMs: this.now() - t0,
    };
  }

  private compute(q: ReturnType<typeof normalise>): SearchHit[] {
    const hotels = this.byCity.get(q.city.trim().toLowerCase()) ?? [];
    const startDay = isoToDay(q.checkIn);
    const endDay = isoToDay(q.checkOut);
    const guestsPerRoom = Math.ceil(q.guests / q.rooms);
    const wanted = new Set(q.amenities ?? []);
    const out: SearchHit[] = [];

    for (const hotel of hotels) {
      if (q.minStars !== undefined && hotel.stars < q.minStars) continue;
      if (wanted.size > 0 && ![...wanted].every((a) => hotel.amenities.includes(a))) continue;

      // Cheapest bookable room type that fits the party is the hotel's representative offer.
      let best: SearchHit | undefined;
      for (const room of hotel.roomTypes) {
        if (room.capacity < guestsPerRoom) continue;
        if (q.freeCancellation && !room.refundable) continue;
        const left = this.availability.unitsLeft(room.id, startDay, endDay);
        if (left < q.rooms) continue; // sold out for these dates
        const occupancy = this.availability.occupancy(room.id, startDay, endDay);
        const pq = quote(room, hotel.currency, startDay, endDay, q.rooms, occupancy, q.currency ?? hotel.currency);
        if (q.maxNightlyPrice !== undefined && pq.averageNightly > q.maxNightlyPrice) continue;
        const scored = scoreCandidate(featureVector(hotel, room, pq), undefined, q.traveller);
        const hit: SearchHit = { hotel, roomType: room, quote: pq, unitsLeft: left, score: scored.score, explanation: explain(scored) };
        if (!best || hit.quote.total < best.quote.total) best = hit;
      }
      if (best) out.push(best);
    }

    out.sort(comparators[q.sort]);
    return out;
  }
}

function facets(hits: readonly SearchHit[]): SearchFacets {
  const stars: Record<string, number> = {};
  const edges = [2_000, 4_000, 8_000, 15_000, 30_000, Number.POSITIVE_INFINITY]; // in major units of display currency
  const counts = edges.map(() => 0);
  for (const h of hits) {
    stars[h.hotel.stars] = (stars[h.hotel.stars] ?? 0) + 1;
    const major = h.quote.averageNightly / 100;
    const i = edges.findIndex((e) => major <= e);
    counts[i === -1 ? counts.length - 1 : i]! += 1;
  }
  return { stars, priceBuckets: edges.map((upTo, i) => ({ upTo, count: counts[i]! })) };
}
