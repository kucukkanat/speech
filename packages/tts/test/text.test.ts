import { describe, expect, test } from "bun:test";
import { CHUNK_GROWTH, FIRST_CHUNK_CHARS, MAX_CHUNK_CHARS, normalizeText, splitText } from "../src/internal/text.js";

const STORY =
  "The lighthouse keeper climbed the stairs one last time. Below him, the sea was calm. " +
  "Somewhere far away, a ship turned towards home, its lights flickering against the dark horizon. He smiled. " +
  "For forty years he had watched these waters, and tonight, for the first time, he felt that they were watching him back. " +
  "No servers. No uploads. Just your voice, your words, and a model that lives on your own machine.";

describe("splitText", () => {
  test("returns nothing for blank input", () => {
    expect(splitText("  \n ")).toEqual([]);
  });

  test("keeps every word, in order", () => {
    expect(splitText(STORY).join(" ")).toBe(STORY);
  });

  test("first chunk is short enough for fast first audio", () => {
    expect(splitText(STORY)[0]?.length).toBeLessThanOrEqual(FIRST_CHUNK_CHARS);
  });

  test("each chunk grows by at most CHUNK_GROWTH over the previous one", () => {
    const chunks = splitText(STORY);
    for (let i = 1; i < chunks.length; i++) {
      const limit = Math.min(MAX_CHUNK_CHARS, Math.max(FIRST_CHUNK_CHARS, Math.floor((chunks[i - 1]?.length ?? 0) * CHUNK_GROWTH)));
      expect(chunks[i]?.length).toBeLessThanOrEqual(limit);
    }
  });

  test("merges fragments too short to sound natural", () => {
    expect(splitText("No servers. No uploads. Just you.")).toEqual(["No servers. No uploads. Just you."]);
  });

  test("does not split decimals, abbreviations or initials", () => {
    expect(splitText("Dr. Smith paid 3.50 dollars to J. R. R. Tolkien.")).toEqual(["Dr. Smith paid 3.50 dollars to J. R. R. Tolkien."]);
  });

  test("splits an over-long first sentence at a clause boundary", () => {
    const text = "When the tide finally turned late in the evening, the old boats drifted back towards the harbour wall.";
    const [first, second] = splitText(text);
    expect(first).toBe("When the tide finally turned late in the evening,");
    expect(second).toBe("the old boats drifted back towards the harbour wall.");
  });

  test("hard-cuts a run with no spaces at the limit", () => {
    const [first] = splitText("x".repeat(300));
    expect(first).toBe("x".repeat(FIRST_CHUNK_CHARS));
  });

  test("never exceeds MAX_CHUNK_CHARS", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    for (const c of splitText(long)) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });
});

describe("normalizeText", () => {
  test("capitalises, collapses whitespace and adds a full stop", () => {
    expect(normalizeText("  hello   there ")).toBe("Hello there.");
  });

  test("keeps existing terminal punctuation", () => {
    expect(normalizeText("Really?")).toBe("Really?");
    expect(normalizeText("and then,")).toBe("And then,");
  });

  test("maps punctuation the model rarely saw in training", () => {
    expect(normalizeText("Wait… “what”: it’s — fine")).toBe('Wait, "what", it\'s - fine.');
  });

  test("leaves empty input empty", () => {
    expect(normalizeText("   ")).toBe("");
  });
});
