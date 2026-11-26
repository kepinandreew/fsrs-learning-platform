# Platform Pembelajaran Adaptif Berbasis REST API, FSRS-5, dan AI Content Generator

Arsitektur layanan terpusat (*multi-tenant backend*) yang menyediakan penjadwalan pengulangan berjarak (*spaced repetition*) menggunakan algoritma **FSRS-5 (Free Spaced Repetition Scheduler)**, pembangkit materi otomatis berbasis **Google Gemini API** (*human-in-the-loop* & verifikasi 2 tahap), dasbor analitik pengajar, serta dua aplikasi gim edukasi interaktif berbasis **Phaser 3**.

---

## Struktur Direktori Utama

```text
├── learning-platform-backend/      # REST API Server (Node.js, Express, TypeScript, Prisma, PostgreSQL)
│   ├── prisma/schema.prisma        # Skema basis data multi-tenant, FSRS CardState, ReviewLog, & Progress
│   ├── src/
│   │   ├── fsrs/                   # Implementasi murni algoritma FSRS-5 (19 parameter w0..w18)
│   │   ├── middlewares/            # Isolasi autentikasi ganda: JWT (Developer) & X-API-Key (Client App)
│   │   └── modules/
│   │       ├── auth/               # Registrasi & login Developer maupun Pemain (End-User)
│   │       ├── apps/               # Manajemen tenant aplikasi klien, rotasi API Key, & target retensi
│   │       ├── decks/ & items/     # Manajemen deck, bank soal, versi konten, & caching ETag (HTTP 304)
│   │       ├── ai/                 # Ekstraksi Flashcard & Kuis dari teks/PDF + 2nd-Pass AI Verifier
│   │       ├── evaluation/         # Evaluasi review FSRS, antrean prioritas due, & skor kuis idempoten
│   │       ├── progress/           # Sinkronisasi poin, EXP, streak, & klasemen lintas-gim
│   │       └── analytics/          # 4 metrik analitik pembelajaran, simulator kurva lupa, & ekspor CSV
│   ├── scripts/benchmark-report.ts # Otomasi benchmark FSRS-5, latensi REST API, ETag, & keamanan
│   ├── tests/                      # 39 pengujian unit otomatis (Vitest)
│   └── docs/                       # Dokumentasi kontrak API.md & laporan BENCHMARK_REPORT.md
│
├── learning-platform-dashboard/    # Konsol Pengajar / Pengembang (React 18, TypeScript, Tailwind CSS, Vite)
│   ├── src/pages/
│   │   ├── AppsPage.tsx            # Kelola aplikasi, API Key, Deep-Link QR Code, & API Inspector
│   │   ├── QuestionBankPage.tsx    # CRUD Deck & Soal (Flashcard / Pilihan Ganda) + Audit AI
│   │   ├── AiGeneratorPage.tsx     # Generator soal otomatis dari teks/PDF & penyuntingan draf langsung
│   │   └── AnalyticsPage.tsx       # Pemantauan siswa real-time, 4 indikator analitik, & Simulator FSRS-5
│   └── public/
│       ├── pet-battle.html         # Gim Klien 1: Pet Battle Stadium (PWA Turn-Based Monster RPG)
│       ├── baking-chef.html        # Gim Klien 2: Baking Chef Rush (PWA Patisserie Simulation)
│       └── sw-games.js             # Service Worker Network-First & manifest PWA layar penuh
│
├── pet-battle-game/                # Salinan mandiri Gim Klien 1 (siap di-host terpisah)
└── baking-chef-game/               # Salinan mandiri Gim Klien 2 (siap di-host terpisah)
```

---

## Ringkasan Model Matematika FSRS-5 (`src/fsrs/formulas.ts`)

1. **Kurva Pelupaan (*Retrievability*)**:
   $$R(t, S) = \left(1 + \frac{19}{81} \cdot \frac{t}{S}\right)^{-0.5}$$
2. **Interval Optimal terhadap Target Retensi ($r$)**:
   $$I(r, S) = \frac{S}{19/81} \left(r^{-2} - 1\right)$$
3. **Pembaruan Kesulitan (*Difficulty*) & Stabilitas (*Stability*)**:
   Dihitung secara murni dari umpan balik ingatan subjektif pemain (`AGAIN = 1`, `HARD = 2`, `GOOD = 3`, `EASY = 4`) menggunakan 19 bobot standar FSRS-5 ($w_0 \dots w_{18}$).

---

## Menjalankan Secara Lokal

```bash
# 1. Backend REST API
cd learning-platform-backend
npm install
npx prisma migrate deploy
npm test          # Menjalankan 39 unit test FSRS, AI, Evaluasi, Progress, & Analitik
npm run benchmark # Menjalankan benchmark FSRS-5 & REST API live -> docs/BENCHMARK_REPORT.md
npm run dev       # Berjalan di http://localhost:3000

# 2. Developer Dashboard & Game Clients
cd ../learning-platform-dashboard
npm install
npm run dev       # Berjalan di http://localhost:5173
```
