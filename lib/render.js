import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { projectDir, resolveSceneVisual, renderRel } from "./store.js";
import { audioMixActive, applyFinalMix } from "./audio.js";
import { effectiveMotion, zoompanExprs, layerPosExprs } from "./motion.js";
import { buildCaptionFilters } from "./captions.js";

const FONT_BOLD = path.join(process.cwd(), "public", "fonts", "Inter-ExtraBold-static.ttf");
const FONT_MED = path.join(process.cwd(), "public", "fonts", "Inter-Medium-static.ttf");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-600)}`))
    );
  });
}

// Pecah teks menjadi potongan yang masing-masing muat saat dibungkus ke
// maxLines baris × maxChars karakter. Urutan dan seluruh kata
// dipertahankan — tidak ada kata yang dibuang.
export function captionChunks(text, maxChars, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const chunks = [];
  let cur = [];
  for (const w of words) {
    const trial = [...cur, w].join(" ");
    if (cur.length && wrapText(trial, maxChars, maxLines + 1).split("\n").length > maxLines) {
      chunks.push(cur.join(" "));
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks;
}

export function wrapText(text, maxChars, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = cur + " " + w;
    }
  }
  if (cur.trim() && lines.length < maxLines) lines.push(cur.trim());
  return lines.join("\n");
}

const ASPECT_DIMS = {
  "9:16": { final: [1080, 1920], draft: [540, 960] },
  "1:1": { final: [1080, 1080], draft: [540, 540] },
  "16:9": { final: [1920, 1080], draft: [960, 540] },
};

export async function renderProject(project, kind, log = () => {}) {
  const [w, h] = (ASPECT_DIMS[project.aspect] || ASPECT_DIMS["9:16"])[kind];
  const cfg = kind === "final"
    ? { w, h, fps: 30, crf: 20, preset: "veryfast" }
    : { w, h, fps: 24, crf: 26, preset: "ultrafast" };
  const landscape = cfg.w > cfg.h;
  const dir = projectDir(project.id);
  const workDir = path.join(dir, "previews", `.work-${kind}`);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const commands = [];
  const segFiles = [];
  const bounds = [];
  let totalDur = 0;

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    // Visual per scene: klip Flow atau gambar latar mengikuti pilihan
    // per scene (visualChoice) — campuran keduanya dalam satu video
    // memang didukung.
    const vis = resolveSceneVisual(scene);
    if (!vis) {
      throw new Error(`Scene ${i + 1} belum punya visual siap pakai (gambar latar atau video Flow sesuai pilihan visual scene ini).`);
    }
    const flowMode = vis === "video";
    const stillAbs = flowMode ? null : path.join(dir, scene.image.file);
    const clipAbs = flowMode ? path.join(dir, scene.video.file) : null;
    const voAbs = scene.vo?.status === "ready" && scene.vo.file ? path.join(dir, scene.vo.file) : null;
    // Mode Flow: durasi segmen mengikuti VO bila ada (klip diloop/dipotong
    // mengikutinya); tanpa VO, durasi segmen adalah durasi klip itu
    // sendiri (maks 120 detik) dan suara bawaan klip dipertahankan.
    const dur = flowMode
      ? (voAbs
          ? Math.max(2, (scene.vo?.duration || scene.durationHint || 6) + 0.3)
          : Math.min(120, Math.max(2, scene.video.duration || scene.durationHint || 6)))
      : Math.max(2, (scene.vo?.duration || scene.durationHint || 6) + 0.3);
    // Jeda narasi antar scene (Audio Studio): segmen diperpanjang
    // dengan hening sesudah narasi selesai; visual tetap berjalan.
    const gapAfter = i < project.scenes.length - 1 ? (project.audio?.gap || 0) : 0;
    const segDur = dur + gapAfter;
    bounds.push({ start: totalDur, end: totalDur + segDur, bgmVolume: scene.bgmVolume ?? null });
    totalDur += segDur;
    const frames = Math.max(1, Math.round(segDur * cfg.fps));
    const voGain = (project.audio?.voVolume ?? 1) * (scene.voVolume ?? 1);
    const sfxAbs = scene.sfx?.status === "ready" && scene.sfx.file ? path.join(dir, scene.sfx.file) : null;
    const sfxGain = scene.sfxVolume ?? 0.9;

    const overlayFile = path.join(workDir, `overlay-${i}.txt`);
    const subtitleFile = path.join(workDir, `subtitle-${i}.txt`);
    fs.writeFileSync(overlayFile, wrapText(scene.overlay || scene.title || "", landscape ? 34 : cfg.w >= 1080 ? 20 : 17, 3));
    fs.writeFileSync(subtitleFile, wrapText(scene.narration || "", landscape ? 64 : cfg.w >= 1080 ? 36 : 30, 4));

    // Caption memakai sistem preset (Fase C, lib/captions.js):
    // frasa, karaoke, satukata, editorial, minimal, dynamic,
    // highlight, storytelling. Sumber waktu kata: timestamp ASR
    // Gemini (Fase D) bila scene.words siap & VO tidak basi;
    // selain itu estimasi proporsional karakter.
    const captionFilters = buildCaptionFilters(
      project.captionStyle || "frasa",
      scene.narration || "",
      dur,
      {
        asrItems:
          scene.words?.status === "ready" && !scene.vo?.stale
            ? scene.words.items
            : null,
        cfg,
        fonts: { bold: FONT_BOLD, med: FONT_MED },
        landscape,
        wrapText,
        captionChunks,
        writeText: (name, content) => {
          const f = path.join(workDir, `cap-${i}-${name}`);
          fs.writeFileSync(f, content);
          return f;
        },
      }
    );

    const seg = path.join(workDir, `seg-${String(i).padStart(2, "0")}.mp4`);
    // Judul overlay masuk dengan geser-naik singkat (keyframe teks
    // Fase B); posisi akhir sama dengan tata letak lama.
    const overlayFilter = `drawtext=fontfile=${FONT_BOLD}:textfile=${overlayFile}:fontsize=${Math.round(cfg.w * 0.06)}:fontcolor=white:borderw=3:bordercolor=black@0.55:x=(w-text_w)/2:y=h*0.09+(1-min(t/0.45\\,1))*h*0.018:line_spacing=10`;
    // Layer objek alpha scene ini (Fase B/D4), bila siap.
    const layerAbs = scene.layer?.status === "ready" && scene.layer.file ? path.join(dir, scene.layer.file) : null;
    // Rantai video berlabel: latar -> [layer] -> judul -> caption.
    const buildVideoChain = (bgChain, layerIdx) => {
      const parts = [`${bgChain}[vbg]`];
      let label = "[vbg]";
      if (layerAbs && layerIdx != null) {
        const lp = layerPosExprs(scene.layerMotion, frames);
        const lw = Math.max(2, Math.trunc((cfg.w * lp.scale) / 2) * 2);
        const fadeOutStart = Math.max(0.4, segDur - 0.3).toFixed(2);
        parts.push(`[${layerIdx}:v]scale=w=${lw}:h=-2,format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${fadeOutStart}:d=0.3:alpha=1[lyr]`);
        parts.push(`${label}[lyr]overlay=x='${lp.x}':y='${lp.y}':eof_action=repeat[vbg2]`);
        label = "[vbg2]";
      }
      parts.push(`${label}${[overlayFilter, ...captionFilters, "format=yuv420p"].join(",")}[v]`);
      return parts.join(";");
    };
    let vf, args;
    if (flowMode) {
      // Visual scene adalah klip video unggahan pengguna (dibuat manual
      // di Google Flow): skala & potong ke kanvas proyek, tanpa zoompan.
      // Klip diloop agar menutup durasi segmen lalu dipotong oleh -t.
      // Audio: VO bila ada; selain itu suara bawaan klip; klip tanpa
      // trek audio memakai trek hening.
      args = ["-y", "-stream_loop", "-1", "-i", clipAbs];
      let audioIn, nextIn = 1;
      if (voAbs) { args.push("-i", voAbs); audioIn = `[${nextIn++}:a]`; }
      else if (scene.video.hasAudio) { audioIn = "[0:a]"; }
      else { args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"); audioIn = `[${nextIn++}:a]`; }
      let audioFilter = `${audioIn}volume=${voGain},apad=whole_dur=${segDur.toFixed(2)}[avo]`;
      if (sfxAbs) {
        args.push("-i", sfxAbs);
        audioFilter += `;[${nextIn++}:a]volume=${sfxGain},apad=whole_dur=${segDur.toFixed(2)}[asfx];[avo][asfx]amix=inputs=2:duration=first:dropout_transition=0[a]`;
      } else {
        audioFilter += `;[avo]anull[a]`;
      }
      let layerIdx = null;
      if (layerAbs) { layerIdx = nextIn++; args.push("-loop", "1", "-i", layerAbs); }
      vf = buildVideoChain(
        `[0:v]scale=${cfg.w}:${cfg.h}:force_original_aspect_ratio=increase,crop=${cfg.w}:${cfg.h},fps=${cfg.fps}`,
        layerIdx
      );
      args.push(
        "-filter_complex", `${vf};${audioFilter}`,
        "-map", "[v]", "-map", "[a]",
        "-t", segDur.toFixed(2),
        "-c:v", "libx264", "-preset", cfg.preset, "-crf", String(cfg.crf),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        seg
      );
    } else {
      // Gerak kamera dari keyframe motion scene (Fase B): motion
      // eksplisit per scene, atau bawaan dari arahan kamera storyboard.
      const mo = effectiveMotion(scene);
      const zp = zoompanExprs(mo, frames);
      args = ["-y", "-loop", "1", "-i", stillAbs];
      if (voAbs) args.push("-i", voAbs);
      else args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
      let audioFilter = `[1:a]volume=${voGain},apad=whole_dur=${segDur.toFixed(2)}[avo]`;
      if (sfxAbs) {
        args.push("-i", sfxAbs);
        audioFilter += `;[2:a]volume=${sfxGain},apad=whole_dur=${segDur.toFixed(2)}[asfx];[avo][asfx]amix=inputs=2:duration=first:dropout_transition=0[a]`;
      } else {
        audioFilter += `;[avo]anull[a]`;
      }
      const layerIdx = layerAbs ? (sfxAbs ? 3 : 2) : null;
      if (layerAbs) args.push("-loop", "1", "-i", layerAbs);
      vf = buildVideoChain(
        `[0:v]scale=${cfg.w * 2}:${cfg.h * 2}:force_original_aspect_ratio=increase,crop=${cfg.w * 2}:${cfg.h * 2},zoompan=z='${zp.z}':x='${zp.x}':y='${zp.y}':d=${frames}:s=${cfg.w}x${cfg.h}:fps=${cfg.fps}`,
        layerIdx
      );
      args.push(
        "-filter_complex", `${vf};${audioFilter}`,
        "-map", "[v]", "-map", "[a]",
        "-t", segDur.toFixed(2),
        "-c:v", "libx264", "-preset", cfg.preset, "-crf", String(cfg.crf),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        seg
      );
    }
    commands.push(`ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
    log(`Merender scene ${i + 1}/${project.scenes.length} (${kind})...`);
    await run("ffmpeg", args);
    segFiles.push(seg);
  }

  // Closing poll card (Fase C): a silent 6-second cream card with the
  // question, a lime "+ FOLLOW" pill, the option pills and a comment CTA.
  // Rendered only when the project poll has a question and >= 2 options;
  // emptying the poll in the wizard disables it.
  const pollOpts = (project.poll?.options || []).map((o) => String(o || "").trim()).filter(Boolean);
  if (String(project.poll?.question || "").trim() && pollOpts.length >= 2) {
    // VO polling (bila ada): kartu menyesuaikan durasi VO, minimum
    // tetap 6 detik agar pilihan sempat dibaca.
    const pollVoAbs = project.poll?.vo?.status === "ready" && project.poll.vo.file
      ? path.join(dir, project.poll.vo.file)
      : null;
    const pdur = pollVoAbs ? Math.max(6, (project.poll.vo.duration || 0) + 0.3) : 6;
    totalDur += pdur;
    const qFile = path.join(workDir, "poll-q.txt");
    fs.writeFileSync(qFile, wrapText(project.poll.question, landscape ? 42 : 22, 2));
    const optFiles = pollOpts.map((o, k) => {
      const f = path.join(workDir, `poll-opt-${k}.txt`);
      fs.writeFileSync(f, o.toUpperCase());
      return f;
    });
    const parts = [
      `drawtext=fontfile=${FONT_BOLD}:textfile=${qFile}:fontsize=${Math.round(cfg.w * 0.058)}:fontcolor=0x17202A:x=(w-text_w)/2:y=h*0.09:line_spacing=8`,
    ];
    const fW = Math.round(cfg.w * 0.34), fH = Math.round(cfg.h * (landscape ? 0.075 : 0.042));
    const fX = Math.round((cfg.w - fW) / 2), fY = Math.round(cfg.h * 0.26);
    parts.push(`drawbox=x=${fX}:y=${fY}:w=${fW}:h=${fH}:color=0xB8E62E:t=fill`);
    parts.push(`drawtext=fontfile=${FONT_BOLD}:text='+ FOLLOW':fontsize=${Math.round(cfg.w * 0.042)}:fontcolor=0x17202A:x=(w-text_w)/2:y=${fY}+(${fH}-text_h)/2`);
    const pillW = Math.round(cfg.w * 0.78), pillH = Math.round(cfg.h * (landscape ? 0.11 : 0.06));
    const pillX = Math.round((cfg.w - pillW) / 2);
    const startY = Math.round(cfg.h * 0.40), gapY = Math.round(cfg.h * 0.028);
    pollOpts.forEach((o, k) => {
      const y = startY + k * (pillH + gapY);
      parts.push(`drawbox=x=${pillX}:y=${y}:w=${pillW}:h=${pillH}:color=white:t=fill`);
      parts.push(`drawtext=fontfile=${FONT_BOLD}:textfile=${optFiles[k]}:fontsize=${Math.round(cfg.w * 0.046)}:fontcolor=0x17202A:x=(w-text_w)/2:y=${y}+(${pillH}-text_h)/2`);
    });
    parts.push(`drawtext=fontfile=${FONT_BOLD}:text='TULIS DI KOMENTAR':fontsize=${Math.round(cfg.w * 0.034)}:fontcolor=0x17202A:x=(w-text_w)/2:y=h*0.90`);
    const seg = path.join(workDir, `seg-${String(project.scenes.length).padStart(2, "0")}.mp4`);
    const args = [
      "-y",
      "-f", "lavfi", "-i", `color=c=0xF5EFE2:s=${cfg.w}x${cfg.h}:r=${cfg.fps}:d=${pdur}`,
      ...(pollVoAbs ? ["-i", pollVoAbs] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]),
      "-filter_complex", `[0:v]${parts.join(",")},format=yuv420p[v];[1:a]apad=whole_dur=${pdur}[a]`,
      "-map", "[v]", "-map", "[a]",
      "-t", String(pdur),
      "-c:v", "libx264", "-preset", cfg.preset, "-crf", String(cfg.crf),
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      seg,
    ];
    commands.push(`ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
    log("Merender kartu polling penutup...");
    await run("ffmpeg", args);
    segFiles.push(seg);
  }

  const listFile = path.join(workDir, "list.txt");
  fs.writeFileSync(listFile, segFiles.map((f) => `file '${f}'`).join("\n"));
  const joined = path.join(workDir, "joined.mp4");
  const concatArgs = ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined];
  commands.push(`ffmpeg ${concatArgs.join(" ")}`);
  log("Menggabungkan scene...");
  await run("ffmpeg", concatArgs);

  // Tahap mix akhir Audio Studio (musik latar + ducking + fade +
  // normalisasi) menimpa hasil gabungan sebelum disalin keluar.
  if (audioMixActive(project)) {
    const mixArgs = await applyFinalMix(project, joined, totalDur, bounds, log);
    commands.push(`ffmpeg ${mixArgs.map((a) => (String(a).includes(" ") ? `"${a}"` : a)).join(" ")}`);
  }

  const outRel = renderRel(kind);
  const outAbs = path.join(dir, outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  const fsArgs = ["-y", "-i", joined, "-c", "copy", "-movflags", "+faststart", outAbs];
  commands.push(`ffmpeg ${fsArgs.join(" ")}`);
  await run("ffmpeg", fsArgs);

  fs.writeFileSync(
    path.join(dir, "exports", "commands.txt"),
    `# Perintah ffmpeg terakhir (${kind}) — untuk rakit manual\n\n` + commands.join("\n\n") + "\n"
  );
  fs.writeFileSync(
    path.join(dir, "README-RAKIT.txt"),
    [
      "RAKIT MANUAL",
      "============",
      "Isi paket: project.json (manifest & pengaturan), scenes/ (satu berkas",
      "JSON per scene — urutan mengikuti nomor berkas), script.json (naskah",
      "mentah generator), storyboard.json (bila ada), assets/images/ (gambar",
      "latar), assets/videos/ (video Flow per scene), assets/audio/ (voice",
      "over, VO polling, efek suara), assets/music/ (musik latar),",
      "previews/ (hasil draf), exports/ (hasil final + commands.txt).",
      "Untuk merakit sendiri di PC: install ffmpeg, lalu jalankan perintah",
      "di exports/commands.txt dari folder proyek ini (sesuaikan path file).",
      "",
    ].join("\n")
  );

  return { file: outRel, duration: Math.round(totalDur * 10) / 10 };
}
