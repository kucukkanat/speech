import { Check, Pencil, Play, Square, Trash2, Wand2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useMotionLevel } from "../../components/hooks/useMotionLevel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Orb } from "../../components/ui/Orb";
import type { Persona } from "../../speech";

interface PersonaCardProps {
  persona: Persona;
  playing: boolean;
  analyser: AnalyserNode | null;
  onPreview: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onUse: () => void;
}

export function PersonaCard({ persona: p, playing, analyser, onPreview, onRename, onDelete, onUse }: PersonaCardProps) {
  const level = useMotionLevel(playing ? analyser : null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    const n = draft.trim();
    if (n && n !== p.name) onRename(n);
    else setDraft(p.name);
    setEditing(false);
  };

  return (
    <motion.article
      data-testid="persona-card"
      data-persona-id={p.id}
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)", transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="glass group relative flex flex-col overflow-hidden rounded-3xl p-5 transition-[border-color,box-shadow] duration-300 hover:border-white/15"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-45"
        style={{ background: p.meta.colors[1] }}
      />
      <div className="relative flex items-start gap-4">
        <button type="button" onClick={onPreview} aria-label={playing ? "Stop preview" : "Play preview"} className="relative rounded-full">
          <Orb colors={p.meta.colors} emoji={p.meta.emoji} size={64} level={level} />
          <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border border-white/15 bg-ink-900 text-white shadow-lg transition group-hover:scale-110">
            {playing ? <Square className="size-2.5 fill-current" /> : <Play className="ml-px size-3 fill-current" />}
          </span>
        </button>
        <div className="min-w-0 flex-1 pt-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commit();
              }}
              className="flex items-center gap-1"
            >
              <input
                ref={input}
                value={draft}
                maxLength={32}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDraft(p.name);
                    setEditing(false);
                  }
                }}
                className="h-8 w-full min-w-0 rounded-lg border border-highlight-300/40 bg-white/[0.06] px-2 font-display text-lg font-semibold text-white outline-none focus-visible:outline-none"
              />
              <button type="submit" aria-label="Save name" className="rounded-md p-1.5 text-good-300 hover:bg-white/10">
                <Check className="size-4" />
              </button>
            </form>
          ) : (
            <h3 className="flex items-center gap-1.5">
              <span className="truncate font-display text-lg font-semibold tracking-tight text-white">{p.name}</span>
              <button
                type="button"
                aria-label="Rename"
                onClick={() => {
                  setDraft(p.name);
                  setEditing(true);
                }}
                className="rounded-md p-1 text-white/30 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100 max-sm:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
            </h3>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="tabular font-mono text-[12px] text-white/45">{p.seconds.toFixed(1)} s clip</span>
            {p.builtIn && <Badge>Built-in</Badge>}
          </div>
        </div>
      </div>

      <div className="relative mt-5 flex items-center gap-2">
        <Button variant="primary" size="sm" className="flex-1" onClick={onUse} icon={<Wand2 className="size-3.5" />}>
          Use in Studio
        </Button>
        {!p.builtIn && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${p.name}`}
            onClick={onDelete}
            className="hover:!bg-danger-500/15 hover:!text-danger-200"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </motion.article>
  );
}
