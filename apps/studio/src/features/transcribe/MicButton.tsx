import clsx from "clsx";
import { Loader2, Mic, Square } from "lucide-react";
import { type MotionValue, motion, useReducedMotion, useTransform } from "motion/react";

interface Props {
  listening: boolean;
  starting: boolean;
  disabled?: boolean;
  level: MotionValue<number>;
  onClick: () => void;
}

export function MicButton({ listening, starting, disabled, level, onClick }: Props) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex size-44 items-center justify-center">
      {[0, 1, 2].map((k) => (
        <Ring key={k} k={k} level={level} active={listening && !reduce} />
      ))}
      {listening && !reduce && (
        <motion.span
          aria-hidden
          className="absolute size-28 rounded-full border border-highlight-300/40"
          animate={{ scale: [1, 1.55], opacity: [0.6, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
        />
      )}
      <motion.button
        onClick={onClick}
        disabled={disabled || starting}
        {...(disabled ? {} : { whileHover: { scale: 1.04 }, whileTap: { scale: 0.92 } })}
        aria-pressed={listening}
        data-testid="mic-button"
        aria-label={listening ? "Stop listening" : "Start listening"}
        className={clsx(
          "relative z-10 flex size-28 items-center justify-center rounded-full text-white transition-[background,box-shadow,opacity] duration-300 disabled:cursor-not-allowed disabled:opacity-40",
          listening
            ? "bg-gradient-to-br from-danger-500 to-highlight-600 shadow-[0_20px_60px_-12px_rgb(244_63_94/0.8),inset_0_1px_0_rgb(255_255_255/0.3)]"
            : "bg-accent shadow-[0_20px_60px_-15px_rgb(228_107_255/0.8),inset_0_1px_0_rgb(255_255_255/0.3)]",
        )}
      >
        <motion.span
          key={listening ? "stop" : starting ? "wait" : "mic"}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          {starting ? (
            <Loader2 className="size-9 animate-spin" />
          ) : listening ? (
            <Square className="size-8 fill-current" />
          ) : (
            <Mic className="size-10" />
          )}
        </motion.span>
      </motion.button>
    </div>
  );
}

function Ring({ k, level, active }: { k: number; level: MotionValue<number>; active: boolean }) {
  const scale = useTransform(level, (v) => (active ? 1 + v * (0.35 + k * 0.28) : 1));
  const opacity = useTransform(level, (v) => (active ? 0.15 + v * (0.55 - k * 0.12) : 0.06));
  return (
    <motion.span
      aria-hidden
      className="absolute size-28 rounded-full bg-gradient-to-br from-highlight-400/40 to-violet-500/40 blur-[2px]"
      style={{ scale, opacity }}
    />
  );
}
