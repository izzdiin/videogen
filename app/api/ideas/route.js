import { NextResponse } from "next/server";
import { generateIdeas, suggestNextEpisodes, IDEA_CATEGORIES } from "../../../lib/ideas.js";
import { listSeries, listProjects } from "../../../lib/store.js";

export const dynamic = "force-dynamic";

// Generator Ide & Judul Otomatis.
// POST mode "viral" | "improv" | "series": ide baru dari generator.
// POST mode "next": usulan episode lanjutan untuk seri berjalan
// (seriesName wajib; daftar episode lama dibaca dari proyek sendiri).
// GET: katalog kategori + daftar seri yang sudah ada.
export async function GET() {
  return NextResponse.json({ categories: IDEA_CATEGORIES, seriesList: listSeries() });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const mode = ["viral", "improv", "series", "next"].includes(body.mode) ? body.mode : "improv";
  const audience = body.audience === "en" ? "en" : "id";
  const model = String(body.model || "");
  try {
    if (mode === "next") {
      const seriesName = String(body.seriesName || "").trim();
      if (!seriesName) {
        return NextResponse.json({ error: "Nama seri wajib diisi untuk usulan episode lanjutan." }, { status: 400 });
      }
      const existing = listProjects()
        .filter((p) => p.series?.name === seriesName)
        .sort((a, b) => (a.series.episode || 0) - (b.series.episode || 0));
      const seriesInfo = listSeries().find((s) => s.name === seriesName);
      const out = await suggestNextEpisodes({
        seriesName,
        concept: seriesInfo?.concept || "",
        existingTitles: existing.map((p) => p.title),
        count: body.count,
        audience,
        model,
      });
      out.nextEpisode = (existing.length ? Math.max(...existing.map((p) => p.series.episode || 0)) : 0) + 1;
      out.seriesName = seriesName;
      return NextResponse.json(out);
    }
    const out = await generateIdeas({
      mode,
      category: IDEA_CATEGORIES.includes(body.category) ? body.category : "Umum",
      count: body.count,
      seed: String(body.seed || "").slice(0, 300),
      audience,
      model,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
