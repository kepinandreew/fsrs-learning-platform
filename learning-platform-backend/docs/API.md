# Dokumentasi Endpoint REST API — Learning Platform (FSRS-5)

Sumber kebenaran: [`src/app.ts`](../src/app.ts).
- **Base URL Lokal**: `http://localhost:3000`
- **Base URL Produksi (Vercel + Supabase)**: `https://fsrs-learning-platform.vercel.app`

Semua respons JSON memakai amplop standar:
- Sukses: `{ "success": true, "data": ..., "meta": ... }`
- Gagal: `{ "success": false, "error": { "code", "message", "details" } }`

---

## 1. Publik
| Method | Rute | Keterangan |
| :--- | :--- | :--- |
| `GET` | `/` | Informasi status layanan API |
| `GET` | `/health` | Pemeriksaan kesehatan server & *uptime* |

---

## 2. Autentikasi Developer & Pemain (`/api/auth`)
| Method | Rute | Auth | Keterangan |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth` | `X-API-Key` | Validasi API Key aplikasi klien |
| `POST` | `/api/auth/developer/register` | - | Registrasi akun pengajar/developer |
| `POST` | `/api/auth/developer/login` | - | Login developer, mengembalikan token JWT |
| `GET` | `/api/auth/developer/me` | `Bearer JWT` | Profil developer aktif |
| `POST` | `/api/auth/player/register` | `X-API-Key` | Registrasi akun siswa/pemain pada game klien |
| `POST` | `/api/auth/player/login` | `X-API-Key` | Login akun siswa/pemain pada game klien |

---

## 3. Developer Dashboard (`Authorization: Bearer <JWT>`)

### A. Manajemen Aplikasi & API Key (`/api/apps`)
| Method | Rute | Keterangan |
| :--- | :--- | :--- |
| `GET` | `/api/apps` | Daftar aplikasi milik developer beserta statistik deck, materi, & siswa |
| `POST` | `/api/apps` | Daftarkan aplikasi baru & terbitkan `X-API-Key` (tampil sekali, disimpan hash SHA-256) |
| `PATCH` | `/api/apps/:id` | Ubah profil aplikasi, status aktif, atau `requestRetention` FSRS (0.70–0.97) |
| `POST` | `/api/apps/:id/rotate-key` | Rotasi kunci `X-API-Key` baru |
| `POST` | `/api/apps/:id/revoke` | Nonaktifkan / cabut kunci `X-API-Key` |
| `DELETE` | `/api/apps/:id` | Hapus permanen aplikasi kosong (ditolak `409` bila sudah memiliki materi/riwayat) |

### B. Manajemen Deck & Bank Materi (`/api/dashboard/decks` & `/api/dashboard/items`)
| Method | Rute | Keterangan |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard/decks` | Daftar deck aktif milik developer (`?appId=`) |
| `POST` | `/api/dashboard/decks` | Buat deck pembelajaran baru |
| `GET` | `/api/dashboard/decks/:id` | Detail satu deck |
| `PATCH` | `/api/dashboard/decks/:id` | Perbarui judul/deskripsi/status deck |
| `DELETE` | `/api/dashboard/decks/:id` | *Soft-delete* deck (`isActive = false`) |
| `GET` | `/api/dashboard/items` | Daftar item Flashcard & Pilihan Ganda (mendukung filter `deckId`, `type`, `search`, paginasi) |
| `POST` | `/api/dashboard/items` | Buat item Flashcard atau Multiple Choice baru |
| `PATCH` | `/api/dashboard/items/:id` | Edit item materi (otomatis menaikkan `contentVersion` untuk invalidasi cache `ETag`) |
| `DELETE` | `/api/dashboard/items/:id` | *Soft-delete* item materi |

### C. AI Content Generator — Gemini (`/api/dashboard/ai`)
| Method | Rute | Keterangan |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard/ai/status` | Status konfigurasi model AI (`gemini-3.5-flash-lite`) & batas dokumen |
| `POST` | `/api/dashboard/ai/generate` | Ekstrak teks / dokumen PDF menjadi draf Flashcard & Pilihan Ganda + verifikasi AI lapis ke-2 |
| `POST` | `/api/dashboard/ai/commit` | Simpan draf hasil kurasi pengajar (*Human-in-the-Loop*) ke database |
| `POST` | `/api/dashboard/ai/verify-deck` | Audit & perbaiki konsistensi soal/kunci jawaban pada deck eksisting via AI |

### D. Monitoring, Learning Analytics, & Simulator FSRS-5 (`/api/dashboard/analytics`)
| Method | Rute | Keterangan |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard/analytics/summary` | Keempat indikator utama Proposal TA sekaligus ($R_{avg}$, Mastery $S \ge 7$h, Difficult Topics, Completion Time) |
| `GET` | `/api/dashboard/analytics/retention` | Indikator 1: *Retention State* ($R_{avg}$) |
| `GET` | `/api/dashboard/analytics/mastery` | Indikator 2: *Mastery Prediction* ($S \ge 7$ hari) |
| `GET` | `/api/dashboard/analytics/difficult-topics` | Indikator 3: Kartu & tag tersulit |
| `GET` | `/api/dashboard/analytics/completion-time` | Indikator 4: Estimasi waktu penguasaan materi |
| `GET` | `/api/dashboard/analytics/monitoring` | Data terpadu *live*: daftar siswa, antrean prioritas `CardState` FSRS, `ReviewLog`, & `QuizAttempt` |
| `POST` | `/api/dashboard/analytics/fsrs-simulate` | Simulator matematis FSRS-5 (mendukung kartu baru maupun proyeksi dari `initialCard` nyata siswa) |
| `POST` | `/api/dashboard/analytics/shift-due` | Simulasi geser hari (*Time-Travel Demo* jadwal jatuh tempo `Due` yang dapat dikembalikan *lossless*) |
| `GET` | `/api/dashboard/analytics/export-csv` | Ekspor laporan evaluasi lengkap berformat CSV UTF-8 BOM siap buka di Microsoft Excel |
| `DELETE` | `/api/dashboard/analytics/users/:externalUserId` | Hapus akun siswa uji coba beserta riwayatnya (`?appId=`) |

---

## 4. Endpoint Aplikasi Game Klien (`X-API-Key: <key>`)
| Method | Rute | Keterangan |
| :--- | :--- | :--- |
| `GET` | `/api/decks` | Daftar deck aktif milik aplikasi klien |
| `GET` | `/api/items` | Ambil materi Flashcard & Pilihan Ganda (mendukung header caching `ETag` / `If-None-Match` → `304`) |
| `GET` | `/api/evaluation/due` | Antrean kartu prioritas FSRS-5 siswa (`Again` → `Hard` → `Due` → `Good` → `Easy`) |
| `POST` | `/api/evaluation/review` | Catat review flashcard (`AGAIN`/`HARD`/`GOOD`/`EASY`) + *Dynamic FSRS Difficulty Adjustment* |
| `POST` | `/api/evaluation/quiz` | Evaluasi jawaban kuis pilihan ganda, hitung skor, waktu respons, & korelasi FSRS |
| `GET` | `/api/progress` | Ambil profil progres gamifikasi siswa (Level, EXP, Poin, Streak, `clientState`) |
| `PUT` | `/api/progress` | Sinkronisasi state progres permainan siswa |
| `GET` | `/api/progress/leaderboard` | Klasemen peringkat poin & level siswa pada aplikasi klien |
