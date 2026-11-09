// In-memory guard so a project never runs two jobs (render/auto) at once.
export const activeJobs = global.__activeJobs || (global.__activeJobs = new Set());

// Registry pekerjaan per-scene (generate gambar / VO per scene) yang
// berjalan di latar belakang proses server. Kunci: "proyek|scene|jenis",
// nilai: waktu mulai (ISO). Status "generating" yang fosil (lebih dari
// 30 menit, mis. container restart di tengah pembuatan) boleh diambil
// alih oleh permintaan baru.
export const activeSceneJobs = global.__activeSceneJobs || (global.__activeSceneJobs = new Map());
export function sceneJobKey(projectId, sceneId, kind) {
  return `${projectId}|${sceneId}|${kind}`;
}
export const SCENE_JOB_STALE_MS = 30 * 60 * 1000;

// Re-stamps job.at every 45s while a job runs, so a long stage that emits no
// progress messages (a stickman/darkcard render can grind for tens of
// minutes) does not look wedged. The wizard only warns "tampaknya terhenti"
// when no stamp has arrived for 10 minutes — with this heartbeat that only
// happens when the job truly died (e.g. container restart mid-render).
// load/save are passed in to keep this module import-free (no cycles).
export function startJobHeartbeat(id, load, save) {
  const t = setInterval(() => {
    try {
      const p = load(id);
      if (p?.job?.status === "running") {
        p.job = { ...p.job, at: new Date().toISOString() };
        save(p);
      }
    } catch {}
  }, 45000);
  t.unref?.();
  return () => clearInterval(t);
}
