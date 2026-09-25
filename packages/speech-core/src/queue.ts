/**
 * Runs async tasks one at a time, in call order. A failed task doesn't break the chain for the next one
 * (its error still reaches its own caller).
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
