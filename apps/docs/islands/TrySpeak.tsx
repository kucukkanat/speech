import { SpeakPanel } from "../lib/SpeakPanel";
import { Panel } from "../lib/ui";

export const client = "only";

/** `<TrySpeak text="…" />`: speak with the first demo voice, right next to the example it demonstrates. */
export default function TrySpeak({ text }: { text?: string }) {
  return (
    <Panel testId="try-speak">
      <SpeakPanel {...(text ? { text } : {})} />
    </Panel>
  );
}
