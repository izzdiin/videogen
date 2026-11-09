// Audio Studio — jalur musik & suara Videogen.
// Satu konfigurasi audio per proyek (project.audio): musik latar (BGM)
// yang diunggah user, ducking otomatis di bawah narasi (sidechain),
// fade in/out, normalisasi loudness, jeda antar scene, volume per
// scene, dan efek suara (SFX) per scene yang menempel di awal scene —
// tersinkron dengan animasi karena dirender ke segmen scene itu
// sendiri. Preset audio adalah bundel parameter bernama; user bisa
// mengubah tiap parameter sesudahnya (preset lalu tercatat "kustom"
// oleh UI).
//
// Cakupan mesin: Slides menerapkan semuanya (SFX + jeda + volume per
// scene di tingkat segmen, sisanya di tahap mix akhir). Mesin lain
// (stickman/darkcard/diagram/editorial) menerima tahap mix akhir yang
// sama (BGM + ducking + fade + normalisasi) lewat postMixProject —
// tanpa SFX/jeda/volume per scene.
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { projectDir } from "./store.js";
import { sanitizeAudioConfig } from "./audioPresets.js";

export { AUDIO_PRESETS, AUDIO_PRESET_IDS, presetOf, audioFromPreset, sanitizeAudioConfig } from "./audioPresets.js";

// Apakah tahap mix akhir perlu jalan untuk proyek ini?
export function audioMixActive(project) {
  const a = project?.audio;
  if (!a) return false;
  return a.bgm?.status === "ready" || a.normalize !== false || (a.fadeIn || 0) > 0 || (a.fadeOut || 0) > 0;
}

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

const f2 = (n) => Math.max(0, Number(n) || 0).toFixed(2);

// Bangun args ffmpeg tahap mix akhir. inAbs adalah video tergabung
// (video + trek narasi), outAbs tujuan. bounds (opsional, hanya
// Slides) = [{start, end, bgmVolume|null}] untuk volume musik per
// scene: jendela waktu dengan volume absolutnya sendiri.
export function buildFinalMixArgs(project, inAbs, outAbs, totalDur, bounds = []) {
  const a = project.audio;
  const dur = Math.max(1, Number(totalDur) || 1);
  const hasBgm = a.bgm?.status === "ready" && a.bgm.file;
  const fadeIn = Math.min(a.fadeIn || 0, dur / 2);
  const fadeOut = Math.min(a.fadeOut || 0, dur / 2);
  const args = ["-y", "-i", inAbs];
  const filters = [];
  let mixLabel;
  if (hasBgm) {
    const bgmAbs = path.join(projectDir(project.id), a.bgm.file);
    args.push("-stream_loop", "-1", "-i", bgmAbs);
    const base = a.bgmVolume;
    const overrides = bounds.filter((b) => b && b.bgmVolume !== null && b.bgmVolume !== undefined);
    let gainExpr;
    if (overrides.length) {
      // Satu filter volume dengan ekspresi gain per jendela waktu.
      let expr = String(base);
      for (let i = overrides.length - 1; i >= 0; i--) {
        const b = overrides[i];
        expr = `if(between(t\\,${f2(b.start)}\\,${f2(b.end)})\\,${b.bgmVolume}\\,${expr})`;
      }
      gainExpr = `volume='${expr}':eval=frame`;
    } else {
      gainExpr = `volume=${base}`;
    }
    filters.push(`[1:a]atrim=0:${f2(dur)},asetpts=PTS-STARTPTS,${gainExpr}[bgm]`);
    // Ducking: musik menunduk otomatis selama narasi berbicara.
    filters.push(`[0:a]asplit=2[vo][voSC]`);
    filters.push(
      `[bgm][voSC]sidechaincompress=threshold=0.015:ratio=${a.duckRatio || 6}:attack=30:release=350[duck]`
    );
    filters.push(`[vo][duck]amix=inputs=2:duration=first:dropout_transition=0[mixraw]`);
    mixLabel = "mixraw";
  } else {
    mixLabel = "0:a";
  }
  const tail = [];
  if (fadeIn > 0) tail.push(`afade=t=in:st=0:d=${f2(fadeIn)}`);
  if (fadeOut > 0) tail.push(`afade=t=out:st=${f2(Math.max(0, dur - fadeOut))}:d=${f2(fadeOut)}`);
  if (a.normalize !== false) tail.push(`loudnorm=I=${a.targetLufs}:TP=-1.5:LRA=11`, "aresample=44100");
  else tail.push("aresample=44100");
  filters.push(`[${mixLabel}]${tail.join(",")}[aout]`);
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
    "-movflags", "+faststart", outAbs
  );
  return args;
}

// Jalankan tahap mix akhir menimpa berkas inAbs (lewat berkas temp).
export async function applyFinalMix(project, inAbs, totalDur, bounds = [], log = () => {}) {
  const tmp = inAbs.replace(/\.mp4$/, "") + ".mix.mp4";
  const args = buildFinalMixArgs(project, inAbs, tmp, totalDur, bounds);
  log("Mencampur audio (musik latar, fade, normalisasi)...");
  await run("ffmpeg", args);
  fs.renameSync(tmp, inAbs);
  return args;
}

// Untuk mesin selain Slides: terapkan mix akhir pada hasil render
// bila konfigurasi audio proyek aktif. Tanpa batas scene — volume
// musik global + ducking + fade + normalisasi.
export async function postMixProject(project, kind, result, log = () => {}) {
  if (!project || project.engine === "slides" || !audioMixActive(project)) return result;
  const abs = path.join(projectDir(project.id), result.file);
  if (!fs.existsSync(abs)) return result;
  await applyFinalMix(project, abs, result.duration, [], log);
  return result;
}
