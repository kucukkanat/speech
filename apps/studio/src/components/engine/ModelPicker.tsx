import clsx from "clsx";
import { Check, Cpu } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fmtSize } from "../format";
import { Badge } from "../ui/Badge";

const hasGpu = typeof navigator !== "undefined" && !!navigator.gpu;

interface PickableModel<K extends string> {
  key: K;
  label: string;
  approxDownloadMB: number;
  requiresWebGPU: boolean;
  description: string;
}

interface Props<K extends string> {
  /** Accessible name of the radio group, also used to scope the selection-ring animation. */
  label: string;
  models: readonly PickableModel<K>[];
  icons: Record<K, ReactNode>;
  value: K;
  loadedKey?: K | undefined;
  disabled?: boolean | undefined;
  onChange: (k: K) => void;
}

export function ModelPicker<K extends string>({ label, models, icons, value, loadedKey, disabled, onChange }: Props<K>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={label} data-testid="model-picker">
      {models.map((m) => {
        const on = m.key === value;
        const blocked = m.requiresWebGPU && !hasGpu;
        return (
          <motion.button
            key={m.key}
            role="radio"
            aria-checked={on}
            disabled={disabled || blocked}
            onClick={() => onChange(m.key)}
            data-testid={`model-option-${m.key}`}
            whileTap={{ scale: 0.98 }}
            className={clsx(
              "group relative overflow-hidden rounded-3xl border p-4 text-left transition-colors sm:p-5",
              on ? "border-transparent" : "border-white/[0.08] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]",
              (disabled || blocked) && "cursor-not-allowed opacity-50",
            )}
          >
            {on && (
              <motion.span
                layoutId={`model-ring-${label}`}
                className="absolute inset-0 rounded-3xl bg-white/[0.05] shadow-[inset_0_0_0_1.5px_rgb(228_107_255/0.55),0_12px_40px_-14px_rgb(228_107_255/0.6)]"
                transition={{ type: "spring", stiffness: 450, damping: 36 }}
              />
            )}
            <div className="relative flex items-start gap-3">
              <span
                className={clsx(
                  "flex size-10 shrink-0 items-center justify-center rounded-2xl transition-colors",
                  on ? "bg-accent text-white" : "bg-white/[0.06] text-white/60",
                )}
              >
                {icons[m.key]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[16px] font-semibold text-white">{m.label}</span>
                  {loadedKey === m.key && (
                    <Badge tone="good">
                      <Check className="size-2.5" /> Loaded
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[13px] leading-snug text-white/55">{m.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{fmtSize(m.approxDownloadMB)}</Badge>
                  {m.requiresWebGPU ? (
                    <Badge tone={hasGpu ? "accent" : "bad"}>{hasGpu ? "WebGPU" : "Needs WebGPU"}</Badge>
                  ) : (
                    <Badge tone="good">
                      <Cpu className="size-2.5" /> WebGPU or WASM
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
