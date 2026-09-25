import type { AudioInput } from "@kucukkanat/speech-audio";
import { type ConditioningCache, createStore, type SpeakerConditioning, SpeechError } from "@kucukkanat/speech-core";
import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB, type StoreNames } from "idb";
import { CLIP_SECONDS, type PrepareOptions, prepareClip } from "./clip.js";
import { DEMO_VOICES, type DemoVoice } from "./demo.js";

/**
 * A saved voice. It has the `{ id, audio }` shape @kucukkanat/tts accepts, so you can pass it straight to
 * `tts.speak(text, { voice })`. `meta` is yours: colours, emoji, tags — whatever your app needs.
 */
export interface VoiceRecord<Meta> {
  readonly id: string;
  readonly name: string;
  /** The reference clip: 24 kHz mono WAV */
  readonly audio: Blob;
  readonly seconds: number;
  /** Bundled demo voice (can't be removed) */
  readonly builtIn: boolean;
  readonly createdAt: number;
  readonly meta: Meta;
}

export interface VoiceStoreState<Meta> {
  /** Demo voices first, then your voices, newest first */
  readonly voices: readonly VoiceRecord<Meta>[];
  readonly loading: boolean;
  readonly error: SpeechError | null;
}

export interface CreateVoiceInput<Meta> extends Pick<PrepareOptions, "crop" | "maxSeconds" | "signal"> {
  name: string;
  /** Any recording (URL, File/Blob, bytes, PCM); it's cropped, normalised and stored as a 24 kHz clip. */
  audio: AudioInput;
  meta: Meta;
}

export interface VoiceStore<Meta> {
  /** Resolves once stored voices are loaded and demo voices seeded. */
  readonly ready: Promise<void>;
  /** Current state (a stable snapshot; works with React's useSyncExternalStore). */
  readonly snapshot: VoiceStoreState<Meta>;
  readonly subscribe: (listener: (state: VoiceStoreState<Meta>) => void) => () => void;
  list(): Promise<readonly VoiceRecord<Meta>[]>;
  get(id: string): Promise<VoiceRecord<Meta> | undefined>;
  create(input: CreateVoiceInput<Meta>): Promise<VoiceRecord<Meta>>;
  update(id: string, patch: { name?: string; meta?: Meta }): Promise<VoiceRecord<Meta>>;
  /** Removes a voice and its cached encodings, returning it (for undo). Demo voices can't be removed (`built-in-read-only`). */
  remove(id: string): Promise<VoiceRecord<Meta>>;
  /** Puts a removed voice back, with the same id (e.g. an "Undo" after remove()). */
  restore(voice: VoiceRecord<Meta>): Promise<VoiceRecord<Meta>>;
  /** Persistent cache of encoded voices: `createTTS({ cache: voices.conditioningCache })`. */
  readonly conditioningCache: ConditioningCache;
  close(): void;
}

export interface VoiceStoreOptions<Meta> {
  /** IndexedDB database name. Default "kucukkanat-voices". */
  name?: string;
  /** Seed the bundled demo voices with this metadata, or `false` to skip them. */
  demoVoices: false | ((demo: DemoVoice) => Meta);
  /** Your own starter voices instead of the bundled ones. Default {@link DEMO_VOICES}. */
  demos?: readonly DemoVoice[];
}

type EmptyMeta = Record<string, never>;

interface Schema<Meta> extends DBSchema {
  voices: { key: string; value: VoiceRecord<Meta>; indexes: { "by-created": number } };
  conditioning: { key: string; value: SpeakerConditioning };
}

/** v1 = Voice Lab studio's original "personas" store, migrated in place on upgrade. */
interface LegacyPersona {
  id: string;
  name: string;
  colors: [string, string];
  emoji?: string;
  builtIn: boolean;
  createdAt: number;
  clip: Blob;
  clipSeconds: number;
}
interface LegacySchema extends DBSchema {
  personas: { key: string; value: LegacyPersona };
}

const DB_VERSION = 2;

