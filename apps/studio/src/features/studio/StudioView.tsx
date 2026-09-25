import { useEngine, useSpeak, useVoices } from "@kucukkanat/speech-react";
import { isTtsModelKey, EXAGGERATION as SDK_EXAGGERATION, type SpeechState, TTS_MODELS, type TtsModelKey } from "@kucukkanat/tts";
import clsx from "clsx";
import { AudioWaveform, ChevronDown, Gem, Loader2, RefreshCw, Sparkles, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ModelGate } from "../../components/engine/ModelGate";
import { ModelPicker } from "../../components/engine/ModelPicker";
import { usePersistentState } from "../../components/hooks/usePersistentState";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { tts, voices } from "../../speech";
import { CreatePersonaSheet } from "../personas/create/CreatePersonaSheet";
import { type HistoryItem, HistoryList } from "./HistoryList";
import { KaraokeText } from "./KaraokeText";
import { PersonaCarousel } from "./PersonaCarousel";
import { ReactiveOrb } from "./ReactiveOrb";
import { SpeakButton } from "./SpeakButton";
import { StatsRow } from "./StatsRow";

const MAX_CHARS = 1000;
const SAMPLES = [
  { label: "Hello", text: "Hi there! This voice was cloned from a few seconds of audio, and it's running entirely inside your browser." },
  {
    label: "Story",
    text: "The lighthouse keeper climbed the stairs one last time. Below him, the sea was calm. Somewhere far away, a ship turned towards home.",
  },
  { label: "Pitch", text: "No servers. No uploads. Just your voice, your words, and a model that lives on your own machine." },
  { label: "Tongue twister", text: "She sells seashells by the seashore, and the shells she sells are surely seashells." },
];

const TAGS = [
  "laugh",
  "chuckle",
  "sigh",
  "gasp",
  "cough",
  "clear throat",
  "sniff",
  "groan",
  "shush",
  "whispering",
  "happy",
  "sarcastic",
  "surprised",
  "angry",
  "fear",
  "crying",
  "dramatic",
  "narration",
];

const EXAGGERATION = { ...SDK_EXAGGERATION, step: 0.05 } as const;
const DEFAULT_COLORS: [string, string] = ["#7c6cff", "#e46bff"];
const parseExaggeration = (v: unknown) => (typeof v === "number" && v >= EXAGGERATION.min && v <= EXAGGERATION.max ? v : undefined);

/** States where the orb shows the 'thinking' animation instead of reacting to audio. */
const BUSY = new Set<SpeechState | "idle">(["loading", "encoding", "generating", "buffering"]);

const ICONS: Record<TtsModelKey, ReactNode> = { "chatterbox-turbo": <Zap className="size-5" />, chatterbox: <Gem className="size-5" /> };

