// Generator Ide & Judul Otomatis — tiga mode:
//  - "viral": riset tren NYATA dari web (Google Trends RSS harian
//    Indonesia + pencarian berita DuckDuckGo HTML), lalu model
//    menyaringnya menjadi ide video. Bila sumber web tidak terjangkau,
//    melempar error JUJUR — tidak pernah mengarang "tren" dari ingatan
//    model (itulah gunanya mode improv, yang memang dilabeli sebagai
//    inspirasi murni AI).
//  - "improv": improvisasi bebas AI (model 9Router), boleh dibatasi
//    kategori/seed dari user.
//  - "series": satu konsep seri utuh — nama seri + judul & tema
//    episode 1..N yang saling menyambung (format video series).
// Judul & tema tiap ide diselaraskan kategorinya; ide siap dipakai:
// CreateForm mengisi judul+tema dari kartu ide, lalu AI Director
// menyusun rencana produksinya seperti biasa.
import { chatJSON } from "./ai.js";
import { pickDirectorModel } from "./director.js";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const str = (v, max) => String(v ?? "").trim().slice(0, max);

export const IDEA_CATEGORIES = [
  "Umum",
  "Edukasi & Sains",
  "Islami & Motivasi",
  "Anak & Keluarga",
  "Teknologi",
  "Sejarah & Fakta Unik",
  "Kesehatan",
  "Bisnis & Keuangan",
  "Hiburan & Humor",
  "Kuliner & Wisata",
];

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Videogen/1.0" };

async function fetchText(url, ms = 12000) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

const decodeEntities = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

// Sinyal tren 1: topik trending harian Indonesia dari RSS resmi
// Google Trends (geo=ID). Gagal -> daftar kosong (bukan fatal bila
// sumber lain masih hidup).
export async function fetchGoogleTrendsID() {
  const xml = await fetchText("https://trends.google.com/trending/rss?geo=ID");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const title = decodeEntities((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").trim();
    const traffic = decodeEntities((block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1] || "").trim();
    const news = decodeEntities((block.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/) || [])[1] || "").trim();
    return { topik: title, sinyal: [traffic && `pencarian ${traffic}`, news && `berita: ${news}`].filter(Boolean).join("; ") };
  }).filter((i) => i.topik);
  return items.slice(0, 20);
}

