import { speechSdk } from "@kucukkanat/speech-core/vite";
import { defineConfig } from "vite";

// FIXTURE_PLUGIN=0 checks that the SDK also works without the plugin (plain Vite defaults).
export default defineConfig({ plugins: process.env.FIXTURE_PLUGIN === "0" ? [] : [speechSdk()] });
