import clsx from "clsx";
import { FileAudio, Loader2, Mic, Square, UploadCloud } from "lucide-react";
import { AnimatePresence, type MotionValue, motion, useReducedMotion, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { MAX_RECORD_SECONDS, useRecorder } from "./useRecorder";

interface SourceStepProps {
  busy: boolean;
  onAudio: (blob: Blob, name: string) => void;
}

export function SourceStep({ busy, onAudio }: SourceStepProps) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const rec = useRecorder((blob) => onAudio(blob, "Recording"));
  const recording = rec.state === "recording";
  const reduce = useReducedMotion();

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onAudio(f, f.name.replace(/\.[^.]+$/, ""));
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
      {/* Drop zone */}
      <motion.label
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current++;
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          if (--depth.current <= 0) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
        animate={{ scale: drag && !reduce ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={clsx(
          "group relative flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed p-6 text-center transition-colors",
          drag
            ? "border-highlight-300/70 bg-highlight-400/[0.08]"
            : "border-white/12 bg-white/[0.025] hover:border-white/25 hover:bg-white/[0.04]",
          (busy || recording) && "pointer-events-none opacity-50",
        )}
      >
        <input
          ref={input}
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: "radial-gradient(60% 60% at 50% 40%, rgb(124 108 255 / 0.14), transparent)" }}
        />
        <motion.div
          animate={drag && !reduce ? { y: [-2, -8, -2] } : { y: 0 }}
          {...(drag ? { transition: { repeat: Number.POSITIVE_INFINITY, duration: 1.1, ease: "easeInOut" } } : {})}
          className="flex size-14 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_12px_30px_-10px_rgb(228_107_255/0.7)]"
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin" />
          ) : drag ? (
            <FileAudio className="size-6" />
          ) : (
            <UploadCloud className="size-6" />
          )}
        </motion.div>
        <div>
          <p className="font-medium text-white">{busy ? "Decoding audio…" : drag ? "Drop it!" : "Drop an audio file"}</p>
          <p className="mt-1 text-[13px] text-white/50">
            or <span className="text-highlight-200 underline decoration-highlight-300/40 underline-offset-2">browse</span> · wav, mp3, m4a,
            ogg, webm
          </p>
        </div>
        <p className="text-[12px] text-white/35">Tip: 5–10 s of clean, single-speaker speech works best.</p>
      </motion.label>

      {/* Recorder */}
      <div
        className={clsx(
          "relative flex min-h-56 flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border p-6 transition-colors",
          recording ? "border-danger-300/30 bg-danger-500/[0.06]" : "border-white/10 bg-white/[0.025]",
        )}
      >
        <LevelBars level={rec.level} active={recording} />
        <AnimatePresence mode="wait" initial={false}>
          {recording ? (
            <motion.div
              key="rec"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="tabular font-mono text-sm text-white/80">
                <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-danger-400" />
                {rec.elapsed.toFixed(1)} / {MAX_RECORD_SECONDS}s
              </div>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-danger-400/80" style={{ width: `${(rec.elapsed / MAX_RECORD_SECONDS) * 100}%` }} />
              </div>
              <Button variant="danger" onClick={rec.stop} icon={<Square className="size-3.5 fill-current" />}>
                Stop
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 text-center"
            >
              <Button
                variant="secondary"
                size="lg"
                disabled={busy || rec.state === "requesting"}
                onClick={rec.start}
                icon={rec.state === "requesting" ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4 text-danger-300" />}
              >
                Record from mic
              </Button>
              <p className="max-w-52 text-[12px] text-white/40">
                Read a sentence naturally. Stops automatically at {MAX_RECORD_SECONDS} s.
              </p>
              {rec.error && <p className="max-w-60 text-[12px] text-danger-300">{rec.error}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const BAR_SHAPE = Array.from({ length: 28 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));

function LevelBars({ level, active }: { level: MotionValue<number>; active: boolean }) {
  return (
    <div aria-hidden className={clsx("flex h-14 items-center gap-[3px] transition-opacity", active ? "opacity-100" : "opacity-30")}>
      {BAR_SHAPE.map((f, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative list; position is identity
        <Bar key={i} level={level} f={f} />
      ))}
    </div>
  );
}

function Bar({ level, f }: { level: MotionValue<number>; f: number }) {
  const scaleY = useTransform(level, (v) => Math.max(0.08, Math.min(1, v * f * 1.6)));
  return (
    <motion.span
      className="h-full w-[4px] origin-center rounded-full bg-gradient-to-t from-danger-400 to-highlight-300"
      style={{ scaleY }}
    />
  );
}
