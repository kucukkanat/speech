import clsx from "clsx";
import { type MotionValue, motion, useReducedMotion, useSpring, useTransform } from "motion/react";

interface OrbProps {
  colors: [string, string];
  size?: number;
  emoji?: string | undefined;
  /** optional 0..1 audio level to pulse with */
  level?: MotionValue<number> | undefined;
  className?: string;
  /** slow idle animation */
  animated?: boolean;
}

/** Animated gradient orb used as persona avatar. */
export function Orb({ colors, size = 56, emoji, level, className, animated = true }: OrbProps) {
  const reduce = useReducedMotion();
  const [a, b] = colors;
  const fallback = useSpring(0);
  const lv = level ?? fallback;
  const scale = useTransform(lv, [0, 1], [1, 1.16]);
  const glow = useTransform(lv, [0, 1], [0.35, 0.95]);
  const spin = animated && !reduce;

  return (
    <motion.div
      className={clsx("relative shrink-0 rounded-full", className)}
      style={{ width: size, height: size, scale: reduce ? 1 : scale }}
    >
      {/* glow */}
      <motion.div
        aria-hidden
        className="absolute -inset-[30%] rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, ${b}, transparent 65%)`, opacity: glow }}
      />
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{ background: `radial-gradient(circle at 30% 28%, ${a}, ${b} 72%)` }}
      >
        <motion.div
          aria-hidden
          className="absolute -inset-1/4 opacity-70 mix-blend-screen blur-md"
          style={{ background: `conic-gradient(from 0deg, transparent, ${a}, transparent 40%, ${b}, transparent 75%)` }}
          {...(spin ? { animate: { rotate: 360 }, transition: { repeat: Number.POSITIVE_INFINITY, duration: 9, ease: "linear" } } : {})}
        />
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 24%, rgb(255 255 255 / 0.55), transparent 32%), radial-gradient(circle at 70% 85%, rgb(0 0 0 / 0.35), transparent 55%)",
          }}
        />
        <div aria-hidden className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]" />
      </div>
      {emoji && (
        <span
          className="absolute inset-0 flex items-center justify-center drop-shadow-[0_2px_6px_rgb(0_0_0/0.35)]"
          style={{ fontSize: size * 0.4 }}
        >
          {emoji}
        </span>
      )}
    </motion.div>
  );
}
