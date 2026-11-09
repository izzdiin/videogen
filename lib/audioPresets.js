// Preset & validasi konfigurasi Audio Studio (modul daun — tanpa
// impor, aman dipakai store.js maupun audio.js). Parameter tiap
// preset adalah titik awal yang masuk akal untuk genrenya; user bisa
// mengubah tiap nilai sesudahnya di wizard.
export const AUDIO_PRESETS = [
  { id: "ceria", label: "Ceria — anak & hiburan ringan", bgmVolume: 0.2, fadeIn: 0.5, fadeOut: 1.5, gap: 0.25, targetLufs: -15, duckRatio: 8 },
  { id: "edukatif", label: "Edukatif — penjelasan & tutorial", bgmVolume: 0.14, fadeIn: 1, fadeOut: 2, gap: 0.4, targetLufs: -16, duckRatio: 6 },
  { id: "dramatis", label: "Dramatis — cerita & sejarah", bgmVolume: 0.26, fadeIn: 1.5, fadeOut: 3, gap: 0.6, targetLufs: -15, duckRatio: 5 },
  { id: "dokumenter", label: "Dokumenter — naratif tenang", bgmVolume: 0.12, fadeIn: 1.5, fadeOut: 2.5, gap: 0.5, targetLufs: -16, duckRatio: 6 },
  { id: "berita", label: "Berita — rapat & tegas", bgmVolume: 0.1, fadeIn: 0.3, fadeOut: 0.8, gap: 0.2, targetLufs: -15, duckRatio: 8 },
  { id: "islami", label: "Islami — lembut & khusyuk", bgmVolume: 0.12, fadeIn: 2, fadeOut: 3, gap: 0.6, targetLufs: -16, duckRatio: 5 },
  { id: "cinematic", label: "Cinematic — musik dominan", bgmVolume: 0.3, fadeIn: 2, fadeOut: 4, gap: 0.5, targetLufs: -14, duckRatio: 4 },
];
export const AUDIO_PRESET_IDS = AUDIO_PRESETS.map((p) => p.id);

export function presetOf(id) {
  return AUDIO_PRESETS.find((p) => p.id === id) || null;
}

// Konfigurasi audio bawaan dari sebuah preset (tanpa aset BGM).
export function audioFromPreset(id) {
  const p = presetOf(id) || presetOf("edukatif");
  return {
    preset: p.id,
    bgm: { status: "none" },
    bgmVolume: p.bgmVolume,
    voVolume: 1,
    fadeIn: p.fadeIn,
    fadeOut: p.fadeOut,
    gap: p.gap,
    normalize: true,
    targetLufs: p.targetLufs,
    duckRatio: p.duckRatio,
  };
}

const clamp = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// Validasi konfigurasi audio dari klien. Aset BGM tidak pernah datang
// dari klien — ia dipertahankan dari konfigurasi tersimpan (keepBgm)
// dan hanya berubah lewat route unggah khusus.
export function sanitizeAudioConfig(input, keepBgm) {
  if (!input || typeof input !== "object") return null;
  const base = audioFromPreset(AUDIO_PRESET_IDS.includes(input.preset) ? input.preset : "edukatif");
  return {
    preset: AUDIO_PRESET_IDS.includes(input.preset) ? input.preset : "kustom",
    bgm: keepBgm && typeof keepBgm === "object" ? keepBgm : { status: "none" },
    bgmVolume: clamp(input.bgmVolume, 0, 1, base.bgmVolume),
    voVolume: clamp(input.voVolume, 0, 2, 1),
    fadeIn: clamp(input.fadeIn, 0, 15, base.fadeIn),
    fadeOut: clamp(input.fadeOut, 0, 15, base.fadeOut),
    gap: clamp(input.gap, 0, 3, base.gap),
    normalize: input.normalize !== false,
    targetLufs: clamp(input.targetLufs, -24, -12, base.targetLufs),
    duckRatio: clamp(input.duckRatio, 1, 20, base.duckRatio),
  };
}
