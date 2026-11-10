// Reference Manager — Character Consistency Engine fase CC1
// (keputusan user RD1–RD6, 10 Nov 2026; rencana di
// PLAN-character-consistency-engine.md).
//
// Modul ini adalah SATU-SATUNYA pemilik bentuk data referensi karakter:
//   character.references = {
//     portrait:    { status, file, source, seed, updatedAt },
//     fullbody:    { ... },
//     expressions: { ... },
//   }
// plus seed per karakter (character.seed, keputusan RD5).
//
// Kaidah kompatibilitas (sama seperti Character Identity):
// - references adalah aset SERVER: klien tidak pernah bisa menuliskannya
//   lewat PATCH proyek; sanitizeCharacters mempertahankannya dari
//   salinan lama (lewat preserveReferences di sini).
// - character.referenceImage LAMA adalah portrait versi pertama:
//   dibaca sebagai portrait lewat effectiveReferences(); penulisan baru
//   selalu masuk ke references.portrait DAN dicerminkan kembali ke
//   referenceImage supaya pembaca lama (UI lama, contact sheet kelak)
//   tetap melihat portrait yang sama.
// - Generate bersifat BERANTAI: portrait dari teks identity; fullbody
//   dan expressions diturunkan dari portrait. Di CC1 penurunannya
//   memakai prompt teks yang diperkuat (jalur gambar-masuk provider
//   adalah pekerjaan CC2 — adapter + conditioning); setiap referensi
//   mencatat derivedFrom dengan JUJUR supaya tidak ada yang menyangka
//   conditioning visual sudah terjadi.
// - Poses DITUNDA (RD4): bukan bagian REF_KINDS.
// - Pollinations TIDAK diberi jalur referensi (RD3).

export const REF_KINDS = ["portrait", "fullbody", "expressions"];

export const REF_KIND_LABELS = {
  portrait: "Portrait",
  fullbody: "Full body",
  expressions: "Expression sheet",
};

const REF_STATUSES = ["none", "generating", "ready", "error"];

export function emptyRef() {
  return { status: "none" };
}

export function emptyReferences() {
  return { portrait: emptyRef(), fullbody: emptyRef(), expressions: emptyRef() };
}

function sanitizeRef(input) {
  if (!input || typeof input !== "object") return emptyRef();
  const status = REF_STATUSES.includes(input.status) ? input.status : "none";
  if (status !== "ready") {
    const out = { status };
    if (status === "generating" && input.startedAt) out.startedAt = String(input.startedAt).slice(0, 40);
    if (status === "error" && input.error) out.error = String(input.error).slice(0, 300);
    if (input.updatedAt) out.updatedAt = String(input.updatedAt).slice(0, 40);
    return out;
  }
  return {
    status: "ready",
    file: String(input.file || "").slice(0, 200),
    ...(input.source ? { source: String(input.source).slice(0, 40) } : {}),
    ...(Number.isFinite(input.seed) ? { seed: input.seed } : {}),
    ...(input.derivedFrom ? { derivedFrom: String(input.derivedFrom).slice(0, 40) } : {}),
    ...(input.updatedAt ? { updatedAt: String(input.updatedAt).slice(0, 40) } : {}),
  };
}

// Bentuk references yang EFEKTIF untuk sebuah karakter: gabungan data
// baru (references) dengan portrait lama (referenceImage). references
// menang bila statusnya bukan "none"; selain itu portrait lama dipakai.
export function effectiveReferences(character) {
  const refs = character?.references && typeof character.references === "object" ? character.references : {};
  const out = {
    portrait: sanitizeRef(refs.portrait),
    fullbody: sanitizeRef(refs.fullbody),
    expressions: sanitizeRef(refs.expressions),
  };
  if (out.portrait.status === "none" && character?.referenceImage?.status) {
    const legacy = sanitizeRef(character.referenceImage);
    if (legacy.status !== "none") out.portrait = legacy;
  }
  return out;
}

// Pertahankan references dari salinan server lama saat PATCH proyek:
// klien boleh mengirim apa pun; yang disimpan selalu milik server,
// dinormalisasi dari salinan lama karakter itu.
export function preserveReferences(incomingIgnored, oldCharacter) {
  void incomingIgnored;
  if (!oldCharacter) return emptyReferences();
  return effectiveReferences(oldCharacter);
}