export function StudioView({ personaId, onPersonaChange }: { personaId: string | null; onPersonaChange: (id: string) => void }) {
  const engine = useEngine(tts);
  const { voices: personas, loading } = useVoices(voices);
  const speech = useSpeak(tts);
  const { toast } = useToast();
  const [text, setText] = useState(SAMPLES[0]?.text ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const insertTag = (tag: string) => {
    const el = taRef.current;
    const at = el ? el.selectionStart : text.length;
    const ins = `${at > 0 && text[at - 1] !== " " ? " " : ""}[${tag}] `;
    const next = (text.slice(0, at) + ins + text.slice(at)).slice(0, MAX_CHARS);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + ins.length, at + ins.length);
    });
  };
  const [creating, setCreating] = useState(false);

  const persona = useMemo(() => personas.find((p) => p.id === personaId) ?? personas[0] ?? null, [personas, personaId]);
  useEffect(() => {
    if (persona && persona.id !== personaId) onPersonaChange(persona.id);
  }, [persona, personaId, onPersonaChange]);

  const status = engine.status;
  const loadedKey = status.state === "ready" ? status.model : undefined;
  const [selected, setSelected] = usePersistentState<TtsModelKey>(
    "voice-lab:tts-model",
    () => tts.model.key,
    (v) => (isTtsModelKey(v) ? v : undefined),
  );
  const [exaggeration, setExaggeration] = usePersistentState("voice-lab:tts-exaggeration", () => EXAGGERATION.neutral, parseExaggeration);
  const model = TTS_MODELS[selected];
  // Controls follow the model that will actually speak, not the one merely highlighted in the picker.
  const speaking = loadedKey ? TTS_MODELS[loadedKey] : model;
  const ready = engine.ready;
  const colors = persona?.meta.colors ?? DEFAULT_COLORS;

  // Before anything is loaded, the remembered choice simply becomes the model to load (switchModel doesn't download).
  useEffect(() => {
    if (tts.status.state === "idle" && tts.model.key !== selected) void tts.switchModel(selected);
  }, [selected]);

  const onSpeak = () => {
    if (!persona || !text.trim()) return;
    setReplayingId(null);
    const spoken = text.trim();
    speech.speak(spoken, { voice: persona, ...(speaking.supports.exaggeration ? { exaggeration } : {}) }).done.then(
      ({ clip, stopped }) => {
        if (stopped || !clip.duration) return;
        const item = {
          id: crypto.randomUUID(),
          text: spoken,
          persona: { name: persona.name, colors: persona.meta.colors },
          clip,
          createdAt: Date.now(),
        };
        setHistory((h) => [item, ...h].slice(0, 20));
      },
      (e: unknown) => toast({ tone: "error", title: "Speech failed", description: e instanceof Error ? e.message : String(e) }),
    );
  };

  const onReplay = (item: HistoryItem) => {
    if (replayingId === item.id) return speech.stop();
    setReplayingId(item.id);
    const clear = () => setReplayingId((id) => (id === item.id ? null : id));
    speech.play(item.clip).done.then(clear, clear);
  };

  const load = () => {
    speech.stop();
    tts
      .switchModel(selected)
      .then(() => tts.load())
      .catch((e: unknown) =>
        toast({ tone: "error", title: "TTS failed to load", description: e instanceof Error ? e.message : String(e) }),
      );
  };

  return (
    <div className="space-y-5">
      <section className="glass rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium tracking-wide text-white/50 uppercase">Voice model</h3>
          <AnimatePresence>
            {ready && loadedKey !== selected && (
              <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}>
                <Button size="sm" variant="primary" onClick={load} icon={<RefreshCw className="size-3.5" />} data-testid="tts-switch-model">
                  Switch to {model.label}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <ModelPicker
          label="Voice model"
          models={tts.models}
          icons={ICONS}
          value={selected}
          loadedKey={loadedKey}
          disabled={status.state === "loading" || speech.active}
          onChange={setSelected}
        />
      </section>

      <ModelGate
        title={model.label}
        modelName={model.repo}
        sizeMB={model.approxDownloadMB}
        status={status}
        onLoad={load}
        icon={<AudioWaveform className="size-5" />}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Composer */}
        <section className="glass flex flex-col rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium tracking-wide text-white/50 uppercase">Voice</h3>
            {persona && <span className="text-[12px] text-white/35">{persona.seconds.toFixed(1)} s reference</span>}
          </div>
          <PersonaCarousel
            personas={personas}
            loading={loading}
            value={persona?.id ?? null}
            onChange={onPersonaChange}
            onCreate={() => setCreating(true)}
          />

          <div className="relative mt-4">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready && !speech.active) onSpeak();
              }}
              rows={6}
              placeholder="Type something to say…"
              className="block min-h-40 w-full resize-y rounded-2xl border border-white/10 bg-black/25 p-4 pb-8 text-[15px] leading-relaxed text-white placeholder:text-white/25 transition outline-none focus-visible:outline-none focus:border-highlight-300/40 focus:shadow-[0_0_0_4px_rgb(228_107_255/0.1)]"
            />
            <span
              className={clsx(
                "tabular pointer-events-none absolute right-3 bottom-2.5 font-mono text-[11px]",
                text.length > MAX_CHARS * 0.9 ? "text-warn-300" : "text-white/30",
              )}
            >
              {text.length}/{MAX_CHARS}
            </span>
          </div>

          <div className="scrollbar-none -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
            {SAMPLES.map((s) => (
              <motion.button
                key={s.label}
                whileTap={{ scale: 0.94 }}
                onClick={() => setText(s.text)}
                className={clsx(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] transition",
                  text === s.text
                    ? "border-highlight-300/40 bg-highlight-400/10 text-highlight-100"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white",
                )}
              >
                {s.label}
              </motion.button>
            ))}
          </div>

          {speaking.supports.exaggeration && (
            <label className="mt-4 block" data-testid="tts-exaggeration">
              <span className="flex items-center justify-between text-[12.5px] text-white/45">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> Emotion intensity
                </span>
                <span className="tabular font-mono text-white/70">{exaggeration.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={EXAGGERATION.min}
                max={EXAGGERATION.max}
                step={EXAGGERATION.step}
                value={exaggeration}
                onChange={(e) => setExaggeration(Number(e.target.value))}
                onDoubleClick={() => setExaggeration(EXAGGERATION.neutral)}
                className="mt-2 w-full accent-accent-b"
                data-testid="tts-exaggeration-slider"
              />
              <span className="mt-1 flex justify-between text-[11.5px] text-white/30">
                <span>Flat</span>
                <span>Neutral {EXAGGERATION.neutral} · double-click to reset</span>
                <span>Dramatic</span>
              </span>
            </label>
          )}

          {speaking.supports.tags && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setAdvanced((a) => !a)}
                className="flex items-center gap-1.5 text-[12.5px] text-white/45 transition hover:text-white/80"
                aria-expanded={advanced}
              >
                <Sparkles className="size-3.5" /> Emotion &amp; sound tags
                <ChevronDown className={clsx("size-3.5 transition-transform", advanced && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {advanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-1.5 pt-3">
                      {TAGS.map((t, i) => (
                        <motion.button
                          key={t}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0, transition: { delay: i * 0.015 } }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => insertTag(t)}
                          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[11.5px] text-white/60 transition-colors hover:border-highlight-300/40 hover:text-highlight-100"
                        >
                          [{t}]
                        </motion.button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-white/30">
                      Turbo understands these inline, e.g. “That's hilarious [laugh] okay.”
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <p className="hidden text-[12px] text-white/30 sm:block">
              <kbd className="rounded border border-white/15 px-1 font-mono">⌘/Ctrl</kbd> +{" "}
              <kbd className="rounded border border-white/15 px-1 font-mono">Enter</kbd>
            </p>
            <p className="text-[12px] text-white/35 sm:hidden">{ready ? "" : "Load the model to speak"}</p>
            <SpeakButton phase={speech.state} disabled={!ready || !persona || !text.trim()} onSpeak={onSpeak} onStop={speech.stop} />
          </div>
        </section>

        {/* Stage */}
        <section className="glass relative flex flex-col overflow-hidden rounded-3xl p-5 sm:p-6">
          <AnimatePresence>
            {speech.state === "buffering" && (
              <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11.5px] text-white/70"
                data-testid="tts-buffering"
                title="Holding audio back until enough is generated to play without pauses"
              >
                <Loader2 className="size-3 animate-spin" /> Buffering…
              </motion.span>
            )}
          </AnimatePresence>
          <div className="relative mx-auto aspect-square w-full max-w-[300px]">
            <ReactiveOrb
              analyser={speech.analyser}
              colors={colors}
              busy={BUSY.has(speech.state)}
              className="absolute inset-0 h-full w-full"
            />
            {persona?.meta.emoji && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl opacity-90 drop-shadow-[0_4px_12px_rgb(0_0_0/0.4)]">
                {persona.meta.emoji}
              </span>
            )}
          </div>
          <div className="mt-1 mb-5 min-h-24 px-1" aria-live="polite">
            <KaraokeText spoken={speech.spoken} current={speech.sentence} state={speech.state} />
          </div>
          <div className="mt-auto">
            <StatsRow stats={speech.stats} status={status} />
          </div>
        </section>
      </div>

      <HistoryList
        items={history}
        replayingId={replayingId}
        onReplay={onReplay}
        onRemove={(id) => setHistory((h) => h.filter((x) => x.id !== id))}
      />

      <CreatePersonaSheet open={creating} onClose={() => setCreating(false)} onCreated={(p) => onPersonaChange(p.id)} />
    </div>
  );
}
