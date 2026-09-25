import type { GeoPoint, SupplierRate } from "./types.js";

/** Binary min-heap with a caller-supplied comparator. */
export class MinHeap<T> {
  private readonly a: T[] = [];
  constructor(private readonly less: (x: T, y: T) => boolean) {}

  get size(): number {
    return this.a.length;
  }

  peek(): T | undefined {
    return this.a[0];
  }

  push(v: T): void {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }

  pop(): T | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Merge k supplier feeds that are each sorted by nightlyRate into one sorted
 * stream. O(N log k) with a heap of size k, instead of O(N log N) for
 * concatenate-and-sort. Stable across feeds (ties keep feed order).
 */
export function mergeSortedFeeds(feeds: readonly (readonly SupplierRate[])[]): SupplierRate[] {
  type Cursor = { feed: number; idx: number; rate: number };
  const heap = new MinHeap<Cursor>((x, y) => x.rate < y.rate || (x.rate === y.rate && x.feed < y.feed));
  feeds.forEach((f, i) => {
    if (f.length > 0) heap.push({ feed: i, idx: 0, rate: f[0]!.nightlyRate });
  });
  const out: SupplierRate[] = [];
  while (heap.size > 0) {
    const c = heap.pop()!;
    const feed = feeds[c.feed]!;
    out.push(feed[c.idx]!);
    const next = c.idx + 1;
    if (next < feed.length) heap.push({ feed: c.feed, idx: next, rate: feed[next]!.nightlyRate });
  }
  return out;
}

/**
 * Normalise a hotel name for matching: lower-case, strip punctuation and common
 * noise words ("hotel", "the", "&" vs "and"), collapse whitespace.
 */
export function normaliseHotelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["hotel", "the", "resort", "inn", "suites", "by"].includes(w))
    .join(" ");
}

/** Great-circle distance in km (haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface DedupedRate {
  readonly key: string;
  readonly best: SupplierRate;
  readonly offers: number; // how many supplier rows collapsed into this one
}

/**
 * De-duplicate property offers coming from several suppliers: rows describing the
 * same property (normalised name + same room name + currency, located within
 * `radiusKm` of each other) collapse into one entry keeping the cheapest offer.
 *
 * Hash on the text key, then compare against the (usually 1) cluster for that key
 * with a haversine check, so GPS jitter across suppliers does not split a property
 * the way naive grid snapping does at cell boundaries. O(N) expected; first-seen
 * order is preserved, so a sorted stream stays sorted.
 */
export function dedupeOffers(rows: readonly SupplierRate[], radiusKm: number = 0.25): DedupedRate[] {
  type Cluster = { key: string; best: SupplierRate; offers: number; centre: GeoPoint };
  const byText = new Map<string, Cluster[]>();
  const order: Cluster[] = [];
  for (const r of rows) {
    const text = `${normaliseHotelName(r.hotelName)}|${normaliseHotelName(r.roomName)}|${r.currency}`;
    let clusters = byText.get(text);
    if (!clusters) byText.set(text, (clusters = []));
    const hit = clusters.find((c) => haversineKm(c.centre, r.location) <= radiusKm);
    if (!hit) {
      const c: Cluster = { key: `${text}|${r.location.lat.toFixed(4)},${r.location.lng.toFixed(4)}`, best: r, offers: 1, centre: r.location };
      clusters.push(c);
      order.push(c);
    } else {
      hit.offers += 1;
      if (r.nightlyRate < hit.best.nightlyRate) hit.best = r;
    }
  }
  return order.map(({ key, best, offers }) => ({ key, best, offers }));
}
