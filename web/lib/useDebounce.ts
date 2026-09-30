import { useState, useEffect } from "react";

/**
 * Reusable hook to debounce any value (e.g. search input).
 * @param value The value to debounce.
 * @param delayMs Delay in milliseconds (default: 300ms).
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
