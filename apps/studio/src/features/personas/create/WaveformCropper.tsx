import clsx from "clsx";
import { Pause, Play, Sparkles } from "lucide-react";
import { motion, useMotionValue, useTransform } from "motion/react";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { computePeaks, IDEAL_MAX, IDEAL_MIN, MAX_SEL, MIN_SEL, selectionTone, snapToZero } from "./audioUtils";

export interface Selection {
  start: number;
  end: number;
}

interface CropperProps {
  pcm: Float32Array;
  sampleRate: number;
  value: Selection;
  onChange: (s: Selection) => void;
}

type DragMode = "start" | "end" | "body";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function WaveformCropper({ pcm, sampleRate, value, onChange }: CropperProps) {
  const dur = pcm.length / sampleRate;
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const drag = useRef<{ mode: DragMode; x0: number; sel0: Selection } | null>(null);
  const [dragging, setDragging] = useState<DragMode | null>(null);
  const player = usePlaySelection(pcm, sampleRate);
  const pct = (t: number) => `${(t / dur) * 100}%`;
  const len = value.end - value.start;
  const tone = selectionTone(len);

  /* ---- size tracking ---- */
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- peaks + draw (retina aware) ---- */
  const dpr = typeof window !== "undefined" ? Math.min(3, window.devicePixelRatio || 1) : 1;
  const barW = 2 * dpr;
  const gap = 1 * dpr;
  const buckets = Math.max(1, Math.floor((width * dpr) / (barW + gap)));
  const peaks = useMemo(() => (width ? computePeaks(pcm, buckets) : null), [pcm, buckets, width]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !peaks) return;
    const W = Math.floor(width * dpr);
    const H = Math.floor(c.clientHeight * dpr);
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, W, H);
    let max = 0.001;
    for (const p of peaks) max = Math.max(max, Math.abs(p));
    const scale = ((H / 2) * 0.92) / max;
    const selGrad = g.createLinearGradient(0, 0, W, 0);
    selGrad.addColorStop(0, "#9b8cff");
    selGrad.addColorStop(0.55, "#ee8bff");
    selGrad.addColorStop(1, "#ffa394");
    const s0 = (value.start / dur) * W;
    const s1 = (value.end / dur) * W;
    for (let b = 0; b < buckets; b++) {
      const x = b * (barW + gap);
      const lo = (peaks[b * 2] ?? 0) * scale;
      const hi = (peaks[b * 2 + 1] ?? 0) * scale;
      const h = Math.max(dpr, hi - lo);
      const inSel = x + barW >= s0 && x <= s1;
      g.fillStyle = inSel ? selGrad : "rgba(255,255,255,0.18)";
      g.beginPath();
      g.roundRect(x, H / 2 - hi, barW, h, barW / 2);
      g.fill();
    }
  }, [peaks, width, dpr, value.start, value.end, dur, buckets, barW, gap]);

  /* ---- interaction ---- */
  const timeAt = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    return r ? clamp(((clientX - r.left) / r.width) * dur, 0, dur) : 0;
  };

  const apply = useCallback(
    (mode: DragMode, sel0: Selection, dt: number) => {
      const l = sel0.end - sel0.start;
      if (mode === "body") {
        const s = clamp(sel0.start + dt, 0, dur - l);
        return { start: s, end: s + l };
      }
      if (mode === "start") {
        return { start: clamp(sel0.start + dt, Math.max(0, sel0.end - MAX_SEL), sel0.end - MIN_SEL), end: sel0.end };
      }
      return { start: sel0.start, end: clamp(sel0.end + dt, sel0.start + MIN_SEL, Math.min(dur, sel0.start + MAX_SEL)) };
    },
    [dur],
  );

  const beginDrag = (mode: DragMode, e: PointerEvent, sel0 = value) => {
    e.preventDefault();
    e.stopPropagation();
    player.stop();
    track.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, x0: e.clientX, sel0 };
    setDragging(mode);
  };

  const onTrackDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // jump nearest handle to the click, then keep dragging it
    const t = timeAt(e.clientX);
    const mode: DragMode = Math.abs(t - value.start) < Math.abs(t - value.end) ? "start" : "end";
    const next = apply(mode, value, t - (mode === "start" ? value.start : value.end));
    onChange(next);
    beginDrag(mode, e, next);
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const width = track.current?.getBoundingClientRect().width;
    if (!width) return;
    const dt = ((e.clientX - d.x0) / width) * dur;
    onChange(apply(d.mode, d.sel0, dt));
  };

  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(null);
    // snap handles to near-zero crossings to avoid clicks
    const s = snapToZero(pcm, sampleRate, value.start);
    const en = snapToZero(pcm, sampleRate, value.end);
    if (en - s >= MIN_SEL && en - s <= MAX_SEL) onChange({ start: s, end: en });
  };

  const nudge = (mode: DragMode) => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.5 : 0.05;
    let dt = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") dt = -step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") dt = step;
    else if (e.key === "Home") dt = -dur;
    else if (e.key === "End") dt = dur;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      player.toggle(value);
      return;
    } else return;
    e.preventDefault();
    player.stop();
    onChange(apply(mode, value, dt));
  };

  /* ---- ruler ---- */
  const tickStep = dur > 40 ? 5 : dur > 16 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(dur / tickStep) + 1 }, (_, i) => i * tickStep);

  const playheadLeft = useTransform(player.head, (t) => `${(t / dur) * 100}%`);

  return (
    <div className="select-none">
      <div className="rounded-2xl border border-white/10 bg-black/35 px-3">
        <div
          ref={track}
          onPointerDown={onTrackDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative h-36 touch-none sm:h-40"
        >
          <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
          {/* dimmed outside regions */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-ink-950/55 backdrop-grayscale"
            style={{ width: pct(value.start) }}
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 bg-ink-950/55" style={{ left: pct(value.end) }} />

          {/* selection body */}
          {/* biome-ignore lint/a11y/useSemanticElements: a keyboard-operable composite control; no native element fits */}
          <div
            role="group"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable on purpose — arrows move the selection, space plays it
            tabIndex={0}
            aria-label={`Selection ${value.start.toFixed(2)} to ${value.end.toFixed(2)} seconds. Arrow keys move, space plays.`}
            onKeyDown={nudge("body")}
            onPointerDown={(e) => beginDrag("body", e)}
            className={clsx(
              "absolute inset-y-0 border-y-2 transition-[background,border-color]",
              dragging === "body" ? "cursor-grabbing bg-white/[0.07]" : "cursor-grab bg-white/[0.03] hover:bg-white/[0.05]",
              tone === "ideal" ? "border-good-300/50" : "border-warn-300/50",
            )}
            style={{ left: pct(value.start), width: pct(len) }}
          />

          {(["start", "end"] as const).map((m) => (
            <div
              key={m}
              role="slider"
              tabIndex={0}
              aria-label={m === "start" ? "Selection start" : "Selection end"}
              aria-valuemin={0}
              aria-valuemax={Number(dur.toFixed(2))}
              aria-valuenow={Number((m === "start" ? value.start : value.end).toFixed(2))}
              aria-valuetext={`${(m === "start" ? value.start : value.end).toFixed(2)} seconds`}
              onKeyDown={nudge(m)}
              onPointerDown={(e) => beginDrag(m, e)}
              className="group absolute inset-y-0 z-10 flex w-6 -translate-x-1/2 cursor-ew-resize justify-center outline-none"
              style={{ left: pct(m === "start" ? value.start : value.end) }}
            >
              <div
                className={clsx(
                  "h-full w-[3px] rounded-full transition-colors",
                  tone === "ideal" ? "bg-good-300" : "bg-warn-300",
                  "shadow-[0_0_12px_rgb(255_255_255/0.4)]",
                )}
              />
              <motion.div
                animate={{ scale: dragging === m ? 1.2 : 1 }}
                className={clsx(
                  "absolute top-1/2 flex h-9 w-4 -translate-y-1/2 items-center justify-center gap-[2px] rounded-md border border-white/40 bg-white shadow-lg transition group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-highlight-300",
                )}
              >
                <span className="h-3.5 w-px bg-black/40" />
                <span className="h-3.5 w-px bg-black/40" />
              </motion.div>
            </div>
          ))}

          {/* playhead */}
          {player.playing && (
            <motion.div
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-white shadow-[0_0_10px_2px_rgb(255_255_255/0.6)]"
              style={{ left: playheadLeft }}
            />
          )}
        </div>
      </div>

      {/* ruler */}
      <div className="relative mx-3 mt-1.5 h-4 font-mono text-[10px] text-white/35">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: pct(t) }}>
            {t}s
          </span>
        ))}
      </div>

      {/* controls */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => player.toggle(value)}
          icon={player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        >
          {player.playing ? "Pause" : "Play selection"}
        </Button>
        <div
          className={clsx(
            "tabular flex items-center gap-1.5 rounded-xl border px-3 py-2 font-mono text-[13px] transition-colors",
            tone === "ideal" ? "border-good-300/25 bg-good-400/10 text-good-200" : "border-warn-300/25 bg-warn-400/10 text-warn-200",
          )}
        >
          {tone === "ideal" && <Sparkles className="size-3.5" />}
          {len.toFixed(2)} s
        </div>
        <span className="tabular font-mono text-[12px] text-white/40">
          {value.start.toFixed(2)} → {value.end.toFixed(2)}
        </span>
        <span className="ml-auto text-[12px] text-white/45">
          {tone === "ideal" ? "Sweet spot" : `Aim for ${IDEAL_MIN}–${IDEAL_MAX} s`} · {MIN_SEL}–{MAX_SEL} s allowed
        </span>
      </div>
    </div>
  );
}

