// Penyatuan dua jalur tulis gambar karakter (CC-fix, 11 Nov):
// route lama [cid]/image menulis character.referenceImage, route
// references (CC1) menulis character.references — keduanya harus
// saling mencerminkan saat MENULIS, bukan hanya saat membaca
// (effectiveReferences). Tanpa ini, unggahan lewat satu jalur
// tertimpa saveProject dari jalur lain dan tampak "hilang".
import { effectiveReferences, mirrorLegacyPortrait, emptyRef } from "./characterReferences.js";

// Dipanggil sesudah route lama menetapkan referenceImage baru
// (unggah/generate/hapus): cerminkan ke references.portrait.
export function syncLegacyWrite(character) {
  const refs = effectiveReferences(character);
  const img = character.referenceImage;
  if (img?.status === "ready" && img.file) {
    refs.portrait = { ...img };
  } else if (img?.status === "generating") {
    refs.portrait = { status: "generating", ...(img.startedAt ? { startedAt: img.startedAt } : {}) };
  } else if (img?.status === "error") {
    refs.portrait = { status: "error", ...(img.error ? { error: String(img.error).slice(0, 300) } : {}), ...(img.updatedAt ? { updatedAt: img.updatedAt } : {}) };
  } else {
    refs.portrait = emptyRef();
  }
  character.references = refs;
  return character;
}

// Dipanggil pada beban proyek yang akan ditulis route lama, SEBELUM
// referenceImage diubah: bila portrait CC1 lebih baru/ada dan
// referenceImage basi, angkat dulu supaya tulisan berikutnya tidak
// menimpa portrait CC1 dengan data lama.
export function liftLegacyFromRefs(character) {
  const refs = effectiveReferences(character);
  character.references = refs;
  character.referenceImage = mirrorLegacyPortrait(refs);
  return character;
}
