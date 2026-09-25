import { useEffect, useState } from "react";

/**
 * useState mirrored to localStorage. `parse` validates the stored value (return undefined to reject it),
 * so a stale or hand-edited entry falls back to `initial` instead of leaking a bad value into the app.
 */
export function usePersistentState<T>(key: string, initial: () => T, parse: (raw: unknown) => T | undefined) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return parse(JSON.parse(raw)) ?? initial();
    } catch (e) {
      // Storage can be blocked (privacy mode, sandboxed previews) or hold malformed JSON; the default still works.
      console.warn(`[storage] could not read "${key}"`, e);
    }
    return initial();
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[storage] could not write "${key}"`, e);
    }
  }, [key, value]);
  return [value, setValue] as const;
}
