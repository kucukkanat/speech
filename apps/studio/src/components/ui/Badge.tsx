import clsx from "clsx";
import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "bad" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-white/[0.06] text-white/60 border-white/10",
  good: "bg-good-400/10 text-good-300 border-good-300/20",
  warn: "bg-warn-400/10 text-warn-300 border-warn-300/20",
  bad: "bg-danger-400/10 text-danger-300 border-danger-300/20",
  accent: "bg-highlight-400/10 text-highlight-200 border-highlight-300/25",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
