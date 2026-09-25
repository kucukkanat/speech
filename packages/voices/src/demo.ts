/** A voice bundled with the package, seeded into new stores. */
export interface DemoVoice {
  id: string;
  name: string;
  url: URL;
  /** Transcript of the clip (LibriTTS-R, CC BY 4.0 — see assets/CREDITS.md). */
  transcript: string;
}

/** The bundled demo voices. Their ids stay stable, so apps can refer to them (e.g. as a default). */
export const DEMO_VOICES: readonly DemoVoice[] = [
  {
    id: "builtin-aria",
    name: "Aria",
    url: new URL("../assets/female.wav", import.meta.url),
    transcript:
      "He shrugged his shoulders in ungracious acquiescence, while our visitor in hurried words and with much excitable gesticulation poured forth his story.",
  },
  {
    id: "builtin-orion",
    name: "Orion",
    url: new URL("../assets/male.wav", import.meta.url),
    transcript:
      "A full hour had passed since his father had gone in with Dan Crosby, the tutor, to find out for him something about the university.",
  },
];
