import { NextResponse } from "next/server";
import { settingsView, saveSettings } from "../../../lib/settings.js";

export const dynamic = "force-dynamic";

// Keys are never echoed back: GET returns URLs/ids plus "is set" booleans.
export async function GET() {
  return NextResponse.json({ settings: settingsView() });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const patch = {};
  // URL / id fields: the form always submits the effective value it showed,
  // so a non-empty value simply becomes the stored override.
  for (const k of ["ninerouterBase", "bridgeBase", "cfAccountId"]) {
    if (typeof body[k] === "string" && body[k].trim()) patch[k] = body[k].trim();
  }
  // Key fields: empty means "keep the current one" — the browser never
  // receives the real key, so it cannot resubmit it.
  for (const k of ["ninerouterKey", "bridgeKey", "cfToken", "elevenlabsKey"]) {
    if (typeof body[k] === "string" && body[k].trim()) patch[k] = body[k].trim();
  }
  saveSettings(patch);
  return NextResponse.json({ settings: settingsView(), saved: true });
}
