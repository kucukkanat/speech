import { type Capabilities, detectCapabilities } from "@kucukkanat/speech-core";
import { useEffect, useState } from "react";

/** What this browser supports (WebGPU, microphone, …); `null` until detected (one async check per page). */
export function useCapabilities(): Capabilities | null {
  const [caps, setCaps] = useState<Capabilities | null>(cached);
  useEffect(() => {
    if (caps) return;
    let alive = true;
    pending ??= detectCapabilities().then((c) => (cached = c));
    // detectCapabilities never rejects (unsupported features just report false).
    void pending.then((c) => alive && setCaps(c));
    return () => {
      alive = false;
    };
  }, [caps]);
  return caps;
}

let cached: Capabilities | null = null;
let pending: Promise<Capabilities> | null = null;
