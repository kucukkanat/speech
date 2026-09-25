import type { AudioClip } from "@kucukkanat/tts";
import { Download, History, Play, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { downloadBlob, slug } from "../../components/format";
import { Button } from "../../components/ui/Button";
import { Orb } from "../../components/ui/Orb";

/** A finished speech, kept in memory for replay and download. */
export interface HistoryItem {
  id: string;
  text: string;
  persona: { name: string; colors: [string, string] };
  clip: AudioClip;
  createdAt: number;
}

interface Props {
  items: HistoryItem[];
  replayingId: string | null;
  onReplay: (h: HistoryItem) => void;
  onRemove: (id: string) => void;
}

export function HistoryList({ items, replayingId, onReplay, onRemove }: Props) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-wide text-white/50 uppercase">
        <History className="size-4" /> History
        <span className="tabular font-mono text-white/30">{items.length || ""}</span>
      </h3>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-[13px] text-white/35">
          Generated clips appear here for replay and download. They live in memory only.
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((h) => {
              const playing = replayingId === h.id;
              return (
                <motion.li
                  key={h.id}
                  data-testid="history-item"
                  layout
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, x: 30, height: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 36 }}
                  className="overflow-hidden"
                >
                  <div className="glass group flex items-center gap-3 rounded-2xl p-2.5 pr-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={playing ? "Stop" : "Replay"}
                      data-testid="history-replay"
                      onClick={() => onReplay(h)}
                      className="!rounded-full !p-0"
                    >
                      <span className="relative">
                        <Orb colors={h.persona.colors} size={38} animated={playing} />
                        <span className="absolute inset-0 flex items-center justify-center text-white">
                          {playing ? <Square className="size-3 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
                        </span>
                      </span>
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-white/85">{h.text}</p>
                      <p className="tabular font-mono text-[11.5px] text-white/40">
                        {h.persona.name} · {h.clip.duration.toFixed(1)} s ·{" "}
                        {new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Download WAV"
                      data-testid="history-download"
                      onClick={() => downloadBlob(h.clip.toWav(), `${slug(h.persona.name)}-${slug(h.text)}.wav`)}
                    >
                      <Download className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove"
                      onClick={() => onRemove(h.id)}
                      className="sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
