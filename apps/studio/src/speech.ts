// The app's speech engines: one instance of each, shared by every view (each holds a model in GPU memory).
import { createSTT, type SttModelKey } from "@kucukkanat/stt";
import { createTTS, type TtsModelKey } from "@kucukkanat/tts";
import { createVoiceStore, type VoiceRecord } from "@kucukkanat/voices";

export interface PersonaMeta {
  colors: [string, string];
  emoji?: string;
}

/** A voice in this app's library. */
export type Persona = VoiceRecord<PersonaMeta>;

const DEMO_META: Record<string, PersonaMeta> = {
  "builtin-aria": { colors: ["#ff9a6b", "#ff4f9a"], emoji: "🌅" },
  "builtin-orion": { colors: ["#4fd1ff", "#6c5cff"], emoji: "🌌" },
};

export const voices = createVoiceStore<PersonaMeta>({
  // The studio's original database name: saved personas from earlier versions are migrated in place.
  name: "voice-lab",
  demoVoices: (demo) => DEMO_META[demo.id] ?? { colors: ["#7c6cff", "#e46bff"] },
});

// `?device=wasm` forces the CPU backend — used by the E2E suite, where headless browsers may expose a software WebGPU
// adapter that works but is far slower than WASM.
const device = new URLSearchParams(location.search).get("device") === "wasm" ? "wasm" : "auto";

// Model selection is a runtime choice here, hence the full model-key unions.
export const tts = createTTS<TtsModelKey>({ cache: voices.conditioningCache, device });
export const stt = createSTT<SttModelKey>({ device });
