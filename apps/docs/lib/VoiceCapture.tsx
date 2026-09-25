import { type Recording, startRecording } from "@kucukkanat/speech-audio";
import { CLIP_SECONDS } from "@kucukkanat/voices";
import { useState } from "react";
import { voices } from "./speech";
import { Button, ErrorNote, Label } from "./ui";

type Voice = (typeof voices.snapshot.voices)[number];

/**
 * Record or upload a voice and add it to the library. `advanced` adds the clip-preparation options of
 * `voices.create()`: automatic cropping to the best stretch, or keeping everything up to `maxSeconds`.
 */
export function VoiceCapture({ advanced = false, onCreated }: { advanced?: boolean; onCreated?: (voice: Voice) => void }) {
  const [name, setName] = useState("My voice");
  const [crop, setCrop] = useState<"auto" | false>("auto");
  const [maxSeconds, setMaxSeconds] = useState<number>(CLIP_SECONDS.max);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const add = (audio: Blob) => {
    setFailure(null);
    setCreating(true);
    voices
      .create({ name: name.trim() || "My voice", audio, meta: {}, crop, maxSeconds })
      .then((voice) => onCreated?.(voice), setFailure)
      .finally(() => setCreating(false));
  };
  const record = async () => {
    setFailure(null);
    const r = await startRecording({ maxSeconds: 15 });
    r.on("time", setSeconds);
    setRecording(r);
    r.done.then(add, setFailure).finally(() => setRecording(null));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <Label>Voice name</Label>
          <input
            data-testid="voice-name"
            className="rounded-blume border border-border bg-background px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {recording ? (
          <Button primary data-testid="voice-record" data-state="recording" onClick={() => recording.stop()}>
            Stop recording ({seconds.toFixed(0)} s)
          </Button>
        ) : (
          <Button
            primary
            data-testid="voice-record"
            data-state={creating ? "creating" : "idle"}
            disabled={creating}
            onClick={() => record().catch(setFailure)}
          >
            {creating ? "Preparing clip…" : "Record"}
          </Button>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <Label>or upload a clip</Label>
          <input
            data-testid="voice-file"
            type="file"
            accept="audio/*"
            className="text-sm"
            disabled={creating || recording !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) add(file);
            }}
          />
        </label>
      </div>
      {advanced && (
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <Label>Crop</Label>
            <select
              data-testid="voice-crop"
              className="rounded-blume border border-border bg-background px-2 py-1.5 text-sm"
              value={crop === "auto" ? "auto" : "none"}
              onChange={(e) => setCrop(e.target.value === "auto" ? "auto" : false)}
            >
              <option value="auto">Auto: the best {CLIP_SECONDS.idealMax} s of speech</option>
              <option value="none">Keep everything (up to max length)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>Max length {maxSeconds} s</Label>
            <input
              data-testid="voice-max-seconds"
              type="range"
              className="accent-accent"
              min={CLIP_SECONDS.min}
              max={CLIP_SECONDS.max}
              step={1}
              value={maxSeconds}
              onChange={(e) => setMaxSeconds(Number(e.target.value))}
            />
          </label>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Read a sentence or two naturally, in a quiet room, for {CLIP_SECONDS.idealMin}–{CLIP_SECONDS.idealMax} seconds. The recording stays
        on this device.
      </p>
      <ErrorNote error={failure} />
    </div>
  );
}
