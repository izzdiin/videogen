// Paket terbit sosial media (modul daun): thumbnail video + draf
// caption dan tagar yang siap disalin user ke platform tujuannya.
//
// Data hidup di project.social:
//   {
//     caption: "",            // draf caption (bisa diedit user)
//     tags: [],               // tagar TANPA tanda pagar
//     thumbnail: { status },  // aset server: exports/thumbnail.jpg
//     updatedAt: ""
//   }
// thumbnail adalah aset server (pola sama seperti referenceImage
// karakter dan bgm): file-nya hanya berubah lewat route khususnya
// (unggah / ambil frame / generate), tidak pernah dari klien.

export const SOCIAL_CAPTION_MAX = 2200;
export const SOCIAL_TAG_MAX = 30;

export function emptySocial() {
  return { caption: "", tags: [], thumbnail: { status: "none" }, updatedAt: "" };
}

// Normalisasi tagar dari berbagai bentuk masukan: array string, atau
// satu string berisi tagar/kata dipisah koma, spasi, atau baris baru.
// Keluaran: daftar bersih TANPA '#', huruf kecil dipertahankan apa
// adanya, unik (tidak peka huruf), maksimal SOCIAL_TAG_MAX butir.
export function sanitizeTags(input) {
  let raw = [];
  if (Array.isArray(input)) raw = input.flatMap((t) => String(t || "").split(/[\s,]+/));
  else if (typeof input === "string") raw = input.split(/[\s,]+/);
  const seen = new Set();
  const out = [];
  for (const piece of raw) {
    const tag = piece.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 50);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= SOCIAL_TAG_MAX) break;
  }
  return out;
}

// Sanitasi project.social dari klien: caption + tags boleh diubah;
// thumbnail dipertahankan dari salinan server (keepThumb).
export function sanitizeSocial(input, keepThumb) {
  const base = emptySocial();
  if (!input || typeof input !== "object") {
    return { ...base, thumbnail: keepThumb || base.thumbnail };
  }
  return {
    caption: String(input.caption || "").slice(0, SOCIAL_CAPTION_MAX),
    tags: sanitizeTags(input.tags),
    thumbnail: keepThumb || base.thumbnail,
    updatedAt: String(input.updatedAt || ""),
  };
}

// Teks siap salin: caption diikuti baris tagar berpagar. Bila caption
// kosong, keluarannya hanya baris tagar (atau string kosong).
export function socialCopyText(social) {
  const caption = String(social?.caption || "").trim();
  const tags = (social?.tags || []).map((t) => `#${t}`).join(" ");
  return [caption, tags].filter(Boolean).join("\n\n");
}

// Tagar bawaan dari konteks proyek: seri, mesin, dan kategori Director.
// Dipakai hanya untuk draf awal — user bebas mengubahnya.
export function defaultTagsFor(project) {
  const tags = ["shorts", "reels", "videopendek"];
  const series = String(project?.series?.name || "").replace(/[^\p{L}\p{N}]+/gu, "");
  if (series) tags.push(series);
  if (project?.engine && project.engine !== "slides") tags.push(project.engine);
  const cat = String(project?.director?.kategori || "").replace(/[^\p{L}\p{N}]+/gu, "");
  if (cat) tags.push(cat);
  return sanitizeTags(tags);
}
