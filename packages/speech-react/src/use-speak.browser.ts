import type {
  AudioClip,
  SentenceInfo,
  SpeakOptions,
  Speech,
  SpeechResult,
  SpeechState,
  SpeechStats,
  TextToSpeech,
  TtsModelKey,
} from "@kucukkanat/tts";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeakHookState<M extends TtsModelKey> {
  /** Speaks `text`, stopping anything still playing. Returns the Speech handle (awaitable). */
  speak: (text: string, options?: SpeakOptions<M>) => Speech;
  /** Replays a finished clip (e.g. `result.clip`) with the same state, karaoke and analyser as speak(). */
  play: (clip: AudioClip) => Speech;
  stop: () => void;
  /** "idle" before the first speak() */
  state: SpeechState | "idle";
  /** True from speak()/play() until playback ends, stops or fails */
  active: boolean;
  /** The sentence being heard right now */
  sentence: SentenceInfo | null;
  /** Every sentence that has started playing so far, in order — ready for karaoke-style rendering */
  spoken: readonly SentenceInfo[];
  stats: SpeechStats | null;
  /** Live signal for waveforms / level meters (see useAudioLevel) */
  analyser: AnalyserNode | null;
  error: unknown;
  /** The last finished speech: its clip can be replayed or saved */
  result: SpeechResult | null;
}

const DONE = new Set<SpeechState | "idle">(["idle", "ended", "stopped", "error"]);

/**
 * Speak text and follow along: state, current sentence (karaoke), stats and an analyser for visuals.
 *
 * ```tsx
 * const { speak, stop, active, sentence } = useSpeak(tts);
 * <button onClick={() => (active ? stop() : speak(text))}>{active ? "Stop" : "Speak"}</button>
 * ```
 */
export function useSpeak<M extends TtsModelKey>(tts: TextToSpeech<M>): SpeakHookState<M> {
  const current = useRef<Speech | null>(null);
  const [state, setState] = useState<SpeechState | "idle">("idle");
  const [sentence, setSentence] = useState<SentenceInfo | null>(null);
  const [spoken, setSpoken] = useState<readonly SentenceInfo[]>([]);
  const [stats, setStats] = useState<SpeechStats | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<SpeechResult | null>(null);

  const track = useCallback((speech: Speech) => {
    current.current?.stop();
    current.current = speech;
    const mine = () => current.current === speech; // ignore events from a speech that was replaced
    setError(null);
    setSentence(null);
    setSpoken([]);
    setStats(speech.stats);
    setAnalyser(speech.analyser);
    setState(speech.state);
    speech.on("state", (s) => mine() && setState(s));
    speech.on("sentence", (s) => {
      if (!mine()) return;
      setSentence(s);
      setSpoken((list) => (list.some((x) => x.index === s.index) ? list : [...list, s]));
    });
    speech.on("stats", (s) => mine() && setStats(s));
    // The hook records the outcome; callers awaiting the returned handle still get the same result or rejection.
    speech.done.then(
      (r) => mine() && setResult(r),
      (e: unknown) => mine() && setError(e),
    );
    return speech;
  }, []);

  const speak = useCallback((text: string, options?: SpeakOptions<M>) => track(tts.speak(text, options)), [tts, track]);
  const play = useCallback((clip: AudioClip) => track(clip.play()), [track]);
  const stop = useCallback(() => current.current?.stop(), []);

  useEffect(() => () => current.current?.stop(), []);

  return { speak, play, stop, state, active: !DONE.has(state), sentence, spoken, stats, analyser, error, result };
}