// Sinyal tren 2: berita utama dari RSS Google News (edisi Indonesia)
// untuk kueri kategori. (DuckDuckGo HTML terverifikasi TIDAK memberi
// hasil dari container — diganti sumber ini.)
export async function fetchGoogleNews(query, limit = 6) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=id&gl=ID&ceid=ID:id";
  const xml = await fetchText(url);
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const t = decodeEntities((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "")
      .replace(/ - [^-]{2,40}$/, "")
      .trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export async function gatherTrendSignals(category) {
  const signals = [];
  try {
    const trends = await fetchGoogleTrendsID();
    for (const t of trends) signals.push({ sumber: "Google Trends ID (harian)", topik: t.topik, catatan: t.sinyal });
  } catch {}
  try {
    const q = category && category !== "Umum"
      ? `berita viral terbaru ${category} Indonesia`
      : "berita viral trending hari ini Indonesia";
    const news = await fetchGoogleNews(q);
    for (const n of news) signals.push({ sumber: "Berita web", topik: n, catatan: "" });
  } catch {}
  return signals;
}

function ideasSystemPrompt(mode) {
  const base = `Kamu adalah periset ide video pendek (Shorts/Reels/TikTok) untuk pembuat konten Indonesia. Keluaranmu WAJIB JSON valid saja, tanpa markdown, tanpa komentar.

Setiap ide WAJIB punya:
- "judul": judul video yang menarik & siap pakai (Bahasa Indonesia, maks ±70 karakter, gaya judul yang membuat penasaran tapi TIDAK clickbait bohong).
- "tema": tema/ide lengkap 1–3 kalimat yang siap dimasukkan ke kolom tema Videogen (sudut pandang, isi, dan daya tariknya jelas).
- "kategori": label kategori singkat.
- "hook": kalimat pembuka 3 detik pertama yang memikat.
- "alasan": 1 kalimat mengapa ide ini layak dibuat sekarang.
- "sumber": untuk mode viral, nama sinyal tren asal ide (persis dari daftar sinyal); untuk mode lain isi "".`;
  if (mode === "viral") {
    return base + `

MODE VIRAL: ide HARUS berangkat dari daftar sinyal tren NYATA yang diberikan di pesan user — jangan mengarang tren, tokoh, atau peristiwa yang tidak ada di daftar. Boleh mengubah topik tren menjadi sudut edukasi/cerita yang aman dan sesuai format video pendek. Bila sebuah topik tren terlalu sensitif (kecelakaan, kematian, politik praktis), ambil sisi edukasi umumnya atau lewati.`;
  }
  if (mode === "series") {
    return base + `

MODE SERIES: rancang SATU konsep seri video bersambung. Keluarkan juga "namaSeri" (nama seri yang melekat, maks ±40 karakter) dan "konsep" (1–2 kalimat konsep serinya). Field "ideas" adalah daftar EPISODE berurutan: episode 1 memperkenalkan dunia/aturan serinya, episode berikutnya menaikkan taruhan atau membuka sudut baru — bukan pengulangan. Judul episode TIDAK perlu memuat nomor episode (penomoran ditangani aplikasi); tema episode menyebut kaitannya dengan episode sebelumnya bila relevan.`;
  }
  return base + `

MODE IMPROVISASI: berimprovisasilah sebebas-bebasnya — sudut pandang segar, premis "gimana kalau", fakta yang jarang diketahui, cerita mini, daftar mengejutkan. Hindari ide klise yang sudah terlalu umum. Ide tidak terikat peristiwa terkini.`;
}

export function validateIdeas(raw, count) {
  const r = raw && typeof raw === "object" ? raw : {};
  const list = Array.isArray(r.ideas) ? r.ideas : [];
  const ideas = list.slice(0, count).map((it) => ({
    judul: str(it?.judul, 120),
    tema: str(it?.tema, 500),
    kategori: str(it?.kategori, 60) || "Umum",
    hook: str(it?.hook, 200),
    alasan: str(it?.alasan, 240),
    sumber: str(it?.sumber, 120),
  })).filter((i) => i.judul && i.tema);
  return {
    namaSeri: str(r.namaSeri, 80),
    konsep: str(r.konsep, 300),
    ideas,
  };
}

export async function generateIdeas({ mode = "improv", category = "Umum", count = 5, seed = "", audience = "id", model = "" }) {
  const n = clamp(Math.round(Number(count) || 5), 1, 10);
  const usedModel = await pickDirectorModel(model);
  const langName = audience === "en" ? "English" : "Bahasa Indonesia";
  let userMsg;
  let signals = [];
  if (mode === "viral") {
    signals = await gatherTrendSignals(category);
    if (!signals.length) {
      throw new Error("Sumber tren web tidak terjangkau saat ini (Google Trends & pencarian berita tidak menjawab). Coba lagi nanti, atau pakai mode Improv AI yang tidak butuh internet.");
    }
    const list = signals.map((s, i) => `${i + 1}. [${s.sumber}] ${s.topik}${s.catatan ? ` — ${s.catatan}` : ""}`).join("\n");
    userMsg = `Sinyal tren hari ini:\n${list}\n\nBuat ${n} ide video dari sinyal di atas${category !== "Umum" ? `, utamakan yang nyambung kategori ${category}` : ""}. Bahasa: ${langName}. Keluarkan JSON: {"ideas":[{...}]}`;
  } else if (mode === "series") {
    userMsg = `Rancang satu seri video${category !== "Umum" ? ` kategori ${category}` : ""}${seed ? ` berangkat dari benih ide ini: "${seed}"` : " dari improvisasimu sendiri"}. Buat ${n} episode berurutan. Bahasa: ${langName}. Keluarkan JSON: {"namaSeri":"...","konsep":"...","ideas":[{...episode 1...}, ...]}`;
  } else {
    userMsg = `Buat ${n} ide video hasil improvisasi${category !== "Umum" ? ` kategori ${category}` : " lintas kategori"}${seed ? `, berangkat dari benih ini: "${seed}"` : ""}. Bahasa: ${langName}. Keluarkan JSON: {"ideas":[{...}]}`;
  }
  const raw = await chatJSON(usedModel, ideasSystemPrompt(mode), userMsg);
  const out = validateIdeas(raw, n);
  if (!out.ideas.length) throw new Error("Model tidak menghasilkan ide yang valid. Coba lagi.");
  out.modelDipakai = usedModel;
  out.mode = mode;
  if (mode === "viral") out.sinyalDipakai = signals.length;
  return out;
}

// Saran episode lanjutan untuk seri yang sudah berjalan: membaca
// judul episode yang sudah ada agar sambungannya masuk akal.
export async function suggestNextEpisodes({ seriesName, concept = "", existingTitles = [], count = 3, audience = "id", model = "" }) {
  const usedModel = await pickDirectorModel(model);
  const langName = audience === "en" ? "English" : "Bahasa Indonesia";
  const listed = existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n") || "(belum ada episode)";
  const raw = await chatJSON(
    usedModel,
    ideasSystemPrompt("series"),
    `Seri berjalan: "${seriesName}"${concept ? ` — konsep: ${concept}` : ""}\nEpisode yang sudah ada:\n${listed}\n\nUsulkan ${count} episode LANJUTAN yang menyambung wajar dari episode terakhir (bukan mengulang). Bahasa: ${langName}. Keluarkan JSON: {"ideas":[{...}]}`
  );
  const out = validateIdeas(raw, clamp(Math.round(Number(count) || 3), 1, 10));
  if (!out.ideas.length) throw new Error("Model tidak menghasilkan usulan episode. Coba lagi.");
  out.modelDipakai = usedModel;
  return out;
}
