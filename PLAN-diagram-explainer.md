# Rencana: Mesin "Diagram" untuk Videogen (meniru format reel @kemasjumansyahhm)

Sumber studi: reel https://www.instagram.com/reel/DfUWrs6Ap5L/ (4 Nov 2026, ±58 dtk,
dipelajari dari caption + analisis media + tontonan penuh frame demi frame, 6 Nov 2026).

## DNA format aslinya

1. **Satu diagram besar, bukan potongan gambar per adegan.** Satu ilustrasi vektor datar
   (gaya isometrik ringan) di atas kanvas krem/pucat dibangun bertahap sepanjang video;
   kamera virtual menyapu & memperbesar antar-bagian.
2. **Headline seksi di kiri atas**: sans tebal hitam 2 baris, satu kata kunci berwarna
   merah-oranye. Diganti utuh tiap seksi, hilang di penutup.
3. **Perabot tetap**: baris subjek + kotak centang langkah (kosong → "?" → ✓ → ✗) dan
   pil status kanan atas yang berganti tiap seksi (warna mengikuti makna).
4. **Aliran data digambar**: kabel antar-komponen digambar progresif, paket kotak kecil
   bergerak di sepanjangnya; animasi ambient kecil (busur Wi-Fi berdenyut, lampu server).
5. **Kartu data hitam** gaya terminal muncul di sebagian seksi: baris-baris mono berisi
   data contoh (dari→ke, jam, sel BTS).
6. **Subtitle karaoke**: pil hitam membulat di bawah-tengah, satu frasa pendek per
   tampilan, satu kata kunci disorot hitam-di-atas-kuning mengikuti narasi.
7. **Watermark** handle kecil abu di tengah, tepat di bawah bilah subtitle, selalu tampil.
8. **Penutup**: kamera mundur ke tampilan lebar seluruh diagram, diam beberapa detik.
   Tanpa kartu akhir/CTA di dalam video.

Struktur naskah: hook (headline paradoks) → perkenalan istilah → langkah 1..N
(tiap langkah = satu seksi: headline + elemen diagram baru + status) → nuansa/pengecualian
→ kesimpulan satu kalimat → bidik lebar diam.

## Pemetaan ke Videogen

Mesin baru `diagram`, sejajar `slides`/`stickman`/`darkcard`:

- **Renderer lokal canvas** (`lib/diagram.js`), mengikuti pola `lib/darkcard.js`:
  tanpa gambar AI (cepat, gratis, deterministik), VO per seksi via pipeline yang ada,
  durasi seksi dari durasi VO (`probeDuration`, sama seperti darkcard).
- **Tahap naskah** memakai mode prompt baru: model menghasilkan naskah TERSTRUKTUR,
  bukan prosa bebas. Per seksi: `headline` + `accent` (kata yang diwarnai),
  `badge` + warna pil, `narration`, daftar operasi diagram (`ops`), dan target kamera.
  Operasi: `add <komponen>`, `connect A->B warna`, `card` (kartu data + barisnya),
  `tracker` (label + status kotak), `focus <komponen>`.
- **Pustaka komponen** digambar dengan kode (gaya datar isometrik ringan, garis tipis,
  bayangan lembut): hp, menara-bts, server, monitor, router, cloud, database, orang,
  rumah, panel-surya, baterai, gembok, gelembung-chat, dokumen, bank, globe, satelit,
  mobil, lampu. Komponen tak dikenal → kotak generik berlabel (fallback aman).
- **Kamera**: transformasi canvas pan/zoom dengan easing antar target seksi.
  Efisiensi di laptopgrt (Atom): lapisan diagram statis digambar sekali ke canvas
  offscreen lalu dikomposit; yang digambar ulang per frame hanya kamera, paket
  bergerak, dan denyut ambient. Target 30 fps.
- **Subtitle karaoke**: frasa pendek per seksi dibagi dari teks narasi; waktu tampil
  diestimasi proporsional jumlah karakter terhadap durasi VO (teknik yang sudah
  dipakai darkcard untuk cues); kata sorotan = kata aksen dari naskah bila ada,
  fallback kata terpanjang dalam frasa.
- **UI**: pemilih mesin bertambah "Diagram". Editor per seksi menampilkan ringkasan
  (headline, badge, ops) — pengeditan ops penuh menyusul di fase 3.
- Rasio 9:16 lebih dulu (format asal); 1:1 & 16:9 mengikuti lewat tata letak kamera.

## Fase

**Fase 1 — MVP (inti format)**
Renderer + ±10 komponen inti + kabel statis digambar progresif + kamera pan/zoom +
headline & pil status + subtitle karaoke frasa + watermark handle (pakai kolom
watermark yang sudah ada di Dark Card) + mode prompt naskah terstruktur + kabel
pipeline (`pipeline.js` dispatch `diagram` → `renderDiagram`).
Perkiraan: renderer+komponen 400–600 baris, prompt+wiring ±150 baris, UI ±100 baris.
Uji: proyek contoh topik teknis (mis. "cara kerja internet masuk rumah") render E2E.

**Fase 2 — Perabot khas**
Paket bergerak di kabel + tracker kotak centang langkah + kartu data terminal +
animasi ambient (denyut Wi-Fi, lampu server berkedip) + bidik penutup lebar diam.
Perkiraan: 200–300 baris.

**Fase 3 — Penyempurnaan**
Editor ops per seksi di UI, komponen tambahan sesuai kebutuhan topik, tema gelap
opsional, dukungan 1:1 & 16:9 penuh.

## Batasan jujur

- Sorotan karaoke adalah estimasi proporsional, bukan alignment kata persis;
  aslinya pun menyorot ±1 kata kunci per frasa pendek, jadi dekat secara visual.
- Kualitas hasil tergantung model naskah memetakan topik ke pustaka komponen;
  topik di luar pustaka tampil sebagai kotak berlabel (tetap rapi, kurang kaya).
- Render vektor per frame di Atom harus dibuktikan di fase 1 (mitigasi: caching
  lapisan + turun ke 24 fps bila perlu). Jauh lebih ringan daripada pasca-TV B3.
- Tanpa biaya kuota gambar; biaya hanya VO (edge-tts gratis / Gemini TTS seperti biasa).

## Keputusan yang dibutuhkan

1. Nama mesin di UI: "Diagram" (usulan) atau nama lain.
2. Cakupan awal: Fase 1 saja, atau Fase 1+2 sekalian.
3. Palet: setia ke asli (krem + merah-oranye) atau aksen bisa dipilih seperti Dark Card.
