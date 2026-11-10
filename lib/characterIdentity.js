// Character Identity — identitas karakter TERSTRUKTUR (modul daun).
//
// Lapisan di atas `appearance` (teks bebas, kini berstatus LEGACY):
// - appearance TETAP disimpan apa adanya dan tetap berfungsi penuh —
//   proyek lama tidak berubah perilakunya sedikit pun.
// - identity adalah data terstruktur per aspek (usia, wajah, rambut,
//   kulit, tubuh, pakaian, aksesori, gaya gambar) yang bisa diedit per
//   field di UI, divalidasi, dan disusun menjadi frasa prompt yang
//   stabil urutannya.
// - Prompt akhir karakter dibangun dari KEDUANYA: frasa identity lebih
//   dulu (jangkar terstruktur), lalu teks appearance sebagai pelengkap
//   bebas. Bila identity kosong, hasilnya persis appearance lama.
// - Identity Lock: karakter yang dikunci (identityLocked=true) tidak
//   menerima perubahan identity dari klien — sanitize mengembalikan
//   identity lama. appearance dan nama tetap bisa diubah; kunci hanya
//   menjaga data terstruktur. Mengunci/membuka dilakukan eksplisit
//   lewat field yang sama pada PATCH (perubahan nilai kunci itu
//   sendiri selalu diterima).
//
// Contoh bentuk:
// {
//   "id": "character-001",
//   "name": "Alya",
//   "identity": {
//     "age": "8 years old",
//     "genderPresentation": "female",
//     "face": "round friendly face",
//     "hair": "black shoulder-length hair",
//     "skinTone": "light brown",
//     "body": "small child proportions",
//     "outfit": "pink long-sleeve dress",
//     "accessories": [],
//     "artStyle": "flat 2D cartoon"
//   }
// }

export const IDENTITY_FIELDS = [
  "age",
  "genderPresentation",
  "face",
  "hair",
  "skinTone",
  "body",
  "outfit",
  "accessories",
  "artStyle",
];

const FIELD_LIMITS = {
  age: 60,
  genderPresentation: 40,
  face: 160,
  hair: 160,
  skinTone: 80,
  body: 160,
  outfit: 200,
  artStyle: 120,
};

export function emptyIdentity() {
  return {
    age: "",
    genderPresentation: "",
    face: "",
    hair: "",
    skinTone: "",
    body: "",
    outfit: "",
    accessories: [],
    artStyle: "",
  };
}

// Normalisasi identity dari masukan tak tepercaya. Field tak dikenal
// dibuang; accessories menjadi daftar string bersih (maks 8 butir).
export function sanitizeIdentity(input) {
  const out = emptyIdentity();
  if (!input || typeof input !== "object") return out;
  for (const f of Object.keys(FIELD_LIMITS)) {
    out[f] = String(input[f] || "").trim().slice(0, FIELD_LIMITS[f]);
  }
  if (Array.isArray(input.accessories)) {
    out.accessories = input.accessories
      .map((a) => String(a || "").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 8);
  }
  return out;
}

export function identityIsEmpty(identity) {
  if (!identity || typeof identity !== "object") return true;
  for (const f of Object.keys(FIELD_LIMITS)) {
    if (String(identity[f] || "").trim()) return false;
  }
  return !(Array.isArray(identity.accessories) && identity.accessories.length);
}

// Frasa prompt dari identity SAJA (tanpa appearance), urutan tetap:
// usia, presentasi gender, wajah, rambut, kulit, tubuh, pakaian,
// aksesori, gaya gambar. String kosong bila identity kosong.
export function identityPhrase(identity) {
  if (identityIsEmpty(identity)) return "";
  const parts = [];
  if (identity.age) parts.push(identity.age);
  if (identity.genderPresentation) parts.push(identity.genderPresentation);
  if (identity.face) parts.push(identity.face);
  if (identity.hair) parts.push(identity.hair);
  if (identity.skinTone) parts.push(`${identity.skinTone} skin`);
  if (identity.body) parts.push(identity.body);
  if (identity.outfit) parts.push(`wearing ${identity.outfit}`);
  if (Array.isArray(identity.accessories) && identity.accessories.length) {
    parts.push(`accessories: ${identity.accessories.join(", ")}`);
  }
  if (identity.artStyle) parts.push(`art style: ${identity.artStyle}`);
  return parts.join(", ");
}

// Deskripsi efektif karakter untuk prompt: identity terstruktur lebih
// dulu, appearance legacy menyusul sebagai pelengkap bebas. Bila salah
// satu kosong, hasilnya yang lain apa adanya — karakter lama (hanya
// appearance) menghasilkan string yang IDENTIK dengan perilaku lama.
export function effectiveAppearance(character) {
  const legacy = String(character?.appearance || "").trim();
  const structured = identityPhrase(character?.identity);
  if (structured && legacy) return `${structured}. Additional details: ${legacy}`;
  return structured || legacy;
}

// Terapkan identity dari klien dengan hormat pada Identity Lock:
// bila kunci SEBELUM dan SESUDAH permintaan sama-sama menyala,
// identity lama dipertahankan. Membuka kunci (permintaan membawa
// identityLocked=false) adalah tindakan eksplisit pemilik karakter —
// identity baru pada permintaan yang sama langsung berlaku, supaya
// membuka kunci dan mengubah identity cukup satu kali simpan.
// Menyalakan kunci juga langsung membekukan identity hasil permintaan
// itu (nilai yang sedang dilihat user saat ia mengunci).
export function applyIdentity(incoming, oldCharacter) {
  const wasLocked = Boolean(oldCharacter?.identityLocked);
  const willLock = applyIdentityLock(incoming, oldCharacter);
  if (wasLocked && willLock) return sanitizeIdentity(oldCharacter.identity);
  return sanitizeIdentity(incoming?.identity);
}

// Nilai kunci efektif sesudah PATCH: perubahan nilai kunci dari klien
// selalu diterima (itulah cara mengunci/membuka); selain itu warisi
// nilai lama.
export function applyIdentityLock(incoming, oldCharacter) {
  if (typeof incoming?.identityLocked === "boolean") return incoming.identityLocked;
  return Boolean(oldCharacter?.identityLocked);
}
