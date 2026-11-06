"use client";
import { useState } from "react";

export default function VoicePreview({ voice, provider = "edge-tts" }) {
  const [show, setShow] = useState(false);
  if (!voice) return null;
  const src =
    provider === "edge-tts"
      ? `/api/voice-preview?voice=${encodeURIComponent(voice)}`
      : `/api/voice-preview?voice=${encodeURIComponent(voice)}&provider=${encodeURIComponent(provider)}`;
  return (
    <span className="mt-2 block">
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
      >
        {show ? "Tutup tes suara" : "▶ Tes suara ini"}
      </button>
      {show && (
        <audio
          key={voice + provider}
          controls
          autoPlay
          src={src}
          className="mt-2 h-9 w-full max-w-sm"
        />
      )}
    </span>
  );
}
