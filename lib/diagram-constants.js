// Shared constants for the Diagram engine. Kept in a leaf module (no imports)
// so lib/ai.js can use the component list without importing lib/diagram.js —
// diagram.js imports stickman.js, which imports ai.js, so an ai -> diagram
// edge would close a cycle and break module init (TDZ) in some route bundles.

export const DG_COMPONENTS = [
  "hp", "bts", "server", "monitor", "router", "cloud", "database",
  "orang", "rumah", "gembok", "chat", "dokumen", "kotak",
  "panel-surya", "baterai", "bank", "globe", "satelit", "mobil", "lampu",
];
export const DG_COMPONENT_LABELS = {
  hp: "HP / ponsel", bts: "Menara BTS", server: "Server", monitor: "Monitor / layar",
  router: "Router", cloud: "Cloud", database: "Database", orang: "Orang / pengguna",
  rumah: "Rumah", gembok: "Gembok / enkripsi", chat: "Chat / pesan", dokumen: "Dokumen",
  kotak: "Kotak berlabel (umum)",
  "panel-surya": "Panel surya", baterai: "Baterai", bank: "Bank / gedung bank",
  globe: "Globe / internet", satelit: "Satelit", mobil: "Mobil", lampu: "Lampu / tiang lampu",
};
export const DG_BADGE_COLORS = {
  green: "#1F9D55", orange: "#E8830C", red: "#D64541", blue: "#2470C9", grey: "#6B7280",
};
export const DG_CABLE_COLORS = {
  blue: "#2470C9", red: "#D64541", gold: "#E3A008", green: "#1F9D55", grey: "#8A9199",
};
