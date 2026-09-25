import { useState } from "react";
import { SpeakPanel } from "../lib/SpeakPanel";
import { Label, Panel } from "../lib/ui";
import { VoiceCapture } from "../lib/VoiceCapture";

export const client = "only";

/** `<TryCloning />`: record or upload a voice, then hear it read any text — the whole cloning flow in one box. */
export default function TryCloning() {
  const [voice, setVoice] = useState<{ id: string; name: string; seconds: number } | null>(null);
  return (
    <Panel testId="try-cloning">
      <Label>1 · Your voice</Label>
      <VoiceCapture onCreated={setVoice} />
      {voice && (
        <div className="space-y-3 border-t border-border pt-3" data-testid="cloned-voice">
          <Label>
            2 · {voice.name} ({voice.seconds.toFixed(1)} s clip) says…
          </Label>
          <SpeakPanel
            voiceId={voice.id}
            text="This isn't really me talking. It's a clone of my voice, made a moment ago, right here in the browser."
          />
        </div>
      )}
    </Panel>
  );
}
