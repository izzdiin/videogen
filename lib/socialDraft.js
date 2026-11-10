// Draf paket sosmed: menyusun caption + tagar awal dari konteks proyek
// memakai model naskah lewat 9Router, lalu mengembalikannya sebagai
// DATA untuk disimpan pemanggil ke project.social. Modul ini tidak
// menyentuh store — pola yang sama seperti lib/director.js.
//
// Draf selalu bisa diedit user sesudahnya; fungsi ini hanya memberi
// titik awal yang layak terbit: hook dari narasi scene pertama,
// ringkasan isi, CTA lunak, dan tagar campuran (inti + isi + umum).
import { chatJSON } from "./ai.js";
import { sanitizeTags, defaultTagsFor } from "./social.js";
import { pickDirectorModel } from "./director.js";

export async function draftSocialPackage(project, model) {
  const usedModel = await pickDirectorModel(model || project?.executors?.scriptModel || "");
  const en = project?.audience === "en";
  const langName = en ? "English" : "Bahasa Indonesia";
  const scenes = (project?.scenes || []).slice(0, 8);
  const narrations = scenes.map((s, i) => `${i + 1}. ${String(s.narration || "").trim()}`).filter((x) => x.length > 4);
  const hook = String(scenes[0]?.narration || project?.theme || "").trim().slice(0, 280);
  const seriesLine = project?.series?.name
    ? `Video ini episode ${project.series.episode || ""} dari seri "${project.series.name}" (${project.series.concept || ""}).`
    : "";
  const system = en
    ? `You write social media captions for short vertical videos (YouTube Shorts / TikTok / Instagram Reels). Output ONLY valid JSON, no markdown fences: {"caption":"...","tags":["tag1","tag2"]}. Rules: caption in English, 40-120 words, first line is a scroll-stopping hook, then 2-4 short lines of value, then ONE soft call to action (follow / comment / save). NO price or cost claims. Tags: 8-15 items, lowercase, no '#' sign, no spaces inside a tag, mix of topic tags and broad discovery tags. Never invent facts that are not in the provided material.`
    : `Kamu menulis caption media sosial untuk video vertikal pendek (YouTube Shorts / TikTok / Instagram Reels). Keluarkan HANYA JSON valid, tanpa pagar markdown: {"caption":"...","tags":["tag1","tag2"]}. Aturan: caption dalam Bahasa Indonesia, 40-120 kata, baris pertama adalah hook yang menghentikan scroll, lalu 2-4 baris pendek berisi nilai isi, lalu SATU ajakan lunak (ikuti / komentar / simpan). Patuhi kaidah prosa Indonesia: verba langsung tanpa tumpukan kata kerja ringan dan nominalisasi (tulis "menguji", bukan "melakukan pengujian terhadap"), tanpa kalke Inggris, tanpa pola "X, bukan berarti Y", tanpa membuka kalimat dengan transisi mekanis berulang, ejaan baku. JANGAN menyebut harga/biaya. Tagar: 8-15 butir, huruf kecil, TANPA tanda '#', tanpa spasi di dalam tag, campuran tagar topik dan tagar temuan umum. Jangan mengarang fakta di luar materi yang diberikan.`;
  const user = [
    `Judul video: ${project?.title || ""}`,
    `Tema: ${project?.theme || ""}`,
    seriesLine,
    hook ? `Narasi scene pertama (hook): ${hook}` : "",
    narrations.length ? `Ringkasan narasi per scene:\n${narrations.join("\n")}` : "",
    `Bahasa: ${langName}. Mesin/format: ${project?.engine || "slides"}.`,
    `Susun caption dan tagarnya dalam JSON sesuai skema.`,
  ]
    .filter(Boolean)
    .join("\n");
  const raw = await chatJSON(usedModel, system, user);
  const caption = String(raw?.caption || "").trim().slice(0, 2200);
  if (!caption) throw new Error("Model tidak menghasilkan caption. Coba lagi.");
  const tags = sanitizeTags(Array.isArray(raw?.tags) ? raw.tags : []);
  const merged = sanitizeTags([...tags, ...defaultTagsFor(project)]);
  return { caption, tags: merged.length ? merged : defaultTagsFor(project), modelDipakai: usedModel };
}
