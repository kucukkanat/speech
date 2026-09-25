// Exercises every package the way an app installed from npm would, and reports what happened on window.__results.
import { openMicrophone } from "@kucukkanat/speech-audio";
import { detectCapabilities, isSpeechError } from "@kucukkanat/speech-core";
import { useEngine } from "@kucukkanat/speech-react";
import { createSTT } from "@kucukkanat/stt";
import { createTTS } from "@kucukkanat/tts";
import { createVoiceStore } from "@kucukkanat/voices";

// An unreachable model host: each worker must boot and load transformers.js, then fail the download with a typed error.
const offline = { remoteHost: "http://127.0.0.1:9/" };
const code = (e: unknown) => (isSpeechError(e) ? e.code : `untyped: ${String(e)}`);

async function run() {
  const tts = await createTTS({ transformers: offline })
    .load()
    .then(() => "loaded", code);
  const stt = await createSTT({ transformers: offline })
    .load()
    .then(() => "loaded", code);
  const voices = (await createVoiceStore({ name: `fixture-${Date.now()}` }).list()).map((v) => [v.name, Math.round(v.seconds)]);
  const mic = await openMicrophone();
  let frame = 0;
  for await (const f of mic) {
    frame = f.length;
    break; // also closes the microphone
  }
  return { tts, stt, voices, frame, mic: mic.closed, react: typeof useEngine, caps: typeof (await detectCapabilities()).webgpu };
}

run().then(
  (r) => Object.assign(window, { __results: r }),
  (e: unknown) => Object.assign(window, { __results: { error: String(e) } }),
);
