import { useTranscription } from "@kucukkanat/speech-react";
import { isSttModelKey, STT_MODELS, type SttModelKey } from "@kucukkanat/stt";
import { useRef, useState } from "react";
import { formatSize } from "./format";
import { stt } from "./speech";
import { Button, ErrorNote, Label, ModelGate } from "./ui";

/** Live microphone dictation. `advanced` adds the model picker and transcribing an audio file. */
export function TranscribePanel({ advanced = false }: { advanced?: boolean }) {
  const [model, setModel] = useState<SttModelKey>(stt.model.key);
  const [failure, setFailure] = useState<unknown>(null);
  const choose = (key: SttModelKey) => {
    setModel(key);
    setFailure(null);
    stt.switchModel(key).catch(setFailure);
  };
  return (
    <div className="space-y-3">
      {advanced && (
        <label className="flex flex-col gap-1">
          <Label>Model</Label>
          <select
            data-testid="stt-model"
            className="rounded-blume border border-border bg-background px-2 py-1.5 text-sm"
            value={model}
            onChange={(e) => isSttModelKey(e.target.value) && choose(e.target.value)}
          >
            {Object.values(STT_MODELS).map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} · {formatSize(m.approxDownloadMB)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{STT_MODELS[model].description}</span>
        </label>
      )}
      <ErrorNote error={failure} />
      <ModelGate engine={stt} model={STT_MODELS[model]}>
        <Dictation />
        {advanced && <FileTranscription />}
      </ModelGate>
    </div>
  );
}

function Dictation() {
  const level = useRef<HTMLDivElement>(null);
  const { start, stop, clear, listening, starting, committed, partial, error } = useTranscription(stt, {
    onLevel: (l) => level.current?.style.setProperty("transform", `scaleX(${Math.min(1, l * 4)})`),
  });
  const [stopFailure, setStopFailure] = useState<unknown>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          primary
          data-testid="mic-button"
          data-state={listening ? "listening" : starting ? "starting" : "idle"}
          disabled={starting}
          onClick={() => (listening ? stop().catch(setStopFailure) : start())}
        >
          {listening ? "Stop" : starting ? "Starting…" : "Start dictation"}
        </Button>
        <Button data-testid="transcript-clear" onClick={clear}>
          Clear
        </Button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div ref={level} className="h-full origin-left scale-x-0 bg-accent" />
      </div>
      <p data-testid="transcript" className="min-h-12 rounded-blume bg-muted p-3 text-sm">
        {committed} <span className="text-muted-foreground">{partial}</span>
        {!committed && !partial && <span className="text-muted-foreground">{listening ? "Listening…" : "Your words appear here."}</span>}
      </p>
      <ErrorNote error={error ?? stopFailure} />
    </div>
  );
}

function FileTranscription() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = (file: File) => {
    setText("");
    setError(null);
    setBusy(true);
    const session = stt.transcribe(file);
    session.on("update", (u) => setText(u.text));
    session.done.then((t) => setText(t.text), setError).finally(() => setBusy(false));
  };
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <label className="flex flex-col gap-1">
        <Label>Or transcribe a file (wav, mp3, ogg, webm, m4a…)</Label>
        <input
          data-testid="stt-file"
          type="file"
          accept="audio/*,video/*"
          disabled={busy}
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) run(file);
          }}
        />
      </label>
      {(text || busy) && (
        <p data-testid="file-transcript" className="rounded-blume bg-muted p-3 text-sm">
          {text || "Transcribing…"}
        </p>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
