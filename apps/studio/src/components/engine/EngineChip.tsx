import type { EngineStatus } from "@kucukkanat/speech-core";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";

const dot: Record<EngineStatus["state"], string> = {
  idle: "bg-white/30",
  loading: "bg-warn-300 shadow-[0_0_10px_rgb(252_211_77/0.8)]",
  ready: "bg-good-400 shadow-[0_0_10px_rgb(52_211_153/0.8)]",
  error: "bg-danger-400 shadow-[0_0_10px_rgb(251_113_133/0.8)]",
};

function statusText(s: EngineStatus) {
  switch (s.state) {
    case "idle":
      return "Not loaded";
    case "loading":
      return `${Math.round(s.progress.progress * 100)}%`;
    case "ready":
      return "Ready";
    case "error":
      return "Error";
  }
}

export function EngineChip({ name, status, onClick }: { name: string; status: EngineStatus; onClick?: () => void }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      title={status.state === "error" ? status.error.message : status.state === "ready" ? `${status.model} on ${status.device}` : undefined}
      data-testid={`engine-chip-${name.toLowerCase()}`}
      data-state={status.state}
      className="glass group flex h-8 items-center gap-2 rounded-full pr-1.5 pl-3 text-[12px] transition hover:border-white/20"
    >
      <span className="relative flex size-2">
        {status.state === "loading" && <span className="absolute inset-0 animate-ping rounded-full bg-warn-300/70" />}
        <span className={clsx("relative size-2 rounded-full transition-colors", dot[status.state])} />
      </span>
      <span className="font-medium text-white/85">{name}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status.state === "ready" ? `ready-${status.device}` : status.state}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className={clsx(
            "tabular rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase",
            status.state === "ready"
              ? status.device === "webgpu"
                ? "bg-good-400/10 text-good-300"
                : "bg-warn-400/10 text-warn-300"
              : "bg-white/[0.06] text-white/50",
          )}
        >
          {status.state === "ready" ? (status.device === "webgpu" ? "WebGPU" : "WASM") : statusText(status)}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
