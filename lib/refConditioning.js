// Normalisasi catatan conditioning pada aset referensi karakter (CC2).
// Aset referensi adalah milik server: field conditioning yang ditulis
// route generate harus lolos saveProject/loadProject apa adanya —
// modul kecil ini adalah satu-satunya tempat bentuknya didefinisikan,
// dipakai characterReferences (sanitasi) dan bisa dipakai UI kelak.
const MODES = ["multi", "img2img", "text"];

export function sanitizeConditioning(input) {
  if (!input || typeof input !== "object") return null;
  if (!MODES.includes(input.mode)) return null;
  const out = {
    requested: MODES.includes(input.requested) ? input.requested : input.mode,
    mode: input.mode,
    provider: String(input.provider || "").slice(0, 40),
    refs: Array.isArray(input.refs) ? input.refs.slice(0, 6).map((r) => String(r).slice(0, 40)) : [],
  };
  if (Number.isFinite(input.strength)) out.strength = input.strength;
  if (input.degraded) out.degraded = String(input.degraded).slice(0, 200);
  return out;
}
