// Motion berbasis keyframe (Fase B, butir 4) — modul MURNI (tanpa
// impor Node/aplikasi) supaya bisa dipakai renderer (server) maupun
// wizard (klien) dari satu sumber kebenaran.
//
// Model latar: scene.motion = { preset, easing, keyframes: [{ t,
// scale, fx, fy }] } — t 0..1 sepanjang segmen, scale = faktor zoom
// kamera di atas gambar (≥1), fx/fy = titik fokus (0..1). Renderer
// mengubah keyframe menjadi ekspresi zoompan ffmpeg dengan
// interpolasi linear per potongan (easing smoothstep hanya untuk
// tepat dua keyframe).
//
// Model layer: scene.layerMotion = { preset, scale } — preset berisi
// keyframe posisi { t, cx, cy } (pusat layer sebagai fraksi frame)
// yang diekspansi di sini menjadi ekspresi overlay ffmpeg.

const clamp = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

export const MOTION_EASINGS = ["linear", "ease-in-out", "smooth"];

export const MOTION_PRESETS = [
  { id: "static", label: "Diam (statis)", keyframes: [{ t: 0, scale: 1, fx: 0.5, fy: 0.5 }] },
  { id: "kenburns-in", label: "Ken Burns — zoom masuk", keyframes: [{ t: 0, scale: 1, fx: 0.5, fy: 0.5 }, { t: 1, scale: 1.18, fx: 0.5, fy: 0.5 }] },
  { id: "kenburns-out", label: "Ken Burns — zoom keluar", keyframes: [{ t: 0, scale: 1.18, fx: 0.5, fy: 0.5 }, { t: 1, scale: 1, fx: 0.5, fy: 0.5 }] },
  { id: "pan-left", label: "Geser kiri (pan)", keyframes: [{ t: 0, scale: 1.15, fx: 0.68, fy: 0.5 }, { t: 1, scale: 1.15, fx: 0.32, fy: 0.5 }] },
  { id: "pan-right", label: "Geser kanan (pan)", keyframes: [{ t: 0, scale: 1.15, fx: 0.32, fy: 0.5 }, { t: 1, scale: 1.15, fx: 0.68, fy: 0.5 }] },
  { id: "pan-up", label: "Geser atas (tilt)", keyframes: [{ t: 0, scale: 1.15, fx: 0.5, fy: 0.68 }, { t: 1, scale: 1.15, fx: 0.5, fy: 0.32 }] },
  { id: "pan-down", label: "Geser bawah (tilt)", keyframes: [{ t: 0, scale: 1.15, fx: 0.5, fy: 0.32 }, { t: 1, scale: 1.15, fx: 0.5, fy: 0.68 }] },
  { id: "pulse", label: "Denyut halus", keyframes: [{ t: 0, scale: 1.02, fx: 0.5, fy: 0.5 }, { t: 0.5, scale: 1.12, fx: 0.5, fy: 0.5 }, { t: 1, scale: 1.02, fx: 0.5, fy: 0.5 }] },
];

export function presetKeyframes(id) {
  const p = MOTION_PRESETS.find((x) => x.id === id);
  return p ? p.keyframes.map((k) => ({ ...k })) : null;
}

export function sanitizeMotion(m) {
  if (!m || typeof m !== "object") return null;
  const presetIds = [...MOTION_PRESETS.map((p) => p.id), "custom"];
  const preset = presetIds.includes(m.preset) ? m.preset : "custom";
  const easing = MOTION_EASINGS.includes(m.easing) ? m.easing : "linear";
  let kfs = (Array.isArray(m.keyframes) ? m.keyframes : [])
    .filter((k) => k && typeof k === "object")
    .map((k) => ({
      t: clamp(k.t, 0, 1, 0),
      scale: clamp(k.scale, 1, 2.5, 1),
      fx: clamp(k.fx, 0, 1, 0.5),
      fy: clamp(k.fy, 0, 1, 0.5),
    }))
    .sort((a, b) => a.t - b.t)
    .slice(0, 6);
  if (!kfs.length) kfs = presetKeyframes(preset) || [{ t: 0, scale: 1, fx: 0.5, fy: 0.5 }];
  return { preset, easing, keyframes: kfs };
}

// Bawaan gerak dari arahan kamera storyboard (Fase A) bila scene belum
// punya motion eksplisit. Tanpa storyboard sama sekali, pertahankan
// tampilan lama (zoom tengah perlahan 1→1,12) supaya proyek lama
// tidak berubah watak.
export function motionFromCamera(sb) {
  const kf = (scale, fx, fy) => ({ t: 0, scale, fx, fy });
  const kf2 = (a, b) => [kf(a[0], a[1], a[2]), { t: 1, scale: b[0], fx: b[1], fy: b[2] }];
  if (!sb) return kf2([1, 0.5, 0.5], [1.12, 0.5, 0.5]);
  switch (sb.camera) {
    case "zoom-in": return kf2([1, 0.5, 0.5], [1.18, 0.5, 0.5]);
    case "zoom-out": return kf2([1.18, 0.5, 0.5], [1, 0.5, 0.5]);
    case "pan-left": return kf2([1.15, 0.68, 0.5], [1.15, 0.32, 0.5]);
    case "pan-right": return kf2([1.15, 0.32, 0.5], [1.15, 0.68, 0.5]);
    case "tilt-up": return kf2([1.15, 0.5, 0.68], [1.15, 0.5, 0.32]);
    case "tilt-down": return kf2([1.15, 0.5, 0.32], [1.15, 0.5, 0.68]);
    default: return [kf(1, 0.5, 0.5)];
  }
}

