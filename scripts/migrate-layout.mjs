// Migrasi massal layout proyek v1 → v2 (Fase E): jalankan di dalam
// container/app setelah deploy build layout v2:
//   node scripts/migrate-layout.mjs
// Memakai DATA_DIR dari env. Aman diulang — proyek yang sudah v2
// tetap konsisten (migrasi bersifat idempoten per berkas).
import fs from "fs";
import { PROJECTS_DIR, migrateProjectLayout } from "../lib/store.js";

const ids = fs
  .readdirSync(PROJECTS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

let ok = 0;
let totalMoved = 0;
for (const id of ids) {
  try {
    const r = migrateProjectLayout(id);
    if (r.migrated) {
      ok++;
      totalMoved += r.filesMoved || 0;
      console.log(`MIGRATED ${id} scenes=${r.scenes} filesMoved=${r.filesMoved}`);
    } else {
      console.log(`SKIP ${id} ${r.reason || ""}`);
    }
  } catch (e) {
    console.log(`ERROR ${id} ${e.message || e}`);
  }
}
console.log(`DONE projects=${ids.length} migrated=${ok} filesMoved=${totalMoved}`);
