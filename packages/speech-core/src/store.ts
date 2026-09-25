/** A tiny observable value whose snapshots are stable objects: plugs straight into React's useSyncExternalStore. */
export interface Store<T> {
  readonly get: () => T;
  readonly subscribe: (listener: (value: T) => void) => () => void;
}

export interface WritableStore<T> extends Store<T> {
  readonly set: (value: T) => void;
}

export function createStore<T>(initial: T): WritableStore<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const l of [...listeners]) l(value);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
