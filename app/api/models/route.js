import { NextResponse } from "next/server";
import { modelsWithStatus } from "../../../lib/modelStatus.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await modelsWithStatus();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ models: [], error: String(e.message || e) });
  }
}
