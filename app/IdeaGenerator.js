"use client";
import { useEffect, useState } from "react";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-amber-400/60";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-white/50";

// Generator Ide & Judul Otomatis: tiga mode —
//  Viral (riset tren web nyata), Improv AI (improvisasi murni),
//  Series (konsep seri + episode berurutan), plus "Episode lanjutan"
//  untuk seri yang sudah berjalan. Memilih ide mengisi judul & tema
//  di CreateForm lewat callback onPick; mode series juga menyalakan
//  konteks seri di formulir itu.
export default function IdeaGenerator({ onPick, scriptModel, audience }) {
  const [mode, setMode] = useState("improv");
  const [categories, setCategories] = useState(["Umum"]);
  const [category, setCategory] = useState("Umum");
  const [seed, setSeed] = useState("");
  const [count, setCount] = useState("5");
  const [seriesList, setSeriesList] = useState([]);
  const [nextSeries, setNextSeries] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch("/api/ideas")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.categories)) setCategories(d.categories);
        if (Array.isArray(d.seriesList)) {
          setSeriesList(d.seriesList);
          if (d.seriesList.length) setNextSeries(d.seriesList[0].name);
        }
      })
      .catch(() => {});
  }, []);

  async function generate() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload =
        mode === "next"
          ? { mode, seriesName: nextSeries, count, audience, model: scriptModel }
          : { mode, category, seed, count, audience, model: scriptModel };
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generator ide gagal.");
      setResult({ ...data, mode });
    } catch (err) {
      setError(String(err.message || err));
    }
    setBusy(false);
  }

  const MODES = [
    ["viral", "🔥 Viral — riset tren hari ini"],
    ["improv", "🎲 Improv AI — ide segar dari AI"],
    ["series", "📺 Series — konsep seri + episode"],
    ["next", "⏭️ Episode lanjutan seri berjalan"],
  ];

  return (
    <div className="mb-4 rounded-xl border border-sky-400/30 bg-sky-400/5 p-4">
      <div className="text-sm font-semibold">💡 Generator Ide &amp; Judul Otomatis</div>
      <p className="mt-1 text-xs text-white/50">
        Kehabisan ide? Mode <b>Viral</b> membaca tren web hari ini (Google Trends Indonesia + berita) lalu menyaringnya jadi ide.
        Mode <b>Improv AI</b> berimprovisasi bebas. Mode <b>Series</b> merancang satu seri utuh dengan episode berurutan.
        Klik &quot;Pakai ide ini&quot; — judul &amp; tema terisi di formulir, lalu AI Director bisa menyusun rencana produksinya.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {MODES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            disabled={id === "next" && seriesList.length === 0}
            title={id === "next" && seriesList.length === 0 ? "Belum ada seri — buat dulu lewat mode Series" : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === id ? "bg-sky-400 text-black" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"} disabled:opacity-40`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {mode !== "next" ? (
          <div>
            <label className={labelCls}>Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className={labelCls}>Seri berjalan</label>
            <select value={nextSeries} onChange={(e) => setNextSeries(e.target.value)} className={inputCls}>
              {seriesList.map((s) => (
                <option key={s.name} value={s.name}>{s.name} ({s.count} episode)</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>{mode === "series" ? "Jumlah episode" : "Jumlah ide"}</label>
          <select value={count} onChange={(e) => setCount(e.target.value)} className={inputCls}>
            {[3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        {mode !== "next" && (
          <div>
            <label className={labelCls}>Benih ide (opsional)</label>
            <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={mode === "series" ? "mis. andai hewan bisa bicara" : "mis. tentang kopi"} className={inputCls} />
          </div>
        )}
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={generate}
          disabled={busy || (mode === "next" && !nextSeries)}
          className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-bold text-black hover:bg-sky-300 disabled:opacity-50"
        >
          {busy ? "Sedang berpikir..." : mode === "viral" ? "Riset Tren & Buat Ide" : mode === "series" ? "Rancang Seri" : mode === "next" ? "Usulkan Episode Lanjutan" : "Buat Ide"}
        </button>
        {mode === "viral" && <span className="ml-2 text-xs text-white/40">Riset web bisa ±30 detik.</span>}
      </div>
      {error && <div className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>}
      {result && (
        <div className="mt-3 space-y-2">
          {result.namaSeri && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-bold">📺 {result.namaSeri}</div>
              {result.konsep && <p className="mt-0.5 text-xs text-white/60">{result.konsep}</p>}
            </div>
          )}
          {result.mode === "viral" && result.sinyalDipakai ? (
            <p className="text-xs text-white/40">Disaring dari {result.sinyalDipakai} sinyal tren hari ini · model {result.modelDipakai}</p>
          ) : (
            <p className="text-xs text-white/40">Disusun oleh model {result.modelDipakai}</p>
          )}
          {(result.ideas || []).map((idea, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {(result.mode === "series" || result.mode === "next") && (
                      <span className="mr-2 rounded bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-300">
                        Eps {(result.nextEpisode || 1) + i}
                      </span>
                    )}
                    {idea.judul}
                  </div>
                  <p className="mt-1 text-xs text-white/60">{idea.tema}</p>
                  {idea.hook && <p className="mt-1 text-xs text-white/45">🎣 Hook: {idea.hook}</p>}
                  {idea.alasan && <p className="mt-0.5 text-xs text-white/35">{idea.alasan}</p>}
                  <p className="mt-1 text-[11px] text-white/30">
                    {idea.kategori}
                    {idea.sumber ? ` · dari tren: ${idea.sumber}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      idea,
                      series:
                        result.mode === "series"
                          ? { name: result.namaSeri, concept: result.konsep }
                          : result.mode === "next"
                            ? { name: result.seriesName || nextSeries, concept: "" }
                            : null,
                    })
                  }
                  className="shrink-0 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-emerald-400"
                >
                  Pakai ide ini
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
