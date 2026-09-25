import type { EngineStatus, LoadProgress } from "@kucukkanat/speech-core";
import { AlertTriangle, CloudDownload, Cpu, HardDrive, Lock, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { fmtMB, fmtSize } from "../format";
import { Button } from "../ui/Button";

interface ModelGateProps {
  title: string;
  modelName: string;
  sizeMB: number;
  status: EngineStatus;
  onLoad: () => void;
  icon?: ReactNode | undefined;
  extra?: ReactNode | undefined;
}

/** Explicit "Load model" card with first-use explainer, loading progress and error/retry. Renders nothing when ready. */
export function ModelGate({ title, modelName, sizeMB, status, onLoad, icon, extra }: ModelGateProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {status.state !== "ready" && (
        <motion.section
          key={status.state === "loading" ? "loading" : "idle"}
          initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(6px)", transition: { duration: 0.2 } }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="glass relative overflow-hidden rounded-3xl p-5 sm:p-6"
        >
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-highlight-500/10 blur-3xl" />
          {status.state === "loading" ? (
            <LoadingBody title={title} modelName={modelName} progress={status.progress} />
          ) : (
            <IdleBody
              title={title}
              modelName={modelName}
              sizeMB={sizeMB}
              icon={icon}
              error={status.state === "error" ? status.error.message : undefined}
              onLoad={onLoad}
              extra={extra}
            />
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function IdleBody({
  title,
  modelName,
  sizeMB,
  icon,
  error,
  onLoad,
  extra,
}: {
  title: string;
  modelName: string;
  sizeMB: number;
  icon?: ReactNode | undefined;
  error?: string | undefined;
  onLoad: () => void;
  extra?: ReactNode | undefined;
}) {
  return (
    <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_10px_30px_-8px_rgb(228_107_255/0.6)]">
        {icon ?? <Cpu className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-semibold tracking-tight text-white">{title}</h3>
        <p className="mt-0.5 truncate font-mono text-[12px] text-white/45">{modelName}</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-white/60">
          <li className="flex items-center gap-1.5">
            <CloudDownload className="size-3.5 text-highlight-300" /> Downloads once · ~{fmtSize(sizeMB)}
          </li>
          <li className="flex items-center gap-1.5">
            <HardDrive className="size-3.5 text-violet-300" /> Cached in your browser
          </li>
          <li className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-good-300" /> Runs 100% locally
          </li>
        </ul>
        {extra}
        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-danger-400/20 bg-danger-500/10 px-3 py-2 text-[12.5px] text-danger-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-words">{error}</span>
          </p>
        )}
      </div>
      <Button
        variant="primary"
        size="lg"
        onClick={onLoad}
        data-testid="model-load"
        icon={error ? <RotateCcw className="size-4" /> : <CloudDownload className="size-4" />}
      >
        {error ? "Retry" : "Load model"}
      </Button>
    </div>
  );
}

function LoadingBody({ title, modelName, progress }: { title: string; modelName: string; progress: LoadProgress }) {
  const pct = Math.max(0, Math.min(1, progress.progress));
  const hasBytes = progress.total != null && progress.total > 0;
  return (
    <div className="relative">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight text-white">Loading {title}</h3>
          <p className="truncate font-mono text-[12px] text-white/45">{modelName}</p>
        </div>
        <span className="tabular font-display text-3xl font-semibold text-accent">{Math.round(pct * 100)}%</span>
      </div>
      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-accent"
          initial={false}
          animate={{ width: `${Math.max(2, pct * 100)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
        >
          <div className="absolute inset-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        </motion.div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={progress.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="min-w-0 truncate font-mono text-white/55"
          >
            {progress.label || "Preparing…"}
          </motion.span>
        </AnimatePresence>
        <span className="tabular shrink-0 font-mono text-white/70">
          {hasBytes ? `${fmtMB(progress.loaded)} / ${fmtMB(progress.total)}` : ""}
        </span>
      </div>
      <p className="mt-4 text-[12px] text-white/40">
        First load downloads the weights and stores them in the browser cache — next time it starts in seconds, offline.
      </p>
    </div>
  );
}
