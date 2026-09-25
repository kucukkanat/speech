import { createNanoEvents, type Unsubscribe } from "nanoevents";

export type { Unsubscribe };

/** Event map: event name → listener arguments. */
export type EventMap = { [event: string]: (...args: never[]) => void };

/** Typed `on(event, listener) → unsubscribe` surface shared by speeches, sessions and microphones. */
export interface Emitter<E extends EventMap> {
  on<K extends keyof E>(event: K, listener: E[K]): Unsubscribe;
}

export interface EmitterController<E extends EventMap> extends Emitter<E> {
  emit<K extends keyof E>(event: K, ...args: Parameters<E[K]>): void;
}

export function createEmitter<E extends EventMap>(): EmitterController<E> {
  const bus = createNanoEvents<E>();
  return {
    on: (event, listener) => bus.on(event, listener),
    emit: (event, ...args) => bus.emit(event, ...args),
  };
}
