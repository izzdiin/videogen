// Util teks renderer yang dipakai bersama lib/render.js dan
// lib/thumbnail.js — dipisah agar thumbnail tidak mengimpor seluruh
// renderer (yang menarik rantai audio/motion/captions).
//
// Pecah teks menjadi baris-baris dengan lebar maksimum maxChars dan
// paling banyak maxLines baris. Kata tidak dibuang kecuali teks
// memang melebihi kapasitas baris terakhir.
export function wrapText(text, maxChars, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = cur + " " + w;
    }
  }
  if (cur.trim() && lines.length < maxLines) lines.push(cur.trim());
  return lines.join("\n");
}
