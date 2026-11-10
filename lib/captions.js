// Sistem preset subtitle Slides (Fase C).
//
// Renderer lama hanya punya dua gaya caption: "frasa" (kotak subtitle
// per potongan teks) dan "satukata" (satu kata raksasa per ketukan).
// Modul ini menggeneralisasi keduanya menjadi sistem preset:
//
//   frasa        — gaya lama, dipertahankan persis (proyek lama aman)
//   karaoke      — frasa redup di kiri bawah; kata-kata "menyala"
//                  berurutan mengisi frasa (lapisan awalan per kata)
//   satukata     — satu kata raksasa di tengah (perilaku lama, kini
//                  waktunya proporsional panjang kata, bukan slot rata)
//   editorial    — huruf besar tebal rata kiri ala majalah + batang
//                  aksen, tanpa kotak
//   minimal      — frasa bersih tanpa kotak, border tipis
//   dynamic      — teks mengetik sendiri: awalan kata muncul kumulatif
//                  rata kiri (reveal per kata)
//   highlight    — seperti frasa, tetapi potongan berisi kata
//                  terpanjang tampil kotak lime berteks gelap
//   storytelling — pita gelap selebar frame di bawah + teks rata kiri,
//                  potongan mengikuti batas kalimat
//
// SUMBER WAKTU saat ini = estimasi proporsional jumlah karakter
// (wordTimings di bawah) — BUKAN timestamp ASR. Fase D akan menguji
// transkripsi Gemini untuk mengganti sumber waktu ini dengan
// timestamp kata asli (scene.words); renderer preset tidak berubah,
// hanya sumber waktunya.
//
// Modul ini murni: tidak membaca berkas; pemanggil (render.js)
// menulis berkas teks potongan lewat callback writeText.

export const CAPTION_STYLES = [
  { id: "frasa", label: "Frasa — kotak subtitle biasa di bawah" },
  { id: "karaoke", label: "Karaoke — kata menyala berurutan mengisi frasa" },
  { id: "satukata", label: "Satu Kata — satu kata raksasa per ketukan, kata terpanjang lime" },
  { id: "editorial", label: "Editorial — huruf besar tebal rata kiri + batang aksen" },
  { id: "minimal", label: "Minimal — teks bersih tanpa kotak" },
  { id: "dynamic", label: "Dynamic — teks mengetik sendiri kata demi kata" },
  { id: "highlight", label: "Highlight — potongan kunci tampil kotak lime" },
  { id: "storytelling", label: "Storytelling — pita gelap bawah, per kalimat" },
];

export const CAPTION_STYLE_IDS = CAPTION_STYLES.map((s) => s.id);

export function sanitizeCaptionStyle(v) {
  return CAPTION_STYLE_IDS.includes(v) ? v : "frasa";
}

export const LIME = "0xB8E62E";
export const DARK = "0x172A28";

