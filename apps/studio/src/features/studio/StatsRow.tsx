import type { EngineStatus } from "@kucukkanat/speech-core";
import type { SpeechStats } from "@kucukkanat/tts";
import { Cpu, Gauge, Timer, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { fmtMs } from "../../components/format";

export function StatsRow({ stats, status }: { stats: SpeechStats | null; status: EngineStatus }) {
  const rtf = stats && stats.audioSeconds > 0 ? stats.genMs / 1000 / stats.audioSeconds : undefined;
  const device = status.state === "ready" ? (status.device === "webgpu" ? "WebGPU" : "WASM") : "—";
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat icon={<Timer className="size-3.5" />} label="1st audio" value={fmtMs(stats?.ttfaMs)} />
      <Stat
        icon={<Gauge className="size-3.5" />}
        label="RTF"
        value={rtf != null ? `${rtf.toFixed(2)}×` : "–"}
        hint={rtf != null ? (rtf < 1 ? "faster than realtime" : "slower than realtime") : undefined}
        good={rtf != null ? rtf < 1 : undefined}
      />
      <Stat icon={<Waves className="size-3.5" />} label="Audio" value={stats?.audioSeconds ? `${stats.audioSeconds.toFixed(1)} s` : "–"} />
      <Stat icon={<Cpu className="size-3.5" />} label="Device" value={device} />
    </dl>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  good,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string | undefined;
  good?: boolean | undefined;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5" title={hint}>
      <dt className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium tracking-wide text-white/40 uppercase">
        {icon}
        {label}
      </dt>
      <dd
        className={`tabular mt-0.5 font-mono text-[15px] ${good === undefined ? "text-white/90" : good ? "text-good-300" : "text-warn-300"}`}
      >
        {value}
      </dd>
    </div>
  );
}
