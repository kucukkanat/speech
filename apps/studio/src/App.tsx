import { useEngine } from "@kucukkanat/speech-react";
import { AudioLines, Captions, UsersRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { CapabilityBanner } from "./components/engine/CapabilityBanner";
import { EngineChip } from "./components/engine/EngineChip";
import { Logo } from "./components/Logo";
import { SegmentedTabs, type TabDef } from "./components/ui/SegmentedTabs";
import { PersonasView } from "./features/personas/PersonasView";
import { StudioView } from "./features/studio/StudioView";
import { TranscribeView } from "./features/transcribe/TranscribeView";
import { stt, tts } from "./speech";

type Tab = "studio" | "personas" | "transcribe";

const TABS: TabDef<Tab>[] = [
  { key: "studio", label: "Studio", icon: <AudioLines className="size-4" /> },
  { key: "personas", label: "Personas", icon: <UsersRound className="size-4" /> },
  { key: "transcribe", label: "Live Transcribe", short: "Transcribe", icon: <Captions className="size-4" /> },
];

const tabFromHash = (): Tab => {
  const h = window.location.hash.replace("#", "");
  return TABS.some((t) => t.key === h) ? (h as Tab) : "studio";
};

export default function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const ttsStatus = useEngine(tts).status;
  const sttStatus = useEngine(stt).status;

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4 sm:py-6">
        <Logo />
        <div className="flex items-center gap-2">
          <EngineChip name="TTS" status={ttsStatus} onClick={() => setTab("studio")} />
          <EngineChip name="STT" status={sttStatus} onClick={() => setTab("transcribe")} />
        </div>
      </header>

      <CapabilityBanner />

      <nav className="sticky top-2 z-30 mb-6 flex justify-center sm:top-4">
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
      </nav>

      <main className="flex-1">
        <Panel active={tab === "studio"}>
          <StudioView personaId={personaId} onPersonaChange={setPersonaId} />
        </Panel>
        <Panel active={tab === "personas"}>
          <PersonasView
            onUse={(id) => {
              setPersonaId(id);
              setTab("studio");
            }}
          />
        </Panel>
        <Panel active={tab === "transcribe"}>
          <TranscribeView />
        </Panel>
      </main>

      <footer className="py-8 text-center text-[12px] text-white/30">
        Models run in your browser via WebGPU / WASM · nothing is uploaded · voices stay in IndexedDB
      </footer>
    </div>
  );
}

/** Keeps each view mounted (state such as history survives tab switches) and animates it in on activation. */
function Panel({ active, children }: { active: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="tabpanel"
      hidden={!active}
      initial={false}
      animate={
        active ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: reduce ? 0 : 14, filter: reduce ? "blur(0px)" : "blur(6px)" }
      }
      transition={active ? { type: "spring", stiffness: 260, damping: 30 } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}
