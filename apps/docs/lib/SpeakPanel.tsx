import { useAudioLevel, useSpeak, useVoices } from "@kucukkanat/speech-react";
import { EXAGGERATION, isTtsModelKey, TTS_MODELS, type TtsModelKey } from "@kucukkanat/tts";
import { useRef, useState } from "react";
import { formatSize } from "./format";
import { tts, voices } from "./speech";
import { Button, ErrorNote, Label, ModelGate } from "./ui";

const SAMPLE = "Hello there! This voice is generated entirely inside your browser. Every sentence lights up as you hear it.";

/** Speak with a demo or saved voice, with karaoke highlighting. `advanced` adds the model, voice and emotion controls. */
export function SpeakPanel({ advanced = false, text: initial = SAMPLE }: { advanced?: boolean; text?: string }) {
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
        <Speaker advanced={advanced} initial={initial} exaggerate={TTS_MODELS[model].supports.exaggeration} />
      </ModelGate>
    </div>
  );
}

function Speaker({ advanced, initial, exaggerate }: { advanced: boolean; initial: string; exaggerate: boolean }) {
  const { speak, stop, active, state, spoken, sentence, stats, analyser, error } = useSpeak(tts);
  const { voices: list } = useVoices(voices);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [text, setText] = useState(initial);
  const [exaggeration, setExaggeration] = useState<number>(EXAGGERATION.neutral);
  const level = useRef<HTMLDivElement>(null);
  useAudioLevel(analyser, (l) => level.current?.style.setProperty("transform", `scaleX(${l})`), { gain: 4 });
  const voice = list.find((v) => v.id === voiceId) ?? list[0];

  return (
    <div className="space-y-3">
      {advanced && (
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <Label>Voice</Label>
            <select
              data-testid="tts-voice"
              className="rounded-blume border border-border bg-background px-2 py-1.5 text-sm"
              value={voice?.id ?? ""}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              {list.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.seconds.toFixed(0)} s{v.builtIn ? ", demo" : ""})
                </option>
              ))}
            </select>
          </label>
          {exaggerate && (
            <label className="flex flex-col gap-1">
              <Label>Exaggeration {exaggeration.toFixed(2)}</Label>
              <input
                data-testid="tts-exaggeration"
                type="range"
                min={EXAGGERATION.min}
                max={EXAGGERATION.max}
                step={0.05}
                value={exaggeration}
                onChange={(e) => setExaggeration(Number(e.target.value))}
              />
            </label>
          )}
        </div>
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
          onClick={() => {
            if (active) return stop();
            if (!voice) return;
            // The hook records the outcome (error / result); the returned handle needs no await here.
            void speak(text.trim(), { voice, ...(exaggerate ? { exaggeration } : {}) });
          }}
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
