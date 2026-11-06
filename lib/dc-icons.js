// Dark Card icon catalog (pure data — safe for client components).
// The canvas renderer (stickman-runtime/scripts/render-darkcard.mjs) draws
// each of these as stroke glyphs; ids must stay in sync with its ICONS map.
export const DC_ICONS = [
  { id: "file", label: "Berkas" },
  { id: "folder", label: "Folder" },
  { id: "database", label: "Database" },
  { id: "key", label: "Kunci / API key" },
  { id: "lock", label: "Gembok" },
  { id: "shield", label: "Perisai" },
  { id: "check", label: "Centang" },
  { id: "book", label: "Buku / aturan" },
  { id: "globe", label: "Globe / online" },
  { id: "bell", label: "Lonceng / notifikasi" },
  { id: "gear", label: "Gir / pengaturan" },
  { id: "chart", label: "Grafik / monitoring" },
  { id: "clock", label: "Jam / jadwal" },
  { id: "zap", label: "Petir / cepat" },
  { id: "layers", label: "Lapis" },
  { id: "code", label: "Kode" },
];
export const DC_ICON_IDS = DC_ICONS.map((i) => i.id);
