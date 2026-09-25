import type { SentenceInfo, SpeechState } from "@kucukkanat/tts";
import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";

interface KaraokeTextProps {
  /** Sentences that have started playing, in order */
  spoken: readonly SentenceInfo[];
  /** The sentence playing right now */
  current: SentenceInfo | null;
  state: SpeechState | "idle";
}

const WAITING: Partial<Record<SpeechState, string>> = {
  loading: "Loading the model",
  encoding: "Learning the voice",
  generating: "Generating first sentence",
  buffering: "Buffering",
};

/** Sentence-level karaoke: played = bright, playing = gradient + glow, not heard yet = shimmer pills. */
export function KaraokeText({ spoken, current, state }: KaraokeTextProps) {
  const reduce = useReducedMotion();
  const count = current?.count ?? spoken.at(-1)?.count ?? 0;
  const pending = Math.max(0, count - spoken.length);
  const waiting = state !== "idle" ? WAITING[state] : undefined;

  if (state === "idle" && spoken.length === 0) {
    return <p className="text-center text-[15px] text-white/35">Pick a voice, write something, and hit Speak.</p>;
  }

  return (
    <p className="text-center text-[17px] leading-relaxed sm:text-lg" data-testid="karaoke">
      {waiting && spoken.length === 0 && (
        <span className="text-white/45">
          {waiting}
          <Dots />
        </span>
      )}
      {spoken.map((s) => {
        const now = s.index === current?.index && state === "playing";
        return (
          <motion.span
            key={s.index}
            initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.45 }}
            data-testid="karaoke-sentence"
            data-current={now || undefined}
            className={clsx(
              "rounded-md transition-[color,text-shadow,background-color] duration-300 [box-decoration-break:clone]",
              now ? "bg-white/[0.06] px-0.5 text-white [text-shadow:0_0_18px_rgb(228_107_255/0.65)]" : "text-white/80",
            )}
          >
            {s.text}{" "}
          </motion.span>
        );
      })}
      {pending > 0 &&
        Array.from({ length: Math.min(pending, 4) }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond their position
            key={i}
            aria-hidden
            className="relative mx-0.5 inline-block h-3.5 overflow-hidden rounded-full bg-white/[0.07] align-middle"
            style={{ width: 48 + ((i * 37) % 60) }}
          >
            <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          </span>
        ))}
    </p>
  );
}

function Dots() {
  return (
    <span className="ml-0.5 inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block size-1 rounded-full bg-white/60"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.2, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}
