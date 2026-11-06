"use client";
import { useEffect, useState } from "react";

const selectCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-amber-400/60";
const inputCls = selectCls;

export default function ModelPicker({ value, onChange }) {
  const [models, setModels] = useState([]);
  const [checkedAt, setCheckedAt] = useState(null);
  const [probing, setProbing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      setModels(data.models || []);
      setCheckedAt(data.checkedAt || null);
      setProbing(Boolean(data.probing));
    } catch {}
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/models/refresh", { method: "POST" });
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const ids = models.map((m) => m.id);
  const known = value && ids.includes(value);

  return (
    <div>
      <select
        value={known ? value : ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={selectCls}
      >
        <option value="" disabled>
          {models.length ? "Pilih model..." : "Memuat daftar model..."}
        </option>
        {models.map((m) => (
          <option key={m.id} value={m.id} disabled={m.active === false} className={m.active === false ? "text-white/30" : ""}>
            {m.id}
            {m.active === false ? " — not available" : m.active === null ? " — belum diperiksa" : ""}
          </option>
        ))}
      </select>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="atau ketik id model manual (mis. nama combo)"
        className={inputCls + " mt-2"}
      />
      <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
        <span>
          {checkedAt
            ? `Status model diperiksa ${new Date(checkedAt).toLocaleString("id-ID")}${probing ? " · sedang memeriksa ulang..." : ""}`
            : probing
              ? "Sedang memeriksa model mana yang aktif..."
              : "Status model belum diperiksa."}
        </span>
        <button type="button" onClick={refresh} disabled={refreshing} className="underline hover:text-white/70 disabled:opacity-50">
          {refreshing ? "memeriksa..." : "periksa ulang"}
        </button>
      </div>
    </div>
  );
}
