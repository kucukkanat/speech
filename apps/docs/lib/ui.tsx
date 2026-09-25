import type { ModelInfo } from "@kucukkanat/speech-core";
import { type EngineLike, useCapabilities, useEngine } from "@kucukkanat/speech-react";
import { type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { errorMessage, formatProgress, formatSize } from "./format";

// Styling uses Blume's theme tokens (bg-accent, border-border, rounded-blume, …) so the demos follow the site's
// accent, radius and light/dark mode.

export function Button({ primary, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  const look = primary ? "bg-accent text-accent-foreground hover:opacity-90" : "border border-border hover:bg-muted";
  return (
    <button
      type="button"
      className={`rounded-blume px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
      {...props}
    />
  );
}

export function Panel({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div data-testid={testId} className="not-prose my-6 space-y-3 rounded-blume border border-border p-4 font-sans">
      {children}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  return (
    <p role="alert" data-testid="demo-error" className="rounded-blume border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
      {errorMessage(error)}
    </p>
  );
}

export const Label = ({ children }: { children: ReactNode }) => (
  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</span>
);

interface SliderProps {
  testId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

/** A labelled range input that shows its current value. */
export function Slider({ testId, label, value, min, max, step, onChange }: SliderProps) {
  return (
    <label className="flex min-w-48 flex-col gap-1">
      <span className="flex justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-mono text-xs" data-testid={`${testId}-value`}>
          {Number.isInteger(step) ? value : value.toFixed(2)}
        </span>
      </span>
      <input
        data-testid={testId}
        className="accent-accent"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

interface GateProps {
  engine: EngineLike<string>;
  /** The model the demo will run (it may not be loaded yet). */
  model: ModelInfo;
  children: ReactNode;
}

/**
 * Renders `children` once the engine's model is ready. Before that: a load button with the download size, progress
 * while loading, and a clear explanation when this browser can't run the model. Models never download without a click.
 */
export function ModelGate({ engine, model, children }: GateProps) {
  const { ready, loading, progress, error, load } = useEngine(engine);
  const caps = useCapabilities();
  const [failure, setFailure] = useState<unknown>(null);
  if (ready) return children;
  if (model.requiresWebGPU && caps && !caps.webgpu) {
    return (
      <p data-testid="needs-webgpu" className="text-sm text-muted-foreground">
        {model.label} needs <strong>WebGPU</strong>, which this browser doesn't offer. Try a recent Chrome or Edge on desktop, or Safari
        26+.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        primary
        data-testid="model-load"
        data-state={loading ? "loading" : "idle"}
        disabled={loading}
        onClick={() => {
          setFailure(null);
          // Also reported through `error` (the engine status); kept here too for failures before the status changes.
          load().catch(setFailure);
        }}
      >
        {loading ? formatProgress(progress) : `Load ${model.label} (${formatSize(model.approxDownloadMB)}, cached after)`}
      </Button>
      <ErrorNote error={error ?? failure} />
    </div>
  );
}
