// AI Director — Automatic Video Production Planner.
// Menerima tema/ide video, meminta model naskah (9Router) menyusun
// strategi produksinya, lalu mengembalikan konfigurasi proyek
// terstruktur (JSON) yang tervalidasi terhadap katalog Videogen.
// AI Director TIDAK merender dan TIDAK menulis naskah — keluarannya
// adalah konfigurasi yang dieksekusi pipeline yang sudah ada lewat
// field-field proyek biasa (engine, visualStyle, captionStyle, dst).
import { chatJSON, listModelsRaw } from "./ai.js";
import { VISUAL_STYLES, VISUAL_STYLE_IDS } from "./visualStyles.js";
import { CAPTION_STYLES, sanitizeCaptionStyle } from "./captions.js";
import { SB_BEAT_ROLES } from "./store.js";

export const DIRECTOR_AUDIENCES = ["anak", "remaja", "dewasa", "umum"];
export const AUDIENCE_LABELS = {
  anak: "Anak-anak",
  remaja: "Remaja",
  dewasa: "Dewasa",
  umum: "Umum (semua usia)",
};
export const ENGINE_LABELS = {
  slides: "Slides",
  stickman: "Stickman",
  darkcard: "Dark Card",
  diagram: "Diagram",
  editorial: "Editorial",
};
export const VOICE_LABELS = {
  "edge-tts": "edge-tts (otomatis)",
  "gemini-tts": "Gemini TTS",
  "muse-bridge": "Muse (bridge)",
  elevenlabs: "ElevenLabs",
};
export const IMAGE_PROVIDER_LABELS = {
  pollinations: "Pollinations (gratis)",
  "sdxl-9router": "Cloudflare SDXL via 9Router",
  venice: "Venice",
  "muse-bridge": "Muse (bridge)",
};

const ENGINES = Object.keys(ENGINE_LABELS);
const VOICES = Object.keys(VOICE_LABELS);
const IMAGE_PROVIDERS = Object.keys(IMAGE_PROVIDER_LABELS);

// Model bawaan untuk AI Director bila user belum memilih model naskah:
// pilih model cepat yang patuh JSON dari daftar yang terbaca di 9Router.
const MODEL_PREFS = [
  "gemini-3.6-flash",
  "gemini-3-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash",
  "qwen3.6-plus",
  "qwen",
  "gemma-4-31b",
  "llama-3.3-70b",
  "llama",
];

export async function pickDirectorModel(requested) {
  if (requested) return requested;
  let models = [];
  try {
    models = await listModelsRaw();
  } catch {
    models = [];
  }
  if (!models.length) {
    throw new Error(
      "Tidak ada model 9Router yang terbaca. Pilih dulu model penulis naskah di formulir, lalu minta rencana lagi."
    );
  }
  const lower = models.map((m) => m.toLowerCase());
  for (const pref of MODEL_PREFS) {
    const idx = lower.findIndex((m) => m.includes(pref));
    if (idx >= 0) return models[idx];
  }
  return models[0];
}

