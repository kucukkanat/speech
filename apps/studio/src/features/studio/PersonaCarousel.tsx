import clsx from "clsx";
import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Orb } from "../../components/ui/Orb";
import { Skeleton } from "../../components/ui/Skeleton";
import type { Persona } from "../../speech";

interface Props {
  personas: readonly Persona[];
  loading: boolean;
  value: string | null;
  onChange: (id: string) => void;
  onCreate: () => void;
}

export function PersonaCarousel({ personas, loading, value, onChange, onCreate }: Props) {
  const reduce = useReducedMotion();
  return (
    <div
      className="scrollbar-none -mx-5 flex snap-x gap-1 overflow-x-auto px-4 pt-2 pb-1 sm:-mx-6 sm:px-5"
      role="radiogroup"
      aria-label="Voice"
    >
      {loading && personas.length === 0
        ? [0, 1, 2].map((i) => (
            <div key={i} className="flex w-20 shrink-0 flex-col items-center gap-2 py-2">
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))
        : personas.map((p) => {
            const on = p.id === value;
            return (
              // biome-ignore lint/a11y/useSemanticElements: custom-styled radio (an orb), not a native input
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`persona-option-${p.id}`}
                onClick={() => onChange(p.id)}
                className="group relative flex w-20 shrink-0 snap-start flex-col items-center gap-2 rounded-2xl py-2 outline-none"
              >
                <div className="relative flex size-[68px] items-center justify-center">
                  {on && (
                    <motion.span
                      layoutId="persona-ring"
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(from 0deg, ${p.meta.colors[0]}, ${p.meta.colors[1]}, ${p.meta.colors[0]})`,
                        padding: 2,
                      }}
                      transition={{ type: "spring", stiffness: 500, damping: 34 }}
                    >
                      <span className="block size-full rounded-full bg-ink-900" />
                    </motion.span>
                  )}
                  <motion.div
                    animate={{ scale: on ? 1 : 0.84 }}
                    {...(reduce ? {} : { whileHover: { scale: on ? 1.04 : 0.9 } })}
                    whileTap={{ scale: 0.78 }}
                    transition={{ type: "spring", stiffness: 420, damping: 18 }}
                    className={clsx("relative transition-opacity", !on && "opacity-70 group-hover:opacity-100")}
                  >
                    <Orb colors={p.meta.colors} emoji={p.meta.emoji} size={56} animated={on} />
                  </motion.div>
                </div>
                <span
                  className={clsx(
                    "max-w-full truncate px-1 text-[12px] transition-colors",
                    on ? "font-medium text-white" : "text-white/45",
                  )}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
      <button type="button" onClick={onCreate} className="group flex w-20 shrink-0 flex-col items-center gap-2 rounded-2xl py-2">
        <span className="flex size-[68px] items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-white/20 text-white/40 transition group-hover:border-highlight-300/60 group-hover:text-white">
            <Plus className="size-5" />
          </span>
        </span>
        <span className="text-[12px] text-white/40 group-hover:text-white/70">New</span>
      </button>
    </div>
  );
}
