import type { LoadProgress } from "@kucukkanat/speech-core";

/** "725 MB", "1.5 GB" */
export const formatSize = (mb: number): string => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`);

/** "Loading 42%", with the file being fetched when the SDK reports one. */
export const formatProgress = (progress: LoadProgress | null): string =>
  `Loading ${Math.round((progress?.progress ?? 0) * 100)}%${progress?.label ? ` · ${progress.label}` : ""}`;

/** A user-presentable message for anything a demo can throw (SDK failures are SpeechErrors with friendly messages). */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