const cleanLen = (w) => String(w).replace(/[^A-Za-zÀ-ÿ0-9]/g, "").length;
const safeWord = (w) => String(w).replace(/\\/g, "").replace(/'/g, "’");
const wordsOf = (text) =>
  String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

// Waktu per kata proporsional jumlah karakter bersih kata (kata
// panjang diucapkan lebih lama), di dalam jendela [start, end]
// durasi narasi. Mengembalikan [{w, a, b}] dalam detik.
export function wordTimings(text, start, end) {
  const words = wordsOf(text);
  if (!words.length || end <= start) return [];
  const weights = words.map((w) => Math.max(1, cleanLen(w)));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = end - start;
  let acc = 0;
  return words.map((w, k) => {
    const a = start + (span * acc) / total;
    acc += weights[k];
    const b = k === words.length - 1 ? end : start + (span * acc) / total;
    return { w, a, b };
  });
}

// Jendela waktu per potongan teks, proporsional panjang potongan.
export function chunkWindows(chunks, dur) {
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
  let acc = 0;
  return chunks.map((c, k) => {
    const a = (dur * acc) / total;
    acc += c.length;
    const b = k === chunks.length - 1 ? dur : (dur * acc) / total;
    return { text: c, a, b };
  });
}

// Potongan mengikuti batas kalimat (untuk storytelling): kalimat
// utuh bila muat, kalimat panjang dipecah lagi per karakter.
export function sentenceChunks(text, maxChars, maxLines, captionChunks) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const sentences = t.match(/[^.!?…]+[.!?…]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [t];
  const out = [];
  for (const s of sentences) out.push(...captionChunks(s, maxChars, maxLines));
  return out;
}

const en = (a, b) => `:enable='between(t\\,${a.toFixed(2)}\\,${b.toFixed(2)})'`;

// Bangun daftar filter drawtext (+ drawbox opsional) untuk caption
// satu scene. ctx: {cfg:{w,h}, fonts:{bold,med}, landscape,
// wrapText, captionChunks, writeText(name, content) -> path}
// Normalisasi timestamp ASR ke jendela bicara renderer (duplikat
// kecil dari lib/asr.js agar modul ini tetap murni tanpa impor).
function normalizeAsr(items, winStart, winEnd) {
  if (!items?.length || winEnd <= winStart) return items || [];
  const first = items[0].a;
  const last = items[items.length - 1].b;
  const span = Math.max(0.1, last - first);
  const target = winEnd - winStart;
  const map = (t) => winStart + ((t - first) / span) * target;
  return items.map((it, k) => ({
    w: it.w,
    a: k === 0 ? winStart : map(it.a),
    b: k === items.length - 1 ? winEnd : Math.max(map(it.a) + 0.05, map(it.b)),
  }));
}

export function buildCaptionFilters(style, narration, dur, ctx) {
  const { cfg, fonts, landscape, wrapText, captionChunks, writeText } = ctx;
  const text = String(narration || "");
  const fsPhrase = Math.round(cfg.w * 0.038);
  const maxChars = landscape ? 64 : cfg.w >= 1080 ? 36 : 30;
  const yBottom = "h-text_h-h*0.055";
  const filters = [];
  if (!wordsOf(text).length) return filters;

  // --- frasa & minimal & highlight: potongan frasa berjangka waktu
  if (style === "frasa" || style === "minimal" || style === "highlight") {
    const chunks = captionChunks(text, maxChars, 4);
    const font = style === "minimal" ? fonts.med : fonts.bold;
    const fs = style === "minimal" ? Math.round(cfg.w * 0.034) : fsPhrase;
    let hiChunk = -1;
    if (style === "highlight") {
      let best = -1;
      chunks.forEach((c, k) => {
        const m = Math.max(...wordsOf(c).map(cleanLen), 0);
        if (m > best) { best = m; hiChunk = k; }
      });
    }
    const wins = chunkWindows(chunks, dur);
    wins.forEach((win, k) => {
      const f = writeText(`subtitle-chunk-${k}.txt`, wrapText(win.text, maxChars, 4));
      const timed = wins.length > 1;
      if (style === "highlight" && k === hiChunk) {
        filters.push(
          `drawtext=fontfile=${font}:textfile=${f}:fontsize=${fs}:fontcolor=${DARK}:box=1:boxcolor=${LIME}:boxborderw=14:x=(w-text_w)/2:y=${yBottom}:line_spacing=7${timed ? en(win.a, win.b) : ""}`
        );
      } else if (style === "minimal") {
        filters.push(
          `drawtext=fontfile=${font}:textfile=${f}:fontsize=${fs}:fontcolor=white:borderw=2:bordercolor=black@0.6:x=(w-text_w)/2:y=${yBottom}:line_spacing=7${timed ? en(win.a, win.b) : ""}`
        );
      } else {
        filters.push(
          `drawtext=fontfile=${font}:textfile=${f}:fontsize=${fs}:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=14:x=(w-text_w)/2:y=${yBottom}:line_spacing=7${timed ? en(win.a, win.b) : ""}`
        );
      }
    });
    return filters;
  }

  // --- storytelling: pita selebar frame + teks rata kiri per kalimat
  if (style === "storytelling") {
    const chunks = sentenceChunks(text, maxChars, 3, captionChunks);
    const wins = chunkWindows(chunks, dur);
    const bandH = Math.round(cfg.h * 0.16);
    const yBand = cfg.h - bandH;
    wins.forEach((win, k) => {
      const f = writeText(`subtitle-chunk-${k}.txt`, wrapText(win.text, maxChars, 3));
      const timed = wins.length > 1 ? en(win.a, win.b) : "";
      filters.push(
        `drawbox=x=0:y=${yBand}:w=${cfg.w}:h=${bandH}:color=black@0.55:t=fill${timed}`
      );
      filters.push(
        `drawtext=fontfile=${fonts.med}:textfile=${f}:fontsize=${fsPhrase}:fontcolor=white:x=w*0.06:y=${yBand}+${Math.round(bandH * 0.22)}:line_spacing=7${timed}`
      );
    });
    return filters;
  }

  // --- editorial: huruf besar rata kiri + batang aksen
  if (style === "editorial") {
    const chunks = captionChunks(text.toUpperCase(), Math.round(maxChars * 0.8), 3);
    const wins = chunkWindows(chunks, dur);
    const fs = Math.round(cfg.w * 0.052);
    wins.forEach((win, k) => {
      const f = writeText(`subtitle-chunk-${k}.txt`, wrapText(win.text, Math.round(maxChars * 0.8), 3));
      const timed = wins.length > 1 ? en(win.a, win.b) : "";
      filters.push(
        `drawbox=x=${Math.round(cfg.w * 0.055)}:y=h*0.70:w=${Math.round(cfg.w * 0.016)}:h=${Math.round(cfg.h * 0.11)}:color=${LIME}:t=fill${timed}`
      );
      filters.push(
        `drawtext=fontfile=${fonts.bold}:textfile=${f}:fontsize=${fs}:fontcolor=white:borderw=3:bordercolor=black@0.5:x=w*0.10:y=h*0.70:line_spacing=8${timed}`
      );
    });
    return filters;
  }

  // --- berbasis kata: satukata, karaoke, dynamic
  const cStart = 0.35;
  const cEnd = Math.max(cStart + 0.4, dur - 0.15);
  // Sumber waktu: timestamp ASR (Fase D, ctx.asrItems) bila kata-
  // katanya persis narasi; selain itu estimasi proporsional karakter.
  const asrOk =
    Array.isArray(ctx.asrItems) &&
    ctx.asrItems.length === wordsOf(text).length &&
    ctx.asrItems.every((it, k) => String(it.w) === wordsOf(text)[k]);
  const timings = asrOk
    ? normalizeAsr(ctx.asrItems, cStart, cEnd)
    : wordTimings(text, cStart, cEnd);
  if (!timings.length) return filters;

  if (style === "satukata") {
    let hi = 0;
    timings.forEach((t, k) => { if (cleanLen(t.w) > cleanLen(timings[hi].w)) hi = k; });
    timings.forEach((t, k) => {
      filters.push(
        `drawtext=fontfile=${fonts.bold}:text='${safeWord(t.w)}':fontsize=${Math.round(cfg.w * 0.088)}:fontcolor=${k === hi ? LIME : "white"}:borderw=6:bordercolor=black:x=(w-text_w)/2:y=h*0.60${en(t.a, t.b)}`
      );
    });
    return filters;
  }

  if (style === "karaoke" || style === "dynamic") {
    // Potongan pendek satu baris; di dalam potongan, kata dijangka
    // dari wordTimings global agar konsisten antar potongan.
    const chunks = captionChunks(text, landscape ? 34 : 24, 1);
    // Petakan kata global ke potongan secara berurutan.
    let gi = 0;
    const fs = Math.round(cfg.w * 0.044);
    for (const c of chunks) {
      const cw = wordsOf(c);
      const group = timings.slice(gi, gi + cw.length);
      gi += cw.length;
      if (!group.length) continue;
      const from = group[0].a;
      const to = group[group.length - 1].b;
      const f = writeText(`subtitle-chunk-${filters.length}.txt`, c);
      if (style === "karaoke") {
        // Lapisan dasar: seluruh potongan redup.
        filters.push(
          `drawtext=fontfile=${fonts.bold}:textfile=${f}:fontsize=${fs}:fontcolor=0x9A9A9A:x=w*0.06:y=${yBottom}${en(from, to)}`
        );
        // Lapisan awalan: kata yang sudah terucap tampil terang.
        for (let k = 0; k < group.length; k++) {
          const pf = writeText(`subtitle-pre-${filters.length}.txt`, group.slice(0, k + 1).map((g) => g.w).join(" "));
          const endAt = k + 1 < group.length ? group[k + 1].a : to;
          filters.push(
            `drawtext=fontfile=${fonts.bold}:textfile=${pf}:fontsize=${fs}:fontcolor=white:x=w*0.06:y=${yBottom}${en(group[k].a, endAt)}`
          );
        }
      } else {
        // dynamic: tanpa lapisan dasar — teks mengetik sendiri.
        for (let k = 0; k < group.length; k++) {
          const pf = writeText(`subtitle-pre-${filters.length}.txt`, group.slice(0, k + 1).map((g) => g.w).join(" "));
          const endAt = k + 1 < group.length ? group[k + 1].a : to;
          filters.push(
            `drawtext=fontfile=${fonts.bold}:textfile=${pf}:fontsize=${fs}:fontcolor=white:borderw=3:bordercolor=black@0.55:x=w*0.06:y=${yBottom}${en(group[k].a, endAt)}`
          );
        }
      }
    }
    return filters;
  }

  return filters;
}
