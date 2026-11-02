import { test } from "node:test";
import assert from "node:assert/strict";
import { CacheStore, appCache } from "../.test-build/lib/cache.js";

test("cache store stores and retrieves values within TTL", () => {
  const cache = new CacheStore({ maxSize: 10, defaultTtlMs: 5000 });
  cache.set("key1", { name: "Alice" });

  assert.equal(cache.has("key1"), true);
  const entry = cache.get("key1");
  assert.equal(entry?.data?.name, "Alice");
  assert.equal(cache.isStale("key1"), false);
});

test("cache store handles single-flight request deduplication", async () => {
  const cache = new CacheStore();
  let fetchCount = 0;

  const slowFetcher = async () => {
    fetchCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { count: fetchCount };
  };

  // Launch three concurrent requests for the same key
  const [res1, res2, res3] = await Promise.all([
    cache.fetch("dedup-key", slowFetcher),
    cache.fetch("dedup-key", slowFetcher),
    cache.fetch("dedup-key", slowFetcher),
  ]);

  assert.equal(fetchCount, 1);
  assert.equal(res1.count, 1);
  assert.equal(res2.count, 1);
  assert.equal(res3.count, 1);
});

test("cache store invalidates entries by tag", () => {
  const cache = new CacheStore();
  cache.set("events:all", [1, 2, 3], { tags: ["events", "dashboard"] });
  cache.set("events:1", { id: 1 }, { tags: ["events"] });
  cache.set("spgs:all", ["spg1"], { tags: ["spgs", "dashboard"] });

  assert.equal(cache.has("events:all"), true);
  assert.equal(cache.has("events:1"), true);
  assert.equal(cache.has("spgs:all"), true);

  // Invalidate events
  cache.invalidateTags("events");

  assert.equal(cache.has("events:all"), false);
  assert.equal(cache.has("events:1"), false);
  assert.equal(cache.has("spgs:all"), true);
});

test("cache store evicts least recently used items when cap is exceeded", () => {
  const cache = new CacheStore({ maxSize: 3 });
  cache.set("k1", 1);
  cache.set("k2", 2);
  cache.set("k3", 3);

  // Access k1 to make it recently used
  cache.get("k1");

  // Add k4; k2 should be evicted as LRU
  cache.set("k4", 4);

  assert.equal(cache.has("k1"), true);
  assert.equal(cache.has("k2"), false);
  assert.equal(cache.has("k3"), true);
  assert.equal(cache.has("k4"), true);
});

test("cache store clears all items on user sign out", () => {
  const cache = new CacheStore();
  cache.set("user:1", { name: "Bob" });
  cache.set("tickets:my", [10, 20]);

  cache.clear();

  assert.equal(cache.has("user:1"), false);
  assert.equal(cache.has("tickets:my"), false);
  assert.equal(cache.get("user:1"), null);
});
