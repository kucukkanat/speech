import { useEngine } from "@kucukkanat/speech-react";
import { STT_MODELS, type SttModelKey } from "@kucukkanat/stt";
import clsx from "clsx";
import { Check, Copy, Download, Eraser, MicOff, Radio, RefreshCw, Timer, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { ModelGate } from "../../components/engine/ModelGate";
import { ModelPicker } from "../../components/engine/ModelPicker";
import { downloadBlob, fmtClock } from "../../components/format";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { stt } from "../../speech";
import { MicButton } from "./MicButton";
import { TranscriptView } from "./TranscriptView";
import { useLiveTranscript } from "./useLiveTranscript";

const hasGpu = typeof navigator !== "undefined" && !!navigator.gpu;
const ICONS: Record<SttModelKey, ReactNode> = {
  "voxtral-realtime": <Radio className="size-5" />,
  "moonshine-base": <Zap className="size-5" />,
};

export function TranscribeView() {
  const { status, ready, loading } = useEngine(stt);
  const { toast } = useToast();
  const tr = useLiveTranscript();
  const [copied, setCopied] = useState(false);

  const loadedKey = status.state === "ready" ? status.model : undefined;
  // Voxtral streams best but needs WebGPU; Moonshine runs anywhere.
  const [selected, setSelected] = useState<SttModelKey>(() => loadedKey ?? (hasGpu ? "voxtral-realtime" : "moonshine-base"));
  const model = STT_MODELS[selected];

  const load = async () => {
    try {
      if (tr.listening) await tr.stop();
      await stt.switchModel(selected);
      await stt.load();
    } catch (e) {
      toast({ tone: "error", title: "Speech model failed to load", description: e instanceof Error ? e.message : String(e) });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tr.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ tone: "error", title: "Clipboard unavailable" });
    }
  };

  return (
    <div className="space-y-5">
      <section className="glass rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium tracking-wide text-white/50 uppercase">Speech model</h3>
          <AnimatePresence>
            {ready && loadedKey !== selected && (
              <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
                <Button size="sm" variant="primary" onClick={load} icon={<RefreshCw className="size-3.5" />}>
                  Switch to {model.label}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <ModelPicker
          label="Speech model"
          models={stt.models}
          icons={ICONS}
          value={selected}
          loadedKey={loadedKey}
          disabled={loading || tr.listening}
          onChange={setSelected}
        />
      </section>

      <ModelGate title={model.label} modelName={model.repo} sizeMB={model.approxDownloadMB} status={status} onLoad={load} />

      <section
        className={clsx("glass rounded-3xl p-5 transition-opacity sm:p-6", !ready && "pointer-events-none opacity-50")}
        aria-disabled={!ready}
      >
        <div className="grid items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2">
            <MicButton
              listening={tr.listening}
              starting={tr.starting}
              disabled={!ready}
              level={tr.level}
              onClick={tr.listening ? () => void tr.stop() : () => tr.start()}
            />
            <div
              className={clsx(
                "tabular flex items-center gap-1.5 font-mono text-sm transition-colors",
                tr.listening ? "text-white" : "text-white/35",
              )}
            >
              <Timer className="size-3.5" />
              {fmtClock(tr.elapsed)}
            </div>
            <p className="text-[12px] text-white/40">{tr.listening ? "Listening…" : ready ? "Tap to start" : "Load a model first"}</p>
          </div>

          <div className="min-w-0">
            <AnimatePresence>
              {tr.error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mb-3 flex items-start gap-3 rounded-2xl border border-danger-400/20 bg-danger-500/10 px-4 py-3">
                    <MicOff className="mt-0.5 size-4 shrink-0 text-danger-300" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-danger-100">Microphone unavailable</p>
                      <p className="mt-0.5 text-[13px] text-danger-200/70">{tr.error}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={tr.dismissError}>
                      Dismiss
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <TranscriptView
              committed={tr.committed}
              partial={tr.partial}
              listening={tr.listening}
              placeholder={tr.listening ? "Start speaking" : "Your words will appear here as you speak — transcribed live, on-device."}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="tabular mr-auto font-mono text-[12px] text-white/35">
                {tr.text ? `${tr.text.split(/\s+/).length} words` : ""}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!tr.text}
                onClick={copy}
                icon={copied ? <Check className="size-3.5 text-good-300" /> : <Copy className="size-3.5" />}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!tr.text}
                onClick={() =>
                  downloadBlob(
                    new Blob([`${tr.text}\n`], { type: "text/plain" }),
                    `transcript-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`,
                  )
                }
                icon={<Download className="size-3.5" />}
              >
                .txt
              </Button>
              <Button size="sm" variant="ghost" disabled={!tr.text} onClick={tr.clear} icon={<Eraser className="size-3.5" />}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
