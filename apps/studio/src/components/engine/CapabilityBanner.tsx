import { useCapabilities } from "@kucukkanat/speech-react";
import { ShieldAlert, Turtle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactElement, useState } from "react";

/** Warns about missing WebGPU (slow WASM fallback) or an insecure context (microphone blocked). */
export function CapabilityBanner() {
  const caps = useCapabilities();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const notes = [
    caps &&
      !caps.secureContext && {
        id: "secure",
        icon: <ShieldAlert className="size-4 text-danger" />,
        text: "This page isn't a secure context — the microphone is blocked. Open it via https:// or localhost.",
      },
    caps &&
      !caps.webgpu && {
        id: "gpu",
        icon: <Turtle className="size-4 text-warn" />,
        text: "WebGPU isn't available in this browser — voice cloning needs it, and live transcription falls back to the slower CPU (Moonshine). Try a recent Chrome, Edge or Safari.",
      },
  ].filter((n): n is { id: string; icon: ReactElement; text: string } => !!n && !dismissed.includes(n.id));

  return (
    <AnimatePresence initial={false}>
      {notes.map((n) => (
        <motion.div
          key={n.id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
          data-testid={`capability-${n.id}`}
        >
          <div className="mb-3 flex items-start gap-3 rounded-2xl border border-warn/15 bg-warn/[0.06] px-4 py-3 text-[13px] text-white/80">
            <span className="mt-0.5">{n.icon}</span>
            <p className="flex-1 leading-snug">{n.text}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed((d) => [...d, n.id])}
              className="rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
