/**
 * Lightweight, in-memory client cache with:
 * 1. In-flight promise deduplication (single-flight)
 * 2. Stale-While-Revalidate (SWR) support
 * 3. Semantic tag-based invalidation (e.g. "tickets", "spgs", "events")
 * 4. User-scoped cache isolation and cleanup on sign-out
 * 5. LRU eviction to prevent memory leaks
 */

export type CacheOptions = {
  /** Milliseconds before cached data is considered stale. Default: 2 minutes (120,000ms). */
  ttl?: number;
  /** Tags associated with this entry for bulk invalidation. */
  tags?: string[];
  /** Optional user identifier. Useful for clearing private data on logout. */
  userScope?: string | null;
  /** Force bypass of cached data to fetch fresh from network. */
  force?: boolean;
};

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
  userScope?: string | null;
};

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_CACHE_ENTRIES = 200;

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();
  private tagIndex = new Map<string, Set<string>>();
  private listeners = new Map<string, Set<() => void>>();
  private maxSize: number;
  private defaultTtlMs: number;

  constructor(options?: { maxSize?: number; defaultTtlMs?: number }) {
    this.maxSize = options?.maxSize ?? MAX_CACHE_ENTRIES;
    this.defaultTtlMs = options?.defaultTtlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Checks if an entry exists in the cache.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Checks if an entry exists and is past its TTL.
   */
  isStale(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Retrieves a cache entry if available.
   * Returns `{ data, isStale }` or `null` if completely missing or past max age.
   */
  get<T>(key: string): { data: T; isStale: boolean } | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    // Refresh LRU order by re-inserting
    this.store.delete(key);
    this.store.set(key, entry as CacheEntry<unknown>);

    const age = Date.now() - entry.timestamp;
    const isStale = age > entry.ttl;

    return { data: entry.data, isStale };
  }

  /**
   * Stores data in cache and updates tag indexes.
   */
  set<T>(key: string, data: T, options?: CacheOptions): void {
    const ttl = options?.ttl ?? this.defaultTtlMs;
    const tags = options?.tags ?? [];
    const userScope = options?.userScope ?? null;

    // Enforce LRU cap
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.delete(oldestKey);
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      tags,
      userScope,
    };

    this.store.set(key, entry as CacheEntry<unknown>);

    // Update tag index
    for (const tag of tags) {
      let set = this.tagIndex.get(tag);
      if (!set) {
        set = new Set<string>();
        this.tagIndex.set(tag, set);
      }
      set.add(key);
    }

    this.notify(key);
  }

  /**
   * Deduplicates concurrent calls to the same key and returns cached or fresh data.
   */
  async fetch<T>(key: string, fetcher: () => Promise<T>, options?: CacheOptions): Promise<T> {
    if (!options?.force) {
      const cached = this.get<T>(key);
      if (cached && !cached.isStale) {
        return cached.data;
      }
    }

    // Single-flight deduplication: if identical fetch is in-flight, await existing promise
    const existingFlight = this.inFlight.get(key) as Promise<T> | undefined;
    if (existingFlight) {
      return existingFlight;
    }

    const promise = (async () => {
      try {
        const data = await fetcher();
        this.set(key, data, options);
        return data;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise as Promise<unknown>);
    return promise;
  }

  /**
   * Removes a specific key and cleans up tag indexing.
   */
  delete(key: string): void {
    const entry = this.store.get(key);
    if (entry) {
      for (const tag of entry.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
      this.store.delete(key);
      this.notify(key);
    }
  }

  /**
   * Invalidates all cache entries tagged with any of the provided tags.
   */
  invalidateTags(tags: string | string[]): void {
    const tagList = Array.isArray(tags) ? tags : [tags];
    const keysToInvalidate = new Set<string>();

    for (const tag of tagList) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        for (const k of keys) {
          keysToInvalidate.add(k);
        }
      }
    }

    for (const key of keysToInvalidate) {
      this.delete(key);
    }
  }

  /**
   * Invalidates specific cache keys.
   */
  invalidateKeys(keys: string | string[]): void {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      this.delete(key);
    }
  }

  /**
   * Clears the cache. If `userScope` is provided, clears only items belonging to that user.
   */
  clear(userScope?: string | null): void {
    if (!userScope) {
      this.store.clear();
      this.inFlight.clear();
      this.tagIndex.clear();
      for (const listeners of this.listeners.values()) {
        listeners.forEach((fn) => fn());
      }
      return;
    }

    // Clear only user-scoped items
    const toDelete: string[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (entry.userScope === userScope) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.delete(key);
    }
  }

  /**
   * Subscribes a callback to changes for a given key.
   */
  subscribe(key: string, listener: () => void): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);

    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  private notify(key: string): void {
    const set = this.listeners.get(key);
    if (set) {
      set.forEach((fn) => {
        try {
          fn();
        } catch {
          // Ignore listener errors
        }
      });
    }
  }
}

export const appCache = new MemoryCache();
export { MemoryCache as CacheStore };
