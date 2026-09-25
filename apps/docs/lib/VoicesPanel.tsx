import { type Recording, startRecording } from "@kucukkanat/speech-audio";
import { useVoices } from "@kucukkanat/speech-react";
import { useState } from "react";
import { voices } from "./speech";
import { Button, ErrorNote, Label } from "./ui";

type Voice = (typeof voices.snapshot.voices)[number];

/** The voice library: demo voices plus your own, from a file or the microphone. Stored in IndexedDB on this device. */
export function VoicesPanel() {
  const { voices: list, loading, error, create, remove, restore } = useVoices(voices);
  const [name, setName] = useState("My voice");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [removed, setRemoved] = useState<Voice | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const add = (audio: Blob) => {
    setFailure(null);
    create({ name: name.trim() || "My voice", audio, meta: {} }).catch(setFailure);
  };
  const record = async () => {
    setFailure(null);
    const r = await startRecording({ maxSeconds: 12 });
    r.on("time", setSeconds);
    setRecording(r);
    r.done.then(add, setFailure).finally(() => setRecording(null));
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading voices…</p>
      ) : (
        <ul className="divide-y divide-border rounded-blume border border-border" data-testid="voice-list">
          {list.map((v) => (
            <li key={v.id} data-testid="voice-item" className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 font-medium">
                {v.name}{" "}
                <span className="text-muted-foreground">
                  · {v.seconds.toFixed(1)} s{v.builtIn ? " · demo" : ""}
                </span>
              </span>
              <Button data-testid="voice-preview" onClick={() => new Audio(URL.createObjectURL(v.audio)).play().catch(setFailure)}>
                Play clip
              </Button>
              {!v.builtIn && (
                <Button data-testid="voice-remove" onClick={() => remove(v.id).then(setRemoved, setFailure)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {removed && (
        <p className="flex items-center gap-2 text-sm">
          Removed {removed.name}.
          <Button data-testid="voice-undo" onClick={() => restore(removed).then(() => setRemoved(null), setFailure)}>
            Undo
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <label className="flex flex-col gap-1">
          <Label>New voice name</Label>
          <input
            data-testid="voice-name"
            className="rounded-blume border border-border bg-background px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {recording ? (
          <Button primary data-testid="voice-record" data-state="recording" onClick={() => recording.stop()}>
            Stop ({seconds.toFixed(0)} s)
          </Button>
        ) : (
          <Button primary data-testid="voice-record" data-state="idle" onClick={() => record().catch(setFailure)}>
            Record 5–12 s
          </Button>
        )}
        <label className="text-sm">
          <span className="sr-only">Upload a recording</span>
          <input
            data-testid="voice-file"
            type="file"
            accept="audio/*"
            className="text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) add(file);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Read a sentence or two naturally. The clip is cropped to its best 5–10 s and never leaves your device.
      </p>
      <ErrorNote error={error ?? failure} />
    </div>
  );
}
