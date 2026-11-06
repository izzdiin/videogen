"use client";
import { useEffect, useRef, useState } from "react";
import { VOICES, GEMINI_VOICES, MUSE_VOICES, isGeminiVoice, isClaudeVoice, defaultGeminiVoice, defaultClaudeVoice, defaultVoice } from "../lib/voices.js";
import { DC_ICONS } from "../lib/dc-icons.js";
import { VISUAL_STYLES } from "../lib/visualStyles.js";
import ModelPicker from "./ModelPicker.js";
import VoicePreview from "./VoicePreview.js";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-amber-400/60";
const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/50";
const btnCls = "rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-50";
const btnAmber = "rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50";

const STICK_PROPS = [
  ["bulb", "Bohlam ide"], ["note", "Catatan ide"], ["youtube", "YouTube"], ["camera", "Kamera"],
  ["clapper", "Clapper film"], ["calendar", "Kalender"], ["opensource", "Open source"], ["script", "Halaman naskah"],
];
const STICK_POSES = [[0, "Mencondong / berpikir"], [1, "Berdiri menyajikan"], [2, "Beraksi"]];
const STICK_SFX = [["", "Tanpa efek"], ["pop", "Pop"], ["tap", "Tap"], ["paper", "Kertas"], ["chime", "Chime"]];
const DC_KINDS = [["hook", "Pembuka (hook)"], ["problem", "Masalah"], ["result", "Hasil / rekap"]];
const DG_BADGES = [["green", "Hijau (aman / berhasil)"], ["orange", "Oranye (aktif / proses)"], ["red", "Merah (bahaya / peringatan)"], ["blue", "Biru (info)"], ["grey", "Abu (netral)"]];
const DG_COMPS = [["hp", "HP / ponsel"], ["bts", "Menara BTS"], ["server", "Server"], ["monitor", "Monitor / layar"], ["router", "Router"], ["cloud", "Cloud"], ["database", "Database"], ["orang", "Orang / pengguna"], ["rumah", "Rumah"], ["gembok", "Gembok / enkripsi"], ["chat", "Chat / pesan"], ["dokumen", "Dokumen"], ["kotak", "Kotak berlabel (umum)"], ["panel-surya", "Panel surya"], ["baterai", "Baterai"], ["bank", "Bank / gedung bank"], ["globe", "Globe / internet"], ["satelit", "Satelit"], ["mobil", "Mobil"], ["lampu", "Lampu / tiang lampu"]];
const DG_CABLES = [["blue", "Biru (alur normal)"], ["gold", "Emas (data disalin)"], ["red", "Merah (bahaya)"], ["green", "Hijau (aman)"], ["grey", "Abu (netral)"]];
const DG_STEPS = [["todo", "… belum"], ["ask", "? diproses / ditanya"], ["ok", "✓ selesai / disetujui"], ["bad", "✗ gagal / ditolak"]];
const ENGINE_LABEL = { darkcard: "Dark Card", slides: "Slides", diagram: "Diagram" };

function VoRecorder({ onDone, disabled }) {
  const [phase, setPhase] = useState("idle"); // idle | recording | ready
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const blobRef = useRef(null);
  const mimeRef = useRef("");

  const supported = typeof window !== "undefined" && Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  useEffect(() => cleanup, []);

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""].find(
        (m) => m === "" || window.MediaRecorder.isTypeSupported(m)
      );
      mimeRef.current = mime;
      const rec = new window.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        cleanup();
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        blobRef.current = blob;
        setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
        setPhase("ready");
      };
      recRef.current = rec;
      rec.start();
      const t0 = Date.now();
      setSecs(0);
      timerRef.current = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
      setPhase("recording");
    } catch (e) {
      cleanup();
      setErr("Mikrofon tidak bisa diakses. Izinkan akses mikrofon di browser, lalu coba lagi.");
      setPhase("idle");
    }
  }

  function useRecording() {
    if (!blobRef.current) return;
    const ext = (mimeRef.current || "").includes("mp4") ? "m4a" : "webm";
    const file = new File([blobRef.current], `rekaman.${ext}`, { type: blobRef.current.type || "audio/webm" });
    onDone(file);
    setPhase("idle");
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return ""; });
    blobRef.current = null;
  }

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  if (!supported) {
    return <span className="text-[11px] text-white/35" title="Perekaman langsung butuh browser modern dan alamat HTTPS">Rekam: butuh HTTPS</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {phase === "idle" && (
        <button onClick={start} disabled={disabled} className={btnCls}>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-400 align-middle" /> Rekam
        </button>
      )}
      {phase === "recording" && (
        <button onClick={() => recRef.current?.stop()} className="rounded-lg bg-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/35">
          <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-red-400 align-middle" /> Berhenti ({mmss})
        </button>
      )}
      {phase === "ready" && (
        <>
          <audio controls src={url} className="h-9 max-w-[180px]" />
          <button onClick={useRecording} disabled={disabled} className={btnCls}>Pakai rekaman ini</button>
          <button onClick={() => { setPhase("idle"); blobRef.current = null; }} className={btnCls}>Ulangi</button>
        </>
      )}
      {err && <span className="w-full text-[11px] text-red-300">{err}</span>}
    </span>
  );
}

