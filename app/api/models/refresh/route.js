import { NextResponse } from "next/server";
import { refreshModelStatus } from "../../../../lib/modelStatus.js";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const cache = await refreshModelStatus();
    return NextResponse.json({ ok: true, checkedAt: cache.checkedAt, results: cache.results });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
