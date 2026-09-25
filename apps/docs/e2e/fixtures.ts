import { fileURLToPath } from "node:url";
import { type BrowserContext, test as base, chromium } from "@playwright/test";

/** Played in a loop as the fake microphone; its transcript is documented in packages/voices/assets/CREDITS.md. */
export const FAKE_MIC_WAV = fileURLToPath(new URL("../../../packages/voices/assets/male.wav", import.meta.url));
const PROFILE = fileURLToPath(new URL("../.cache/pw-profile", import.meta.url));

/**
 * A persistent Chromium profile so downloaded models survive between runs, with WebGPU on and a fake microphone fed
 * from a WAV file: the real getUserMedia → AudioWorklet → worker → model path runs, only the sound source is a file.
 */
export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ headless }, use) => {
    const context = await chromium.launchPersistentContext(PROFILE, {
      headless,
      // The trailing slash matters: page paths below are relative to the /speech/ base.
      baseURL: "http://localhost:5461/speech/",
      permissions: ["microphone"],
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}`,
        // WebGPU in headless Chromium: the real GPU through Metal on macOS; SwiftShader (software) elsewhere.
        "--enable-unsafe-webgpu",
        ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      ],
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});

export { expect } from "@playwright/test";
