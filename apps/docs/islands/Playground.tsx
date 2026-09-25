import { useCapabilities } from "@kucukkanat/speech-react";
import { useState } from "react";
import { SpeakPanel } from "../lib/SpeakPanel";
import { TranscribePanel } from "../lib/TranscribePanel";
import { Panel } from "../lib/ui";
import { VoicesPanel } from "../lib/VoicesPanel";

// Workers, WebGPU, IndexedDB and the microphone only exist in the browser.
export const client = "only";

const TABS = [
  { key: "speak", label: "Speak" },
  { key: "transcribe", label: "Transcribe" },
  { key: "voices", label: "Voices" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function Playground() {
  const [tab, setTab] = useState<Tab>("speak");
  const caps = useCapabilities();
  return (
    <Panel testId="playground">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            data-testid={`tab-${key}`}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-accent text-accent" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {caps && (
        <p data-testid="capabilities" className="text-xs text-muted-foreground">
          WebGPU {caps.webgpu ? "✓" : "✗"} · half precision {caps.shaderF16 ? "✓" : "✗"} · microphone{" "}
          {caps.microphone && caps.secureContext ? "✓" : "✗"}
        </p>
      )}
      {/* Panels stay mounted so a running speech or dictation survives switching tabs. */}
      <div role="tabpanel" hidden={tab !== "speak"}>
        <SpeakPanel advanced />
      </div>
      <div role="tabpanel" hidden={tab !== "transcribe"}>
        <TranscribePanel advanced />
      </div>
      <div role="tabpanel" hidden={tab !== "voices"}>
        <VoicesPanel advanced />
      </div>
    </Panel>
  );
}
