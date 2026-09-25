import type { SpeechError } from "@kucukkanat/speech-core";
import type { CreateVoiceInput, VoiceRecord, VoiceStore } from "@kucukkanat/voices";
import { useSyncExternalStore } from "react";

export interface VoicesState<Meta> {
  /** Demo voices first, then yours, newest first */
  voices: readonly VoiceRecord<Meta>[];
  loading: boolean;
  error: SpeechError | null;
  create: (input: CreateVoiceInput<Meta>) => Promise<VoiceRecord<Meta>>;
  update: (id: string, patch: { name?: string; meta?: Meta }) => Promise<VoiceRecord<Meta>>;
  remove: (id: string) => Promise<VoiceRecord<Meta>>;
  restore: (voice: VoiceRecord<Meta>) => Promise<VoiceRecord<Meta>>;
}

/**
 * The voices in a store, kept up to date.
 *
 * ```tsx
 * const { voices, create } = useVoices(voiceStore);
 * ```
 */
export function useVoices<Meta>(store: VoiceStore<Meta>): VoicesState<Meta> {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    () => store.snapshot,
    () => store.snapshot,
  );
  return { ...snapshot, create: store.create, update: store.update, remove: store.remove, restore: store.restore };
}
