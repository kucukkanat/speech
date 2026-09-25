import clsx from "clsx";
import { motion } from "motion/react";
import type { ReactNode } from "react";

export interface TabDef<K extends string> {
  key: K;
  label: string;
  short?: string;
  icon: ReactNode;
}

export function SegmentedTabs<K extends string>({ tabs, value, onChange }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="glass relative inline-flex w-full rounded-2xl p-1 sm:w-auto">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            type="button"
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={clsx(
              "relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors duration-200 sm:flex-none sm:px-5 sm:text-sm",
              active ? "text-white" : "text-white/50 hover:text-white/80",
            )}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-xl bg-white/[0.09] shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_6px_24px_-8px_rgb(228_107_255/0.55)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              >
                <span className="absolute inset-x-4 -bottom-px h-px bg-accent opacity-80" />
              </motion.span>
            )}
            <span className="relative z-10 flex items-center gap-2">
              {t.icon}
              <span className="whitespace-nowrap">
                {t.short ? (
                  <>
                    <span className="sm:hidden">{t.short}</span>
                    <span className="max-sm:hidden">{t.label}</span>
                  </>
                ) : (
                  t.label
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