function directorSystemPrompt() {
  const visualCatalog = VISUAL_STYLES.map((s) => `- "${s.id}": ${s.label}`).join("\n");
  return `Kamu adalah AI Director untuk Videogen, perencana produksi video pendek. Tugasmu HANYA menyusun strategi produksi dari sebuah tema — kamu TIDAK menulis naskah dan TIDAK membuat gambar. Keluaranmu WAJIB JSON valid saja, tanpa markdown, tanpa komentar.

Katalog mesin rendering (field "mesin"):
- "slides": gambar AI diam + gerak zoom + overlay + subtitle. Paling serbaguna: edukasi umum, cerita, anak-anak, sejarah, motivasi.
- "stickman": animasi gambar tangan stickman. Field "gayaStickman": "B1" minimal hitam-putih (humor, keseharian, relatable), "B2" ilustrasi warna di kertas krem (cerita hangat, anak-anak), "B3" siluet retro TV (misteri, nostalgia).
- "darkcard": kartu UI gelap ala listicle teknologi. Untuk daftar fakta cepat, teknologi, gadget, perbandingan. Tanpa gambar AI.
- "diagram": diagram vektor penjelas di kanvas krem. Untuk sains, teknik, cara kerja sesuatu, proses. Field "modeDiagram": "akumulasi" (satu diagram dibangun bertahap) atau "bedah" (bedah fenomena/data dengan kartu angka besar).
- "editorial": tipografi raksasa + satu gambar objek hero per scene, TANPA subtitle. Untuk opini, esai, kutipan, tema dewasa yang berkelas.

Gaya visual (field "visual", HANYA untuk mesin "slides"; mesin lain isi null):
${visualCatalog}
Pasangan yang terbukti: "kartun-datar" + gaya subtitle "satukata" sangat cocok untuk anak-anak dan edukasi ringan.

Gaya subtitle (field "gayaSubtitle"), salah satu dari: "frasa" (kotak subtitle biasa), "karaoke" (kata menyala berurutan — musik, lantunan, konten anak), "satukata" (satu kata raksasa per ketukan — energik, cocok untuk anak-anak dan kartun datar), "editorial" (huruf besar rata kiri — opini dan esai serius), "minimal" (teks bersih tanpa kotak — dokumenter dan konten tenang), "dynamic" (teks mengetik sendiri — teknologi dan tutorial), "highlight" (potongan kunci disorot lime — tips dan fakta penting), "storytelling" (pita bawah per kalimat — narasi dan cerita). Untuk mesin "editorial" isi null.

Penyedia suara (field "voiceProvider"): "edge-tts" (netral, aman untuk kebanyakan tema), "gemini-tts" (paling ekspresif — cerita, anak-anak, tema emosional), "muse-bridge" (dibacakan Muse, lambat), "elevenlabs" (premium).

Penyedia gambar (field "penyediaGambar", berlaku untuk slides, stickman B2/B3, editorial): "pollinations" (gratis), "sdxl-9router" (Cloudflare SDXL — paling setia untuk gaya kartun-datar dan ilustrasi stickman B2/B3), "venice", "muse-bridge" (lambat). Untuk darkcard/diagram isi "pollinations".

Rasio (field "rasio"): "9:16" bawaan untuk Shorts/Reels/TikTok; "1:1" untuk feed persegi; "16:9" hanya untuk YouTube lanskap.

Durasi (field "durasiDetik"): kebanyakan tema 30–90 detik; untuk anak-anak 40–60 detik. Jumlah scene (field "jumlahScene"): kira-kira 1 scene per 8–10 detik, antara 4 dan 10 scene.

Template naskah (field "templateNaskah"): "andai" HANYA bila tema jelas kontrafaktual ("gimana kalau...", "andai saja...", what-if). Selain itu "".

Musik (field "musik"): frasa suasana singkat Bahasa Indonesia, mis. "Ceria dan lembut", "Tenang dan hangat", "Epik orkestra ringan", "Tegang minimal". Ini arahan suasana, bukan nama lagu.

Kategori (field "kategori"): label singkat Bahasa Indonesia, mis. "Edukasi Islami", "Edukasi Sains", "Teknologi", "Sejarah", "Motivasi", "Hiburan Anak", "Tutorial", "Kesehatan".

Target audiens (field "targetAudiens"): "anak" | "remaja" | "dewasa" | "umum". Nilai dari bahasa dan konteks tema — tema religius atau umum TIDAK otomatis untuk anak; bila ragu pilih "umum".

Judul usulan (field "judulUsulan"): judul proyek singkat dan menarik dalam bahasa naskah.
Alasan (field "alasan"): 1–2 kalimat Bahasa Indonesia yang menjelaskan pilihan mesin dan visual.

Distribusi peran beat (field "peranBeat"): array berisi TEPAT "jumlahScene" peran, satu per scene berurutan, dari himpunan "hook" | "turn" | "proof" | "cta" (adopsi motionmaxxing). Aturan: elemen pertama WAJIB "hook", elemen terakhir WAJIB "cta", "proof" adalah porsi terbesar (bukti/isi), "turn" hanya untuk scene yang mengubah arah cerita (paling banyak sepertiga jumlah scene, dan hanya bila ceritanya memang berbelok).

Keluarkan JSON PERSIS dengan field-field ini: {"kategori":"...","targetAudiens":"umum","durasiDetik":55,"jumlahScene":6,"rasio":"9:16","mesin":"slides","gayaStickman":null,"modeDiagram":null,"visual":"bebas","penyediaGambar":"pollinations","voiceProvider":"edge-tts","gayaSubtitle":"frasa","templateNaskah":"","musik":"...","judulUsulan":"...","alasan":"...","peranBeat":["hook","proof","proof","turn","proof","cta"]}`;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const str = (v, max) => String(v ?? "").trim().slice(0, max);

// Validasi rencana mentah dari model terhadap katalog. Nilai di luar
// katalog tidak pernah diteruskan — selalu jatuh ke bawaan yang aman.
export function validatePlan(raw, theme) {
  const r = raw && typeof raw === "object" ? raw : {};
  const mesin = ENGINES.includes(r.mesin) ? r.mesin : "slides";
  const durasiDetik = clamp(Math.round(Number(r.durasiDetik) || 55), 20, 180);
  const jumlahScene = clamp(
    Math.round(Number(r.jumlahScene) || Math.round(durasiDetik / 9)),
    3,
    12
  );
  const visual =
    mesin === "slides"
      ? VISUAL_STYLE_IDS.includes(r.visual)
        ? r.visual
        : "bebas"
      : null;
  const subtitle =
    mesin === "editorial" ? null : sanitizeCaptionStyle(r.gayaSubtitle);
  // Distribusi peran beat (M1/B1): paksa kerangka hook … cta dan
  // sesuaikan panjangnya ke jumlahScene; "turn" dibatasi sepertiga.
  let peranBeat = (Array.isArray(r.peranBeat) ? r.peranBeat : [])
    .map((x) => String(x || ""))
    .filter((x) => SB_BEAT_ROLES.includes(x))
    .slice(0, jumlahScene);
  while (peranBeat.length < jumlahScene) peranBeat.push("proof");
  if (jumlahScene >= 1) peranBeat[0] = "hook";
  if (jumlahScene >= 2) peranBeat[jumlahScene - 1] = "cta";
  const maxTurn = Math.floor(jumlahScene / 3);
  let seenTurn = 0;
  peranBeat = peranBeat.map((x) => (x === "turn" ? (++seenTurn > maxTurn ? "proof" : x) : x));
  return {
    kategori: str(r.kategori, 60) || "Umum",
    targetAudiens: DIRECTOR_AUDIENCES.includes(r.targetAudiens) ? r.targetAudiens : "umum",
    targetAudiensLabel: AUDIENCE_LABELS[
      DIRECTOR_AUDIENCES.includes(r.targetAudiens) ? r.targetAudiens : "umum"
    ],
    durasiDetik,
    jumlahScene,
    rasio: ["9:16", "1:1", "16:9"].includes(r.rasio) ? r.rasio : "9:16",
    mesin,
    mesinLabel: ENGINE_LABELS[mesin],
    gayaStickman:
      mesin === "stickman" ? (["B1", "B2", "B3"].includes(r.gayaStickman) ? r.gayaStickman : "B1") : null,
    modeDiagram:
      mesin === "diagram" ? (r.modeDiagram === "bedah" ? "bedah" : "akumulasi") : null,
    visual,
    visualLabel: visual ? VISUAL_STYLES.find((s) => s.id === visual)?.label || visual : null,
    penyediaGambar: IMAGE_PROVIDERS.includes(r.penyediaGambar) ? r.penyediaGambar : "pollinations",
    penyediaGambarLabel:
      IMAGE_PROVIDER_LABELS[
        IMAGE_PROVIDERS.includes(r.penyediaGambar) ? r.penyediaGambar : "pollinations"
      ],
    voiceProvider: VOICES.includes(r.voiceProvider) ? r.voiceProvider : "edge-tts",
    voiceLabel: VOICE_LABELS[VOICES.includes(r.voiceProvider) ? r.voiceProvider : "edge-tts"],
    gayaSubtitle: subtitle,
    gayaSubtitleLabel: subtitle
      ? CAPTION_STYLES.find((s) => s.id === subtitle)?.label?.split(" — ")[0] || subtitle
      : "Tanpa subtitle",
    templateNaskah: r.templateNaskah === "andai" ? "andai" : "",
    musik: str(r.musik, 80) || "Instrumental lembut",
    judulUsulan: str(r.judulUsulan, 90) || str(theme, 90),
    alasan: str(r.alasan, 400),
    peranBeat,
  };
}

export async function planProduction({ theme, audience = "id", model = "" }) {
  const usedModel = await pickDirectorModel(model);
  const langName = audience === "en" ? "English" : "Bahasa Indonesia";
  const raw = await chatJSON(
    usedModel,
    directorSystemPrompt(),
    `Tema video: ${theme}\nBahasa naskah: ${langName}.\nSusun rencana produksinya dalam JSON sesuai skema.`
  );
  const plan = validatePlan(raw, theme);
  plan.modelDipakai = usedModel;
  return plan;
}
