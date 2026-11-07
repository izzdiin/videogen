import SettingsForm from "../SettingsForm.js";

export const metadata = { title: "Pengaturan — Videogen" };

export default function SettingsPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold">Pengaturan</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/60">
          Endpoint dan kunci API penyedia AI yang dipakai Videogen untuk naskah, gambar, dan
          voice over. Nilai yang disimpan di sini menggantikan nilai bawaan server (env) dan
          langsung berlaku tanpa restart. Kunci tersimpan di server dan tidak pernah
          ditampilkan kembali.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
}
