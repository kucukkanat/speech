import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

interface ReactiveOrbProps {
  analyser: AnalyserNode | null;
  colors: [string, string];
  /** "thinking" shimmer while waiting for first audio */
  busy?: boolean;
  className?: string;
}

const POINTS = 120;

function hexToRgb(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}
const rgba = (h: string, a: number) => {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r},${g},${b},${a})`;
};

/** Audio-reactive gradient blob drawn on canvas; bands of the spectrum push the outline outwards. */
export function ReactiveOrb({ analyser, colors, busy, className }: ReactiveOrbProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const props = useRef({ analyser, colors, busy });
  props.current = { analyser, colors, busy };

  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    let raf = 0;
    let W = 0;
    let H = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      W = Math.floor(e.contentRect.width * dpr);
      H = Math.floor(e.contentRect.height * dpr);
      c.width = W;
      c.height = H;
    });
    ro.observe(c);

    const bands = new Float32Array(POINTS / 2);
    let freq = new Uint8Array(0);
    let time = new Float32Array(0);
    let level = 0;
    let busyMix = 0;
    const t0 = performance.now();

    const draw = () => {
      const {
        analyser: an,
        colors: [ca, cb],
        busy: isBusy,
      } = props.current;
      const t = (performance.now() - t0) / 1000;
      if (!W || !H) {
        raf = requestAnimationFrame(draw);
        return;
      }

      // --- audio features
      let rms = 0;
      if (an) {
        if (freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount);
        if (time.length !== an.fftSize) time = new Float32Array(an.fftSize);
        an.getByteFrequencyData(freq);
        an.getFloatTimeDomainData(time);
        let s = 0;
        for (const x of time) s += x * x;
        rms = Math.sqrt(s / time.length);
        // map voice range (~80 Hz – 5 kHz) logarithmically onto half the circle
        const nyq = an.context.sampleRate / 2;
        for (let i = 0; i < bands.length; i++) {
          const f = 80 * (5000 / 80) ** (i / (bands.length - 1));
          const bin = Math.min(freq.length - 1, Math.round((f / nyq) * freq.length));
          const v = (freq[bin] ?? 0) / 255;
          const b = bands[i] ?? 0;
          bands[i] = b + (v - b) * (v > b ? 0.45 : 0.1);
        }
      } else {
        bands.forEach((b, i) => {
          bands[i] = b * 0.9;
        });
      }
      const target = Math.min(1, rms * 5);
      level += (target - level) * (target > level ? 0.35 : 0.08);
      busyMix += ((isBusy ? 1 : 0) - busyMix) * 0.05;

      // --- geometry
      g.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.3;
      const motionT = reduce ? 0 : t;

      // halo
      const haloR = R * (1.9 + level * 0.6);
      const halo = g.createRadialGradient(cx, cy, R * 0.4, cx, cy, haloR);
      halo.addColorStop(0, rgba(cb, 0.35 + level * 0.3));
      halo.addColorStop(0.5, rgba(ca, 0.08 + level * 0.12));
      halo.addColorStop(1, rgba(ca, 0));
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      // rings
      for (let k = 0; k < 3; k++) {
        const phase = (motionT * 0.35 + k / 3) % 1;
        const rr = R * (1.05 + phase * (0.7 + level * 0.5));
        g.beginPath();
        g.arc(cx, cy, rr, 0, Math.PI * 2);
        g.strokeStyle = rgba(ca, (1 - phase) * (0.1 + level * 0.35 + busyMix * 0.15));
        g.lineWidth = 1.2 * dpr;
        g.stroke();
      }

      // blob path
      const path = new Path2D();
      for (let i = 0; i <= POINTS; i++) {
        const th = (i / POINTS) * Math.PI * 2;
        const bi = i <= POINTS / 2 ? i : POINTS - i; // mirror so it is symmetric
        const band = bands[Math.min(bands.length - 1, bi)] ?? 0;
        const wobble =
          0.035 * Math.sin(3 * th + motionT * 1.1) +
          0.025 * Math.sin(5 * th - motionT * 1.7) +
          busyMix * 0.03 * Math.sin(8 * th + motionT * 4);
        const r = R * (1 + wobble + (reduce ? 0 : 0.012 * Math.sin(motionT * 1.4)) + band * 0.26 * (0.4 + level) + level * 0.08);
        const x = cx + Math.cos(th - Math.PI / 2) * r;
        const y = cy + Math.sin(th - Math.PI / 2) * r;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();

      g.save();
      g.shadowColor = rgba(cb, 0.8);
      g.shadowBlur = (30 + level * 70) * dpr;
      const ang = motionT * 0.6;
      const grad = g.createLinearGradient(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, cx - Math.cos(ang) * R, cy - Math.sin(ang) * R);
      grad.addColorStop(0, ca);
      grad.addColorStop(1, cb);
      g.fillStyle = grad;
      g.fill(path);
      g.restore();

      // inner sheen
      g.save();
      g.clip(path);
      const sheen = g.createRadialGradient(cx - R * 0.35, cy - R * 0.45, 0, cx - R * 0.35, cy - R * 0.45, R * 1.1);
      sheen.addColorStop(0, "rgba(255,255,255,0.55)");
      sheen.addColorStop(0.35, "rgba(255,255,255,0.08)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = sheen;
      g.fillRect(0, 0, W, H);
      const shade = g.createRadialGradient(cx + R * 0.4, cy + R * 0.6, 0, cx + R * 0.4, cy + R * 0.6, R * 1.2);
      shade.addColorStop(0, "rgba(10,6,30,0.45)");
      shade.addColorStop(1, "rgba(10,6,30,0)");
      g.fillStyle = shade;
      g.fillRect(0, 0, W, H);
      g.restore();

      g.lineWidth = 1 * dpr;
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.stroke(path);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduce]);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
