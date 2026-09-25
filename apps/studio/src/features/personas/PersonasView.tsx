import { useVoices } from "@kucukkanat/speech-react";
import { Plus, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { type Persona, voices } from "../../speech";
import { CreatePersonaSheet } from "./create/CreatePersonaSheet";
import { PersonaCard } from "./PersonaCard";
import { stopPreview, togglePreview, usePreview } from "./preview";

export function PersonasView({ onUse }: { onUse: (id: string) => void }) {
  const { voices: personas, loading, error, update, remove, restore } = useVoices(voices);
  const preview = usePreview();
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const del = async (p: Persona) => {
    if (preview.playingId === p.id) stopPreview();
    try {
      const removed = await remove(p.id);
      toast({ title: `Deleted ${p.name}`, action: { label: "Undo", onClick: () => void restore(removed) } });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't delete", description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">Personas</h2>
          <p className="mt-1 text-sm text-white/50">Clone any voice from a 5–10 second clip. Everything stays on this device.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <motion.button
          layout
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setCreating(true)}
          data-testid="new-persona"
          className="group relative flex min-h-[168px] flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-white/12 bg-white/[0.02] p-5 text-center transition-colors hover:border-highlight-300/40 hover:bg-white/[0.04]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{ background: "radial-gradient(60% 70% at 50% 30%, rgb(228 107 255 / 0.13), transparent)" }}
          />
          <span className="relative flex size-12 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_10px_30px_-8px_rgb(228_107_255/0.6)] transition-transform duration-300 group-hover:rotate-90">
            <Plus className="size-5" />
          </span>
          <span className="relative">
            <span className="block font-medium text-white">New persona</span>
            <span className="block text-[13px] text-white/45">Upload or record a voice</span>
          </span>
        </motion.button>

        {loading && personas.length === 0
          ? [0, 1].map((i) => (
              <div key={i} className="glass rounded-3xl p-5">
                <div className="flex gap-4">
                  <Skeleton className="size-16 rounded-full" />
                  <div className="flex-1 space-y-2 pt-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="mt-6 h-8 w-full" />
              </div>
            ))
          : null}

        <AnimatePresence mode="popLayout">
          {personas.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              playing={preview.playingId === p.id}
              analyser={preview.analyser}
              onPreview={() =>
                togglePreview(p).catch((e: unknown) =>
                  toast({ tone: "error", title: "Playback failed", description: e instanceof Error ? e.message : String(e) }),
                )
              }
              onRename={(name) => void update(p.id, { name })}
              onDelete={() => void del(p)}
              onUse={() => {
                stopPreview();
                onUse(p.id);
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {error && (
        <p className="mt-6 flex items-center gap-2 text-sm text-danger" data-testid="voices-error">
          <UsersRound className="size-4" /> {error.message}
        </p>
      )}

      <CreatePersonaSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
