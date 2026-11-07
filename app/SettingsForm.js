"use client";
import { useEffect, useState } from "react";

const inputCls =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-amber-400/60";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-white/50";

function Group({ title, desc, children }) {
  return (
    <section className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div>
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="mt-0.5 text-xs text-white/50">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function KeyField({ label, name, isSet, value, onChange }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="password"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={isSet ? "Sudah terisi — isi hanya bila ingin mengganti" : "Belum terisi"}
        autoComplete="new-password"
        className={inputCls}
      />
    </div>
  );
}

export default function SettingsForm() {
  const [view, setView] = useState(null);
  const [form, setForm] = useState({
    ninerouterBase: "",
    ninerouterKey: "",
    bridgeBase: "",
    bridgeKey: "",
    cfAccountId: "",
    cfToken: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function applyView(s) {
    setView(s);
    setForm((f) => ({
      ...f,
      ninerouterBase: s.ninerouterBase,
      bridgeBase: s.bridgeBase,
      cfAccountId: s.cfAccountId,
    }));
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => applyView(d.settings))
      .catch(() => setMsg("Gagal memuat pengaturan."));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan.");
      applyView(data.settings);
      setForm((f) => ({ ...f, ninerouterKey: "", bridgeKey: "", cfToken: "" }));
      setMsg("Tersimpan — langsung berlaku tanpa restart.");
    } catch (err) {
      setMsg(String(err.message || err));
    }
    setBusy(false);
  }

  if (!view) {
    return <p className="text-sm text-white/50">{msg || "Memuat pengaturan…"}</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Group
        title="9Router / gerbang AI (OpenAI-compatible)"
        desc="Sumber model naskah, daftar model, Gemini TTS, dan gambar SDXL. Ganti alamatnya untuk memakai gerbang atau penyedia AI lain yang kompatibel dengan API OpenAI."
      >
        <div>
          <label className={labelCls}>Base URL endpoint</label>
          <input
            name="ninerouterBase"
            value={form.ninerouterBase}
            onChange={set("ninerouterBase")}
            placeholder="http://192.168.11.11:20128/v1"
            className={inputCls}
          />
        </div>
        <KeyField
          label="API key"
          name="ninerouterKey"
          isSet={view.ninerouterKeySet}
          value={form.ninerouterKey}
          onChange={set("ninerouterKey")}
        />
      </Group>

      <Group
        title="Muse (bridge)"
        desc="Jalur gambar dan voice over yang dibuat Muse sendiri lewat muse-bridge, tanpa kuota penyedia lain."
      >
        <div>
          <label className={labelCls}>Base URL endpoint</label>
          <input
            name="bridgeBase"
            value={form.bridgeBase}
            onChange={set("bridgeBase")}
            placeholder="http://192.168.11.11:8765/v1"
            className={inputCls}
          />
        </div>
        <KeyField
          label="API key (secret bridge)"
          name="bridgeKey"
          isSet={view.bridgeKeySet}
          value={form.bridgeKey}
          onChange={set("bridgeKey")}
        />
      </Group>

      <Group
        title="Cloudflare Workers AI"
        desc="Penyedia gambar langsung ke Cloudflare (alternatif SDXL lewat 9Router)."
      >
        <div>
          <label className={labelCls}>Account ID</label>
          <input
            name="cfAccountId"
            value={form.cfAccountId}
            onChange={set("cfAccountId")}
            className={inputCls}
          />
        </div>
        <KeyField
          label="API token"
          name="cfToken"
          isSet={view.cfTokenSet}
          value={form.cfToken}
          onChange={set("cfToken")}
        />
      </Group>

      {msg && <p className="text-sm text-amber-300">{msg}</p>}
      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50"
        >
          {busy ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
      </div>
    </form>
  );
}