// Cerminkan references kembali ke referenceImage lama (portrait).
export function mirrorLegacyPortrait(references) {
  const p = references?.portrait;
  if (!p || p.status === "none") return { status: "none" };
  const out = { status: p.status };
  if (p.status === "ready") {
    out.file = p.file;
    if (p.source) out.source = p.source;
    if (Number.isFinite(p.seed)) out.seed = p.seed;
  }
  if (p.status === "generating" && p.startedAt) out.startedAt = p.startedAt;
  if (p.status === "error" && p.error) out.error = p.error;
  if (p.updatedAt) out.updatedAt = p.updatedAt;
  return out;
}

// Nama berkas kanonik per jenis di assets/characters/.
export function refFileRel(characterId, kind, ext = "jpg") {
  return `assets/characters/${characterId}-${kind}.${ext}`;
}

// Awalan berkas untuk sweep: portrait baru memakai "<cid>-portrait.",
// portrait lama memakai "<cid>." persis.
export function refSweepPrefixes(characterId) {
  return [`${characterId}-`, `${characterId}.`];
}

// Seed per karakter (RD5): bilangan stabil 0..999999. Karakter baru
// mendapat seed acak saat pertama dibuat; sesudah itu dipertahankan
// server. Seed ini yang dipakai jalur Pollinations (dan kelak adapter)
// supaya satu karakter cenderung digambar dari titik acak yang sama.
export function preserveSeed(incoming, oldCharacter) {
  if (oldCharacter && Number.isFinite(oldCharacter.seed)) return oldCharacter.seed;
  if (Number.isFinite(incoming?.seed)) return Math.abs(Math.floor(incoming.seed)) % 1000000;
  return null; // diisi pembuat karakter (store) bila masih null
}

export function mintSeed() {
  return Math.floor(Math.random() * 1000000);
}

// Prompt pembangunan referensi per jenis. derivedFromPortrait=true
// menandai prompt penurunan (dipakai CC1 sebagai penurunan teks yang
// diperkuat; CC2 mengganti jalurnya dengan conditioning visual tanpa
// mengubah redaksi maksudnya).
const KIND_PROMPTS = {
  portrait:
    "character reference portrait, upper body, facing the camera, neutral expression, plain neutral background, clear detailed face",
  fullbody:
    "character reference full body shot, the SAME character standing upright in a relaxed neutral pose, whole body visible from head to feet, plain neutral background, consistent face, hair and outfit",
  expressions:
    "character expression sheet, the SAME character's head shown in a neat 3x2 grid with six facial expressions: neutral, happy, surprised, sad, angry, thinking, plain neutral background, consistent face and hair in every cell",
};

export function referencePromptFor(kind, character, effectiveAppearanceText) {
  const base = KIND_PROMPTS[kind] || KIND_PROMPTS.portrait;
  const who = effectiveAppearanceText || character?.name || "";
  return who ? `${base}: ${who}` : base;
}

// Reference Resolver (fondasi CC1, dipakai penuh oleh adapter CC2):
// untuk satu karakter, tentukan mode conditioning terbaik yang MUNGKIN
// dari aset yang siap, tanpa tahu provider:
//   - "multi"  : >=2 referensi siap (portrait + satu lagi) — kandidat
//                reference-conditioning sejati.
//   - "single" : tepat 1 referensi siap — kandidat img2img/edit.
//   - "text"   : tidak ada referensi siap — fallback teks (perilaku v1).
// Urutan prioritas referensi: portrait, expressions, fullbody.
export function resolveForCharacter(character) {
  const refs = effectiveReferences(character);
  const ready = [];
  for (const kind of ["portrait", "expressions", "fullbody"]) {
    if (refs[kind]?.status === "ready" && refs[kind].file) ready.push({ kind, file: refs[kind].file });
  }
  const mode = ready.length >= 2 ? "multi" : ready.length === 1 ? "single" : "text";
  return {
    characterId: character?.id || "",
    mode,
    refs: ready,
    primaryRef: ready[0] || null,
    seed: Number.isFinite(character?.seed) ? character.seed : null,
  };
}

// Resolver tingkat scene: hanya karakter yang hadir di scene ini
// (scene.sb.characters), urutan mengikuti daftar karakter proyek.
export function resolveReferences(project, scene) {
  const ids = scene?.sb?.characters;
  if (!Array.isArray(ids) || !ids.length) return [];
  const out = [];
  for (const c of project?.characters || []) {
    if (ids.includes(c.id)) out.push(resolveForCharacter(c));
  }
  return out;
}