/** Plays a slice of PCM with a sample-accurate playhead (MotionValue in seconds). */
function usePlaySelection(pcm: Float32Array, sampleRate: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const raf = useRef(0);
  const head = useMotionValue(0);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (srcRef.current) {
      srcRef.current.onended = null;
      try {
        srcRef.current.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current = null;
    }
    setPlaying(false);
  }, []);

  const play = useCallback(
    (sel: Selection) => {
      stop();
      ctxRef.current ??= new AudioContext();
      const ctx = ctxRef.current;
      void ctx.resume();
      const s = Math.floor(sel.start * sampleRate);
      const e = Math.floor(sel.end * sampleRate);
      const buf = ctx.createBuffer(1, e - s, sampleRate);
      buf.copyToChannel(pcm.slice(s, e), 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const t0 = ctx.currentTime + 0.02;
      src.start(t0);
      srcRef.current = src;
      setPlaying(true);
      head.set(sel.start);
      src.onended = () => stop();
      const tick = () => {
        head.set(sel.start + Math.max(0, ctx.currentTime - t0));
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [pcm, sampleRate, head, stop],
  );

  useEffect(
    () => () => {
      stop();
      void ctxRef.current?.close();
    },
    [stop],
  );

  return {
    playing,
    head,
    stop,
    toggle: (sel: Selection) => (srcRef.current ? stop() : play(sel)),
  };
}
