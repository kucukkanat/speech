import clsx from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { memo, useLayoutEffect, useRef } from "react";

const ANIMATED_TAIL = 80;

interface Props {
  committed: string;
  partial: string;
  listening: boolean;
  placeholder: string;
}

/**
 * Committed words are solid, the partial tail is dimmer with a blinking caret.
 * Keys are `${position}:${word}` so a word keeps its identity when it moves from partial → committed
 * (no re-animation), while revised words get a fresh key and blur in.
 */
export function TranscriptView({ committed, partial, listening, placeholder }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const cw = committed ? committed.split(/\s+/).filter(Boolean) : [];
  const pw = partial ? partial.split(/\s+/).filter(Boolean) : [];
  const staticCount = Math.max(0, cw.length - ANIMATED_TAIL);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs on new words on purpose, to keep the newest text in view.
  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [committed, partial]);

  const empty = cw.length === 0 && pw.length === 0;

  return (
    <div
      ref={box}
      data-testid="transcript"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="relative h-72 overflow-y-auto rounded-2xl border border-white/[0.07] bg-black/25 p-5 sm:h-80 sm:p-6"
      aria-live="polite"
    >
      {empty ? (
        <p className="text-[17px] leading-relaxed text-white/30">
          {placeholder}
          {listening && <Caret />}
        </p>
      ) : (
        <p className="text-[17px] leading-[1.75] text-white sm:text-lg">
          {staticCount > 0 && <span>{cw.slice(0, staticCount).join(" ")} </span>}
          {cw.slice(staticCount).map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a word's position is its identity (the same word can repeat)
            <Word key={`${staticCount + i}:${w}`} word={w} partial={false} />
          ))}
          {pw.map((w, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a word's position is its identity (the same word can repeat)
            <Word key={`${cw.length + i}:${w}`} word={w} partial />
          ))}
          {listening && <Caret />}
        </p>
      )}
    </div>
  );
}

const Word = memo(function Word({ word, partial }: { word: string; partial: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)", y: 4 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.3, 1] }}
      className={clsx("inline-block whitespace-pre transition-colors duration-500", partial ? "text-white/45" : "text-white")}
    >
      {word}{" "}
    </motion.span>
  );
});

function Caret() {
  return (
    <span aria-hidden className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-caret rounded-full bg-highlight-300" />
  );
}
