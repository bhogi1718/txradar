/**
 * In-memory TTL cache with request coalescing.
 *
 * Why not Next's fetch cache: it stores any HTTP 200, and several explorers
 * (Etherscan especially) return errors *as* 200s. We only want to cache
 * results that parsed and normalized successfully. Concurrent requests for
 * the same key share one in-flight load so a burst of identical lookups hits
 * the upstream once.
 *
 * Process-local by design: this app runs on one machine. Swap for Redis if
 * that ever changes — the interface is one method.
 */

type Entry<V> = { value: V; expiresAt: number };

export type TtlCacheOptions = {
  /** Max entries before least-recently-inserted are evicted. */
  maxEntries?: number;
  /** Clock override for tests. */
  now?: () => number;
};

export type CacheLookup<V> = { value: V; hit: boolean; ageMs: number };

export class TtlCache<V = unknown> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: TtlCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
  }

  get(key: string): CacheLookup<V> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    const t = this.now();
    if (entry.expiresAt <= t) {
      this.entries.delete(key);
      return undefined;
    }
    return { value: entry.value, hit: true, ageMs: 0 };
  }

  set(key: string, value: V, ttlMs: number): void {
    if (ttlMs <= 0) return;
    // Re-insert so Map iteration order doubles as insertion-recency order.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Return the cached value, or run `load` once (shared across concurrent
   * callers) and cache its result. A rejected load is never cached.
   */
  async getOrLoad(
    key: string,
    ttlMs: number,
    load: () => Promise<V>,
  ): Promise<CacheLookup<V>> {
    const cached = this.get(key);
    if (cached) return cached;

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = load().finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }

    const value = await pending;
    this.set(key, value, ttlMs);
    return { value, hit: false, ageMs: 0 };
  }
}

/** Module-level singletons keyed by purpose so routes share one cache each. */
const registry = new Map<string, TtlCache<unknown>>();

export function sharedCache<V>(name: string, options?: TtlCacheOptions): TtlCache<V> {
  let cache = registry.get(name);
  if (!cache) {
    cache = new TtlCache<unknown>(options);
    registry.set(name, cache);
  }
  return cache as TtlCache<V>;
}
