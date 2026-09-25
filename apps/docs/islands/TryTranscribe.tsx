import { TranscribePanel } from "../lib/TranscribePanel";
import { Panel } from "../lib/ui";

export const client = "only";

export default function TryTranscribe() {
  return (
    <Panel testId="try-transcribe">
      <TranscribePanel />
    </Panel>
  );
}
