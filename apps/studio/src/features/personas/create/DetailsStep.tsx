import clsx from "clsx";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Orb } from "../../../components/ui/Orb";
import { EMOJIS, PALETTES } from "../palettes";

export interface Details {
  name: string;
  colors: [string, string];
  emoji?: string | undefined;
}

export function DetailsStep({ value, onChange, clipSeconds }: { value: Details; onChange: (d: Details) => void; clipSeconds: number }) {
  // Move focus into the step when it opens (the dialog pattern), without the autoFocus attribute's page-load quirks.
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => nameInput.current?.focus(), []);
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="flex flex-col items-center gap-3 sm:pt-2">
        <motion.div
          key={value.colors.join()}
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 16 }}
        >
          <Orb colors={value.colors} emoji={value.emoji} size={112} />
        </motion.div>
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-white">{value.name || "Untitled"}</p>
          <p className="tabular font-mono text-[12px] text-white/45">{clipSeconds.toFixed(1)} s reference</p>
        </div>
      </div>

      <div className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium tracking-wide text-white/50 uppercase">Name</span>
          <input
            ref={nameInput}
            value={value.name}
            maxLength={32}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="e.g. Narrator, Grandpa, Me"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[15px] text-white placeholder:text-white/25 transition outline-none focus-visible:outline-none focus:border-highlight-300/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgb(228_107_255/0.12)]"
          />
        </label>

        <div>
          <span className="mb-2 block text-[12px] font-medium tracking-wide text-white/50 uppercase">Colour</span>
          <div className="flex flex-wrap gap-2.5">
            {PALETTES.map((p) => {
              const on = p.colors.join() === value.colors.join();
              return (
                <motion.button
                  key={p.name}
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={on}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => onChange({ ...value, colors: p.colors })}
                  className={clsx(
                    "relative size-10 rounded-full transition-shadow",
                    on ? "ring-2 ring-white ring-offset-2 ring-offset-ink-900" : "ring-1 ring-white/15",
                  )}
                  style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}
                >
                  {on && <Check className="absolute inset-0 m-auto size-4 text-white drop-shadow" />}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[12px] font-medium tracking-wide text-white/50 uppercase">Emoji</span>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((em) => {
              const on = value.emoji === em;
              return (
                <motion.button
                  key={em}
                  whileTap={{ scale: 0.85 }}
                  aria-pressed={on}
                  onClick={() => onChange({ ...value, emoji: on ? undefined : em })}
                  className={clsx(
                    "flex size-10 items-center justify-center rounded-xl text-xl transition",
                    on ? "bg-white/15 ring-1 ring-white/30" : "bg-white/[0.04] hover:bg-white/[0.09]",
                  )}
                >
                  {em}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
