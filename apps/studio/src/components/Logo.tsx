import { motion, useReducedMotion } from "motion/react";

const BARS = [0.45, 0.8, 1, 0.65, 0.9, 0.5];

export function Logo() {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-10 items-center justify-center rounded-[14px] bg-ink-800 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),0_10px_30px_-10px_rgb(228_107_255/0.6)]">
        <div className="flex h-5 items-center gap-[3px]">
          {BARS.map((h, i) => (
            <motion.span
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative list; position is identity
              key={i}
              className="w-[3px] rounded-full bg-accent"
              style={{ height: `${h * 100}%`, backgroundSize: "20px 100%", backgroundPosition: `${-i * 3}px 0` }}
              {...(reduce ? {} : { animate: { scaleY: [1, 0.45 + (i % 3) * 0.15, 1] } })}
              transition={{ repeat: Infinity, duration: 1.4 + i * 0.13, ease: "easeInOut", delay: i * 0.08 }}
            />
          ))}
        </div>
      </div>
      <div className="leading-tight">
        <h1 className="font-display text-[19px] font-semibold tracking-tight text-white">
          Voice <span className="text-accent">Lab</span>
        </h1>
        <p className="text-[11.5px] text-white/40">Clone · Speak · Transcribe — on-device</p>
      </div>
    </div>
  );
}
