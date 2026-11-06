export const VOICES = {
  id: [
    { id: "id-ID-GadisNeural", label: "Gadis (perempuan, Indonesia)" },
    { id: "id-ID-ArdiNeural", label: "Ardi (laki-laki, Indonesia)" },
  ],
  en: [
    { id: "en-US-AriaNeural", label: "Aria (female, US)" },
    { id: "en-US-JennyNeural", label: "Jenny (female, US)" },
    { id: "en-US-GuyNeural", label: "Guy (male, US)" },
    { id: "en-GB-SoniaNeural", label: "Sonia (female, UK)" },
  ],
};

export function defaultVoice(audience) {
  return audience === "en" ? "en-US-AriaNeural" : "id-ID-GadisNeural";
}

export const GEMINI_VOICES = [
  { id: "Kore", label: "Kore (tegas, jernih)" },
  { id: "Zephyr", label: "Zephyr (cerah)" },
  { id: "Aoede", label: "Aoede (santai)" },
  { id: "Leda", label: "Leda (muda, ringan)" },
  { id: "Puck", label: "Puck (ceria)" },
  { id: "Charon", label: "Charon (informatif, dalam)" },
  { id: "Fenrir", label: "Fenrir (bersemangat)" },
  { id: "Orus", label: "Orus (mantap)" },
];

export function isGeminiVoice(v) {
  return GEMINI_VOICES.some((g) => g.id === v);
}

export function defaultGeminiVoice() {
  return "Kore";
}

// Voices for the "Muse (bridge)" VO provider: narration is synthesized by
// Muse itself (its built-in TTS voices), relayed through muse-bridge.
export const MUSE_VOICES = [
  { id: "helio", label: "Helio (Muse — netral, jernih)" },
  { id: "aria", label: "Aria (Muse — hangat)" },
];

export function isClaudeVoice(v) {
  return MUSE_VOICES.some((g) => g.id === v);
}

export function defaultClaudeVoice() {
  return "helio";
}
