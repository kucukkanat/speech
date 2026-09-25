import { decodeAudio } from "@kucukkanat/speech-audio";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Sheet } from "../../../components/ui/Sheet";
import { useToast } from "../../../components/ui/Toast";
import { type Persona, tts, voices } from "../../../speech";
import { PALETTES } from "../palettes";
import { bestWindow, MIN_SEL, selectionTone } from "./audioUtils";
import { type Details, DetailsStep } from "./DetailsStep";
import { SourceStep } from "./SourceStep";
import { type Selection, WaveformCropper } from "./WaveformCropper";

type Step = "source" | "crop" | "details";

const randomPalette = (): [string, string] =>
  (PALETTES[Math.floor(Math.random() * PALETTES.length)] ?? { colors: ["#7c6cff", "#e46bff"] as [string, string] }).colors;
const STEPS: Step[] = ["source", "crop", "details"];
const STEP_LABEL: Record<Step, string> = { source: "Audio", crop: "Trim", details: "Identity" };

interface Loaded {
  pcm: Float32Array;
  sampleRate: number;
  name: string;
}

export function CreatePersonaSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (p: Persona) => void }) {
  const [step, setStep] = useState<Step>("source");
  const [dir, setDir] = useState(1);
  const [decoding, setDecoding] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [audio, setAudio] = useState<Loaded | null>(null);
  const [sel, setSel] = useState<Selection>({ start: 0, end: 0 });
  const [details, setDetails] = useState<Details>(() => ({ name: "", colors: randomPalette() }));
  const { toast } = useToast();
  const reduce = useReducedMotion();

  const go = (s: Step) => {
    setDir(STEPS.indexOf(s) > STEPS.indexOf(step) ? 1 : -1);
    setStep(s);
  };

  const reset = useCallback(() => {
    setStep("source");
    setAudio(null);
    setSaving(null);
    setDetails({ name: "", colors: randomPalette() });
  }, []);

  const close = () => {
    if (saving) return;
    onClose();
    setTimeout(reset, 300);
  };

  const onAudio = async (blob: Blob, name: string) => {
    setDecoding(true);
    try {
      const { pcm, sampleRate } = await decodeAudio(blob);
      const dur = pcm.length / sampleRate;
      if (dur < MIN_SEL) {
        toast({
          tone: "error",
          title: "Clip too short",
          description: `Need at least ${MIN_SEL} s of audio — this one is ${dur.toFixed(1)} s.`,
        });
        return;
      }
      setAudio({ pcm, sampleRate, name });
      setSel(bestWindow(pcm, sampleRate, Math.min(8, dur)));
      setDetails((d) => ({ ...d, name: d.name || (name === "Recording" ? "" : name.slice(0, 32)) }));
      go("crop");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't read that file", description: e instanceof Error ? e.message : "Unsupported audio format." });
    } finally {
      setDecoding(false);
    }
  };

  const save = async () => {
    if (!audio) return;
    try {
      setSaving("Saving…");
      // The SDK crops, normalises and stores the clip at 24 kHz.
      const p: Persona = await voices.create({
        name: details.name.trim() || "Untitled voice",
        audio: { pcm: audio.pcm, sampleRate: audio.sampleRate },
        crop: sel,
        meta: { colors: details.colors, ...(details.emoji ? { emoji: details.emoji } : {}) },
      });
      // Learn the voice now if the model is loaded, so the first Speak starts right away.
      let encoded = false;
      if (tts.status.state === "ready") {
        setSaving("Learning the voice…");
        encoded = await tts.prepare(p).then(
          () => true,
          () => false, // not fatal: the voice is saved and gets encoded the first time it speaks
        );
      }
      toast({
        tone: "success",
        title: `${p.name} is ready`,
        description: encoded ? "Voice learned and cached." : "The voice will be learned the first time you use it.",
      });
      onCreated?.(p);
      onClose();
      setTimeout(reset, 300);
    } catch (err) {
      setSaving(null);
      toast({ tone: "error", title: "Couldn't save persona", description: err instanceof Error ? err.message : String(err) });
    }
  };

  const idx = STEPS.indexOf(step);
  const len = sel.end - sel.start;
  const canNext = step === "crop" ? selectionTone(len) !== "bad" : true;

  return (
    <Sheet open={open} onClose={close} locked={!!saving} title="New persona" subtitle={<Stepper index={idx} />}>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 40, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -40, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="pt-3"
          >
            {step === "source" && <SourceStep busy={decoding} onAudio={onAudio} />}
            {step === "crop" && audio && (
              <div>
                <p className="mb-3 text-[13px] text-white/55">
                  Drag the handles or the highlighted region to pick the cleanest stretch of speech. Arrow keys nudge (Shift for bigger
                  steps).
                </p>
                <WaveformCropper pcm={audio.pcm} sampleRate={audio.sampleRate} value={sel} onChange={setSel} />
              </div>
            )}
            {step === "details" && <DetailsStep value={details} onChange={setDetails} clipSeconds={len} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {step !== "source" && (
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <Button
            variant="ghost"
            disabled={!!saving}
            onClick={() => go(STEPS[idx - 1] ?? "source")}
            icon={<ArrowLeft className="size-4" />}
          >
            Back
          </Button>
          {step === "crop" ? (
            <Button variant="primary" disabled={!canNext} onClick={() => go("details")} data-testid="persona-continue">
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!!saving}
              onClick={save}
              data-testid="persona-save"
              icon={saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={saving ?? "save"}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  {saving ?? "Save persona"}
                </motion.span>
              </AnimatePresence>
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Stepper({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <motion.span
              animate={{ width: i === index ? 20 : 6, opacity: i <= index ? 1 : 0.3 }}
              className={clsx("block h-1.5 rounded-full", i <= index ? "bg-accent" : "bg-white")}
            />
            <span className={clsx("text-[12px]", i === index ? "text-white/80" : "text-white/35")}>{STEP_LABEL[s]}</span>
          </div>
          {i < STEPS.length - 1 && <span className="text-white/15">·</span>}
        </div>
      ))}
    </div>
  );
}
