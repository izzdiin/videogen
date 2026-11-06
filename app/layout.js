import "./globals.css";

export const metadata = {
  title: "Videogen — Studio Motion Graphics",
  description: "Buat video motion graphics 5 tahap: naskah, latar, voice over, rakit, unduh.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">
        <header className="border-b border-white/10 bg-black/30">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-bold tracking-tight">
              <span className="text-amber-400">Video</span>gen
              <span className="ml-2 hidden text-xs font-normal text-white/50 sm:inline">
                Studio Motion Graphics
              </span>
            </a>
            <a href="/" className="text-sm text-white/60 hover:text-white">Proyek saya</a>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
