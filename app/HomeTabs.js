"use client";
import { useState } from "react";

// Beranda dibagi dua tab: form buat proyek dan daftar proyek, supaya daftar
// yang panjang tidak mendorong form ke bawah (dan sebaliknya).
export default function HomeTabs({ form, list, initialTab = "buat", projectCount = 0 }) {
  const [tab, setTab] = useState(initialTab);
  const btn = (active) =>
    `rounded-lg px-4 py-2 text-sm font-semibold ${
      active ? "bg-amber-400 text-black" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
    }`;
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setTab("buat")} className={btn(tab === "buat")}>
          Buat Proyek Baru
        </button>
        <button onClick={() => setTab("proyek")} className={btn(tab === "proyek")}>
          Proyek Saya{projectCount > 0 ? ` (${projectCount})` : ""}
        </button>
      </div>
      {tab === "buat" ? form : list}
    </div>
  );
}