export const toSpeechError = (e: unknown): SpeechError => {
  if (e instanceof SpeechError) return e;
  if (e instanceof Error && e.name === "QuotaExceededError") {
    return new SpeechError("quota-exceeded", "The browser is out of storage for voices. Remove some voices or free up space.", {
      cause: e,
    });
  }
  return new SpeechError("internal", `Voice storage failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
};

/** Sort: demo voices in their bundled order, then user voices newest first. */
const byLibraryOrder = <M>(a: VoiceRecord<M>, b: VoiceRecord<M>) =>
  Number(b.builtIn) - Number(a.builtIn) || (a.builtIn ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);

export function createVoiceStore(options?: Partial<VoiceStoreOptions<EmptyMeta>>): VoiceStore<EmptyMeta>;
export function createVoiceStore<Meta>(options: VoiceStoreOptions<Meta> & { name?: string }): VoiceStore<Meta>;
/**
 * A persistent voice library in IndexedDB.
 *
 * ```ts
 * const voices = createVoiceStore();
 * const mine = await voices.create({ name: "Me", audio: recordedBlob, meta: {} });
 * await tts.speak("Hi, it's me.", { voice: mine });
 * ```
 */
export function createVoiceStore<Meta>(options: Partial<VoiceStoreOptions<Meta>> = {}): VoiceStore<Meta> {
  const name = options.name ?? "kucukkanat-voices";
  const demoMeta = options.demoVoices === undefined ? () => ({}) as Meta : options.demoVoices;
  const demos = options.demos ?? DEMO_VOICES;
  const state = createStore<VoiceStoreState<Meta>>({ voices: [], loading: true, error: null });

  const dbPromise = openDB<Schema<Meta>>(name, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains("voices")) db.createObjectStore("voices", { keyPath: "id" }).createIndex("by-created", "createdAt");
      if (!db.objectStoreNames.contains("conditioning")) db.createObjectStore("conditioning");
      const legacy = db as unknown as IDBPDatabase<LegacySchema>;
      if (oldVersion === 1 && legacy.objectStoreNames.contains("personas")) {
        const old = (tx as unknown as IDBPTransaction<LegacySchema, StoreNames<LegacySchema>[], "versionchange">).objectStore("personas");
        for (const p of await old.getAll()) {
          // Old conditioning isn't carried over: re-encoding takes about a second on first use.
          const meta = { colors: p.colors, ...(p.emoji ? { emoji: p.emoji } : {}) } as Meta;
          await tx
            .objectStore("voices")
            .put({ id: p.id, name: p.name, audio: p.clip, seconds: p.clipSeconds, builtIn: p.builtIn, createdAt: p.createdAt, meta });
        }
        legacy.deleteObjectStore("personas");
      }
    },
    blocked() {
      state.set({
        ...state.get(),
        error: new SpeechError("db-blocked", "Close other tabs of this app: an older version is keeping the voice library open."),
      });
    },
  });
  // Once the upgrade goes through, a "blocked" notice no longer applies.
  dbPromise.then(
    () => {
      if (state.get().error?.code === "db-blocked") state.set({ ...state.get(), error: null });
    },
    (e: unknown) => state.set({ ...state.get(), loading: false, error: toSpeechError(e) }),
  );
  const db = () => dbPromise;

  const refresh = async () => {
    const voices = (await (await db()).getAllFromIndex("voices", "by-created")).sort(byLibraryOrder);
    state.set({ voices, loading: false, error: state.get().error });
    return voices;
  };

  const seed = async () => {
    if (demoMeta === false) return;
    const d = await db();
    for (const [i, demo] of demos.entries()) {
      if (await d.get("voices", demo.id)) continue;
      const clip = await prepareClip(demo.url, { crop: false, maxSeconds: CLIP_SECONDS.max }).catch((e: unknown) => {
        throw new SpeechError(
          "decode-failed",
          `Couldn't load the demo voice "${demo.name}" from ${demo.url.href}. Is the asset served by your bundler?`,
          {
            cause: e,
          },
        );
      });
      await d.put("voices", {
        id: demo.id,
        name: demo.name,
        audio: clip.wav,
        seconds: clip.seconds,
        builtIn: true,
        createdAt: i,
        meta: demoMeta(demo),
      });
    }
  };

  const ready = (async () => {
    try {
      await seed();
    } finally {
      await refresh();
    }
  })().catch((e: unknown) => {
    const error = toSpeechError(e);
    state.set({ ...state.get(), loading: false, error });
    throw error;
  });
  // The failure is recorded in `snapshot.error` above and still rejects `ready` for whoever awaits it; this handler only
  // keeps an unawaited `ready` from being reported as an unhandled rejection.
  ready.then(
    () => undefined,
    () => undefined,
  );

  const guard = async <T>(op: () => Promise<T>): Promise<T> => {
    try {
      return await op();
    } catch (e) {
      throw toSpeechError(e);
    }
  };

  const require = async (id: string) => {
    const voice = await (await db()).get("voices", id);
    if (!voice) throw new SpeechError("voice-not-found", `There's no voice with id "${id}".`);
    return voice;
  };

  return {
    ready,
    get snapshot() {
      return state.get();
    },
    subscribe: state.subscribe,
    list: async () => {
      // A failed demo seed is already reported in `snapshot.error`; it must not hide the voices that did load.
      await ready.then(
        () => undefined,
        () => undefined,
      );
      return state.get().voices;
    },
    get: (id) => guard(async () => (await db()).get("voices", id)),
    create: (input) =>
      guard(async () => {
        const clip = await prepareClip(input.audio, {
          ...(input.crop !== undefined ? { crop: input.crop } : {}),
          ...(input.maxSeconds !== undefined ? { maxSeconds: input.maxSeconds } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        });
        const voice: VoiceRecord<Meta> = {
          id: crypto.randomUUID(),
          name: input.name,
          audio: clip.wav,
          seconds: clip.seconds,
          builtIn: false,
          createdAt: Date.now(),
          meta: input.meta,
        };
        await (await db()).put("voices", voice);
        await refresh();
        return voice;
      }),
    update: (id, patch) =>
      guard(async () => {
        const next = { ...(await require(id)), ...patch };
        await (await db()).put("voices", next);
        await refresh();
        return next;
      }),
    remove: (id) =>
      guard(async () => {
        const voice = await require(id);
        if (voice.builtIn) throw new SpeechError("built-in-read-only", `"${voice.name}" is a built-in voice and can't be removed.`);
        const d = await db();
        const tx = d.transaction(["voices", "conditioning"], "readwrite");
        await tx.objectStore("voices").delete(id);
        // Encodings are keyed "<voiceId>|<model>|v<n>": delete every one for this voice.
        await tx.objectStore("conditioning").delete(IDBKeyRange.bound(`${id}|`, `${id}|￿`));
        await tx.done;
        await refresh();
        return voice;
      }),
    restore: (voice) =>
      guard(async () => {
        await (await db()).put("voices", voice);
        await refresh();
        return voice;
      }),
    conditioningCache: {
      get: (key) => guard(async () => (await db()).get("conditioning", key)),
      set: (key, value) =>
        guard(async () => {
          await (await db()).put("conditioning", value, key);
        }),
    },
    close: () => {
      // If opening failed there's nothing to close; that failure is already in `snapshot.error`.
      dbPromise.then(
        (d) => d.close(),
        () => undefined,
      );
    },
  };
}
