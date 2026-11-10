// Blok konsistensi karakter & frasa bidikan (Fase A, butir 1+2).
// Modul daun (tanpa impor dari modul aplikasi lain) supaya builder
// prompt mana pun bisa memakainya tanpa risiko siklus impor.
//
// Prinsip v1 (keputusan D3): konsistensi dijaga lewat ANCHOR TEKS —
// blok penampilan baku tiap karakter disisipkan persis sama ke prompt
// gambar semua scene tempat karakter itu hadir, ditambah frasa bidikan
// dari storyboard. Ini mengurangi drift antar-scene; identitas sejati
// (img2img/IP-Adapter) adalah jalur v2 bila provider mendukungnya.

const SHOT_PHRASES = {
  wide: "wide establishing shot",
  medium: "medium shot",
  "close-up": "close-up shot",
  detail: "extreme close-up detail shot",
  aerial: "aerial view",
};

export function shotPhrase(sb) {
  if (!sb) return "";
  return SHOT_PHRASES[sb.shotType] || "";
}

const CAMERA_PHRASES = {
  "zoom-in": "the camera slowly zooms in",
  "zoom-out": "the camera slowly zooms out",
  "pan-left": "the camera slowly pans to the left",
  "pan-right": "the camera slowly pans to the right",
  "tilt-up": "the camera slowly tilts up",
  "tilt-down": "the camera slowly tilts down",
};

export function cameraPhrase(sb) {
  if (!sb) return "";
  return CAMERA_PHRASES[sb.camera] || "";
}

// Blok penampilan semua karakter yang hadir di scene ini, dirujuk dari
// scene.sb.characters (daftar id). Urutan mengikuti daftar karakter
// proyek supaya redaksinya stabil antar-scene.
export function characterBlockFor(project, scene) {
  const ids = scene?.sb?.characters;
  if (!Array.isArray(ids) || !ids.length) return "";
  const parts = [];
  for (const c of project?.characters || []) {
    if (!ids.includes(c.id)) continue;
    const app = String(c.appearance || "").trim();
    if (app) parts.push(`${c.name}: ${app}`);
    else if (c.name) parts.push(`${c.name}`);
  }
  if (!parts.length) return "";
  return `Characters in this scene (keep each character's appearance EXACTLY as described, identical in every scene): ${parts.join("; ")}`;
}

// Konteks karakter untuk penulis naskah/storyboard: daftar nama +
// penampilan yang boleh dirujuk field "characters" per scene.
export function charactersContext(project) {
  const list = (project?.characters || []).filter((c) => c.name);
  if (!list.length) return "";
  const lines = list.map((c) => `- "${c.name}": ${String(c.appearance || "").slice(0, 200)}`);
  return `\n\nDefined characters (assign them to scenes via the "characters" field using EXACTLY these names; do NOT describe their appearance inside imagePrompt — the system injects the fixed appearance text at image-generation time):\n${lines.join("\n")}`;
}

// Petakan nama karakter dari keluaran model ke id karakter proyek
// (pencocokan nama persis, tidak peka huruf besar/kecil).
export function characterIdsByName(project, names) {
  if (!Array.isArray(names)) return [];
  const byName = new Map((project?.characters || []).map((c) => [String(c.name || "").toLowerCase(), c.id]));
  const out = [];
  for (const n of names) {
    const id = byName.get(String(n || "").trim().toLowerCase());
    if (id && !out.includes(id)) out.push(id);
  }
  return out.slice(0, 6);
}
