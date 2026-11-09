"use client";
import { useEffect, useState } from "react";
import { VOICES, GEMINI_VOICES, MUSE_VOICES, ELEVENLABS_VOICES, defaultVoice, defaultGeminiVoice, defaultClaudeVoice, defaultElevenLabsVoice } from "../lib/voices.js";
import { VISUAL_STYLES } from "../lib/visualStyles.js";
import ModelPicker from "./ModelPicker.js";
import VoicePreview from "./VoicePreview.js";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-amber-400/60";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-white/50";

export default function CreateForm() {
  const [audience, setAudience] = useState("id");
  const [voice, setVoice] = useState(defaultVoice("id"));
  const [voProvider, setVoProvider] = useState("edge-tts");
  const [scriptModel, setScriptModel] = useState("");
  const [engine, setEngine] = useState("slides");
  const [stickStyle, setStickStyle] = useState("B1");
  const [visualStyle, setVisualStyle] = useState("bebas");
  const [imageProvider, setImageProvider] = useState("pollinations");
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [targetDuration, setTargetDuration] = useState("55");
  const [sceneCount, setSceneCount] = useState("6");
  const [captionStyle, setCaptionStyle] = useState("frasa");
  const [scriptTemplate, setScriptTemplate] = useState("");
  const [dgMode, setDgMode] = useState("akumulasi");
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planApplied, setPlanApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (voProvider !== "gemini-tts" && voProvider !== "muse-bridge" && voProvider !== "elevenlabs") setVoice(defaultVoice(audience));
  }, [audience]);

  function changeVoProvider(p) {
    setVoProvider(p);
    setVoice(p === "gemini-tts" ? defaultGeminiVoice() : p === "muse-bridge" ? defaultClaudeVoice() : p === "elevenlabs" ? defaultElevenLabsVoice() : defaultVoice(audience));
  }

  async function askDirector() {
    setPlanBusy(true);
    setPlanError("");
    setPlan(null);
    setPlanApplied(false);
    try {
      const res = await fetch("/api/director/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, audience, model: scriptModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI Director gagal menyusun rencana.");
      setPlan(data.plan);
    } catch (err) {
      setPlanError(String(err.message || err));
    }
    setPlanBusy(false);
  }

  function applyPlan() {
    if (!plan) return;
    setEngine(plan.mesin);
    if (plan.gayaStickman) setStickStyle(plan.gayaStickman);
    if (plan.modeDiagram) setDgMode(plan.modeDiagram);
    if (plan.visual) setVisualStyle(plan.visual);
    setAspect(plan.rasio);
    setTargetDuration(String(plan.durasiDetik));
    setSceneCount(String(plan.jumlahScene));
    if (plan.gayaSubtitle) setCaptionStyle(plan.gayaSubtitle);
    setScriptTemplate(plan.templateNaskah || "");
    changeVoProvider(plan.voiceProvider);
    setImageProvider(plan.penyediaGambar);
    if (!title.trim() && plan.judulUsulan) setTitle(plan.judulUsulan);
    setPlanApplied(true);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.target);
    const payload = {
      title: fd.get("title"),
      theme: fd.get("theme"),
      audience,
      aspect: fd.get("aspect"),
      targetDuration: Number(fd.get("targetDuration")),
      sceneCount: Number(fd.get("sceneCount")),
      style: fd.get("style"),
      engine,
      stickStyle,
      visualStyle,
      dcWatermark: fd.get("dcWatermark"),
      dcAccent: fd.get("dcAccent"),
      dgWatermark: fd.get("dgWatermark"),
      dgAccent: fd.get("dgAccent"),
      dgTheme: fd.get("dgTheme"),
      dgMode: fd.get("dgMode"),
      edWatermark: fd.get("edWatermark"),
      edAccent: fd.get("edAccent"),
      captionStyle: fd.get("captionStyle"),
      scriptTemplate: fd.get("scriptTemplate"),
      scriptModel,
      imageProvider,
      voProvider,
      voice,
      assembly: fd.get("assembly"),
      mode: fd.get("mode"),
      director: planApplied && plan ? plan : undefined,
    };
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat proyek.");
      window.location.href = `/projects/${data.project.id}`;
    } catch (err) {
      setError(String(err.message || err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className={labelCls}>Judul proyek</label>
        <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Potensi Krisis Minyak" className={inputCls} />
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Tema / ide video</label>
        <textarea name="theme" required rows={3} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Jelaskan ide videonya: topik, sudut pandang, data atau pesan utama..." className={inputCls} />
      </div>
      <div className="md:col-span-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">🎬 AI Director — Perencana Produksi Otomatis</div>
            <p className="mt-0.5 text-xs text-white/40">
              Tulis tema di atas, lalu biarkan AI Director menyusun strategi produksinya: kategori, target audiens, durasi, rasio, visual, mesin rendering, suara, subtitle, dan musik. Kamu tinggal meninjau dan menerapkan — tanpa perlu memahami semua mesin.
            </p>
          </div>
          <button
            type="button"
            disabled={planBusy || theme.trim().length < 8}
            onClick={askDirector}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50"
          >
            {planBusy ? "Menyusun rencana..." : plan ? "Susun Ulang" : "Susun Rencana"}
          </button>
        </div>
        {planError && <div className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{planError}</div>}
        {plan && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {[
                ["Kategori", plan.kategori],
                ["Target audiens", plan.targetAudiensLabel],
                ["Durasi", `${plan.durasiDetik} detik · ${plan.jumlahScene} scene`],
                ["Rasio", plan.rasio],
                ["Visual", plan.visualLabel || (plan.mesin === "stickman" ? `Stickman ${plan.gayaStickman}` : "Mengikuti mesin")],
                ["Rendering", plan.mesinLabel + (plan.modeDiagram ? ` · mode ${plan.modeDiagram}` : "")],
                ["Voice", plan.voiceLabel],
                ["Subtitle", plan.gayaSubtitleLabel],
                ["Musik", plan.musik],
                ["Penyedia gambar", plan.penyediaGambarLabel],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="w-32 shrink-0 text-white/40">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
            {plan.alasan && <p className="mt-2 text-xs text-white/50">{plan.alasan}</p>}
            <p className="mt-1 text-xs text-white/30">
              Disusun oleh model {plan.modelDipakai}. Musik dicatat sebagai arahan suasana di rencana proyek — Videogen belum merender musik latar. Target audiens diteruskan ke penulis naskah agar nada narasi menyesuaikan.
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={applyPlan}
                disabled={planApplied}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-60"
              >
                {planApplied ? "✓ Rencana diterapkan — periksa formulir, lalu klik Buat Proyek" : "Terapkan Rencana ke Formulir"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Rasio aspek</label>
        <select name="aspect" className={inputCls} value={aspect} onChange={(e) => setAspect(e.target.value)}>
          <option value="9:16">9:16 — vertikal (Reels/TikTok/Shorts)</option>
          <option value="1:1">1:1 — persegi (feed)</option>
          <option value="16:9">16:9 — lanskap (YouTube)</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Target audiens</label>
        <select value={audience} onChange={(e) => setAudience(e.target.value)} className={inputCls}>
          <option value="id">Lokal — Bahasa Indonesia</option>
          <option value="en">Luar — English</option>
        </select>
        <p className="mt-1 text-xs text-white/40">Menentukan bahasa naskah, suara VO, dan subtitle.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Durasi (detik)</label>
          <input name="targetDuration" type="number" min={15} max={300} value={targetDuration} onChange={(e) => setTargetDuration(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Jumlah scene</label>
          <input name="sceneCount" type="number" min={2} max={20} value={sceneCount} onChange={(e) => setSceneCount(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Catatan gaya visual (opsional)</label>
        <input name="style" placeholder="mis. sinematik, latar gelap, aksen amber, banyak ruang kosong untuk teks" className={inputCls} />
      </div>

      <div className="md:col-span-2 border-t border-white/10 pt-3">
        <div className="text-sm font-semibold">Eksekutor per tahap</div>
        <p className="text-xs text-white/40">Bisa diganti lagi nanti di halaman proyek.</p>
      </div>
      <div>
        <label className={labelCls}>Model penulis naskah (9Router)</label>
        <ModelPicker value={scriptModel} onChange={setScriptModel} />
      </div>
      <div>
        <label className={labelCls}>Voice over</label>
        <select value={voProvider} onChange={(e) => changeVoProvider(e.target.value)} className={inputCls}>
          <option value="edge-tts">edge-tts (otomatis)</option>
          <option value="gemini-tts">Gemini TTS via 9Router (lebih ekspresif)</option>
          <option value="muse-bridge">Muse (bridge) — dibacakan Muse, tanpa kuota</option>
          <option value="elevenlabs">ElevenLabs</option>
          <option value="upload">Unggah manual per scene</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Suara voice over</label>
        <select value={voice} onChange={(e) => setVoice(e.target.value)} className={inputCls}>
          {(() => {
            const list = voProvider === "gemini-tts" ? GEMINI_VOICES : voProvider === "muse-bridge" ? MUSE_VOICES : voProvider === "elevenlabs" ? ELEVENLABS_VOICES : VOICES[audience];
            const opts = list.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ));
            if (voProvider === "elevenlabs" && voice && !ELEVENLABS_VOICES.some((v) => v.id === voice)) {
              opts.unshift(<option key="custom" value={voice}>Suara kustom ({voice})</option>);
            }
            return opts;
          })()}
        </select>
        {voProvider === "elevenlabs" && (
          <input
            value={ELEVENLABS_VOICES.some((v) => v.id === voice) ? "" : (voice || "")}
            onChange={(e) => { const v = e.target.value.trim(); setVoice(v || defaultElevenLabsVoice()); }}
            placeholder="ID suara kustom (mis. hasil kloning) — kosongkan untuk suara bawaan"
            className={inputCls + " mt-2"}
          />
        )}
        <VoicePreview voice={voice} provider={voProvider} />
      </div>
      <div>
        <label className={labelCls}>Mesin video</label>
        <select value={engine} onChange={(e) => setEngine(e.target.value)} className={inputCls}>
          <option value="slides">Slides — gambar AI + gerak zoom</option>
          <option value="stickman">Stickman — gambar tangan (kaomei/stickman-video-director)</option>
          <option value="darkcard">Dark Card — kartu UI gelap (listicle teknologi)</option>
          <option value="diagram">Diagram — diagram vektor penjelas (ala reel edukasi teknis)</option>
          <option value="editorial">Editorial — motion graphics editorial (satu objek hero + tipografi raksasa)</option>
        </select>
        <p className="mt-1 text-xs text-white/40">
          {engine === "stickman"
            ? stickStyle === "B3"
              ? "Setiap scene adalah ilustrasi siluet putih/abu satu frame penuh di bidang nyaris hitam (SDXL), judul uppercase ringkas, caption putih tanpa label, dan finish televisi analog (bloom + scanline lembut). Pilihan gambar latar & perakitan di bawah tidak berlaku."
              : stickStyle === "B2"
              ? "Setiap scene adalah ilustrasi warna satu frame penuh di atas kertas krem hangat (SDXL), judul tulisan tangan, caption di label kertas gading. Pilihan gambar latar & perakitan di bawah tidak berlaku."
              : "Figur stickman digambar lapis demi lapis dengan teks tulisan tangan besar, properti crayon, caption semantik, dan efek suara kecil. Pilihan gambar latar & perakitan di bawah tidak berlaku."
            : engine === "darkcard"
              ? "Latar navy gelap, chip label + judul mono, tumpukan kartu berikon yang bertambah tiap scene, caption besar dengan satu frasa disorot. Tanpa gambar AI; pilihan gambar latar & perakitan tidak berlaku."
              : engine === "diagram"
              ? "Satu diagram vektor di atas kanvas krem yang dibangun bertahap (komponen muncul, kabel tersambung, kamera menyapu), headline per seksi dengan satu kata berwarna aksen, pil status, dan subtitle karaoke. Tanpa gambar AI; pilihan gambar latar & perakitan tidak berlaku."
              : engine === "editorial"
              ? "Kertas krem, satu gambar objek hero per scene (AI) dengan dorongan zoom pelan, headline huruf condensed raksasa + satu kata serif italic berwarna aksen + pil label kecil, potongan cepat, TANPA subtitle (tipografi adalah pengaitnya), penutup memudar ke putih. Pilihan perakitan tidak berlaku."
              : "Setiap scene adalah gambar AI diam yang digerakkan (zoom) dengan overlay dan subtitle."}
        </p>
      </div>
      {engine === "slides" && (
        <div>
          <label className={labelCls}>Gaya visual (katalog Style 1–5)</label>
          <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className={inputCls}>
            {VISUAL_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-white/40">Preset arah gambar dari katalog stickman-video-director, diterapkan sebagai arahan prompt gambar tiap scene. Bisa diganti lagi di halaman proyek.</p>
        </div>
      )}
      {engine === "stickman" && (
        <div>
          <label className={labelCls}>Gaya stickman</label>
          <select value={stickStyle} onChange={(e) => { setStickStyle(e.target.value); if (e.target.value === "B2" || e.target.value === "B3") setImageProvider("sdxl-9router"); }} className={inputCls}>
            <option value="B1">B1 — Minimal hitam-putih (pose + properti crayon)</option>
            <option value="B2">B2 — Colorful hand-drawn (ilustrasi warna per scene)</option>
            <option value="B3">B3 — Retro TV (siluet putih/abu di bidang gelap + finish TV)</option>
          </select>
          <p className="mt-1 text-xs text-white/40">Bisa diganti lagi di halaman proyek (panel Eksekutor tahap).</p>
        </div>
      )}
      {engine === "darkcard" && (
        <>
          <div>
            <label className={labelCls}>Watermark Dark Card (bebas, boleh kosong)</label>
            <input name="dcWatermark" placeholder="mis. @handleku | situsku.com" className={inputCls} />
            <p className="mt-1 text-xs text-white/40">Teks kecil di dasar video, identitas kanalmu sendiri. Bisa diubah lagi di halaman proyek.</p>
          </div>
          <div>
            <label className={labelCls}>Warna aksen Dark Card</label>
            <input name="dcAccent" type="color" defaultValue="#F26D8D" className="h-10 w-24 cursor-pointer rounded-lg border border-white/15 bg-white/5 px-1 py-1" />
            <p className="mt-1 text-xs text-white/40">Untuk chip label, garis kartu terbaru, dan sorotan caption. Bisa diubah lagi di halaman proyek.</p>
          </div>
        </>
      )}
      {engine === "slides" && (
        <>
          <div>
            <label className={labelCls}>Gaya caption Slides</label>
            <select name="captionStyle" className={inputCls} value={captionStyle} onChange={(e) => setCaptionStyle(e.target.value)}>
              <option value="frasa">Frasa — kotak subtitle biasa di bawah</option>
              <option value="satukata">Satu Kata — satu kata raksasa per ketukan (ala kartun 2D), satu kata disorot lime</option>
            </select>
            <p className="mt-1 text-xs text-white/40">Bisa diubah lagi di halaman proyek.</p>
          </div>
          <div>
            <label className={labelCls}>Template naskah Slides</label>
            <select name="scriptTemplate" className={inputCls} value={scriptTemplate} onChange={(e) => setScriptTemplate(e.target.value)}>
              <option value="">Standar — alur hook → konteks → poin → penutup</option>
              <option value="andai">Andai-Andai — cerita "gimana kalau..." langkah demi langkah (ala what-if)</option>
            </select>
            <p className="mt-1 text-xs text-white/40">Naskah Slides selalu menyertakan saran kartu polling penutup; bisa diedit/dikosongkan di halaman proyek.</p>
          </div>
        </>
      )}
      {engine === "editorial" && (
        <>
          <div>
            <label className={labelCls}>Watermark Editorial (bebas, boleh kosong)</label>
            <input name="edWatermark" placeholder="mis. @handleku" className={inputCls} />
            <p className="mt-1 text-xs text-white/40">Teks kecil di dasar video, identitas kanalmu sendiri. Bisa diubah lagi di halaman proyek.</p>
          </div>
          <div>
            <label className={labelCls}>Warna aksen Editorial</label>
            <input name="edAccent" type="color" defaultValue="#E94F1E" className="h-10 w-24 cursor-pointer rounded-lg border border-white/15 bg-white/5 px-1 py-1" />
            <p className="mt-1 text-xs text-white/40">Untuk pil label dan kata serif italic tiap scene. Bisa diubah lagi di halaman proyek.</p>
          </div>
        </>
      )}
      {engine === "diagram" && (
        <>
          <div>
            <label className={labelCls}>Watermark Diagram (bebas, boleh kosong)</label>
            <input name="dgWatermark" placeholder="mis. @handleku" className={inputCls} />
            <p className="mt-1 text-xs text-white/40">Teks kecil di bawah subtitle, identitas kanalmu sendiri. Bisa diubah lagi di halaman proyek.</p>
          </div>
          <div>
            <label className={labelCls}>Warna aksen Diagram</label>
            <input name="dgAccent" type="color" defaultValue="#E4572E" className="h-10 w-24 cursor-pointer rounded-lg border border-white/15 bg-white/5 px-1 py-1" />
            <p className="mt-1 text-xs text-white/40">Untuk kata kunci pada headline tiap seksi. Bisa diubah lagi di halaman proyek.</p>
          </div>
          <div>
            <label className={labelCls}>Tema Diagram</label>
            <select name="dgTheme" className={inputCls} defaultValue="light">
              <option value="light">Terang — kanvas krem (gaya asli)</option>
              <option value="dark">Gelap — kanvas gelap</option>
            </select>
            <p className="mt-1 text-xs text-white/40">Bisa diubah lagi di halaman proyek.</p>
          </div>
          <div>
            <label className={labelCls}>Mode Diagram</label>
            <select name="dgMode" className={inputCls} value={dgMode} onChange={(e) => setDgMode(e.target.value)}>
              <option value="akumulasi">Akumulasi — satu diagram dibangun bertahap (gaya asli)</option>
              <option value="bedah">Bedah — halaman diagram per scene + kartu angka besar (ala bedah sains)</option>
            </select>
            <p className="mt-1 text-xs text-white/40">Mode Bedah: tiap scene adalah halaman sendiri (headline + kartu data angka raksasa + diagram subjek dengan panah aliran + caption kata kunci). Bisa diubah lagi di halaman proyek; naskah perlu dibuat ulang setelah ganti mode.</p>
          </div>
        </>
      )}
      <div>
        <label className={labelCls}>{engine === "stickman" && (stickStyle === "B2" || stickStyle === "B3") ? `Ilustrasi scene ${stickStyle}` : "Gambar latar"}</label>
        <select value={imageProvider} onChange={(e) => setImageProvider(e.target.value)} className={inputCls} disabled={engine === "darkcard" || engine === "diagram" || (engine === "stickman" && stickStyle === "B1")}>
          <option value="pollinations">Pollinations (gratis, otomatis)</option>
          <option value="sdxl-9router">Cloudflare SDXL via 9Router</option>
          <option value="venice">Venice (langsung)</option>
          <option value="muse-bridge">Muse (bridge) — dibuat Muse sendiri, lambat</option>
          <option value="upload">Unggah manual per scene</option>
        </select>
        {engine === "stickman" && (stickStyle === "B2" || stickStyle === "B3") && (
          <p className="mt-1 text-xs text-white/40">Penyedia ini menggambar ilustrasi tiap scene {stickStyle}. Cloudflare SDXL paling mendekati gaya referensi {stickStyle}.</p>
        )}
        {engine === "stickman" && stickStyle === "B1" && (
          <p className="mt-1 text-xs text-white/40">B1 tidak memakai gambar latar; pilihan ini tidak berlaku.</p>
        )}
      </div>
      <div>
        <label className={labelCls}>Perakitan</label>
        <select name="assembly" className={inputCls} defaultValue="server" disabled={engine !== "slides"}>
          <option value="server">Di server ini (ffmpeg)</option>
          <option value="export">Ekspor paket, rakit manual di PC saya</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Mode kerja</label>
        <select name="mode" className={inputCls} defaultValue="manual">
          <option value="manual">Bertahap (dengan koreksi tiap tahap)</option>
          <option value="auto">Otomatis — langsung jalan sampai MP4</option>
        </select>
      </div>

      {error && <div className="md:col-span-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</div>}
      <div className="md:col-span-2">
        <button disabled={busy} className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50">
          {busy ? "Membuat..." : "Buat proyek"}
        </button>
      </div>
    </form>
  );
}
