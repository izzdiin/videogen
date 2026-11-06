import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { projectDir } from "./store.js";

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
  const workDir = path.join(dir, "renders", `${kind}-work`);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const commands = [];
  const segFiles = [];
  let totalDur = 0;

  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    if (scene.image?.status !== "ready" || !scene.image.file) {
      throw new Error(`Scene ${i + 1} belum punya gambar latar.`);
    }
    const stillAbs = path.join(dir, scene.image.file);
    const voAbs = scene.vo?.status === "ready" && scene.vo.file ? path.join(dir, scene.vo.file) : null;
    const dur = Math.max(2, (scene.vo?.duration || scene.durationHint || 6) + 0.3);
    totalDur += dur;
    const frames = Math.max(1, Math.round(dur * cfg.fps));

    const overlayFile = path.join(workDir, `overlay-${i}.txt`);
    const subtitleFile = path.join(workDir, `subtitle-${i}.txt`);
    fs.writeFileSync(overlayFile, wrapText(scene.overlay || scene.title || "", landscape ? 34 : cfg.w >= 1080 ? 20 : 17, 3));
    fs.writeFileSync(subtitleFile, wrapText(scene.narration || "", landscape ? 64 : cfg.w >= 1080 ? 36 : 30, 4));

    const seg = path.join(workDir, `seg-${String(i).padStart(2, "0")}.mp4`);
    const vf = [
      `[0:v]scale=${cfg.w * 2}:${cfg.h * 2}:force_original_aspect_ratio=increase,crop=${cfg.w * 2}:${cfg.h * 2}`,
      `zoompan=z='min(1+0.12*on/${frames},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${cfg.w}x${cfg.h}:fps=${cfg.fps}`,
      `drawtext=fontfile=${FONT_BOLD}:textfile=${overlayFile}:fontsize=${Math.round(cfg.w * 0.06)}:fontcolor=white:borderw=3:bordercolor=black@0.55:x=(w-text_w)/2:y=h*0.09:line_spacing=10`,
      `drawtext=fontfile=${FONT_MED}:textfile=${subtitleFile}:fontsize=${Math.round(cfg.w * 0.038)}:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=14:x=(w-text_w)/2:y=h-text_h-h*0.055:line_spacing=7`,
      `format=yuv420p[v]`,
    ].join(",");

    const args = ["-y", "-loop", "1", "-i", stillAbs];
    if (voAbs) args.push("-i", voAbs);
    else args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
    args.push(
      "-filter_complex", `${vf};[1:a]apad=whole_dur=${dur.toFixed(2)}[a]`,
      "-map", "[v]", "-map", "[a]",
      "-t", dur.toFixed(2),
      "-c:v", "libx264", "-preset", cfg.preset, "-crf", String(cfg.crf),
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
      seg
    );
    commands.push(`ffmpeg ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
    log(`Merender scene ${i + 1}/${project.scenes.length} (${kind})...`);
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

  const outRel = `renders/${kind}.mp4`;
  const outAbs = path.join(dir, outRel);
  const fsArgs = ["-y", "-i", joined, "-c", "copy", "-movflags", "+faststart", outAbs];
  commands.push(`ffmpeg ${fsArgs.join(" ")}`);
  await run("ffmpeg", fsArgs);

  fs.writeFileSync(
    path.join(dir, "renders", "commands.txt"),
    `# Perintah ffmpeg terakhir (${kind}) — untuk rakit manual\n\n` + commands.join("\n\n") + "\n"
  );
  fs.writeFileSync(
    path.join(dir, "README-RAKIT.txt"),
    [
      "RAKIT MANUAL",
      "============",
      "Isi paket: project.json (naskah & pengaturan), stills/ (gambar latar),",
      "vo/ (voice over per scene), renders/ (hasil MP4 + commands.txt).",
      "Untuk merakit sendiri di PC: install ffmpeg, lalu jalankan perintah",
      "di renders/commands.txt dari folder proyek ini (sesuaikan path file).",
      "Urutan scene mengikuti urutan di project.json.",
      "",
    ].join("\n")
  );

  return { file: outRel, duration: Math.round(totalDur * 10) / 10 };
}
