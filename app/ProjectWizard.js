"use client";
import { useEffect, useRef, useState } from "react";
import { VOICES, GEMINI_VOICES, MUSE_VOICES, ELEVENLABS_VOICES, isGeminiVoice, isClaudeVoice, isElevenLabsVoice, defaultGeminiVoice, defaultClaudeVoice, defaultElevenLabsVoice, defaultVoice } from "../lib/voices.js";
import { DC_ICONS } from "../lib/dc-icons.js";
import { VISUAL_STYLES, flowVideoPrompt } from "../lib/visualStyles.js";
import { AUDIO_PRESETS, audioFromPreset } from "../lib/audioPresets.js";
import { MOTION_PRESETS, LAYER_MOTION_PRESETS, presetKeyframes } from "../lib/motion.js";
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
const SB_SHOT_OPTS = [["wide", "Wide (establishing)"], ["medium", "Medium"], ["close-up", "Close-up"], ["detail", "Detail (ekstrem)"], ["aerial", "Aerial"]];
const SB_CAMERA_OPTS = [["static", "Diam"], ["zoom-in", "Zoom in"], ["zoom-out", "Zoom out"], ["pan-left", "Pan kiri"], ["pan-right", "Pan kanan"], ["tilt-up", "Tilt atas"], ["tilt-down", "Tilt bawah"]];
const SB_TIME_OPTS = [["", "—"], ["pagi", "Pagi"], ["siang", "Siang"], ["sore", "Sore"], ["malam", "Malam"]];
const SB_TRANSITION_OPTS = [["cut", "Cut"], ["fade", "Fade"], ["slide", "Slide"]];
const SB_ROLE_OPTS = [["", "— (otomatis)"], ["hook", "Hook (pembuka)"], ["turn", "Turn (belokan)"], ["proof", "Proof (bukti/isi)"], ["cta", "CTA (penutup)"]];
const DG_BADGES = [["green", "Hijau (aman / berhasil)"], ["orange", "Oranye (aktif / proses)"], ["red", "Merah (bahaya / peringatan)"], ["blue", "Biru (info)"], ["grey", "Abu (netral)"]];
const DG_COMPS = [["hp", "HP / ponsel"], ["bts", "Menara BTS"], ["server", "Server"], ["monitor", "Monitor / layar"], ["router", "Router"], ["cloud", "Cloud"], ["database", "Database"], ["orang", "Orang / pengguna"], ["rumah", "Rumah"], ["gembok", "Gembok / enkripsi"], ["chat", "Chat / pesan"], ["dokumen", "Dokumen"], ["kotak", "Kotak berlabel (umum)"], ["panel-surya", "Panel surya"], ["baterai", "Baterai"], ["bank", "Bank / gedung bank"], ["globe", "Globe / internet"], ["satelit", "Satelit"], ["mobil", "Mobil"], ["lampu", "Lampu / tiang lampu"], ["panah-panas", "Panah panas naik (Bedah)"], ["aliran", "Putaran aliran udara (Bedah)"]];
const DG_FLOWS = [["panas", "Panas (oranye-merah)"], ["aliran", "Aliran (teal)"], ["netral", "Netral (abu)"]];
const DG_CABLES = [["blue", "Biru (alur normal)"], ["gold", "Emas (data disalin)"], ["red", "Merah (bahaya)"], ["green", "Hijau (aman)"], ["grey", "Abu (netral)"]];
const DG_STEPS = [["todo", "… belum"], ["ask", "? diproses / ditanya"], ["ok", "✓ selesai / disetujui"], ["bad", "✗ gagal / ditolak"]];
const ID_FIELDS = [
  ["age", "Usia (Inggris)", "mis. 8 years old"],
  ["genderPresentation", "Presentasi gender (Inggris)", "mis. female"],
  ["face", "Wajah (Inggris)", "mis. round friendly face"],
  ["hair", "Rambut (Inggris)", "mis. black shoulder-length hair"],
  ["skinTone", "Warna kulit (Inggris)", "mis. light brown"],
  ["body", "Tubuh (Inggris)", "mis. small child proportions"],
  ["outfit", "Pakaian khas (Inggris)", "mis. pink long-sleeve dress"],
  ["artStyle", "Gaya gambar (Inggris)", "mis. flat 2D cartoon"],
];
const ENGINE_LABEL = { darkcard: "Dark Card", slides: "Slides", diagram: "Diagram", editorial: "Editorial" };

