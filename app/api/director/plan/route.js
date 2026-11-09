import { NextResponse } from "next/server";
import { planProduction } from "../../../../lib/director.js";

export const dynamic = "force-dynamic";

// AI Director: tema masuk, rencana produksi terstruktur (JSON) keluar.
// Tidak membuat proyek dan tidak merender apa pun — rencana diterapkan
// user ke formulir pembuatan proyek, lalu pipeline biasa yang bekerja.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const theme = String(body.theme || "").trim();
  if (theme.length < 8) {
    return NextResponse.json(
      { error: "Tema terlalu pendek — jelaskan idenya sedikit lebih panjang dulu." },
      { status: 400 }
    );
  }
  try {
    const plan = await planProduction({
      theme,
      audience: body.audience === "en" ? "en" : "id",
      model: String(body.model || ""),
    });
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
