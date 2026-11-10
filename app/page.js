import { listProjects } from "../lib/store.js";
import CreateForm from "./CreateForm.js";
import HomeTabs from "./HomeTabs.js";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const projects = listProjects();
  const form = (
    <section>
      <h1 className="text-xl font-bold">Buat proyek baru</h1>
      <p className="mt-1 text-sm text-white/60">
        Isi tema, pilih target audiens dan eksekutor tiap tahap. Setelah proyek dibuat,
        kamu bisa bekerja bertahap dengan koreksi di setiap tahap, atau jalan otomatis sekali klik.
      </p>
      <div className="mt-4">
        <CreateForm />
      </div>
    </section>
  );
  const list = (
    <section>
      <h2 className="text-lg font-bold">Proyek saya</h2>
      {projects.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">Belum ada proyek.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <a
              key={p.id}
              href={`/projects/${p.id}`}
              className="rounded-xl border border-white/10 bg-white/5 p-4 hover:border-amber-400/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{p.title}</span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase">{p.audience}</span>
              </div>
              <div className="mt-2 text-xs text-white/50">
                {p.sceneCount} scene · diubah {new Date(p.updatedAt).toLocaleString("id-ID")}
              </div>
              {p.series && (
                <div className="mt-2 inline-block rounded bg-sky-500/20 px-2 py-0.5 text-xs text-sky-300">
                  📺 {p.series.name} · Eps {p.series.episode}
                </div>
              )}
              {p.hasFinal && (
                <div className="mt-2 inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                  Video final selesai
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </section>
  );
  return (
    <HomeTabs
      form={form}
      list={list}
      initialTab={projects.length > 0 ? "proyek" : "buat"}
      projectCount={projects.length}
    />
  );
}