function Section({ no, title, desc, children }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-black">{no}</span>
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {desc && <p className="mt-1 text-xs text-white/50">{desc}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ProjectWizard({ initial }) {
  const [project, setProject] = useState(initial);
  const [scenes, setScenes] = useState(initial.scenes);
  const [exec, setExec] = useState(initial.executors);
  const [dcCfg, setDcCfg] = useState(initial.darkcard || { watermark: "", accent: "#F26D8D" });
  const [dgCfg, setDgCfg] = useState(initial.diagram || { watermark: "", accent: "#E4572E" });
  const [stickStyle, setStickStyle] = useState(initial.stickStyle || "B1");
  const [visualStyle, setVisualStyle] = useState(initial.visualStyle || "bebas");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const id = initial.id;
  const jobRunning = project.job?.status === "running";
  const jobStale =
    jobRunning &&
    project.job?.at &&
    Date.now() - new Date(project.job.at).getTime() > 10 * 60 * 1000;
  // Tombol-tombol tahap hanya terkunci selama pekerjaan sungguh berjalan;
  // pekerjaan fosil (status running tapi cap waktunya basi, mis. container
  // restart di tengah render) harus bisa dilanjutkan lagi dari UI.
  const jobBusy = jobRunning && !jobStale;

  const fileUrl = (rel) => `/api/projects/${id}/files/${rel}`;

  async function refresh() {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setProject(data.project);
    setExec(data.project.executors);
    if (!dirtyRef.current) setScenes(data.project.scenes);
  }
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!jobRunning) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobRunning]);

  function applyAssetUpdate(respProject) {
    setProject(respProject);
    setScenes((prev) =>
      prev.map((s) => {
        const fresh = respProject.scenes.find((x) => x.id === s.id);
        return fresh ? { ...s, image: fresh.image, vo: fresh.vo } : s;
      })
    );
  }

  async function call(key, fn) {
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  }

  async function jsonFetch(url, method, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  const saveScenes = () =>
    call("saveScenes", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { scenes });
      setProject(data.project);
      setScenes(data.project.scenes);
      setDirty(false);
    });

  const saveExecutors = () =>
    call("saveExec", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { executors: exec });
      setProject(data.project);
    });

  const saveDc = () =>
    call("saveDc", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { darkcard: dcCfg });
      setProject(data.project);
      setDcCfg(data.project.darkcard || dcCfg);
    });

  const saveDg = () =>
    call("saveDg", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { diagram: dgCfg });
      setProject(data.project);
      setDgCfg(data.project.diagram || dgCfg);
    });

  const saveStick = () =>
    call("saveStick", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { stickStyle });
      setProject(data.project);
      setStickStyle(data.project.stickStyle || stickStyle);
    });

  const saveVisual = () =>
    call("saveVisual", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { visualStyle });
      setProject(data.project);
      setVisualStyle(data.project.visualStyle || visualStyle);
    });

  const genScript = () =>
    call("script", async () => {
      const data = await jsonFetch(`/api/projects/${id}/script`, "POST", { model: exec.scriptModel });
      setProject(data.project);
      setScenes(data.project.scenes);
      setDirty(false);
    });

  const addScene = () =>
    call("addScene", async () => {
      if (dirty) await jsonFetch(`/api/projects/${id}`, "PATCH", { scenes });
      const data = await jsonFetch(`/api/projects/${id}/scenes`, "POST", {});
      setProject(data.project);
      setScenes(data.project.scenes);
      setDirty(false);
    });

  function editScene(idx, field, value) {
    setScenes((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
    setDirty(true);
  }
  function editDc(idx, field, value) {
    setScenes((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, dc: { ...(s.dc || {}), [field]: value } } : s))
    );
    setDirty(true);
  }
  function editDg(idx, field, value) {
    setScenes((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, dg: { ...(s.dg || {}), [field]: value } } : s))
    );
    setDirty(true);
  }
  function editDcCard(idx, field, value) {
    setScenes((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, dc: { ...(s.dc || {}), card: { icon: "file", label: "", note: "", ...((s.dc || {}).card || {}), [field]: value } } } : s))
    );
    setDirty(true);
  }
  function editStick(idx, field, value) {
    setScenes((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, stick: { ...(s.stick || {}), [field]: value } } : s))
    );
    setDirty(true);
  }
  function removeScene(idx) {
    setScenes((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }
  function moveScene(idx, dir) {
    setScenes((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setDirty(true);
  }

  const genImage = (scene) =>
    call("img-" + scene.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/scenes/${scene.id}/image`, "POST", {});
      applyAssetUpdate(data.project);
    });

  const genVo = (scene) =>
    call("vo-" + scene.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/scenes/${scene.id}/vo`, "POST", { voice: exec.voice });
      applyAssetUpdate(data.project);
    });

  async function uploadAsset(scene, kind, file) {
    if (!file) return;
    await call(`${kind}-${scene.id}`, async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${id}/scenes/${scene.id}/${kind}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyAssetUpdate(data.project);
    });
  }

  const render = (kind) =>
    call("render-" + kind, async () => {
      if (dirty) throw new Error("Simpan dulu perubahan naskah sebelum merender.");
      await jsonFetch(`/api/projects/${id}/render`, "POST", { kind });
      await refresh();
    });

  const runAuto = () =>
    call("auto", async () => {
      await jsonFetch(`/api/projects/${id}/auto`, "POST", {});
      await refresh();
    });

  const removeProject = () =>
    call("delete", async () => {
      if (!confirm("Hapus proyek ini beserta semua asetnya?")) return;
      await jsonFetch(`/api/projects/${id}`, "DELETE");
      window.location.href = "/";
    });

  const staleBadge = (asset) =>
    asset?.stale ? (
      <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">perlu dibuat ulang</span>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">{project.theme}</p>
          <div className="mt-2 flex gap-2 text-xs text-white/50">
            <span className="rounded bg-white/10 px-2 py-0.5 uppercase">{project.audience === "en" ? "English" : "Indonesia"}</span>
            <span className="rounded bg-white/10 px-2 py-0.5">{project.engine === "stickman" ? `Stickman ${project.stickStyle || "B1"}` : ENGINE_LABEL[project.engine] || "Slides"}</span>
            <span className="rounded bg-white/10 px-2 py-0.5">{project.aspect || "9:16"}</span>
            <span className="rounded bg-white/10 px-2 py-0.5">target {project.targetDuration} dtk</span>
            <span className="rounded bg-white/10 px-2 py-0.5">{scenes.length} scene</span>
          </div>
        </div>
        <button onClick={removeProject} disabled={busy === "delete"} className="text-xs text-red-300/70 hover:text-red-300">
          Hapus proyek
        </button>
      </div>

      {project.job && project.job.status === "running" && (
        <div className="rounded-lg bg-sky-500/15 px-3 py-2 text-sm text-sky-200">
          Sedang bekerja — tahap {project.job.step}: {project.job.message}
        </div>
      )}
      {jobStale && (
        <div className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
          Pekerjaan ini tampaknya terhenti (tidak ada kemajuan lebih dari 10 menit). Klik "Jalankan otomatis sampai MP4" untuk melanjutkannya dari tahap terakhir yang selesai.
        </div>
      )}
      {project.job && project.job.status === "error" && (
        <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
          Pekerjaan terakhir gagal di tahap {project.job.step}: {project.job.message}
        </div>
      )}
      {error && <div className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>}

      {/* Eksekutor */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-base font-bold">Eksekutor tahap</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Model naskah (9Router)</label>
            <ModelPicker value={exec.scriptModel || ""} onChange={(v) => setExec({ ...exec, scriptModel: v })} />
          </div>
          <div>
            <label className={labelCls}>Mesin VO</label>
            <select value={exec.voProvider || "edge-tts"} onChange={(e) => {
              const p = e.target.value;
              setExec({ ...exec, voProvider: p, voice: p === "gemini-tts" ? defaultGeminiVoice() : p === "muse-bridge" ? defaultClaudeVoice() : ((isGeminiVoice(exec.voice) || isClaudeVoice(exec.voice)) ? defaultVoice(project.audience) : exec.voice) });
            }} className={inputCls}>
              <option value="edge-tts">edge-tts</option>
              <option value="gemini-tts">Gemini TTS (ekspresif)</option>
              <option value="muse-bridge">Muse (bridge) — dibacakan Muse, tanpa kuota</option>
              <option value="upload">Unggah manual</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Suara VO</label>
            <select value={exec.voice} onChange={(e) => setExec({ ...exec, voice: e.target.value })} className={inputCls}>
              {((exec.voProvider || "edge-tts") === "gemini-tts" ? GEMINI_VOICES : (exec.voProvider || "edge-tts") === "muse-bridge" ? MUSE_VOICES : VOICES[project.audience]).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <VoicePreview voice={exec.voice} provider={exec.voProvider || "edge-tts"} />
          </div>
          <div>
            <label className={labelCls}>{project.engine === "stickman" && ["B2", "B3"].includes(project.stickStyle || "B1") ? `Ilustrasi scene ${project.stickStyle}` : "Gambar latar"}</label>
            <select value={exec.imageProvider} onChange={(e) => setExec({ ...exec, imageProvider: e.target.value })} className={inputCls} disabled={project.engine === "darkcard" || project.engine === "diagram" || (project.engine === "stickman" && (project.stickStyle || "B1") === "B1")}>
              <option value="pollinations">Pollinations (gratis)</option>
              <option value="sdxl-9router">Cloudflare SDXL via 9Router</option>
              <option value="muse-bridge">Muse (bridge) — dibuat Muse, lambat</option>
              <option value="upload">Unggah manual</option>
            </select>
            {project.engine === "stickman" && ["B2", "B3"].includes(project.stickStyle || "B1") && (
              <p className="mt-1 text-xs text-white/40">Berlaku untuk ilustrasi tiap scene {project.stickStyle} (tahap 2). Jangan lupa klik Simpan pengaturan.</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Perakitan</label>
            <select value={exec.assembly} onChange={(e) => setExec({ ...exec, assembly: e.target.value })} className={inputCls}>
              <option value="server">Di server (ffmpeg)</option>
              <option value="export">Ekspor paket (rakit manual)</option>
            </select>
          </div>
        </div>
        {project.engine === "stickman" && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <label className={labelCls}>Gaya stickman</label>
            <div className="flex flex-wrap items-center gap-2">
              <select value={stickStyle} onChange={(e) => setStickStyle(e.target.value)} className={inputCls + " max-w-md"}>
                <option value="B1">B1 — Minimal hitam-putih (pose + properti crayon)</option>
                <option value="B2">B2 — Colorful hand-drawn (ilustrasi warna per scene)</option>
                <option value="B3">B3 — Retro TV (siluet putih/abu + finish TV)</option>
              </select>
              <button onClick={saveStick} disabled={busy === "saveStick"} className={btnCls}>Simpan gaya</button>
            </div>
            <p className="mt-1 text-xs text-white/40">
              {stickStyle === "B3"
                ? "B3: setiap scene dirender dari ilustrasi siluet putih/abu satu frame penuh (dibuat di tahap 2) + judul uppercase + finish televisi analog. Naskah gaya lain perlu dibuat ulang agar punya arahan gambar per scene."
                : stickStyle === "B2"
                ? "B2: setiap scene dirender dari ilustrasi warna satu frame penuh (dibuat di tahap 2) + judul tulisan tangan. Naskah yang sudah ada gaya B1 perlu dibuat ulang agar punya arahan gambar per scene."
                : "B1: figur digambar dari pose atlas + properti crayon yang dipilih di tahap 1."}
            </p>
          </div>
        )}
        {project.engine === "slides" && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <label className={labelCls}>Gaya visual (katalog Style 1–5)</label>
            <div className="flex flex-wrap items-center gap-2">
              <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className={inputCls + " max-w-md"}>
                {VISUAL_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <button onClick={saveVisual} disabled={busy === "saveVisual"} className={btnCls}>Simpan gaya</button>
            </div>
            <p className="mt-1 text-xs text-white/40">
              Preset mengarahkan prompt gambar tiap scene dan catatan gaya untuk penulis naskah. Berlaku untuk gambar yang dibuat setelah perubahan; gambar yang sudah jadi tidak berubah — generate ulang gambarnya untuk menerapkan gaya baru.
            </p>
          </div>
        )}
        {project.engine === "darkcard" && (
          <div className="mt-4 grid gap-3 border-t border-white/10 pt-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>Watermark Dark Card (bebas, boleh kosong)</label>
              <input value={dcCfg.watermark || ""} onChange={(e) => setDcCfg({ ...dcCfg, watermark: e.target.value })} placeholder="mis. @handleku | situsku.com" className={inputCls} />
              <p className="mt-1 text-xs text-white/40">Teks kecil di dasar video — identitas kanalmu sendiri.</p>
            </div>
            <div>
              <label className={labelCls}>Warna aksen Dark Card</label>
              <div className="flex items-center gap-2">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(dcCfg.accent || "") ? dcCfg.accent : "#F26D8D"} onChange={(e) => setDcCfg({ ...dcCfg, accent: e.target.value })} className="h-10 w-24 cursor-pointer rounded-lg border border-white/15 bg-white/5 px-1 py-1" />
                <button onClick={saveDc} disabled={busy === "saveDc"} className={btnCls}>Simpan watermark & aksen</button>
              </div>
              <p className="mt-1 text-xs text-white/40">Chip label, garis kartu terbaru, dan sorotan caption memakai warna ini.</p>
            </div>
          </div>
        )}
        {project.engine === "diagram" && (
          <div className="mt-4 grid gap-3 border-t border-white/10 pt-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>Watermark Diagram (bebas, boleh kosong)</label>
              <input value={dgCfg.watermark || ""} onChange={(e) => setDgCfg({ ...dgCfg, watermark: e.target.value })} placeholder="mis. @handleku" className={inputCls} />
              <p className="mt-1 text-xs text-white/40">Teks kecil di bawah subtitle — identitas kanalmu sendiri.</p>
            </div>
            <div>
              <label className={labelCls}>Warna aksen Diagram</label>
              <div className="flex items-center gap-2">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(dgCfg.accent || "") ? dgCfg.accent : "#E4572E"} onChange={(e) => setDgCfg({ ...dgCfg, accent: e.target.value })} className="h-10 w-24 cursor-pointer rounded-lg border border-white/15 bg-white/5 px-1 py-1" />
                <button onClick={saveDg} disabled={busy === "saveDg"} className={btnCls}>Simpan pengaturan Diagram</button>
              </div>
              <p className="mt-1 text-xs text-white/40">Kata kunci pada headline tiap seksi memakai warna ini.</p>
            </div>
            <div>
              <label className={labelCls}>Tema Diagram</label>
              <select value={dgCfg.theme || "light"} onChange={(e) => setDgCfg({ ...dgCfg, theme: e.target.value })} className={inputCls}>
                <option value="light">Terang — kanvas krem (gaya asli)</option>
                <option value="dark">Gelap — kanvas gelap</option>
              </select>
              <p className="mt-1 text-xs text-white/40">Tema gelap memakai diagram pucat di atas kanvas gelap; komponen dan warna kabel tetap sama.</p>
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={saveExecutors} disabled={busy === "saveExec"} className={btnCls}>Simpan pengaturan</button>
          <button onClick={runAuto} disabled={busy === "auto" || jobBusy} className={btnAmber}>
            {busy === "auto" ? "Memulai..." : jobBusy ? "Sedang berjalan…" : "Jalankan otomatis sampai MP4"}
          </button>
          <span className="self-center text-xs text-white/40">Mode otomatis: naskah → gambar → VO → render final, tanpa koreksi di tengah.</span>
        </div>
      </section>

      {/* Tahap 1 */}
      <Section no={1} title="Naskah & prompt" desc="Buat naskah dengan model terpilih, lalu koreksi bebas: ubah teks, hapus scene, tambah scene, geser urutan. Simpan sebelum lanjut.">
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={genScript} disabled={busy === "script" || jobBusy} className={btnAmber}>
            {busy === "script" ? "Menulis naskah..." : scenes.length ? "Buat ulang naskah" : "Buat naskah"}
          </button>
          <button onClick={addScene} disabled={busy === "addScene"} className={btnCls}>+ Tambah scene</button>
          <button onClick={saveScenes} disabled={busy === "saveScenes" || !dirty} className={btnCls}>
            {dirty ? "Simpan perubahan *" : "Tersimpan"}
          </button>
        </div>
        <div className="space-y-3">
          {scenes.map((s, i) => (
            <div key={s.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300">SCENE {i + 1}</span>
                <span className="flex gap-1">
                  <button onClick={() => moveScene(i, -1)} className={btnCls}>↑</button>
                  <button onClick={() => moveScene(i, 1)} className={btnCls}>↓</button>
                  <button onClick={() => removeScene(i)} className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25">Hapus</button>
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Judul scene</label>
                  <input value={s.title} onChange={(e) => editScene(i, "title", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{project.engine === "stickman" ? "Teks layar baris 1 (judul besar tulisan tangan)" : project.engine === "darkcard" ? "Judul layar (mono, maks 3 kata)" : project.engine === "diagram" ? "Headline seksi (judul besar di atas diagram)" : "Teks overlay (judul besar di video)"}</label>
                  <input value={s.overlay} onChange={(e) => editScene(i, "overlay", e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelCls}>Narasi (dibacakan VO, jadi subtitle)</label>
                <textarea rows={3} value={s.narration} onChange={(e) => editScene(i, "narration", e.target.value)} className={inputCls} />
              </div>
              {project.engine === "stickman" && ["B2", "B3"].includes(project.stickStyle || "B1") ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>Teks layar baris 2 (aksen merah, opsional)</label>
                    <input value={s.stick?.lines?.[1] || ""} onChange={(e) => editStick(i, "lines", [s.overlay || "", e.target.value])} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Efek suara awal scene</label>
                    <select value={s.stick?.sfx || ""} onChange={(e) => editStick(i, "sfx", e.target.value || null)} className={inputCls}>
                      {STICK_SFX.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Arahan ilustrasi scene (Inggris, satu frame penuh)</label>
                    <textarea rows={2} value={s.imagePrompt} onChange={(e) => editScene(i, "imagePrompt", e.target.value)} placeholder="mis. wide shot of a small kitchen in the morning, the stick figure sits at a wooden table staring at a phone, a cup of coffee beside it" className={inputCls} />
                    <p className="mt-1 text-xs text-white/40">{project.stickStyle === "B3" ? "Gaya siluet putih/abu di bidang gelap + finish TV ditambahkan otomatis saat gambar dibuat di tahap 2. Usahakan komposisi & skala fokus berbeda antar-scene." : "Gaya warna hand-drawn kertas krem ditambahkan otomatis saat gambar dibuat di tahap 2. Usahakan lokasi & sudut pandang berbeda antar-scene."}</p>
                  </div>
                </div>
              ) : project.engine === "stickman" ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>Teks layar baris 2 (aksen merah, opsional)</label>
                    <input value={s.stick?.lines?.[1] || ""} onChange={(e) => editStick(i, "lines", [s.overlay || "", e.target.value])} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Pose stickman</label>
                    <select value={s.stick?.pose ?? 1} onChange={(e) => editStick(i, "pose", Number(e.target.value))} className={inputCls}>
                      {STICK_POSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Properti 1 (crayon)</label>
                    <select value={s.stick?.props?.[0] || ""} onChange={(e) => editStick(i, "props", [e.target.value, s.stick?.props?.[1] || ""].filter(Boolean))} className={inputCls}>
                      <option value="">Tidak ada</option>
                      {STICK_PROPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Properti 2 (crayon)</label>
                    <select value={s.stick?.props?.[1] || ""} onChange={(e) => editStick(i, "props", [s.stick?.props?.[0] || "", e.target.value].filter(Boolean))} className={inputCls}>
                      <option value="">Tidak ada</option>
                      {STICK_PROPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Efek suara awal scene</label>
                    <select value={s.stick?.sfx || ""} onChange={(e) => editStick(i, "sfx", e.target.value || null)} className={inputCls}>
                      {STICK_SFX.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Properti khusus (prompt Inggris, opsional)</label>
                    <input value={s.stick?.customPrompt || ""} onChange={(e) => editStick(i, "customPrompt", e.target.value)} placeholder="mis. a piggy bank — digambar SDXL gaya crayon" className={inputCls} />
                  </div>
                </div>
              ) : project.engine === "darkcard" ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>Jenis scene</label>
                    <select value={s.dc?.kind || ""} onChange={(e) => editDc(i, "kind", e.target.value)} className={inputCls}>
                      <option value="">Otomatis (pertama = pembuka, terakhir = hasil)</option>
                      {DC_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Label chip (kosong = bawaan jenis)</label>
                    <input value={s.dc?.chip || ""} onChange={(e) => editDc(i, "chip", e.target.value)} placeholder="mis. MASALAH" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Ikon kartu baru scene ini</label>
                    <select value={s.dc?.card?.icon || "file"} onChange={(e) => editDcCard(i, "icon", e.target.value)} className={inputCls}>
                      {DC_ICONS.map((ic) => <option key={ic.id} value={ic.id}>{ic.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Label kartu baru (kosong = scene tanpa kartu)</label>
                    <input value={s.dc?.card?.label || ""} onChange={(e) => editDcCard(i, "label", e.target.value)} placeholder="mis. API key di luar kode" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Catatan kanan kartu</label>
                    <input value={s.dc?.card?.note || ""} onChange={(e) => editDcCard(i, "note", e.target.value)} placeholder="mis. ENVIRONMENT VARIABLE" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Frasa sorotan caption (harus ada di narasi)</label>
                    <input value={s.dc?.highlight || ""} onChange={(e) => editDc(i, "highlight", e.target.value)} placeholder="mis. di luar kode" className={inputCls} />
                  </div>
                </div>
              ) : project.engine === "diagram" ? (
                <div className="mt-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className={labelCls}>Kata aksen headline (diwarnai, harus ada di headline)</label>
                      <input value={s.dg?.accent || ""} onChange={(e) => editDg(i, "accent", e.target.value)} placeholder="mis. TIDAK" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Teks pil status (kanan atas, maks 3 kata)</label>
                      <input value={s.dg?.badge || ""} onChange={(e) => editDg(i, "badge", e.target.value)} placeholder="mis. HP AMAN" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Warna pil status</label>
                      <select value={s.dg?.badgeColor || "grey"} onChange={(e) => editDg(i, "badgeColor", e.target.value)} className={inputCls}>
                        {DG_BADGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Subjek tracker (diisi di scene 1, tampil terus)</label>
                      <input value={s.dg?.trackerLabel || ""} onChange={(e) => editDg(i, "trackerLabel", e.target.value)} placeholder="mis. 08xx-xxxx-2211" className={inputCls} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white/70">Langkah tracker scene ini</span>
                      <button type="button" onClick={() => editDg(i, "steps", [...(Array.isArray(s.dg?.steps) ? s.dg.steps : []), { label: "", state: "ask" }])} disabled={(Array.isArray(s.dg?.steps) ? s.dg.steps : []).length >= 3} className={btnCls}>+ Langkah</button>
                    </div>
                    {(Array.isArray(s.dg?.steps) ? s.dg.steps : []).map((st, k) => (
                      <div key={k} className="mt-2 flex flex-wrap items-center gap-2">
                        <input value={st.label || ""} onChange={(e) => { const steps = [...s.dg.steps]; steps[k] = { ...steps[k], label: e.target.value }; editDg(i, "steps", steps); }} placeholder="mis. IZIN" style={{ width: 130 }} className={inputCls} />
                        <select value={st.state || "todo"} onChange={(e) => { const steps = [...s.dg.steps]; steps[k] = { ...steps[k], state: e.target.value }; editDg(i, "steps", steps); }} style={{ width: 210 }} className={inputCls}>
                          {DG_STEPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button type="button" onClick={() => editDg(i, "steps", s.dg.steps.filter((_, x) => x !== k))} className={btnCls}>Hapus</button>
                      </div>
                    ))}
                    <p className="mt-1 text-xs text-white/40">Label yang sama di scene berikutnya memperbarui status langkah itu. Maksimal 5 langkah tampil per video.</p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className={labelCls}>Judul kartu data (kosong = tanpa kartu)</label>
                      <input value={s.dg?.card?.title || ""} onChange={(e) => { const lines = s.dg?.card?.lines || []; const t = e.target.value; editDg(i, "card", (t || lines.some((l) => String(l).trim())) ? { title: t, lines } : null); }} placeholder="mis. SALINAN" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Baris kartu data (satu baris teks per baris, maks 4)</label>
                      <textarea rows={3} value={(s.dg?.card?.lines || []).join("\n")} onChange={(e) => { const lines = e.target.value.split("\n").slice(0, 4); const t = s.dg?.card?.title || ""; editDg(i, "card", (t || lines.some((l) => l.trim())) ? { title: t, lines } : null); }} placeholder={"dari: 08xx-2211\njam: 21.03"} className={inputCls} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-white/70">Perintah diagram</span>
                      <button type="button" onClick={() => editDg(i, "ops", [...(Array.isArray(s.dg?.ops) ? s.dg.ops : []), { op: "add", comp: "kotak", id: "", label: "" }])} className={btnCls}>+ Komponen</button>
                      <button type="button" onClick={() => editDg(i, "ops", [...(Array.isArray(s.dg?.ops) ? s.dg.ops : []), { op: "connect", from: "", to: "", color: "blue" }])} className={btnCls}>+ Kabel</button>
                      <button type="button" onClick={() => editDg(i, "ops", [...(Array.isArray(s.dg?.ops) ? s.dg.ops : []), { op: "focus", target: "all" }])} className={btnCls}>+ Fokus</button>
                    </div>
                    {(Array.isArray(s.dg?.ops) ? s.dg.ops : []).map((op, k) => {
                      const ops = Array.isArray(s.dg?.ops) ? s.dg.ops : [];
                      const setOp = (patch) => { const next = [...ops]; next[k] = { ...next[k], ...patch }; editDg(i, "ops", next); };
                      const setType = (t) => { const next = [...ops]; next[k] = t === "add" ? { op: "add", comp: "kotak", id: "", label: "" } : t === "connect" ? { op: "connect", from: "", to: "", color: "blue" } : { op: "focus", target: "all" }; editDg(i, "ops", next); };
                      return (
                        <div key={k} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
                          <select value={op.op} onChange={(e) => setType(e.target.value)} style={{ width: 120 }} className={inputCls}>
                            <option value="add">Tambah</option>
                            <option value="connect">Kabel</option>
                            <option value="focus">Fokus</option>
                          </select>
                          {op.op === "add" && (<>
                            <select value={op.comp || "kotak"} onChange={(e) => setOp({ comp: e.target.value })} style={{ width: 180 }} className={inputCls}>
                              {DG_COMPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            <input value={op.id || ""} onChange={(e) => setOp({ id: e.target.value })} placeholder="id unik, mis. bts" style={{ width: 140 }} className={inputCls} />
                            <input value={op.label || ""} onChange={(e) => setOp({ label: e.target.value })} placeholder="label di bawah komponen" style={{ width: 200 }} className={inputCls} />
                          </>)}
                          {op.op === "connect" && (<>
                            <input value={op.from || ""} onChange={(e) => setOp({ from: e.target.value })} placeholder="dari id" style={{ width: 120 }} className={inputCls} />
                            <span className="text-white/40">→</span>
                            <input value={op.to || ""} onChange={(e) => setOp({ to: e.target.value })} placeholder="ke id" style={{ width: 120 }} className={inputCls} />
                            <select value={op.color || "blue"} onChange={(e) => setOp({ color: e.target.value })} style={{ width: 180 }} className={inputCls}>
                              {DG_CABLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </>)}
                          {op.op === "focus" && (
                            <input value={op.target || ""} onChange={(e) => setOp({ target: e.target.value })} placeholder="id komponen atau all" style={{ width: 200 }} className={inputCls} />
                          )}
                          <button type="button" onClick={() => editDg(i, "ops", ops.filter((_, x) => x !== k))} className={btnCls}>Hapus</button>
                        </div>
                      );
                    })}
                    <p className="mt-1 text-xs text-white/40">Komponen muncul sekali lalu menetap; id harus sama persis dengan yang dirujuk kabel/fokus. Tanpa perintah fokus, kamera mengikuti komponen terbaru.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <label className={labelCls}>Prompt gambar latar (Inggris)</label>
                  <textarea rows={2} value={s.imagePrompt} onChange={(e) => editScene(i, "imagePrompt", e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          ))}
          {scenes.length === 0 && <p className="text-sm text-white/50">Belum ada naskah. Klik "Buat naskah" atau tambah scene manual.</p>}
        </div>
      </Section>

      {/* Tahap 2 */}
      <Section no={2} title={project.engine === "stickman" ? (["B2", "B3"].includes(project.stickStyle || "B1") ? "Ilustrasi scene" : "Properti & pose") : project.engine === "darkcard" ? "Tumpukan kartu" : project.engine === "diagram" ? "Diagram" : "Gambar latar"} desc={project.engine === "stickman" ? ((project.stickStyle || "B1") === "B3" ? "Setiap scene B3 adalah ilustrasi siluet putih/abu satu frame penuh (SDXL) di bidang nyaris hitam dari arahan gambar di tahap 1, atau unggah ilustrasimu sendiri. Tanpa ilustrasi, scene tampil sebagai judul di atas bidang gelap." : (project.stickStyle || "B1") === "B2" ? "Setiap scene B2 adalah ilustrasi warna satu frame penuh (SDXL, gaya hand-drawn di kertas krem) dari arahan gambar di tahap 1, atau unggah ilustrasimu sendiri. Tanpa ilustrasi, scene tampil sebagai judul di atas kertas krem." : "Mode stickman digambar dari pose karakter dan properti crayon bawaan B1 yang dipilih di tahap 1. Properti khusus dibuat otomatis (SDXL gaya crayon) saat mode otomatis berjalan atau sebelum render.") : project.engine === "darkcard" ? "Dark Card tidak memakai gambar: setiap scene menambah satu kartu ke tumpukan yang tampil terus. Urutan tumpukan mengikuti urutan scene; kartu diatur di tahap 1." : project.engine === "diagram" ? "Diagram tidak memakai gambar: satu diagram vektor dibangun bertahap — komponen muncul dan tersambung kabel mengikuti perintah tiap scene dari tahap 1, kamera menyapu ke bagian yang baru. Ringkasan keadaan diagram per scene:" : "Generate per scene dari prompt di tahap 1, atau unggah gambar sendiri (potret 9:16 disarankan)."}>
        {dirty && <p className="mb-2 text-xs text-amber-300">Ada perubahan naskah belum disimpan — generate memakai prompt yang tersimpan di server.</p>}
        {project.engine === "stickman" && (project.stickStyle || "B1") === "B1" ? (
          <div className="space-y-2">
            {scenes.map((s, i) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <span className="text-xs font-bold text-amber-300">SCENE {i + 1}</span>
                <span className="text-xs text-white/60">
                  Pose: {STICK_POSES.find(([v]) => v === (s.stick?.pose ?? 1))?.[1] || "-"} ·
                  Properti: {(s.stick?.props?.length ? s.stick.props.map((p) => STICK_PROPS.find(([v]) => v === p)?.[1] || p).join(", ") : "tidak ada")}
                  {s.stick?.customPrompt ? ` · khusus: "${s.stick.customPrompt}"` : ""}
                </span>
                {s.stick?.customFile ? (
                  <img src={fileUrl(s.stick.customFile)} alt={`Properti scene ${i + 1}`} className="h-16 w-16 rounded bg-white object-contain" />
                ) : s.stick?.customPrompt ? (
                  <span className="text-xs text-white/40">properti khusus belum dibuat — jalankan mode otomatis atau render final</span>
                ) : null}
              </div>
            ))}
            {scenes.length === 0 && <p className="text-sm text-white/50">Belum ada naskah.</p>}
          </div>
        ) : project.engine === "darkcard" ? (
          <div className="space-y-2">
            {(() => {
              const stack = [];
              return scenes.map((s, i) => {
                if (s.dc?.card?.label) stack.push({ ...s.dc.card, scene: i + 1 });
                return (
                  <div key={s.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="text-xs font-bold text-amber-300">SCENE {i + 1}</span>
                    <span className="ml-2 text-xs text-white/60">
                      {s.dc?.card?.label ? `menambah kartu "${s.dc.card.label}"` : "tanpa kartu baru"}
                    </span>
                    {stack.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {stack.map((c, k) => (
                          <div key={k} className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${c.scene === i + 1 ? "border-amber-400/50 text-white" : "border-white/10 text-white/50"}`}>
                            <span className="font-semibold">{DC_ICONS.find((x) => x.id === c.icon)?.label || c.icon}</span>
                            <span>{c.label}</span>
                            {c.note && <span className="ml-auto text-white/40">{c.note}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            {scenes.length === 0 && <p className="text-sm text-white/50">Belum ada naskah.</p>}
          </div>
        ) : project.engine === "diagram" ? (
          <div className="space-y-2">
            {(() => {
              const have = new Map();
              const links = [];
              const stepMap = new Map();
              let subject = "";
              return scenes.map((s, i) => {
                const ops = Array.isArray(s.dg?.ops) ? s.dg.ops : [];
                const news = [];
                for (const op of ops) {
                  if (op.op === "add" && op.id && !have.has(op.id)) {
                    have.set(op.id, op);
                    news.push(`${op.comp}${op.label ? ` "${op.label}"` : ""}`);
                  }
                  if (op.op === "connect") links.push(`${op.from} → ${op.to}`);
                }
                if (s.dg?.trackerLabel) subject = s.dg.trackerLabel;
                for (const st of Array.isArray(s.dg?.steps) ? s.dg.steps : []) {
                  if (st?.label) stepMap.set(st.label.toLowerCase(), st);
                }
                const stepLine = [...stepMap.values()].map((st) => `${st.label} ${{ ok: "✓", bad: "✗", ask: "?", todo: "…" }[st.state] || ""}`).join(" · ");
                return (
                  <div key={s.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <span className="text-xs font-bold text-amber-300">SCENE {i + 1}</span>
                    <span className="ml-2 text-xs text-white/60">
                      {news.length ? `menambah komponen ${news.join(", ")}` : "tanpa komponen baru"}
                      {s.dg?.badge ? ` · pil: ${s.dg.badge}` : ""}
                      {s.dg?.card ? ` · kartu data "${s.dg.card.title}"` : ""}
                    </span>
                    <div className="mt-1 text-xs text-white/40">
                      Di layar: {[...have.keys()].join(", ") || "—"}{links.length ? ` · Kabel: ${links.join("; ")}` : ""}
                    </div>
                    {stepLine && (
                      <div className="mt-1 text-xs text-white/40">
                        Tracker{subject ? ` "${subject}"` : ""}: {stepLine}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            {scenes.length === 0 && <p className="text-sm text-white/50">Belum ada naskah.</p>}
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s, i) => (
            <div key={s.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
              <div className="relative aspect-[9/16] bg-white/5">
                {s.image?.status === "ready" ? (
                  <img src={fileUrl(s.image.file)} alt={`Scene ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/40">belum ada gambar</div>
                )}
              </div>
              <div className="p-2">
                <div className="text-xs font-semibold">Scene {i + 1}{staleBadge(s.image)}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button onClick={() => genImage(s)} disabled={busy === "img-" + s.id || !s.imagePrompt || exec.imageProvider === "upload"} className={btnCls} title={exec.imageProvider === "upload" ? "Penyedia gambar: unggah manual" : ""}>
                    {busy === "img-" + s.id ? "Membuat..." : s.image?.status === "ready" ? "Generate ulang" : "Generate"}
                  </button>
                  <label className={btnCls + " cursor-pointer"}>
                    Unggah
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadAsset(s, "image", e.target.files?.[0])} />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </Section>

      {/* Tahap 3 */}
      <Section no={3} title="Voice over" desc="Generate per scene dari teks narasi dengan suara terpilih, rekam langsung dari mikrofon (tombol Rekam, butuh alamat HTTPS), atau unggah berkas rekaman sendiri.">
        <div className="space-y-2">
          {scenes.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <span className="text-xs font-bold text-amber-300">SCENE {i + 1}</span>
              {s.vo?.status === "ready" ? (
                <>
                  <audio controls src={fileUrl(s.vo.file)} className="h-9 max-w-full" />
                  <span className="text-xs text-white/50">{s.vo.duration ? `${s.vo.duration.toFixed(1)} dtk` : ""}</span>
                  {staleBadge(s.vo)}
                </>
              ) : (
                <span className="text-xs text-white/40">belum ada VO</span>
              )}
              <span className="ml-auto flex flex-wrap gap-1">
                <button onClick={() => genVo(s)} disabled={busy === "vo-" + s.id || !s.narration} className={btnCls}>
                  {busy === "vo-" + s.id ? "Membuat..." : s.vo?.status === "ready" ? "Generate ulang" : "Generate VO"}
                </button>
                <VoRecorder onDone={(f) => uploadAsset(s, "vo", f)} disabled={busy === "vo-" + s.id} />
                <label className={btnCls + " cursor-pointer"}>
                  Unggah
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadAsset(s, "vo", e.target.files?.[0])} />
                </label>
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Tahap 4 */}
      <Section no={4} title="Perakitan" desc={project.engine === "stickman" ? `Render draf = pratinjau 20 detik pertama dari renderer stickman; render final = film penuh mengikuti rasio aspek proyek, dengan caption dan efek suara. Gaya aktif: ${project.stickStyle || "B1"}.` : project.engine === "darkcard" ? "Render draf = pratinjau 20 detik pertama; render final = film penuh mengikuti rasio aspek proyek, dengan tumpukan kartu, caption sorot, dan watermark." : project.engine === "diagram" ? "Render draf = pratinjau 20 detik pertama; render final = film penuh mengikuti rasio aspek proyek, dengan diagram yang dibangun bertahap, kamera menyapu, headline & pil status, subtitle karaoke, dan watermark." : "Render draf (cepat, 540x960) untuk pratinjau, koreksi bila perlu, lalu render final 1080x1920."}>
        {exec.assembly === "export" && project.engine === "slides" ? (
          <div className="text-sm text-white/70">
            Mode rakit manual dipilih. Unduh paket proyek di tahap 5 — berisi still, VO, naskah,
            dan perintah ffmpeg (renders/commands.txt dibuat setelah render pertama; untuk paket awal,
            rakit dengan ffmpeg concat mengikuti urutan scene di project.json).
            <div className="mt-3">
              <a href={`/api/projects/${id}/package`} className={btnAmber + " inline-block"}>Unduh paket proyek</a>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => render("draft")} disabled={busy === "render-draft" || jobBusy} className={btnCls}>Render draf</button>
              <button onClick={() => render("final")} disabled={busy === "render-final" || jobBusy} className={btnAmber}>Render final</button>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {["draft", "final"].map((kind) => {
                const r = project.renders?.[kind];
                return (
                  <div key={kind} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-bold uppercase text-white/60">{kind === "draft" ? "Draf" : "Final"}</div>
                    {!r && <p className="mt-1 text-xs text-white/40">belum dirender</p>}
                    {r?.status === "running" && <p className="mt-1 text-xs text-sky-300">sedang dirender...</p>}
                    {r?.status === "error" && <p className="mt-1 text-xs text-red-300">gagal: {r.message}</p>}
                    {r?.status === "done" && (
                      <>
                        <video controls src={fileUrl(r.file)} style={{ aspectRatio: (project.aspect || "9:16").replace(":", "/"), maxWidth: project.aspect === "16:9" ? 430 : 280 }} className="mt-2 w-full rounded bg-black" />
                        <div className="mt-1 text-xs text-white/50">durasi ±{r.duration} dtk</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Section>

      {/* Tahap 5 */}
      <Section no={5} title="Hasil & unduh" desc="Video final dan paket proyek untuk arsip atau rakit manual.">
        {project.renders?.final?.status === "done" ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={fileUrl(project.renders.final.file)} download className={btnAmber + " inline-block"}>Unduh MP4 final</a>
            <a href={`/api/projects/${id}/package`} className={btnCls + " inline-block py-2"}>Unduh paket proyek (.tar.gz)</a>
            <span className="text-xs text-white/50">Paket berisi naskah (project.json), still, VO, hasil render, dan petunjuk rakit manual.</span>
          </div>
        ) : (
          <p className="text-sm text-white/50">Video final belum tersedia. Selesaikan tahap 4 (render final) atau jalankan mode otomatis.</p>
        )}
      </Section>
    </div>
  );
}
