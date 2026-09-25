import type { SpeechState } from "@kucukkanat/tts";
import clsx from "clsx";
import { AudioLines, Loader2, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

type Phase = SpeechState | "idle";

const DONE = new Set<Phase>(["idle", "ended", "stopped", "error"]);
const LABELS: Partial<Record<Phase, string>> = { loading: "Loading model", encoding: "Learning voice" };

export function SpeakButton({
  phase,
  disabled,
  onSpeak,
  onStop,
}: {
  phase: Phase;
  disabled?: boolean;
  onSpeak: () => void;
  onStop: () => void;
}) {
  const active = !DONE.has(phase);
  // While the model loads or the voice is being learned the button shows a spinner (a click still stops).
  const preparing = phase === "loading" || phase === "encoding";
  const label = active ? (LABELS[phase] ?? "Stop") : "Speak";
  return (
    <motion.button
      layout
      type="button"
      disabled={!active && disabled}
      onClick={active ? onStop : onSpeak}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 32 }}
      className={clsx(
        "relative flex h-12 items-center justify-center gap-2.5 overflow-hidden rounded-2xl px-6 text-[15px] font-semibold text-white transition-[box-shadow,background,filter] duration-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        active
          ? "min-w-32 bg-white/10 ring-1 ring-white/15 hover:bg-white/15"
          : "min-w-36 bg-accent shadow-[0_14px_40px_-12px_rgb(228_107_255/0.8),inset_0_1px_0_rgb(255_255_255/0.3)] hover:brightness-110",
      )}
      aria-label={active ? "Stop" : "Speak"}
      data-testid="speak-button"
      data-state={phase}
    >
      {active && (
        <motion.span
          aria-hidden
          className="absolute inset-0 bg-accent opacity-20"
          animate={{ opacity: [0.12, 0.3, 0.12] }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.6 }}
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={active ? (preparing ? "prep" : "stop") : "speak"}
          initial={{ opacity: 0, scale: 0.6, rotate: -30 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 30 }}
          className="relative"
        >
          {preparing ? (
            <Loader2 className="size-4.5 animate-spin" />
          ) : active ? (
            <Square className="size-4 fill-current" />
          ) : (
            <AudioLines className="size-4.5" />
          )}
        </motion.span>
      </AnimatePresence>
      <motion.span layout="position" className="relative">
        {label}
      </motion.span>
    </motion.button>
  );
}