export function effectiveMotion(scene) {
  const m = sanitizeMotion(scene?.motion);
  if (m) return m;
  return { preset: "camera", easing: "linear", keyframes: motionFromCamera(scene?.sb) };
}

// Angka diformat selalu dengan tanda kurung bila negatif, supaya
// selisih seperti (0.5--0.35) tidak pernah muncul di ekspresi.
const fmt = (n) => {
  const v = Number(n.toFixed(4));
  return v < 0 ? `(${v})` : String(v);
};

// Ekspresi ffmpeg untuk satu properti keyframe: interpolasi linear
// per potongan atas variabel frame V sepanjang totalFrames. Easing
// smoothstep hanya diterapkan untuk tepat dua keyframe.
export function lerpExpr(kfs, prop, V, totalFrames, easing) {
  const F = Math.max(1, Math.round(totalFrames) || 1);
  if (!kfs.length) return "0";
  if (kfs.length === 1) return fmt(kfs[0][prop]);
  if (easing && easing !== "linear" && kfs.length === 2) {
    const p = `(min(max(${V}/${F},0),1))`;
    const pe = `(${p}*${p}*(3-2*${p}))`;
    return `(${fmt(kfs[0][prop])}+(${fmt(kfs[1][prop])}-${fmt(kfs[0][prop])})*${pe})`;
  }
  let expr = fmt(kfs[kfs.length - 1][prop]);
  for (let i = kfs.length - 2; i >= 0; i--) {
    const f0 = fmt(kfs[i].t * F);
    const f1 = fmt(kfs[i + 1].t * F);
    const v0 = fmt(kfs[i][prop]);
    const v1 = fmt(kfs[i + 1][prop]);
    if (f1 === f0) continue;
    expr = `if(between(${V},${f0},${f1}),${v0}+(${v1}-${v0})*(${V}-${f0})/(${f1}-${f0}),${expr})`;
  }
  return `if(lt(${V},${fmt(kfs[0].t * F)}),${fmt(kfs[0][prop])},${expr})`;
}

// Ekspresi zoompan untuk segmen gambar diam. Variabel frame zoompan
// adalah 'on' (frame keluaran); x/y memakai 'zoom' yang sedang aktif.
export function zoompanExprs(motion, frames) {
  const kfs = motion.keyframes;
  const ez = motion.easing;
  return {
    z: lerpExpr(kfs, "scale", "on", frames, ez),
    x: `(iw-iw/zoom)*(${lerpExpr(kfs, "fx", "on", frames, ez)})`,
    y: `(ih-ih/zoom)*(${lerpExpr(kfs, "fy", "on", frames, ez)})`,
  };
}

// --- Layer objek alpha (D4) ---
export const LAYER_MOTION_PRESETS = [
  { id: "diam", label: "Diam di tengah", keyframes: [{ t: 0, cx: 0.5, cy: 0.55 }] },
  { id: "masuk-kiri", label: "Masuk dari kiri", keyframes: [{ t: 0, cx: -0.35, cy: 0.55 }, { t: 0.25, cx: 0.5, cy: 0.55 }, { t: 1, cx: 0.5, cy: 0.55 }] },
  { id: "masuk-kanan", label: "Masuk dari kanan", keyframes: [{ t: 0, cx: 1.35, cy: 0.55 }, { t: 0.25, cx: 0.5, cy: 0.55 }, { t: 1, cx: 0.5, cy: 0.55 }] },
  { id: "masuk-bawah", label: "Masuk dari bawah", keyframes: [{ t: 0, cx: 0.5, cy: 1.35 }, { t: 0.25, cx: 0.5, cy: 0.55 }, { t: 1, cx: 0.5, cy: 0.55 }] },
  { id: "melayang", label: "Melayang lembut", keyframes: [{ t: 0, cx: 0.5, cy: 0.52 }, { t: 0.5, cx: 0.5, cy: 0.58 }, { t: 1, cx: 0.5, cy: 0.52 }] },
];

export function sanitizeLayerMotion(m) {
  if (!m || typeof m !== "object") return null;
  const preset = LAYER_MOTION_PRESETS.some((p) => p.id === m.preset) ? m.preset : "diam";
  return { preset, scale: clamp(m.scale, 0.1, 1.2, 0.45) };
}

export function layerKeyframes(presetId) {
  const p = LAYER_MOTION_PRESETS.find((x) => x.id === presetId) || LAYER_MOTION_PRESETS[0];
  return p.keyframes;
}

// Ekspresi x/y filter overlay: posisi adalah PUSAT layer sebagai
// fraksi frame; overlay menempatkan sudut kiri-atas, jadi dikurangi
// separuh ukuran layer. Variabel frame overlay adalah 'n'.
export function layerPosExprs(layerMotion, frames) {
  const lm = sanitizeLayerMotion(layerMotion) || { preset: "diam", scale: 0.45 };
  const kfs = layerKeyframes(lm.preset);
  const cx = lerpExpr(kfs, "cx", "n", frames, null);
  const cy = lerpExpr(kfs, "cy", "n", frames, null);
  return { x: `(W*(${cx})-w/2)`, y: `(H*(${cy})-h/2)`, scale: lm.scale };
}
