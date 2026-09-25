import { HORIZON_DAYS } from "./calendar.js";

/**
 * Segment tree over an integer array supporting
 *   - rangeMin(l, r)      : minimum over [l, r)          O(log n)
 *   - rangeAdd(l, r, d)   : add d to every cell in [l, r) O(log n)  (lazy propagation)
 * Backed by typed arrays; no allocation on the hot path.
 */
export class MinSegmentTree {
  private readonly n: number;
  private readonly size: number;
  private readonly min: Int32Array;
  private readonly lazy: Int32Array;

  constructor(values: ArrayLike<number>) {
    this.n = values.length;
    let size = 1;
    while (size < this.n) size <<= 1;
    this.size = size;
    this.min = new Int32Array(2 * size);
    this.lazy = new Int32Array(2 * size);
    for (let i = 0; i < this.n; i++) this.min[size + i] = values[i]!;
    for (let i = this.n; i < size; i++) this.min[size + i] = 0x3fffffff; // +inf padding
    for (let i = size - 1; i >= 1; i--) this.min[i] = Math.min(this.min[2 * i]!, this.min[2 * i + 1]!);
  }

  get length(): number {
    return this.n;
  }

  private apply(node: number, delta: number): void {
    this.min[node] = this.min[node]! + delta;
    if (node < this.size) this.lazy[node] = this.lazy[node]! + delta;
  }

  private push(node: number): void {
    const d = this.lazy[node]!;
    if (d !== 0) {
      this.apply(2 * node, d);
      this.apply(2 * node + 1, d);
      this.lazy[node] = 0;
    }
  }

  rangeMin(l: number, r: number): number {
    if (l < 0 || r > this.n || l >= r) throw new RangeError(`bad range [${l}, ${r})`);
    return this.queryRec(1, 0, this.size, l, r);
  }

  private queryRec(node: number, nl: number, nr: number, l: number, r: number): number {
    if (r <= nl || nr <= l) return 0x3fffffff;
    if (l <= nl && nr <= r) return this.min[node]!;
    this.push(node);
    const mid = (nl + nr) >> 1;
    return Math.min(this.queryRec(2 * node, nl, mid, l, r), this.queryRec(2 * node + 1, mid, nr, l, r));
  }

  rangeAdd(l: number, r: number, delta: number): void {
    if (l < 0 || r > this.n || l >= r) throw new RangeError(`bad range [${l}, ${r})`);
    this.updateRec(1, 0, this.size, l, r, delta);
  }

  private updateRec(node: number, nl: number, nr: number, l: number, r: number, delta: number): void {
    if (r <= nl || nr <= l) return;
    if (l <= nl && nr <= r) {
      this.apply(node, delta);
      return;
    }
    this.push(node);
    const mid = (nl + nr) >> 1;
    this.updateRec(2 * node, nl, mid, l, r, delta);
    this.updateRec(2 * node + 1, mid, nr, l, r, delta);
    this.min[node] = Math.min(this.min[2 * node]!, this.min[2 * node + 1]!);
  }

  pointValue(i: number): number {
    return this.rangeMin(i, i + 1);
  }

  toArray(): number[] {
    const out = new Array<number>(this.n);
    for (let i = 0; i < this.n; i++) out[i] = this.pointValue(i);
    return out;
  }
}

export interface HoldResult {
  readonly ok: boolean;
  readonly unitsLeft: number; // min units left over the stay after (or without) the hold
}

/**
 * Availability index: one segment tree per room type holding the number of
 * unsold units for each night in the horizon.
 *
 * `hold()` is all-or-nothing: it checks the minimum over the stay and decrements
 * every night in one synchronous step, so two overlapping requests can never both
 * take the last unit (the JavaScript engine gives us a single-threaded critical
 * section; a database would use `SELECT ... FOR UPDATE` or a unique constraint).
 */
export class AvailabilityIndex {
  private readonly trees = new Map<string, MinSegmentTree>();
  private readonly capacity = new Map<string, number>();

  addRoomType(roomTypeId: string, totalUnits: number, horizonDays: number = HORIZON_DAYS): void {
    if (this.trees.has(roomTypeId)) throw new Error(`room type already registered: ${roomTypeId}`);
    const init = new Int32Array(horizonDays).fill(totalUnits);
    this.trees.set(roomTypeId, new MinSegmentTree(init));
    this.capacity.set(roomTypeId, totalUnits);
  }

  has(roomTypeId: string): boolean {
    return this.trees.has(roomTypeId);
  }

  private tree(roomTypeId: string): MinSegmentTree {
    const t = this.trees.get(roomTypeId);
    if (!t) throw new Error(`unknown room type: ${roomTypeId}`);
    return t;
  }

  /** Minimum unsold units over the nights [startDay, endDay). */
  unitsLeft(roomTypeId: string, startDay: number, endDay: number): number {
    return this.tree(roomTypeId).rangeMin(startDay, endDay);
  }

  /** Close out inventory (stop-sell) for a range, e.g. from a supplier calendar. */
  stopSell(roomTypeId: string, startDay: number, endDay: number): void {
    const t = this.tree(roomTypeId);
    for (let d = startDay; d < endDay; d++) {
      const v = t.pointValue(d);
      if (v > 0) t.rangeAdd(d, d + 1, -v);
    }
  }

  hold(roomTypeId: string, startDay: number, endDay: number, rooms: number): HoldResult {
    if (!Number.isInteger(rooms) || rooms < 1) throw new RangeError("rooms must be a positive integer");
    const t = this.tree(roomTypeId);
    const left = t.rangeMin(startDay, endDay);
    if (left < rooms) return { ok: false, unitsLeft: left };
    t.rangeAdd(startDay, endDay, -rooms);
    return { ok: true, unitsLeft: left - rooms };
  }

  release(roomTypeId: string, startDay: number, endDay: number, rooms: number): void {
    const t = this.tree(roomTypeId);
    const cap = this.capacity.get(roomTypeId)!;
    t.rangeAdd(startDay, endDay, rooms);
    if (t.rangeMin(startDay, endDay) > cap) throw new Error("release exceeded capacity: double release?");
  }

  /** Occupancy ratio (0..1) over a stay; drives demand-based pricing. */
  occupancy(roomTypeId: string, startDay: number, endDay: number): number {
    const cap = this.capacity.get(roomTypeId);
    if (!cap) throw new Error(`unknown room type: ${roomTypeId}`);
    const left = this.unitsLeft(roomTypeId, startDay, endDay);
    return 1 - left / cap;
  }

  capacityOf(roomTypeId: string): number {
    const cap = this.capacity.get(roomTypeId);
    if (cap === undefined) throw new Error(`unknown room type: ${roomTypeId}`);
    return cap;
  }
}
