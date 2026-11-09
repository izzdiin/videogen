import fs from "fs";
import path from "path";
import { projectDir } from "../../../../../../lib/store.js";

export const dynamic = "force-dynamic";

const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
  ".mp4": "video/mp4", ".json": "application/json", ".txt": "text/plain",
};

export async function GET(req, { params }) {
  const base = projectDir(params.id);
  const rel = (params.path || []).join("/");
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(path.resolve(base)) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return new Response("Not found", { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  const type = TYPES[ext] || "application/octet-stream";
  const size = fs.statSync(abs).size;
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : size - 1;
      const buf = fs.readFileSync(abs).subarray(start, end + 1);
      return new Response(buf, {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(buf.length),
          "Cache-Control": "no-store",
        },
      });
    }
  }
  return new Response(fs.readFileSync(abs), {
    headers: {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
      // Aset scene selalu ditulis ulang pada path yang sama (mis.
      // stills/<scene>.jpg). Tanpa no-store, browser menampilkan byte
      // lama dari cache setelah generate ulang / unggah pengganti —
      // seolah-olah unggahan tidak menggantikan gambar sebelumnya.
      "Cache-Control": "no-store",
    },
  });
}
