import { describe, expect, test } from "bun:test";
import { SpeechError } from "@kucukkanat/speech-core";
import { errorMessage, formatProgress, formatSize } from "./format";

describe("formatSize", () => {
  test("megabytes below a gigabyte, one decimal above", () => {
    expect(formatSize(158)).toBe("158 MB");
    expect(formatSize(724.6)).toBe("725 MB");
    expect(formatSize(1495)).toBe("1.5 GB");
  });
});

describe("formatProgress", () => {
  test("percentage with the current file", () => {
    expect(formatProgress({ progress: 0.423, label: "model.onnx" })).toBe("Loading 42% · model.onnx");
  });
  test("no label, no progress yet", () => {
    expect(formatProgress({ progress: 0, label: "" })).toBe("Loading 0%");
    expect(formatProgress(null)).toBe("Loading 0%");
  });
});

describe("errorMessage", () => {
  test("SDK errors show their user-facing message", () => {
    expect(errorMessage(new SpeechError("busy", "One session at a time."))).toBe("One session at a time.");
  });
  test("anything else is stringified", () => {
    expect(errorMessage("nope")).toBe("nope");
  });
});
