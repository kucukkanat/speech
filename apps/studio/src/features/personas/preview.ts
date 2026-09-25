import { type AudioPlayer, createPlayer, decodeAudio } from "@kucukkanat/speech-audio";
import { useSyncExternalStore } from "react";
import type { Persona } from "../../speech";

/** Single app-wide preview player, so only one persona clip plays at a time. */
interface PreviewState {
  playingId: string | null;
  analyser: AnalyserNode | null;
}

let state: PreviewState = { playingId: null, analyser: null };
let player: AudioPlayer | null = null;
const subscribers = new Set<() => void>();
const set = (next: PreviewState) => {
  state = next;
  for (const f of subscribers) f();
};

export function stopPreview(): void {
  player?.dispose();
  player = null;
  set({ playingId: null, analyser: null });
}

export async function togglePreview(p: Persona): Promise<void> {
  if (state.playingId === p.id) return stopPreview();
  stopPreview();
  const mine = createPlayer(); // created in the click handler: allowed to start audio
  player = mine;
  set({ playingId: p.id, analyser: mine.analyser });
  mine.on("drained", () => player === mine && stopPreview());
  try {
    const { pcm, sampleRate } = await decodeAudio(p.audio);
    if (player === mine) mine.enqueue(pcm, sampleRate);
  } catch (e) {
    if (player === mine) stopPreview();
    throw e;
  }
}

export function usePreview(): PreviewState {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => state,
  );
}
