/**
 * A push-to-pull bridge: producers `push`/`close`/`fail`, consumers `for await` over it. Unbounded (producers are
 * model outputs that we never want to block), single-consumer.
 */
export interface Channel<T> extends AsyncIterable<T> {
  push(value: T): void;
  close(): void;
  fail(error: unknown): void;
  /** Called once if the consumer stops early (`break`/`return` in `for await`). */
  onReturn(listener: () => void): void;
}

export function createChannel<T>(): Channel<T> {
  const buffered: T[] = [];
  let waiting: { resolve: (r: IteratorResult<T>) => void; reject: (e: unknown) => void } | null = null;
  let done = false;
  let error: { value: unknown } | null = null;
  let returnListener: (() => void) | null = null;

  const settle = () => {
    if (!waiting) return;
    const w = waiting;
    const next = buffered.shift();
    if (next !== undefined) {
      waiting = null;
      w.resolve({ value: next, done: false });
    } else if (error) {
      waiting = null;
      w.reject(error.value);
    } else if (done) {
      waiting = null;
      w.resolve({ value: undefined, done: true });
    }
  };

  return {
    push(value) {
      if (done || error) return;
      buffered.push(value);
      settle();
    },
    close() {
      done = true;
      settle();
    },
    fail(e) {
      if (done || error) return;
      error = { value: e };
      settle();
    },
    onReturn(listener) {
      returnListener = listener;
    },
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise<IteratorResult<T>>((resolve, reject) => {
            waiting = { resolve, reject };
            settle();
          }),
        return: async () => {
          const wasOpen = !done && !error;
          done = true;
          buffered.length = 0;
          if (wasOpen) returnListener?.();
          return { value: undefined, done: true };
        },
      };
    },
  };
}
