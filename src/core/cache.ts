/**
 * LRU cache with per-entry TTL. `Map` preserves insertion order, so moving a key to
 * the end on access gives O(1) get/set/evict without a hand-rolled linked list.
 */
export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly expirations: number;
  readonly size: number;
  readonly hitRate: number;
}

export class LruCache<K, V> {
  private readonly map = new Map<K, { value: V; expiresAt: number }>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (capacity < 1) throw new RangeError("capacity must be >= 1");
  }

  get(key: K): V | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    if (e.expiresAt <= this.now()) {
      this.map.delete(key);
      this.expirations++;
      this.misses++;
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, e);
    this.hits++;
    return e.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
      this.evictions++;
    }
    this.map.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /** Drop every entry whose key satisfies the predicate (e.g. all searches for a hotel's city after a booking). */
  invalidateWhere(pred: (key: K) => boolean): number {
    let n = 0;
    for (const k of [...this.map.keys()]) if (pred(k)) n += this.map.delete(k) ? 1 : 0;
    return n;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      size: this.map.size,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }
}
