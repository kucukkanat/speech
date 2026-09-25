import { useVoices } from "@kucukkanat/speech-react";
import { useState } from "react";
import { voices } from "./speech";
import { Button, ErrorNote } from "./ui";
import { VoiceCapture } from "./VoiceCapture";

type Voice = (typeof voices.snapshot.voices)[number];

/** The voice library: demo voices plus your own, from a file or the microphone. Stored in IndexedDB on this device. */
export function VoicesPanel({ advanced = false }: { advanced?: boolean }) {
  const { voices: list, loading, error, remove, restore } = useVoices(voices);
  const [removed, setRemoved] = useState<Voice | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

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
      <div className="border-t border-border pt-3">
        <VoiceCapture advanced={advanced} />
      </div>
      <ErrorNote error={error ?? failure} />
    </div>
  );
}