function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text || "");
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {}
  }
  return (
    <button type="button" onClick={copy} disabled={!text} className={btnCls}>
      {done ? "Tersalin ✓" : label}
    </button>
  );
}

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
  const [edCfg, setEdCfg] = useState(initial.editorial || { watermark: "", accent: "#E94F1E" });
  const [slCfg, setSlCfg] = useState({
    captionStyle: initial.captionStyle || "frasa",
    scriptTemplate: initial.scriptTemplate || "",
    poll: {
      question: initial.poll?.question || "",
      options: [0, 1, 2].map((k) => (initial.poll?.options || [])[k] || ""),
      voText: initial.poll?.voText || "",
    },
  });
  const [stickStyle, setStickStyle] = useState(initial.stickStyle || "B1");
  const [audioCfg, setAudioCfg] = useState(initial.audio || audioFromPreset("edukatif"));
  const [chars, setChars] = useState(initial.characters || []);
  const [social, setSocial] = useState(initial.social || { caption: "", tags: [], thumbnail: { status: "none" } });
  const [socialTagsText, setSocialTagsText] = useState((initial.social?.tags || []).join(" "));
  useEffect(() => {
    const s = project.social;
    if (!s) return;
    setSocial((prev) => ({ caption: s.caption || "", tags: s.tags || [], thumbnail: s.thumbnail || prev.thumbnail || { status: "none" } }));
    setSocialTagsText((s.tags || []).join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.social?.updatedAt]);
  const [sheet, setSheet] = useState(null);
  const [layerPrompt, setLayerPrompt] = useState({});
  const [visualStyle, setVisualStyle] = useState(initial.visualStyle || "bebas");
  const [imgProv, setImgProv] = useState({});
  const [voProv, setVoProv] = useState({});
  const [voVoice, setVoVoice] = useState({});
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
  // URL pratinjau aset scene dengan penanda versi updatedAt: path berkas
  // tidak berubah saat aset diganti (generate ulang / unggah), jadi tanpa
  // penanda ini pratinjau bisa menampilkan aset lama.
  const assetUrl = (asset) =>
    asset?.file ? fileUrl(asset.file) + (asset.updatedAt ? `?v=${encodeURIComponent(asset.updatedAt)}` : "") : "";

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

  // Sinkronisasi tampilan dengan keadaan di server: status aset berubah
  // juga dari tab/browser lain dan dari pekerjaan latar server (generate
  // per scene kini berjalan di server, bukan menunggu fetch). Tab yang
  // kembali fokus langsung menyegarkan; tab yang terbuka menyegarkan
  // berkala; selama ada scene berstatus "generating" dipercepat.
  async function refreshAssets() {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setProject(data.project);
      if (!dirtyRef.current) {
        setScenes(data.project.scenes);
      } else {
        setScenes((prev) =>
          prev.map((s) => {
            const fresh = data.project.scenes.find((x) => x.id === s.id);
            return fresh ? { ...s, image: fresh.image, vo: fresh.vo, video: fresh.video, sfx: fresh.sfx, layer: fresh.layer } : s;
          })
        );
      }
    } catch {}
  }

  const anyGenerating =
    scenes.some((s) => s.image?.status === "generating" || s.vo?.status === "generating" || s.layer?.status === "generating" || s.words?.status === "generating") ||
    project.poll?.vo?.status === "generating" ||
    (project.characters || []).some((c) => c.referenceImage?.status === "generating");

  useEffect(() => {
    const onWake = () => { if (document.visibilityState === "visible") refreshAssets(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    const t = setInterval(() => { if (document.visibilityState === "visible") refreshAssets(); }, anyGenerating ? 4000 : 15000);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyGenerating]);

  function applyAssetUpdate(respProject) {
    setProject(respProject);
    setScenes((prev) =>
      prev.map((s) => {
        const fresh = respProject.scenes.find((x) => x.id === s.id);
        return fresh ? { ...s, image: fresh.image, vo: fresh.vo, video: fresh.video, sfx: fresh.sfx, words: fresh.words } : s;
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

  // Simpan otomatis: perubahan naskah/prompt tersimpan sendiri ±1 detik
  // setelah ketikan terakhir, tanpa menunggu tombol Simpan — edit yang
  // belum tersimpan dulu hilang begitu halaman dimuat ulang atau aset
  // dibuat dari prompt lama di server. Hasil PATCH tidak menimpa state
  // scenes (pengguna bisa sedang mengetik lagi); dirty hanya dibersihkan
  // bila tidak ada ketikan baru selama penyimpanan berjalan.
  const scenesVerRef = useRef(0);
  useEffect(() => { scenesVerRef.current += 1; }, [scenes]);
  useEffect(() => {
    if (!dirty) return;
    const ver = scenesVerRef.current;
    const t = setTimeout(async () => {
      try {
        const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { scenes });
        setProject(data.project);
        if (scenesVerRef.current === ver) setDirty(false);
      } catch (e) {
        setError(String(e.message || e));
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, scenes]);

  const saveExecutors = () =>
    call("saveExec", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { executors: exec });
      setProject(data.project);
    });

  // --- Audio Studio ---
  const saveAudio = () =>
    call("saveAudio", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { audio: audioCfg });
      setProject(data.project);
      if (data.project.audio) setAudioCfg(data.project.audio);
    });

  const applyAudioPreset = (pid) => {
    const p = audioFromPreset(pid);
    setAudioCfg((prev) => ({ ...p, bgm: prev.bgm }));
  };

  const tweakAudio = (patch) => setAudioCfg((prev) => ({ ...prev, ...patch, preset: "kustom" }));

  const uploadBgm = (file) => {
    if (!file) return;
    call("bgm", async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${id}/audio`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProject(data.project);
      if (data.project.audio) setAudioCfg(data.project.audio);
    });
  };

  const deleteBgm = () =>
    call("bgm", async () => {
      const data = await jsonFetch(`/api/projects/${id}/audio`, "DELETE");
      setProject(data.project);
      if (data.project.audio) setAudioCfg(data.project.audio);
    });

  const updSceneAudio = (sid, patch) => {
    setScenes((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  async function uploadSfx(scene, file) {
    if (!file) return;
    await call("sfx-" + scene.id, async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${id}/scenes/${scene.id}/sfx`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      applyAssetUpdate(data.project);
    });
  }

  const deleteSfx = (scene) =>
    call("sfx-" + scene.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/scenes/${scene.id}/sfx`, "DELETE");
      applyAssetUpdate(data.project);
    });

  // --- VO kartu polling ---
  // Generate menyimpan dulu pengaturan polling (teks VO dibaca server
  // dari proyek tersimpan), baru meminta sintesis.
  const genPollVo = () =>
    call("pollVo", async () => {
      await jsonFetch(`/api/projects/${id}`, "PATCH", {
        captionStyle: slCfg.captionStyle,
        scriptTemplate: slCfg.scriptTemplate,
        poll: { question: slCfg.poll.question, options: slCfg.poll.options.map((o) => String(o || "").trim()), voText: slCfg.poll.voText },
      });
      const prov = voProv.poll || exec.voProvider || "edge-tts";
      const data = await jsonFetch(`/api/projects/${id}/poll/vo`, "POST", { provider: prov, voice: voVoice.poll || exec.voice });
      setProject(data.project);
    });

  async function uploadPollVo(file) {
    if (!file) return;
    await call("pollVo", async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${id}/poll/vo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProject(data.project);
    });
  }

  const deletePollVo = () =>
    call("pollVo", async () => {
      const data = await jsonFetch(`/api/projects/${id}/poll/vo`, "DELETE");
      setProject(data.project);
    });

  // --- Character sheet (Fase A) ---
  const saveChars = () =>
    call("saveChars", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { characters: chars });
      setProject(data.project);
      setChars(data.project.characters || []);
    });
  const addChar = () =>
    setChars((prev) => [...prev, { id: "tmp-" + Math.random().toString(36).slice(2, 9), name: "", appearance: "", identity: { age: "", genderPresentation: "", face: "", hair: "", skinTone: "", body: "", outfit: "", accessories: [], artStyle: "" }, identityLocked: false, referenceImage: { status: "none" } }]);
  const editChar = (idx, field, value) =>
    setChars((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  const editIdentity = (idx, field, value) =>
    setChars((prev) => prev.map((c, i) => (i === idx ? { ...c, identity: { ...(c.identity || {}), [field]: field === "accessories" ? String(value || "").split(",").map((x) => x.trim()).filter(Boolean) : value } } : c)));
  const removeChar = (idx) => setChars((prev) => prev.filter((_, i) => i !== idx));
  const uploadCharRef = (c, file) => {
    if (!file || !c?.id || c.id.startsWith("tmp-")) return;
    call("charRef-" + c.id, async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${id}/characters/${c.id}/image`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProject(data.project);
      setChars(data.project.characters || []);
    });
  };
  const genCharRef = (c) => {
    if (!c?.id || c.id.startsWith("tmp-")) return;
    call("charRef-" + c.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/characters/${c.id}/image`, "POST", {});
      setProject(data.project);
      setChars(data.project.characters || []);
    });
  };
  const deleteCharRef = (c) => {
    if (!c?.id || c.id.startsWith("tmp-")) return;
    call("charRef-" + c.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/characters/${c.id}/image`, "DELETE");
      setProject(data.project);
      setChars(data.project.characters || []);
    });
  };
  const makeSheet = () =>
    call("sheet", async () => {
      const res = await fetch(`/api/projects/${id}/contact-sheet`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSheet(data);
    });

  // --- Reference Manager (CC1): portrait / fullbody / expressions ---
  const genRef = (c, kind) => {
    if (!c?.id || c.id.startsWith("tmp-")) return;
    call(`ref-${kind}-` + c.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/characters/${c.id}/references`, "POST", { kind });
      setProject(data.project);
      setChars(data.project.characters || []);
    });
  };
  const uploadRef = (c, kind, file) => {
    if (!file || !c?.id || c.id.startsWith("tmp-")) return;
    call(`ref-${kind}-` + c.id, async () => {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      const res = await fetch(`/api/projects/${id}/characters/${c.id}/references`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProject(data.project);
      setChars(data.project.characters || []);
    });
  };
  const deleteRef = (c, kind) => {
    if (!c?.id || c.id.startsWith("tmp-")) return;
    call(`ref-${kind}-` + c.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/characters/${c.id}/references`, "DELETE", { kind });
      setProject(data.project);
      setChars(data.project.characters || []);
    });
  };

  // --- Paket sosmed: thumbnail + caption + tagar (tahap 6) ---
  const socialCopy = [social.caption?.trim(), (social.tags || []).map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
  const saveSocial = () =>
    call("saveSocial", async () => {
      const tags = socialTagsText.split(/[\s,]+/).map((t) => t.replace(/^#+/, "")).filter(Boolean);
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { social: { caption: social.caption || "", tags } });
      setProject(data.project);
    });
  const draftSocial = () =>
    call("draftSocial", async () => {
      const data = await jsonFetch(`/api/projects/${id}/social`, "POST", {});
      setProject(data.project);
    });
  const composeThumb = () =>
    call("thumbCompose", async () => {
      const data = await jsonFetch(`/api/projects/${id}/thumbnail`, "POST", { mode: "compose" });
      setProject(data.project);
    });
  const genThumb = () =>
    call("thumbGen", async () => {
      const data = await jsonFetch(`/api/projects/${id}/thumbnail`, "POST", { mode: "generate" });
      setProject(data.project);
    });
  const uploadThumb = (file) => {
    if (!file) return;
    call("thumbUp", async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${id}/thumbnail`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProject(data.project);
    });
  };
  const deleteThumb = () =>
    call("thumbDel", async () => {
      const data = await jsonFetch(`/api/projects/${id}/thumbnail`, "DELETE");
      setProject(data.project);
    });

  // --- Layer objek alpha (Fase B) ---
  const uploadLayer = (s, file) => {
    if (!file) return;
    call("layer-" + s.id, async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${id}/scenes/${s.id}/layer`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProject(data.project);
    });
  };
  const genLayer = (s) =>
    call("layer-" + s.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/scenes/${s.id}/layer`, "POST", { prompt: layerPrompt[s.id] ?? s.layer?.prompt ?? "" });
      setProject(data.project);
    });
  const deleteLayer = (s) =>
    call("layer-" + s.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/scenes/${s.id}/layer`, "DELETE");
      setProject(data.project);
    });
  const saveLayerMotion = (s, lm) =>
    call("layerM-" + s.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/scenes/${s.id}/layer`, "PATCH", { layerMotion: lm });
      setProject(data.project);
      const fresh = (data.project.scenes || []).find((x) => x.id === s.id);
      if (fresh) setScenes((prev) => prev.map((x) => (x.id === s.id ? { ...x, layerMotion: fresh.layerMotion } : x)));
    });

  // --- Timestamp kata ASR (Fase D) ---
  const genWords = (s) =>
    call("words-" + s.id, async () => {
      const data = await jsonFetch(`/api/projects/${id}/scenes/${s.id}/words`, "POST", {});
      setProject(data.project);
    });

  // --- Editor keyframe motion (Fase B) ---
  const setMotionPreset = (idx, presetId) => {
    const cur = scenes[idx].motion;
    if (presetId === "camera") { editScene(idx, "motion", null); return; }
    if (presetId === "custom") {
      editScene(idx, "motion", { preset: "custom", easing: cur?.easing || "linear", keyframes: cur?.keyframes?.length ? cur.keyframes : presetKeyframes("kenburns-in") });
      return;
    }
    editScene(idx, "motion", { preset: presetId, easing: cur?.easing || "linear", keyframes: presetKeyframes(presetId) });
  };
  const editKeyframe = (idx, ki, field, value) => {
    const cur = scenes[idx].motion || { preset: "custom", easing: "linear", keyframes: presetKeyframes("kenburns-in") };
    editScene(idx, "motion", { ...cur, preset: "custom", keyframes: (cur.keyframes || []).map((k, j) => (j === ki ? { ...k, [field]: value } : k)) });
  };
  const addKeyframe = (idx) => {
    const cur = scenes[idx].motion || { preset: "custom", easing: "linear", keyframes: presetKeyframes("kenburns-in") };
    const last = cur.keyframes[cur.keyframes.length - 1] || { t: 0, scale: 1, fx: 0.5, fy: 0.5 };
    editScene(idx, "motion", { ...cur, preset: "custom", keyframes: [...cur.keyframes, { ...last, t: 1 }] });
  };
  const removeKeyframe = (idx, ki) => {
    const cur = scenes[idx].motion;
    if (!cur) return;
    editScene(idx, "motion", { ...cur, preset: "custom", keyframes: (cur.keyframes || []).filter((_, j) => j !== ki) });
  };

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

  const saveEd = () =>
    call("saveEd", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", { editorial: edCfg });
      setProject(data.project);
      setEdCfg(data.project.editorial || edCfg);
    });

  const saveSl = () =>
    call("saveSl", async () => {
      const data = await jsonFetch(`/api/projects/${id}`, "PATCH", {
        captionStyle: slCfg.captionStyle,
        scriptTemplate: slCfg.scriptTemplate,
        poll: { question: slCfg.poll.question, options: slCfg.poll.options.map((o) => String(o || "").trim()), voText: slCfg.poll.voText },
      });
      setProject(data.project);
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

  const voiceListFor = (prov) =>
    prov === "gemini-tts" ? GEMINI_VOICES : prov === "muse-bridge" ? MUSE_VOICES : prov === "elevenlabs" ? ELEVENLABS_VOICES : VOICES[project.audience];
  const defaultVoiceFor = (prov) =>
    prov === "gemini-tts" ? defaultGeminiVoice() : prov === "muse-bridge" ? defaultClaudeVoice() : prov === "elevenlabs" ? defaultElevenLabsVoice() : defaultVoice(project.audience);

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
  function editEd(idx, field, value) {
    setScenes((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ed: { ...(s.ed || {}), [field]: value } } : s))
    );
    setDirty(true);
  }
  function editSb(idx, field, value) {
    setScenes((prev) =>
      prev.map((s, i) =>
        i === idx
          ? { ...s, sb: { shotType: "medium", camera: "static", location: "", timeOfDay: "", characters: [], transitionIn: "cut", ...(s.sb || {}), [field]: value } }
          : s
      )
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
      const data = await jsonFetch(`/api/projects/${id}/scenes/${scene.id}/image`, "POST", { provider: imgProv[scene.id] || exec.imageProvider });
      applyAssetUpdate(data.project);
    });

  const genVo = (scene) =>
    call("vo-" + scene.id, async () => {
      const prov = voProv[scene.id] || exec.voProvider || "edge-tts";
      const data = await jsonFetch(`/api/projects/${id}/scenes/${scene.id}/vo`, "POST", { provider: prov, voice: voVoice[scene.id] || exec.voice });
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

  // Status "generating" yang fosil: pekerjaan latar di server mati di
  // tengah jalan (mis. container restart) sehingga status tidak pernah
  // berubah. Setelah 35 menit tombol generate boleh dipakai lagi.
  const assetStale = (asset) =>
    asset?.status === "generating" &&
    asset?.startedAt &&
    Date.now() - new Date(asset.startedAt).getTime() > 35 * 60 * 1000;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          {project.series && (
            <span className="mt-1 inline-block rounded bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">📺 Seri {project.series.name} · Episode {project.series.episode}</span>
          )}
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
              setExec({ ...exec, voProvider: p, voice: p === "gemini-tts" ? defaultGeminiVoice() : p === "muse-bridge" ? defaultClaudeVoice() : p === "elevenlabs" ? defaultElevenLabsVoice() : ((isGeminiVoice(exec.voice) || isClaudeVoice(exec.voice) || isElevenLabsVoice(exec.voice)) ? defaultVoice(project.audience) : exec.voice) });
            }} className={inputCls}>
              <option value="edge-tts">edge-tts</option>
              <option value="gemini-tts">Gemini TTS (ekspresif)</option>
              <option value="muse-bridge">Muse (bridge) — dibacakan Muse, tanpa kuota</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="upload">Unggah manual</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Suara VO</label>
            <select value={exec.voice} onChange={(e) => setExec({ ...exec, voice: e.target.value })} className={inputCls}>
              {(() => {
                const prov = exec.voProvider || "edge-tts";
                const list = prov === "gemini-tts" ? GEMINI_VOICES : prov === "muse-bridge" ? MUSE_VOICES : prov === "elevenlabs" ? ELEVENLABS_VOICES : VOICES[project.audience];
                const opts = list.map((v) => <option key={v.id} value={v.id}>{v.label}</option>);
                if (prov === "elevenlabs" && exec.voice && !ELEVENLABS_VOICES.some((v) => v.id === exec.voice)) {
                  opts.unshift(<option key="custom" value={exec.voice}>Suara kustom ({exec.voice})</option>);
                }
                return opts;
              })()}
            </select>
            {(exec.voProvider || "edge-tts") === "elevenlabs" && (
              <input
                value={ELEVENLABS_VOICES.some((v) => v.id === exec.voice) ? "" : (exec.voice || "")}
                onChange={(e) => { const v = e.target.value.trim(); setExec({ ...exec, voice: v || defaultElevenLabsVoice() }); }}
                placeholder="ID suara kustom (mis. hasil kloning) — kosongkan untuk suara bawaan"
                className={inputCls + " mt-2"}
              />
            )}
            <VoicePreview voice={exec.voice} provider={exec.voProvider || "edge-tts"} />
          </div>
          <div>
            <label className={labelCls}>{project.engine === "stickman" && ["B2", "B3"].includes(project.stickStyle || "B1") ? `Ilustrasi scene ${project.stickStyle}` : "Gambar latar"}</label>
            <select value={exec.imageProvider} onChange={(e) => setExec({ ...exec, imageProvider: e.target.value })} className={inputCls} disabled={project.engine === "darkcard" || project.engine === "diagram" || (project.engine === "stickman" && (project.stickStyle || "B1") === "B1")}>
              <option value="pollinations">Pollinations (gratis)</option>
              <option value="sdxl-9router">Cloudflare SDXL via 9Router</option>
              <option value="venice">Venice (langsung)</option>
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
        {project.engine === "slides" && (
          <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/40">
            Visual tiap scene (gambar latar atau video Google Flow) kini diatur per scene di tahap 2 — keduanya boleh dicampur dalam satu video, dan penyedia gambar/VO untuk generate ulang juga dipilih per scene di tahap 2 dan 3.
          </p>
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
            <div>
              <label className={labelCls}>Mode Diagram</label>
              <select value={dgCfg.mode || "akumulasi"} onChange={(e) => setDgCfg({ ...dgCfg, mode: e.target.value })} className={inputCls}>
                <option value="akumulasi">Akumulasi — satu diagram dibangun bertahap</option>
                <option value="bedah">Bedah — halaman per scene + kartu angka besar</option>
              </select>
              <p className="mt-1 text-xs text-white/40">Bedah: tiap scene halaman sendiri (headline + kartu data + diagram subjek + panah aliran + caption kata kunci); watermark tampil sebagai pil di kanan atas. Setelah ganti mode, buat ulang naskah agar format scene-nya sesuai.</p>
            </div>
          </div>
        )}
        {project.engine === "slides" && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelCls}>Gaya caption</label>
                <select value={slCfg.captionStyle} onChange={(e) => setSlCfg({ ...slCfg, captionStyle: e.target.value })} className={inputCls}>
                  <option value="frasa">Frasa — kotak subtitle di bawah</option>
                  <option value="karaoke">Karaoke — kata menyala berurutan</option>
                  <option value="satukata">Satu Kata — kata raksasa per ketukan, kata terpanjang lime</option>
                  <option value="editorial">Editorial — huruf besar rata kiri + aksen</option>
                  <option value="minimal">Minimal — teks bersih tanpa kotak</option>
                  <option value="dynamic">Dynamic — teks mengetik sendiri</option>
                  <option value="highlight">Highlight — potongan kunci kotak lime</option>
                  <option value="storytelling">Storytelling — pita bawah, per kalimat</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Template naskah</label>
                <select value={slCfg.scriptTemplate} onChange={(e) => setSlCfg({ ...slCfg, scriptTemplate: e.target.value })} className={inputCls}>
                  <option value="">Standar</option>
                  <option value="andai">Andai-Andai — "gimana kalau..." langkah demi langkah</option>
                </select>
                <p className="mt-1 text-xs text-white/40">Template berlaku saat naskah dibuat ulang.</p>
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Kartu polling penutup (kosongkan pertanyaan untuk menonaktifkan)</label>
              <input value={slCfg.poll.question} onChange={(e) => setSlCfg({ ...slCfg, poll: { ...slCfg.poll, question: e.target.value } })} placeholder="mis. MANA YANG PALING FATAL?" className={inputCls} />
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {[0, 1, 2].map((k) => (
                  <input key={k} value={slCfg.poll.options[k] || ""} onChange={(e) => { const options = [...slCfg.poll.options]; options[k] = e.target.value; setSlCfg({ ...slCfg, poll: { ...slCfg.poll, options } }); }} placeholder={`Pilihan ${k + 1} (maks 3 kata)`} className={inputCls} />
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
                <label className={labelCls}>Voice over kartu polling (opsional)</label>
                <input value={slCfg.poll.voText} onChange={(e) => setSlCfg({ ...slCfg, poll: { ...slCfg.poll, voText: e.target.value } })} placeholder="mis. Gimana menurut kamu? Tulis jawabanmu di komentar ya!" className={inputCls} />
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {project.poll?.vo?.status === "ready" ? (
                    <>
                      <audio controls src={assetUrl(project.poll.vo)} className="h-9 max-w-full" />
                      <span className="text-xs text-white/50">{project.poll.vo.duration ? `${project.poll.vo.duration.toFixed(1)} dtk` : ""}</span>
                    </>
                  ) : project.poll?.vo?.status === "generating" ? (
                    <span className="text-xs text-sky-300">sedang dibuat…{assetStale(project.poll.vo) ? " (tampaknya terhenti — klik Generate VO untuk mencoba lagi)" : ""}</span>
                  ) : project.poll?.vo?.status === "error" ? (
                    <span className="text-xs text-red-300">gagal: {project.poll.vo.error || "coba lagi"}</span>
                  ) : (
                    <span className="text-xs text-white/40">belum ada VO — kartu tampil hening</span>
                  )}
                  <span className="ml-auto flex flex-wrap gap-1">
                    <select value={voProv.poll || exec.voProvider || "edge-tts"} onChange={(e) => { const p = e.target.value; setVoProv({ ...voProv, poll: p }); setVoVoice({ ...voVoice, poll: defaultVoiceFor(p) }); }} className={inputCls} style={{ width: 160 }} title="Mesin VO kartu polling">
                      <option value="edge-tts">edge-tts</option>
                      <option value="gemini-tts">Gemini TTS</option>
                      <option value="muse-bridge">Muse (bridge)</option>
                      <option value="elevenlabs">ElevenLabs</option>
                    </select>
                    <select value={voVoice.poll || exec.voice} onChange={(e) => setVoVoice({ ...voVoice, poll: e.target.value })} className={inputCls} style={{ width: 180 }} title="Suara VO kartu polling">
                      {(() => {
                        const prov = voProv.poll || exec.voProvider || "edge-tts";
                        const list = voiceListFor(prov);
                        const cur = voVoice.poll || exec.voice;
                        const opts = list.map((v) => <option key={v.id} value={v.id}>{v.label}</option>);
                        if (cur && !list.some((v) => v.id === cur)) opts.unshift(<option key="cur" value={cur}>{cur}</option>);
                        return opts;
                      })()}
                    </select>
                    <button onClick={genPollVo} disabled={busy === "pollVo" || !slCfg.poll.voText.trim() || (project.poll?.vo?.status === "generating" && !assetStale(project.poll.vo))} className={btnCls} title={!slCfg.poll.voText.trim() ? "Isi teks VO dulu, lalu klik Simpan di bawah" : ""}>
                      {busy === "pollVo" ? "Membuat..." : project.poll?.vo?.status === "generating" && !assetStale(project.poll.vo) ? "Sedang dibuat…" : project.poll?.vo?.status === "ready" ? "Generate ulang" : "Generate VO"}
                    </button>
                    <VoRecorder onDone={(f) => uploadPollVo(f)} disabled={busy === "pollVo"} />
                    <label className={btnCls + " cursor-pointer"}>
                      Unggah
                      <input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadPollVo(e.target.files?.[0])} />
                    </label>
                    {project.poll?.vo?.status === "ready" && (
                      <button onClick={deletePollVo} disabled={busy === "pollVo"} className={btnCls}>Hapus VO</button>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/40">Generate otomatis menyimpan teks ini dulu. Kartu mengikuti durasi VO (minimum 6 detik). Mode otomatis juga membuat VO ini bila teks terisi.</p>
              </div>
              <p className="mt-1 text-xs text-white/40">Kartu di akhir video: pertanyaan + pil "+ FOLLOW" + pilihan + ajakan komentar. Naskah baru selalu menyarankan isinya.</p>
            </div>
            <button onClick={saveSl} disabled={busy === "saveSl"} className={`${btnCls} mt-3`}>Simpan caption, template & polling</button>
          </div>
        )}
        {project.engine === "editorial" && (
          <div className="mt-4 grid gap-3 border-t border-white/10 pt-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>Watermark Editorial (bebas, boleh kosong)</label>
              <input value={edCfg.watermark || ""} onChange={(e) => setEdCfg({ ...edCfg, watermark: e.target.value })} placeholder="mis. @handleku" className={inputCls} />
              <p className="mt-1 text-xs text-white/40">Teks kecil di dasar video — identitas kanalmu sendiri.</p>
            </div>
            <div>
              <label className={labelCls}>Warna aksen Editorial</label>
              <div className="flex items-center gap-2">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(edCfg.accent || "") ? edCfg.accent : "#E94F1E"} onChange={(e) => setEdCfg({ ...edCfg, accent: e.target.value })} className="h-10 w-24 cursor-pointer rounded-lg border border-white/15 bg-white/5 px-1 py-1" />
                <button onClick={saveEd} disabled={busy === "saveEd"} className={btnCls}>Simpan watermark & aksen</button>
              </div>
              <p className="mt-1 text-xs text-white/40">Pil label dan kata serif italic tiap scene memakai warna ini.</p>
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
        {project.engine === "slides" && (
          <div className="mb-4 rounded-lg border border-sky-300/20 bg-sky-400/5 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-sky-200">Karakter & Konsistensi</span>
              <span className="ml-auto flex gap-1">
                <button onClick={addChar} className={btnCls}>+ Tambah karakter</button>
                <button onClick={saveChars} disabled={busy === "saveChars"} className={btnCls}>{busy === "saveChars" ? "Menyimpan..." : "Simpan karakter"}</button>
              </span>
            </div>
            <p className="mb-2 text-xs text-white/40"> Definisikan karakter SEKALI di sini: blok penampilannya disisipkan persis sama ke prompt gambar setiap scene tempat ia hadir (dipilih di panel storyboard tiap scene), menjaga rupa tetap konsisten antar-scene. Tulis penampilan dalam bahasa Inggris, sangat spesifik: usia, wajah, rambut, pakaian khas, warna dominan. Buat naskah sesudah menyimpan karakter agar penulis naskah bisa menugaskan mereka per scene.</p>
            {chars.length === 0 && <p className="text-xs text-white/40">Belum ada karakter. Proyek tanpa karakter tetap jalan seperti biasa.</p>}
            <div className="space-y-3">
              {chars.map((c, ci) => {
                const saved = (project.characters || []).find((x) => x.id === c.id);
                const ref = saved?.referenceImage || c.referenceImage || { status: "none" };
                const isTmp = !c.id || c.id.startsWith("tmp-");
                return (
                  <div key={c.id || ci} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="flex flex-wrap gap-3">
                      <div className="flex w-24 flex-col items-center gap-1">
                        {ref.status === "ready" ? (
                          <img src={assetUrl(ref)} alt={c.name || "karakter"} className="h-28 w-24 rounded object-cover" />
                        ) : (
                          <div className="flex h-28 w-24 items-center justify-center rounded bg-white/5 px-1 text-center text-[11px] text-white/40">
                            {ref.status === "generating" ? "sedang dibuat…" : ref.status === "error" ? "gagal dibuat" : "belum ada gambar referensi"}
                          </div>
                        )}
                        <span className="flex flex-wrap justify-center gap-1">
                          <button onClick={() => genCharRef(c)} disabled={isTmp || busy === "charRef-" + c.id || ref.status === "generating"} className={btnCls} title={isTmp ? "Simpan karakter dulu" : "Buat gambar referensi dari deskripsi penampilan"}>
                            {ref.status === "ready" ? "Generate ulang" : "Generate"}
                          </button>
                          <label className={btnCls + (isTmp ? " pointer-events-none opacity-40" : " cursor-pointer")} title={isTmp ? "Simpan karakter dulu" : ""}>
                            Unggah
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadCharRef(c, e.target.files?.[0])} />
                          </label>
                          {ref.status === "ready" && (
                            <button onClick={() => deleteCharRef(c)} disabled={busy === "charRef-" + c.id} className={btnCls}>Hapus gbr</button>
                          )}
                        </span>
                      </div>
                      <div className="min-w-52 flex-1 space-y-2">
                        <div>
                          <label className={labelCls}>Nama karakter</label>
                          <input value={c.name} onChange={(e) => editChar(ci, "name", e.target.value)} placeholder="mis. Pak Harun" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Penampilan baku (Inggris)</label>
                          <textarea rows={3} value={c.appearance} onChange={(e) => editChar(ci, "appearance", e.target.value)} placeholder="mis. a 58-year-old Indonesian man, round face, short grey hair, glasses, wearing a faded brown batik shirt and dark trousers" className={inputCls} />
                          <p className="mt-1 text-[11px] text-white/35">Deskripsi legacy — tetap dipakai; prompt dibangun dari identity terstruktur di bawah + teks ini sebagai pelengkap.</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-sky-200">Character Identity (terstruktur)</span>
                            <label className="ml-auto flex cursor-pointer items-center gap-1 text-[11px] text-white/60">
                              <input type="checkbox" checked={!!c.identityLocked} onChange={(e) => editChar(ci, "identityLocked", e.target.checked)} />
                              Identity Lock — kunci identity dari perubahan
                            </label>
                          </div>
                          <div className={`grid gap-2 md:grid-cols-2 ${c.identityLocked ? "pointer-events-none opacity-50" : ""}`}>
                            {ID_FIELDS.map(([f, lbl, ph]) => (
                              <div key={f}>
                                <label className={labelCls}>{lbl}</label>
                                <input value={c.identity?.[f] || ""} onChange={(e) => editIdentity(ci, f, e.target.value)} placeholder={ph} className={inputCls} />
                              </div>
                            ))}
                            <div className="md:col-span-2">
                              <label className={labelCls}>Aksesori (pisahkan koma)</label>
                              <input value={(c.identity?.accessories || []).join(", ")} onChange={(e) => editIdentity(ci, "accessories", e.target.value)} placeholder="mis. red ribbon, round glasses" className={inputCls} />
                            </div>
                          </div>
                          {c.identityLocked && <p className="mt-1 text-[11px] text-amber-300/80">Identity terkunci: perubahan field identity tidak akan disimpan server sampai kunci dibuka.</p>}
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-sky-200">Reference Manager</span>
                            <span className="text-[11px] text-white/40">seed karakter: {saved?.seed ?? c.seed ?? "—"}</span>
                          </div>
                          <p className="mb-2 text-[11px] text-white/35">Tiga referensi per karakter. Full body & expression sheet diturunkan dari portrait (generate portrait dulu). Di CC1 penurunannya memakai prompt teks yang diperkuat; conditioning visual menyusul di CC2.</p>
                          <div className="grid gap-2 md:grid-cols-3">
                            {[["portrait", "Portrait"], ["fullbody", "Full body"], ["expressions", "Expressions"]].map(([kind, label]) => {
                              const r = (saved?.references || c.references || {})[kind] || (kind === "portrait" ? ref : { status: "none" });
                              const rk = `ref-${kind}-` + c.id;
                              return (
                                <div key={kind} className="flex flex-col items-center gap-1">
                                  {r.status === "ready" ? (
                                    <img src={assetUrl(r)} alt={label} className="h-24 w-full rounded object-cover" />
                                  ) : (
                                    <div className="flex h-24 w-full items-center justify-center rounded bg-white/5 px-1 text-center text-[11px] text-white/40">
                                      {r.status === "generating" ? "sedang dibuat…" : r.status === "error" ? "gagal dibuat" : `belum ada ${label.toLowerCase()}`}
                                    </div>
                                  )}
                                  <span className="text-[11px] font-medium text-white/60">{label}{r.derivedFrom ? " · dari portrait" : ""}</span>
                                  <span className="flex flex-wrap justify-center gap-1">
                                    <button onClick={() => genRef(c, kind)} disabled={isTmp || busy === rk || r.status === "generating"} className={btnCls}>{r.status === "ready" ? "Generate ulang" : "Generate"}</button>
                                    <label className={btnCls + (isTmp ? " pointer-events-none opacity-40" : " cursor-pointer")}>
                                      Unggah
                                      <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadRef(c, kind, e.target.files?.[0])} />
                                    </label>
                                    {r.status === "ready" && (
                                      <button onClick={() => deleteRef(c, kind)} disabled={busy === rk} className={btnCls}>Hapus</button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <button onClick={() => removeChar(ci)} className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25">Hapus karakter</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={genScript} disabled={busy === "script" || jobBusy} className={btnAmber}>
            {busy === "script" ? "Menulis naskah..." : scenes.length ? "Buat ulang naskah" : "Buat naskah"}
          </button>
          <button onClick={addScene} disabled={busy === "addScene"} className={btnCls}>+ Tambah scene</button>
          <button onClick={saveScenes} disabled={busy === "saveScenes" || !dirty} className={btnCls}>
            {dirty ? "Simpan perubahan *" : "Tersimpan"}
          </button>
          {dirty && <span className="self-center text-xs text-white/40">perubahan tersimpan otomatis…</span>}
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
                  <label className={labelCls}>{project.engine === "stickman" ? "Teks layar baris 1 (judul besar tulisan tangan)" : project.engine === "darkcard" ? "Judul layar (mono, maks 3 kata)" : project.engine === "diagram" ? "Headline seksi (judul besar di atas diagram)" : project.engine === "editorial" ? "Headline editorial (condensed, 1–3 kata, HURUF BESAR)" : "Teks overlay (judul besar di video)"}</label>
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
                  {(dgCfg.mode || "akumulasi") === "bedah" && (
                    <div className="mb-3 rounded-lg border border-amber-400/30 bg-black/20 p-3">
                      <div className="text-xs font-semibold text-amber-300">Mode Bedah — halaman scene ini</div>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Kata kunci caption (satu kata dari narasi, disorot kuning)</label>
                          <input value={s.dg?.keyword || ""} onChange={(e) => editDg(i, "keyword", e.target.value)} placeholder="mis. oven" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Catatan</label>
                          <p className="text-xs text-white/50">Di mode Bedah: label komponen = pil penunjuk; tombol "+ Panah aliran" ada di Perintah diagram; kolom tracker & kartu data terminal tidak dipakai.</p>
                        </div>
                      </div>
                      {[0, 1].map((k) => {
                        const d = (Array.isArray(s.dg?.data) ? s.dg.data : [])[k] || { label: "", value: "", result: "", tone: "plain" };
                        const setData = (patch) => {
                          const arr = [...(Array.isArray(s.dg?.data) ? s.dg.data : [])];
                          arr[k] = { label: "", value: "", result: "", tone: "plain", ...((Array.isArray(s.dg?.data) ? s.dg.data : [])[k] || {}), ...patch };
                          editDg(i, "data", arr);
                        };
                        return (
                          <div key={k} className="mt-2 grid gap-2 md:grid-cols-4">
                            <div>
                              <label className={labelCls}>Kartu {k + 1} — label kecil</label>
                              <input value={d.label || ""} onChange={(e) => setData({ label: e.target.value })} placeholder="mis. ATAP LOGAM · SIANG" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Kartu {k + 1} — angka besar</label>
                              <input value={d.value || ""} onChange={(e) => setData({ value: e.target.value })} placeholder="mis. >59 °C" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Kartu {k + 1} — baris hasil (highlight kuning)</label>
                              <input value={d.result || ""} onChange={(e) => setData({ result: e.target.value })} placeholder="mis. bisa 60 °C lebih" className={inputCls} />
                            </div>
                            <div>
                              <label className={labelCls}>Kartu {k + 1} — nada angka</label>
                              <select value={d.tone || "plain"} onChange={(e) => setData({ tone: e.target.value })} className={inputCls}>
                                <option value="plain">Biasa (hitam)</option>
                                <option value="hot">Panas (merah)</option>
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                      {(dgCfg.mode || "akumulasi") === "bedah" && (
                        <button type="button" onClick={() => editDg(i, "ops", [...(Array.isArray(s.dg?.ops) ? s.dg.ops : []), { op: "flow", from: "", to: "", kind: "aliran" }])} className={btnCls}>+ Panah aliran</button>
                      )}
                    </div>
                    {(Array.isArray(s.dg?.ops) ? s.dg.ops : []).map((op, k) => {
                      const ops = Array.isArray(s.dg?.ops) ? s.dg.ops : [];
                      const setOp = (patch) => { const next = [...ops]; next[k] = { ...next[k], ...patch }; editDg(i, "ops", next); };
                      const setType = (t) => { const next = [...ops]; next[k] = t === "add" ? { op: "add", comp: "kotak", id: "", label: "" } : t === "connect" ? { op: "connect", from: "", to: "", color: "blue" } : t === "flow" ? { op: "flow", from: "", to: "", kind: "aliran" } : { op: "focus", target: "all" }; editDg(i, "ops", next); };
                      return (
                        <div key={k} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
                          <select value={op.op} onChange={(e) => setType(e.target.value)} style={{ width: 120 }} className={inputCls}>
                            <option value="add">Tambah</option>
                            <option value="connect">Kabel</option>
                            <option value="focus">Fokus</option>
                            <option value="flow">Aliran</option>
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
                          {op.op === "flow" && (<>
                            <input value={op.from || ""} onChange={(e) => setOp({ from: e.target.value })} placeholder="dari id" style={{ width: 120 }} className={inputCls} />
                            <span className="text-white/40">→</span>
                            <input value={op.to || ""} onChange={(e) => setOp({ to: e.target.value })} placeholder="ke id" style={{ width: 120 }} className={inputCls} />
                            <select value={op.kind || "aliran"} onChange={(e) => setOp({ kind: e.target.value })} style={{ width: 190 }} className={inputCls}>
                              {DG_FLOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </>)}
                          <button type="button" onClick={() => editDg(i, "ops", ops.filter((_, x) => x !== k))} className={btnCls}>Hapus</button>
                        </div>
                      );
                    })}
                    <p className="mt-1 text-xs text-white/40">Komponen muncul sekali lalu menetap; id harus sama persis dengan yang dirujuk kabel/fokus. Tanpa perintah fokus, kamera mengikuti komponen terbaru.</p>
                  </div>
                </div>
              ) : project.engine === "editorial" ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>Kata aksen (serif italic, satu kata kontras)</label>
                    <input value={s.ed?.accentWord || ""} onChange={(e) => editEd(i, "accentWord", e.target.value)} placeholder="mis. hilang" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Pil label (tag kategori kecil, opsional)</label>
                    <input value={s.ed?.label || ""} onChange={(e) => editEd(i, "label", e.target.value)} placeholder="mis. SEJARAH" className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Arahan gambar objek hero (Inggris, satu objek tunggal)</label>
                    <textarea rows={2} value={s.imagePrompt} onChange={(e) => editScene(i, "imagePrompt", e.target.value)} placeholder="mis. a vintage brass magnifying glass, straight-on view, dramatic soft light" className={inputCls} />
                    <p className="mt-1 text-xs text-white/40">Gaya kolase editorial (latar kertas krem polos, objek tunggal di tengah, tanpa teks) ditambahkan otomatis saat gambar dibuat di tahap 2.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <label className={labelCls}>Prompt gambar latar (Inggris)</label>
                  <textarea rows={2} value={s.imagePrompt} onChange={(e) => editScene(i, "imagePrompt", e.target.value)} className={inputCls} />
                </div>
              )}
              {(project.engine === "slides" || project.engine === "editorial") && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
                  <span className="text-[11px] font-bold tracking-wide text-sky-200/80">STORYBOARD</span>
                  <div className="mt-1 grid gap-2 md:grid-cols-3">
                    <div>
                      <label className={labelCls}>Jenis bidikan</label>
                      <select value={s.sb?.shotType || "medium"} onChange={(e) => editSb(i, "shotType", e.target.value)} className={inputCls}>
                        {SB_SHOT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Gerakan kamera</label>
                      <select value={s.sb?.camera || "static"} onChange={(e) => editSb(i, "camera", e.target.value)} className={inputCls}>
                        {SB_CAMERA_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Transisi masuk</label>
                      <select value={s.sb?.transitionIn || "cut"} onChange={(e) => editSb(i, "transitionIn", e.target.value)} className={inputCls}>
                        {SB_TRANSITION_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Lokasi</label>
                      <input value={s.sb?.location || ""} onChange={(e) => editSb(i, "location", e.target.value)} placeholder="mis. small kitchen" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Waktu</label>
                      <select value={s.sb?.timeOfDay || ""} onChange={(e) => editSb(i, "timeOfDay", e.target.value)} className={inputCls}>
                        {SB_TIME_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Peran beat</label>
                      <select value={s.sb?.beatRole || ""} onChange={(e) => editSb(i, "beatRole", e.target.value)} className={inputCls}>
                        {SB_ROLE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  {project.engine === "slides" && (project.characters || []).length > 0 && (
                    <div className="mt-2">
                      <label className={labelCls}>Karakter hadir di scene ini</label>
                      <div className="flex flex-wrap gap-1">
                        {(project.characters || []).map((c) => {
                          const on = (s.sb?.characters || []).includes(c.id);
                          return (
                            <button key={c.id} onClick={() => editSb(i, "characters", on ? (s.sb?.characters || []).filter((x) => x !== c.id) : [...(s.sb?.characters || []), c.id])} className={on ? btnAmber : btnCls}>
                              {on ? "✓ " : ""}{c.name || "(tanpa nama)"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {project.engine === "slides" && (
                    <div className="mt-2 border-t border-white/10 pt-2">
                      <span className="text-[11px] font-bold tracking-wide text-sky-200/80">GERAK KAMERA (KEYFRAME)</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <div>
                          <label className={labelCls}>Preset gerak</label>
                          <select value={s.motion?.preset || "camera"} onChange={(e) => setMotionPreset(i, e.target.value)} className={inputCls}>
                            <option value="camera">Ikuti kamera storyboard</option>
                            {MOTION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            <option value="custom">Kustom (edit keyframe)</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Easing</label>
                          <select value={s.motion?.easing || "linear"} onChange={(e) => editScene(i, "motion", { preset: s.motion?.preset || "custom", keyframes: s.motion?.keyframes?.length ? s.motion.keyframes : presetKeyframes("kenburns-in"), easing: e.target.value })} className={inputCls}>
                            <option value="linear">Linear</option>
                            <option value="ease-in-out">Ease in-out (untuk 2 keyframe)</option>
                          </select>
                        </div>
                      </div>
                      {(s.motion?.keyframes || []).map((k, ki) => (
                        <div key={ki} className="mt-1 flex flex-wrap items-center gap-1 text-xs text-white/60">
                          <span className="font-semibold text-white/40">KF {ki + 1}</span>
                          <span>waktu</span>
                          <input type="number" min="0" max="100" value={Math.round((k.t ?? 0) * 100)} onChange={(e) => editKeyframe(i, ki, "t", Number(e.target.value) / 100)} className={inputCls} style={{ width: 64 }} />
                          <span>% · zoom</span>
                          <input type="number" min="1" max="2.5" step="0.01" value={k.scale} onChange={(e) => editKeyframe(i, ki, "scale", Number(e.target.value))} className={inputCls} style={{ width: 76 }} />
                          <span>· fokus X</span>
                          <input type="number" min="0" max="100" value={Math.round((k.fx ?? 0.5) * 100)} onChange={(e) => editKeyframe(i, ki, "fx", Number(e.target.value) / 100)} className={inputCls} style={{ width: 64 }} />
                          <span>% · Y</span>
                          <input type="number" min="0" max="100" value={Math.round((k.fy ?? 0.5) * 100)} onChange={(e) => editKeyframe(i, ki, "fy", Number(e.target.value) / 100)} className={inputCls} style={{ width: 64 }} />
                          <span>%</span>
                          {(s.motion?.keyframes?.length || 0) > 1 && <button onClick={() => removeKeyframe(i, ki)} className={btnCls}>×</button>}
                        </div>
                      ))}
                      <div className="mt-1 flex gap-1">
                        <button onClick={() => addKeyframe(i)} disabled={(s.motion?.keyframes?.length || 0) >= 6} className={btnCls}>+ Keyframe</button>
                        {!s.motion && <span className="self-center text-xs text-white/40">Belum diatur — render mengikuti gerakan kamera storyboard ({s.sb?.camera || "bawaan: zoom perlahan"}).</span>}
                      </div>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-white/40">Storyboard tersimpan otomatis bersama naskah dan tercermin ke storyboard.json. Jenis bidikan masuk ke prompt gambar; gerakan kamera menjadi gerak render (atau atur keyframe sendiri di atas).</p>
                </div>
              )}
            </div>
          ))}
          {scenes.length === 0 && <p className="text-sm text-white/50">Belum ada naskah. Klik "Buat naskah" atau tambah scene manual.</p>}
        </div>
      </Section>

      {/* Tahap 2 */}
      <Section no={2} title={project.engine === "stickman" ? (["B2", "B3"].includes(project.stickStyle || "B1") ? "Ilustrasi scene" : "Properti & pose") : project.engine === "darkcard" ? "Tumpukan kartu" : project.engine === "diagram" ? "Diagram" : project.engine === "editorial" ? "Gambar hero" : project.engine === "slides" ? "Visual scene" : "Gambar latar"} desc={project.engine === "stickman" ? ((project.stickStyle || "B1") === "B3" ? "Setiap scene B3 adalah ilustrasi siluet putih/abu satu frame penuh (SDXL) di bidang nyaris hitam dari arahan gambar di tahap 1, atau unggah ilustrasimu sendiri. Tanpa ilustrasi, scene tampil sebagai judul di atas bidang gelap." : (project.stickStyle || "B1") === "B2" ? "Setiap scene B2 adalah ilustrasi warna satu frame penuh (SDXL, gaya hand-drawn di kertas krem) dari arahan gambar di tahap 1, atau unggah ilustrasimu sendiri. Tanpa ilustrasi, scene tampil sebagai judul di atas kertas krem." : "Mode stickman digambar dari pose karakter dan properti crayon bawaan B1 yang dipilih di tahap 1. Properti khusus dibuat otomatis (SDXL gaya crayon) saat mode otomatis berjalan atau sebelum render.") : project.engine === "darkcard" ? "Dark Card tidak memakai gambar: setiap scene menambah satu kartu ke tumpukan yang tampil terus. Urutan tumpukan mengikuti urutan scene; kartu diatur di tahap 1." : project.engine === "diagram" ? "Diagram tidak memakai gambar: satu diagram vektor dibangun bertahap — komponen muncul dan tersambung kabel mengikuti perintah tiap scene dari tahap 1, kamera menyapu ke bagian yang baru. Ringkasan keadaan diagram per scene:" : project.engine === "editorial" ? "Setiap scene Editorial adalah SATU gambar objek hero dari arahan gambar di tahap 1 (gaya kolase editorial ditambahkan otomatis), atau unggah gambarmu sendiri — paling bagus objek tunggal di latar polos krem. Tanpa gambar, scene tidak bisa dirender." : project.engine === "slides" ? "Tiap scene bisa memakai gambar latar atau video Google Flow — boleh dicampur dalam satu video. Generate ulang gambar bisa memakai penyedia berbeda per scene; video Flow dibuat manual dari prompt siap salin lalu diunggah per scene." : "Generate per scene dari prompt di tahap 1, atau unggah gambar sendiri (potret 9:16 disarankan)."}>
        {dirty && <p className="mb-2 text-xs text-amber-300">Ada perubahan naskah belum disimpan — generate memakai prompt yang tersimpan di server.</p>}
        {project.engine === "slides" && (
          <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white/70">Contact sheet — periksa konsistensi karakter & gaya sekilas</span>
              <button onClick={makeSheet} disabled={busy === "sheet"} className={btnCls + " ml-auto"}>{busy === "sheet" ? "Membuat..." : sheet ? "Buat ulang contact sheet" : "Buat contact sheet"}</button>
            </div>
            {sheet?.file && <img src={fileUrl(sheet.file) + `?v=${encodeURIComponent(sheet.updatedAt || "")}`} alt="Contact sheet semua scene" style={{ maxHeight: 420 }} className="mt-2 w-auto rounded" />}
          </div>
        )}
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
        ) : project.engine === "slides" ? (
          <div className="space-y-3">
            <p className="text-xs text-white/50">
              Setiap scene boleh memakai gambar latar ATAU video Google Flow — boleh dicampur dalam satu video. Pilihan "Dipakai" menentukan
              visual scene saat rakit; "Otomatis" memakai video Flow bila klipnya sudah diunggah, selain itu gambar. Generate ulang gambar
              bisa memakai penyedia berbeda per scene.
            </p>
            {scenes.map((s, i) => {
              const used = s.visualChoice === "video" ? "video" : s.visualChoice === "gambar" ? "gambar" : s.video?.status === "ready" ? "video" : "gambar";
              const prov = imgProv[s.id] || exec.imageProvider;
              return (
                <div key={s.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-amber-300">SCENE {i + 1}</span>
                    <span className="text-xs text-white/50">Dipakai saat rakit:</span>
                    <select value={s.visualChoice || "auto"} onChange={(e) => editScene(i, "visualChoice", e.target.value)} className={inputCls} style={{ width: 215 }}>
                      <option value="auto">Otomatis (video bila ada)</option>
                      <option value="video">Video Flow</option>
                      <option value="gambar">Gambar latar</option>
                    </select>
                    <span className={`text-xs font-semibold ${used === "video" ? "text-sky-300" : "text-emerald-300"}`}>{used === "video" ? "→ video Flow" : "→ gambar latar"}</span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-white/10 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Gambar latar{staleBadge(s.image)}</div>
                      <div className="relative mt-2 aspect-[9/16] max-h-60 overflow-hidden rounded bg-white/5">
                        {s.image?.status === "ready" ? (
                          <img src={assetUrl(s.image)} alt={`Gambar scene ${i + 1}`} className="h-full w-full object-cover" />
                        ) : s.image?.status === "generating" ? (
                          <div className="flex h-full animate-pulse items-center justify-center px-3 text-center text-xs text-sky-300">
                            sedang dibuat…{assetStale(s.image) ? " (tampaknya terhenti — klik Generate untuk mencoba lagi)" : ""}
                          </div>
                        ) : s.image?.status === "error" ? (
                          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-red-300">gagal: {s.image.error || "coba lagi"}</div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-white/40">belum ada gambar</div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <select value={prov} onChange={(e) => setImgProv({ ...imgProv, [s.id]: e.target.value })} className={inputCls} style={{ width: 195 }} title="Penyedia gambar untuk scene ini">
                          <option value="pollinations">Pollinations (gratis)</option>
                          <option value="sdxl-9router">Cloudflare SDXL via 9Router</option>
                          <option value="venice">Venice (langsung)</option>
                          <option value="muse-bridge">Muse (bridge)</option>
                          <option value="upload">Unggah manual</option>
                        </select>
                        <button onClick={() => genImage(s)} disabled={busy === "img-" + s.id || !s.imagePrompt || prov === "upload" || (s.image?.status === "generating" && !assetStale(s.image))} className={btnCls} title={prov === "upload" ? "Penyedia gambar: unggah manual" : ""}>
                          {busy === "img-" + s.id ? "Membuat..." : s.image?.status === "generating" && !assetStale(s.image) ? "Sedang dibuat…" : s.image?.status === "ready" ? "Generate ulang" : "Generate"}
                        </button>
                        <label className={btnCls + " cursor-pointer"}>
                          Unggah
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadAsset(s, "image", e.target.files?.[0])} />
                        </label>
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Video Google Flow (manual)</div>
                      {s.video?.status === "ready" ? (
                        <>
                          <video controls src={assetUrl(s.video)} className="mt-2 max-h-60 w-full rounded bg-black" />
                          <div className="mt-1 text-xs text-emerald-300">
                            video siap{s.video.duration ? ` · ${s.video.duration.toFixed(1)} dtk` : ""}{s.video.hasAudio ? " · ada suara bawaan" : " · tanpa suara"}
                          </div>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-white/40">belum ada video — buat di flow.google dari prompt di bawah, unduh hasilnya, lalu unggah di sini</p>
                      )}
                      <textarea readOnly rows={4} value={flowVideoPrompt(project, s)} className={inputCls + " mt-2"} />
                      <div className="mt-2 flex flex-wrap gap-1">
                        <CopyBtn text={flowVideoPrompt(project, s)} label="Salin prompt" />
                        <CopyBtn text={s.narration || ""} label="Salin naskah" />
                        <label className={btnCls + " cursor-pointer"}>
                          {s.video?.status === "ready" ? "Unggah ulang video" : "Unggah video"}
                          <input type="file" accept="video/*" className="hidden" onChange={(e) => uploadAsset(s, "video", e.target.files?.[0])} />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-white/10 p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Layer objek (PNG transparan — bergerak di atas latar)</div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded" style={{ background: "repeating-conic-gradient(#3a3a3a 0% 25%, #262626 0% 50%) 0 0/16px 16px" }}>
                        {s.layer?.status === "ready" ? (
                          <img src={assetUrl(s.layer)} alt={`Layer scene ${i + 1}`} className="h-full w-full object-contain" />
                        ) : s.layer?.status === "generating" ? (
                          <div className="flex h-full animate-pulse items-center justify-center px-1 text-center text-[11px] text-sky-300">sedang dibuat…</div>
                        ) : s.layer?.status === "error" ? (
                          <div className="flex h-full items-center justify-center px-1 text-center text-[11px] text-red-300">gagal: {s.layer.error || "coba lagi"}</div>
                        ) : (
                          <div className="flex h-full items-center justify-center px-1 text-center text-[11px] text-white/40">belum ada layer</div>
                        )}
                      </div>
                      <div className="min-w-52 flex-1 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          <input value={layerPrompt[s.id] ?? s.layer?.prompt ?? ""} onChange={(e) => setLayerPrompt({ ...layerPrompt, [s.id]: e.target.value })} placeholder="Prompt objek (Inggris), mis. a red vintage telephone booth" className={inputCls} style={{ minWidth: 200, flex: 1 }} />
                          <button onClick={() => genLayer(s)} disabled={busy === "layer-" + s.id || s.layer?.status === "generating"} className={btnCls}>{s.layer?.status === "ready" ? "Generate ulang + cutout" : "Generate + cutout"}</button>
                          <label className={btnCls + " cursor-pointer"}>
                            Unggah PNG
                            <input type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={(e) => uploadLayer(s, e.target.files?.[0])} />
                          </label>
                          {s.layer?.status === "ready" && <button onClick={() => deleteLayer(s)} disabled={busy === "layer-" + s.id} className={btnCls}>Hapus</button>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-white/50">Gerak layer:</span>
                          <select value={s.layerMotion?.preset || "diam"} onChange={(e) => saveLayerMotion(s, { preset: e.target.value, scale: s.layerMotion?.scale ?? 0.45 })} className={inputCls} style={{ width: 185 }}>
                            {LAYER_MOTION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                          <span className="text-xs text-white/50">Ukuran:</span>
                          <select value={String(s.layerMotion?.scale ?? 0.45)} onChange={(e) => saveLayerMotion(s, { preset: s.layerMotion?.preset || "diam", scale: Number(e.target.value) })} className={inputCls} style={{ width: 120 }}>
                            {[0.25, 0.35, 0.45, 0.6, 0.8].map((v) => <option key={v} value={String(v)}>{Math.round(v * 100)}% lebar</option>)}
                          </select>
                        </div>
                        <p className="text-xs text-white/40">Generate membuat objek di atas latar hijau pekat lalu membuang latarnya otomatis (chromakey). Paling andal: unggah PNG yang memang transparan.</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {scenes.length === 0 && <p className="text-sm text-white/50">Belum ada naskah.</p>}
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenes.map((s, i) => (
            <div key={s.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
              <div className="relative aspect-[9/16] bg-white/5">
                {s.image?.status === "ready" ? (
                  <img src={assetUrl(s.image)} alt={`Scene ${i + 1}`} className="h-full w-full object-cover" />
                ) : s.image?.status === "generating" ? (
                  <div className="flex h-full animate-pulse items-center justify-center px-3 text-center text-xs text-sky-300">
                    sedang dibuat…{assetStale(s.image) ? " (tampaknya terhenti — klik Generate untuk mencoba lagi)" : ""}
                  </div>
                ) : s.image?.status === "error" ? (
                  <div className="flex h-full items-center justify-center px-3 text-center text-xs text-red-300">gagal: {s.image.error || "coba lagi"}</div>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/40">belum ada gambar</div>
                )}
              </div>
              <div className="p-2">
                <div className="text-xs font-semibold">Scene {i + 1}{staleBadge(s.image)}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button onClick={() => genImage(s)} disabled={busy === "img-" + s.id || !s.imagePrompt || exec.imageProvider === "upload" || (s.image?.status === "generating" && !assetStale(s.image))} className={btnCls} title={exec.imageProvider === "upload" ? "Penyedia gambar: unggah manual" : ""}>
                    {busy === "img-" + s.id ? "Membuat..." : s.image?.status === "generating" && !assetStale(s.image) ? "Sedang dibuat…" : s.image?.status === "ready" ? "Generate ulang" : "Generate"}
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
                  <audio controls src={assetUrl(s.vo)} className="h-9 max-w-full" />
                  <span className="text-xs text-white/50">{s.vo.duration ? `${s.vo.duration.toFixed(1)} dtk` : ""}</span>
                  {staleBadge(s.vo)}
                </>
              ) : s.vo?.status === "generating" ? (
                <span className="text-xs text-sky-300">sedang dibuat…{assetStale(s.vo) ? " (tampaknya terhenti — klik Generate VO untuk mencoba lagi)" : ""}</span>
              ) : s.vo?.status === "error" ? (
                <span className="text-xs text-red-300">gagal: {s.vo.error || "coba lagi"}</span>
              ) : (
                <span className="text-xs text-white/40">belum ada VO</span>
              )}
              <span className="ml-auto flex flex-wrap gap-1">
                <select value={voProv[s.id] || exec.voProvider || "edge-tts"} onChange={(e) => { const p = e.target.value; setVoProv({ ...voProv, [s.id]: p }); setVoVoice({ ...voVoice, [s.id]: defaultVoiceFor(p) }); }} className={inputCls} style={{ width: 160 }} title="Mesin VO untuk scene ini">
                  <option value="edge-tts">edge-tts</option>
                  <option value="gemini-tts">Gemini TTS</option>
                  <option value="muse-bridge">Muse (bridge)</option>
                  <option value="elevenlabs">ElevenLabs</option>
                </select>
                <select value={voVoice[s.id] || exec.voice} onChange={(e) => setVoVoice({ ...voVoice, [s.id]: e.target.value })} className={inputCls} style={{ width: 180 }} title="Suara untuk scene ini">
                  {(() => {
                    const prov = voProv[s.id] || exec.voProvider || "edge-tts";
                    const list = voiceListFor(prov);
                    const cur = voVoice[s.id] || exec.voice;
                    const opts = list.map((v) => <option key={v.id} value={v.id}>{v.label}</option>);
                    if (cur && !list.some((v) => v.id === cur)) opts.unshift(<option key="cur" value={cur}>{cur}</option>);
                    return opts;
                  })()}
                </select>
                <button onClick={() => genVo(s)} disabled={busy === "vo-" + s.id || !s.narration || (s.vo?.status === "generating" && !assetStale(s.vo))} className={btnCls}>
                  {busy === "vo-" + s.id ? "Membuat..." : s.vo?.status === "generating" && !assetStale(s.vo) ? "Sedang dibuat…" : s.vo?.status === "ready" ? "Generate ulang" : "Generate VO"}
                </button>
                <VoRecorder onDone={(f) => uploadAsset(s, "vo", f)} disabled={busy === "vo-" + s.id} />
                <label className={btnCls + " cursor-pointer"}>
                  Unggah
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadAsset(s, "vo", e.target.files?.[0])} />
                </label>
              </span>
              {project.engine === "slides" && (
                <div className="flex basis-full flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-xs text-white/50">
                  <span className="font-semibold uppercase tracking-wide">SFX</span>
                  {s.sfx?.status === "ready" ? (
                    <>
                      <span className="text-emerald-300">♪ {s.sfx.name || "efek suara"}</span>
                      <button onClick={() => deleteSfx(s)} disabled={busy === "sfx-" + s.id} className={btnCls}>Hapus SFX</button>
                    </>
                  ) : (
                    <label className={btnCls + " cursor-pointer"}>
                      Unggah SFX
                      <input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadSfx(s, e.target.files?.[0])} />
                    </label>
                  )}
                  <label className="flex items-center gap-1">Vol VO
                    <input type="number" min={0} max={2} step={0.1} value={s.voVolume ?? 1} onChange={(e) => updSceneAudio(s.id, { voVolume: Number(e.target.value) })} className={inputCls} style={{ width: 64 }} />
                  </label>
                  <label className="flex items-center gap-1">Vol SFX
                    <input type="number" min={0} max={2} step={0.1} value={s.sfxVolume ?? 0.9} onChange={(e) => updSceneAudio(s.id, { sfxVolume: Number(e.target.value) })} className={inputCls} style={{ width: 64 }} />
                  </label>
                  <label className="flex items-center gap-1">Musik scene %
                    <input type="number" min={0} max={100} step={1} value={s.bgmVolume === null || s.bgmVolume === undefined ? "" : Math.round(s.bgmVolume * 100)} placeholder="proyek" onChange={(e) => updSceneAudio(s.id, { bgmVolume: e.target.value === "" ? null : Number(e.target.value) / 100 })} className={inputCls} style={{ width: 64 }} />
                  </label>
                  <span className="text-white/30">SFX berbunyi dari awal scene; perubahan volume tersimpan otomatis.</span>
                </div>
              )}
              {project.engine === "slides" && ["karaoke", "dynamic", "satukata"].includes(project.captionStyle || "frasa") && (
                <div className="flex basis-full flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-xs text-white/50">
                  <span className="font-semibold uppercase tracking-wide">Timestamp kata</span>
                  {s.words?.status === "ready" ? (
                    <span className="text-emerald-300">ASR Gemini — karaoke mengikuti suara asli ({s.words.items?.length || 0} kata)</span>
                  ) : s.words?.status === "generating" ? (
                    <span className="text-sky-300">sedang ditranskripsikan… (bisa 2–4 menit)</span>
                  ) : s.words?.status === "error" ? (
                    <span className="text-red-300">ASR gagal — render memakai perkiraan ({String(s.words.error || "").slice(0, 80)})</span>
                  ) : (
                    <span>perkiraan dari panjang kata — render tetap jalan</span>
                  )}
                  <button onClick={() => genWords(s)} disabled={busy === "words-" + s.id || s.vo?.status !== "ready" || s.words?.status === "generating"} className={btnCls}>
                    {busy === "words-" + s.id ? "Meminta..." : s.words?.status === "ready" ? "Transkrip ulang" : "Transkrip ASR"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Audio Studio */}
      <Section no={4} title="Audio Studio — musik & efek suara" desc="Musik latar diunggah sekali per proyek, lalu dicampur otomatis saat render: musik menunduk (ducking) selama narasi berbicara, fade in/out di awal dan akhir, dan normalisasi loudness ke target LUFS. SFX per scene, volume per scene, dan jeda antar scene berlaku untuk mesin Slides (diatur SFX-nya di tahap 3); mesin lain menerima campuran global (musik + fade + normalisasi).">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Preset audio</label>
            <select value={audioCfg.preset} onChange={(e) => { if (e.target.value !== "kustom") applyAudioPreset(e.target.value); }} className={inputCls}>
              {AUDIO_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              <option value="kustom">Kustom — parameter diubah manual</option>
            </select>
            <p className="mt-1 text-xs text-white/40">Preset mengisi semua parameter di panel ini; mengubah satu nilai saja sesudahnya menjadikan konfigurasi "Kustom".</p>
          </div>
          <div>
            <label className={labelCls}>Musik latar (BGM)</label>
            {project.audio?.bgm?.status === "ready" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-emerald-300">♪ {project.audio.bgm.name || project.audio.bgm.file}</span>
                <label className={btnCls + " cursor-pointer"}>
                  Ganti
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadBgm(e.target.files?.[0])} />
                </label>
                <button onClick={deleteBgm} disabled={busy === "bgm"} className={btnCls}>Hapus</button>
              </div>
            ) : (
              <label className={btnCls + " cursor-pointer inline-block"}>
                {busy === "bgm" ? "Mengunggah..." : "Unggah musik latar"}
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadBgm(e.target.files?.[0])} />
              </label>
            )}
            <p className="mt-1 text-xs text-white/40">MP3/WAV/M4A/OGG milikmu, diloop sampai menutupi durasi video. Tanpa BGM pun fade + normalisasi tetap diterapkan ke narasi.</p>
          </div>
          <div>
            <label className={labelCls}>Volume musik ({Math.round((audioCfg.bgmVolume ?? 0) * 100)}%)</label>
            <input type="range" min={0} max={100} step={1} value={Math.round((audioCfg.bgmVolume ?? 0) * 100)} onChange={(e) => tweakAudio({ bgmVolume: Number(e.target.value) / 100 })} className="w-full" />
          </div>
          <div>
            <label className={labelCls}>Volume narasi ({Math.round((audioCfg.voVolume ?? 1) * 100)}%)</label>
            <input type="range" min={0} max={200} step={5} value={Math.round((audioCfg.voVolume ?? 1) * 100)} onChange={(e) => tweakAudio({ voVolume: Number(e.target.value) / 100 })} className="w-full" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Fade in (dtk)</label>
              <input type="number" min={0} max={15} step={0.1} value={audioCfg.fadeIn} onChange={(e) => tweakAudio({ fadeIn: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fade out (dtk)</label>
              <input type="number" min={0} max={15} step={0.1} value={audioCfg.fadeOut} onChange={(e) => tweakAudio({ fadeOut: Number(e.target.value) })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Jeda narasi (dtk)</label>
              <input type="number" min={0} max={3} step={0.05} value={audioCfg.gap} disabled={project.engine !== "slides"} onChange={(e) => tweakAudio({ gap: Number(e.target.value) })} className={inputCls} />
              {project.engine !== "slides" && <p className="mt-1 text-xs text-white/40">Khusus Slides.</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Normalisasi loudness</label>
              <select value={audioCfg.normalize ? "ya" : "tidak"} onChange={(e) => tweakAudio({ normalize: e.target.value === "ya" })} className={inputCls}>
                <option value="ya">Ya — samakan ke target LUFS</option>
                <option value="tidak">Tidak</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Target (LUFS)</label>
              <input type="number" min={-24} max={-12} step={1} value={audioCfg.targetLufs} onChange={(e) => tweakAudio({ targetLufs: Number(e.target.value) })} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <button onClick={saveAudio} disabled={busy === "saveAudio"} className={btnCls}>
            {busy === "saveAudio" ? "Menyimpan..." : "Simpan pengaturan audio"}
          </button>
          <span className="ml-2 text-xs text-white/40">Ducking otomatis: rasio {audioCfg.duckRatio}:1 terhadap narasi. Volume per scene & SFX ada di tahap 3.</span>
        </div>
      </Section>

      {/* Tahap 5 */}
      <Section no={5} title="Perakitan" desc={project.engine === "stickman" ? `Render draf = pratinjau 20 detik pertama dari renderer stickman; render final = film penuh mengikuti rasio aspek proyek, dengan caption dan efek suara. Gaya aktif: ${project.stickStyle || "B1"}.` : project.engine === "darkcard" ? "Render draf = pratinjau 20 detik pertama; render final = film penuh mengikuti rasio aspek proyek, dengan tumpukan kartu, caption sorot, dan watermark." : project.engine === "diagram" ? "Render draf = pratinjau 20 detik pertama; render final = film penuh mengikuti rasio aspek proyek, dengan diagram yang dibangun bertahap, kamera menyapu, headline & pil status, subtitle karaoke, dan watermark." : project.engine === "editorial" ? "Render draf = pratinjau 20 detik pertama; render final = film penuh mengikuti rasio aspek proyek, dengan tipografi editorial, dorongan zoom pada gambar hero, dan penutup memudar ke putih. Editorial tidak memakai subtitle." : "Render draf (cepat, 540x960) untuk pratinjau, koreksi bila perlu, lalu render final 1080x1920."}>
        {exec.assembly === "export" && project.engine === "slides" ? (
          <div className="text-sm text-white/70">
            Mode rakit manual dipilih. Unduh paket proyek di tahap 6 — berisi still, VO, naskah,
            dan perintah ffmpeg (exports/commands.txt dibuat setelah render pertama; untuk paket awal,
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

      {/* Tahap 6 */}
      <Section no={6} title="Hasil & unduh" desc="Video final dan paket proyek untuk arsip atau rakit manual.">
        {project.renders?.final?.status === "done" ? (
          <div className="flex flex-wrap items-center gap-3">
            <a href={fileUrl(project.renders.final.file)} download className={btnAmber + " inline-block"}>Unduh MP4 final</a>
            <a href={`/api/projects/${id}/package`} className={btnCls + " inline-block py-2"}>Unduh paket proyek (.tar.gz)</a>
            <span className="text-xs text-white/50">Paket berisi naskah (project.json), still, VO, hasil render, dan petunjuk rakit manual.</span>
          </div>
        ) : (
          <p className="text-sm text-white/50">Video final belum tersedia. Selesaikan tahap 4 (render final) atau jalankan mode otomatis.</p>
        )}
        <div className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-400/5 p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-emerald-200">Paket Sosmed — Thumbnail, Caption & Tagar</span>
            <span className="ml-auto flex flex-wrap gap-1">
              <button onClick={draftSocial} disabled={busy === "draftSocial"} className={btnCls}>{busy === "draftSocial" ? "Menyusun draf..." : "Susun draf caption + tagar (AI)"}</button>
              <button onClick={saveSocial} disabled={busy === "saveSocial"} className={btnCls}>{busy === "saveSocial" ? "Menyimpan..." : "Simpan caption & tagar"}</button>
            </span>
          </div>
          <p className="mb-2 text-xs text-white/40">Salin paket ini ke YouTube Shorts / TikTok / Reels saat mengunggah video. Mode otomatis menyusun drafnya setelah render final; edit bebas lalu simpan.</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex w-28 flex-col items-center gap-1">
              {social.thumbnail?.status === "ready" ? (
                <img src={assetUrl(social.thumbnail)} alt="thumbnail" className="w-28 rounded object-cover" style={{ aspectRatio: (project.aspect || "9:16").replace(":", "/") }} />
              ) : (
                <div className="flex w-28 items-center justify-center rounded bg-white/5 px-1 text-center text-[11px] text-white/40" style={{ aspectRatio: (project.aspect || "9:16").replace(":", "/") }}>
                  belum ada thumbnail
                </div>
              )}
              <span className="flex flex-wrap justify-center gap-1">
                <button onClick={composeThumb} disabled={busy === "thumbCompose"} className={btnCls} title="Susun dari gambar scene pertama + judul proyek">Susun</button>
                <button onClick={genThumb} disabled={busy === "thumbGen"} className={btnCls} title="Buat gambar thumbnail via penyedia gambar proyek">Generate</button>
                <label className={btnCls + " cursor-pointer"}>
                  Unggah
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadThumb(e.target.files?.[0])} />
                </label>
                {social.thumbnail?.status === "ready" && (
                  <>
                    <a href={assetUrl(social.thumbnail)} download className={btnCls}>Unduh</a>
                    <button onClick={deleteThumb} disabled={busy === "thumbDel"} className={btnCls}>Hapus</button>
                  </>
                )}
              </span>
            </div>
            <div className="min-w-52 flex-1 space-y-2">
              <div>
                <label className={labelCls}>Caption</label>
                <textarea rows={5} value={social.caption || ""} onChange={(e) => setSocial((prev) => ({ ...prev, caption: e.target.value }))} placeholder="Draf caption untuk postingan..." className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tagar (pisahkan spasi/koma, tanpa #)</label>
                <input value={socialTagsText} onChange={(e) => setSocialTagsText(e.target.value)} placeholder="mis. shorts edukasi sains" className={inputCls} />
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-white/50">Teks siap salin (caption + tagar)</span>
                  <span className="ml-auto"><CopyBtn text={socialCopy} label="Salin semua" /></span>
                </div>
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-xs text-white/70">{socialCopy || "— caption/tagar masih kosong —"}</pre>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
