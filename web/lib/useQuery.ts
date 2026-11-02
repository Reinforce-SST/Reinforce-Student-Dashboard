"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appCache, type CacheOptions } from "./cache";

export type QueryOptions<T> = CacheOptions & {
  /** If false, query will not run automatically. Default: true */
  enabled?: boolean;
  /** Initial fallback data while loading. */
  initialData?: T;
  /** Callback fired on successful fetch. */
  onSuccess?: (data: T) => void;
  /** Callback fired on error. */
  onError?: (err: unknown) => void;
};

export type QueryResult<T> = {
  data: T | undefined;
  loading: boolean;
  isValidating: boolean;
  error: Error | null;
  isStale: boolean;
  refresh: () => Promise<T | undefined>;
  mutate: (updater: T | ((current: T | undefined) => T), shouldRevalidate?: boolean) => void;
};

/**
 * High-performance React hook implementing Stale-While-Revalidate (SWR) caching.
 *
 * 1. If key data is in cache, immediately renders with cached data (0ms latency, loading=false).
 * 2. If data is stale, triggers a background network revalidation without showing a spinner.
 * 3. Subscribes to global cache updates so mutations immediately re-render this component.
 */
export function useQuery<T>(
  key: string | null | undefined,
  fetcher: () => Promise<T>,
  options?: QueryOptions<T>
): QueryResult<T> {
  const enabled = options?.enabled !== false && Boolean(key);

  // Initialize directly from cache for zero-latency first render
  const cached = key ? appCache.get<T>(key) : null;
  const initialData = cached ? cached.data : options?.initialData;
  const initialStale = cached ? cached.isStale : true;
  const initialLoading = enabled && !cached;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(initialLoading);
  const [isValidating, setIsValidating] = useState<boolean>(enabled && (initialLoading || initialStale));
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState<boolean>(initialStale);

  const fetcherRef = useRef(fetcher);
  const optionsRef = useRef(options);
  const activeKeyRef = useRef(key);

  // Refs are only read from effects/callbacks below (after commit), never
  // during render, so syncing them here instead of inline keeps this hook
  // out of react-hooks/refs while still always reading the latest values.
  // Declared before the "re-sync" effect so it commits first in the same
  // pass: that effect calls executeFetch, which reads these refs.
  useEffect(() => {
    fetcherRef.current = fetcher;
    optionsRef.current = options;
    activeKeyRef.current = key;
  });

  const executeFetch = useCallback(
    async (forceNetwork = false): Promise<T | undefined> => {
      const currentKey = activeKeyRef.current;
      if (!currentKey) return undefined;

      setIsValidating(true);
      try {
        const result = await appCache.fetch<T>(
          currentKey,
          () => fetcherRef.current(),
          {
            ...optionsRef.current,
            force: forceNetwork,
          }
        );

        if (activeKeyRef.current === currentKey) {
          setData(result);
          setError(null);
          setLoading(false);
          setIsStale(false);
          optionsRef.current?.onSuccess?.(result);
        }
        return result;
      } catch (err) {
        if (activeKeyRef.current === currentKey) {
          const errObj = err instanceof Error ? err : new Error(String(err));
          setError(errObj);
          setLoading(false);
          optionsRef.current?.onError?.(err);
        }
        return undefined;
      } finally {
        if (activeKeyRef.current === currentKey) {
          setIsValidating(false);
        }
      }
    },
    []
  );

  // Re-sync on key change or initial mount
  useEffect(() => {
    if (!enabled || !key) {
      setLoading(false);
      setIsValidating(false);
      return;
    }

    const currentCached = appCache.get<T>(key);
    if (currentCached) {
      setData(currentCached.data);
      setLoading(false);
      setIsStale(currentCached.isStale);

      // Background revalidate if stale
      if (currentCached.isStale) {
        executeFetch(true);
      }
    } else {
      setLoading(true);
      executeFetch(false);
    }

    // Subscribe to external cache updates (from mutations or other components)
    const unsubscribe = appCache.subscribe(key, () => {
      const updated = appCache.get<T>(key);
      if (updated) {
        setData(updated.data);
        setIsStale(updated.isStale);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [key, enabled, executeFetch]);

  const refresh = useCallback(async () => {
    return executeFetch(true);
  }, [executeFetch]);

  const mutate = useCallback(
    (updater: T | ((current: T | undefined) => T), shouldRevalidate = false) => {
      if (!key) return;
      const nextData = typeof updater === "function" ? (updater as (c: T | undefined) => T)(data) : updater;
      appCache.set(key, nextData, optionsRef.current);
      setData(nextData);
      if (shouldRevalidate) {
        executeFetch(true);
      }
    },
    [key, data, executeFetch]
  );

  return {
    data,
    loading,
    isValidating,
    error,
    isStale,
    refresh,
    mutate,
  };
}
