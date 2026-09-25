import { useAudioLevel, useSpeak, useVoices } from "@kucukkanat/speech-react";
import { EXAGGERATION, isTtsModelKey, SAMPLING_RANGES, type Sampling, TTS_MODELS, type TtsModelKey } from "@kucukkanat/tts";
import { useRef, useState } from "react";
import { formatSize } from "./format";
import { tts, voices } from "./speech";
import { Button, ErrorNote, Label, ModelGate, Slider } from "./ui";

const SAMPLE = "Hello there! This voice is generated entirely inside your browser. Every sentence lights up as you hear it.";

interface SpeakPanelProps {
  /** Model, voice, emotion, sampling and buffering controls (the playground). */
  advanced?: boolean;
  text?: string;
  /** Speak with this library voice (e.g. one just cloned) instead of letting the reader pick. */
  voiceId?: string;
}

/** Speak with a demo or saved voice, with karaoke highlighting. */
export function SpeakPanel({ advanced = false, text = SAMPLE, voiceId }: SpeakPanelProps) {
  const [model, setModel] = useState<TtsModelKey>(tts.model.key);
  const [failure, setFailure] = useState<unknown>(null);
  const choose = (key: TtsModelKey) => {
    setModel(key);
    setFailure(null);
    // Before a model is loaded this only changes what "Load" fetches; afterwards it swaps models (freeing GPU memory).
    tts.switchModel(key).catch(setFailure);
  };
  return (
    <div className="space-y-3">
      {advanced && (
        <label className="flex flex-col gap-1">
          <Label>Model</Label>
          <select
            data-testid="tts-model"
            className="rounded-blume border border-border bg-background px-2 py-1.5 text-sm"
            value={model}
            onChange={(e) => isTtsModelKey(e.target.value) && choose(e.target.value)}
          >
            {Object.values(TTS_MODELS).map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} · {formatSize(m.approxDownloadMB)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{TTS_MODELS[model].description}</span>
        </label>
      )}
      <ErrorNote error={failure} />
      <ModelGate engine={tts} model={TTS_MODELS[model]}>
        {/* Keyed by model: sampling defaults and supported options differ per model. */}
        <Speaker key={model} model={model} advanced={advanced} initial={text} voiceId={voiceId} />
      </ModelGate>
    </div>
  );
}

const SAMPLING_LABELS: { readonly [K in keyof Sampling]: string } = {
  temperature: "Temperature",
  topK: "Top-k",
  topP: "Top-p",
  minP: "Min-p",
  repetitionPenalty: "Repetition penalty",
};
const SAMPLING_STEPS: { readonly [K in keyof Sampling]: number } = {
  temperature: 0.05,
  topK: 10,
  topP: 0.01,
  minP: 0.01,
  repetitionPenalty: 0.05,
};
const SAMPLING_KEYS = ["temperature", "topK", "topP", "minP", "repetitionPenalty"] as const satisfies readonly (keyof Sampling)[];

interface SpeakerProps {
  model: TtsModelKey;
  advanced: boolean;
  initial: string;
  voiceId: string | undefined;
}

function Speaker({ model, advanced, initial, voiceId }: SpeakerProps) {
  const { speak, stop, active, state, spoken, sentence, stats, analyser, error } = useSpeak(tts);
  const { voices: list } = useVoices(voices);
  const info = TTS_MODELS[model];
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState(initial);
  const [exaggeration, setExaggeration] = useState<number>(EXAGGERATION.neutral);
  const [sampling, setSampling] = useState<Sampling>(info.sampling);
  const [buffering, setBuffering] = useState(true);
  const level = useRef<HTMLDivElement>(null);
  useAudioLevel(analyser, (l) => level.current?.style.setProperty("transform", `scaleX(${l})`), { gain: 4 });
  const voice = list.find((v) => v.id === (voiceId ?? picked)) ?? list[0];

  const onSpeak = () => {
    if (!voice) return;
    // The hook records the outcome (error / result); the returned handle needs no await here.
    void speak(text.trim(), {
      voice,
      ...(advanced ? { sampling, buffering } : {}),
      ...(advanced && info.supports.exaggeration ? { exaggeration } : {}),
    });
  };

  return (
    <div className="space-y-3">
      {advanced && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <Label>Voice</Label>
              <select
                data-testid="tts-voice"
                className="rounded-blume border border-border bg-background px-2 py-1.5 text-sm"
                value={voice?.id ?? ""}
                onChange={(e) => setPicked(e.target.value)}
              >
                {list.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.seconds.toFixed(0)} s{v.builtIn ? ", demo" : ""})
                  </option>
                ))}
              </select>
            </label>
            {info.supports.exaggeration && (
              <Slider
                testId="tts-exaggeration"
                label="Exaggeration"
                value={exaggeration}
                min={EXAGGERATION.min}
                max={EXAGGERATION.max}
                step={0.05}
                onChange={setExaggeration}
              />
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                data-testid="tts-buffering"
                className="accent-accent"
                type="checkbox"
                checked={buffering}
                onChange={(e) => setBuffering(e.target.checked)}
              />
              Buffer before playing (no pauses; off = lowest latency)
            </label>
          </div>
          <fieldset className="rounded-blume border border-border p-3" data-testid="tts-sampling">
            <legend className="px-1">
              <Label>Sampling</Label>
            </legend>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {SAMPLING_KEYS.map((key) => (
                <Slider
                  key={key}
                  testId={`tts-sampling-${key}`}
                  label={SAMPLING_LABELS[key]}
                  value={sampling[key]}
                  min={SAMPLING_RANGES[key].min}
                  // The full top-k range is thousands of tokens; the useful part is far smaller.
                  max={key === "topK" ? 2000 : SAMPLING_RANGES[key].max}
                  step={SAMPLING_STEPS[key]}
                  onChange={(value) => setSampling((s) => ({ ...s, [key]: value }))}
                />
              ))}
            </div>
            <Button className="mt-2" data-testid="tts-sampling-reset" onClick={() => setSampling(info.sampling)}>
              Reset to {info.label} defaults
            </Button>
          </fieldset>
        </>
      )}
      <textarea
        data-testid="tts-text"
        rows={3}
        className="w-full rounded-blume border border-border bg-background p-2 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button
          primary
          data-testid="speak-button"
          data-state={state}
          disabled={!active && (!voice || !text.trim())}
          onClick={() => (active ? stop() : onSpeak())}
        >
          {active ? "Stop" : `Speak as ${voice?.name ?? "…"}`}
        </Button>
        <span className="text-xs text-muted-foreground" data-testid="speak-state">
          {state === "idle" ? "" : state}
          {stats?.ttfaMs !== undefined && ` · first audio after ${Math.round(stats.ttfaMs)} ms`}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div ref={level} className="h-full origin-left scale-x-0 bg-accent" />
      </div>
      {spoken.length > 0 && (
        <p className="text-sm leading-relaxed">
          {spoken.map((s) => (
            <span
              key={s.index}
              data-testid="karaoke-sentence"
              className={`rounded px-0.5 transition ${s.index === sentence?.index && active ? "bg-accent text-accent-foreground" : ""}`}
            >
              {s.text}{" "}
            </span>
          ))}
        </p>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
