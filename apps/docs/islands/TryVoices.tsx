import { Panel } from "../lib/ui";
import { VoicesPanel } from "../lib/VoicesPanel";

export const client = "only";

export default function TryVoices() {
  return (
    <Panel testId="try-voices">
      <VoicesPanel />
    </Panel>
  );
}
