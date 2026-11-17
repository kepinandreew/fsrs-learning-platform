# Dokumentasi Endpoint REST API — Learning Platform (FSRS)

Sumber kebenaran: [`src/app.ts`](../src/app.ts). Base URL lokal: `http://localhost:3000`.

Semua respons memakai format `{ "success": true, "data": ..., "meta": ... }` atau
`{ "success": false, "error": { "code", "message", "details" } }`.

## Publik

| Method | Rute | Keterangan |
|---|---|---|
| GET | `/health` | Cek server hidup |

## Autentikasi (`/api/auth`)

| Method | Rute | Auth | Keterangan |
|---|---|---|---|
| POST | `/api/auth` | `X-API-Key` | Validasi API Key aplikasi client |
| POST | `/api/auth/developer/register` | - | Daftar developer |
| POST | `/api/auth/developer/login` | - | Login, mengembalikan JWT |
| GET | `/api/auth/developer/me` | JWT | Profil developer |

## Developer Dashboard — header `Authorization: Bearer <JWT>`

### Kredensial aplikasi (`/api/apps`, tidak memakai prefix `/dashboard`)

| Method | Rute | Keterangan |
|---|---|---|
| GET | `/api/apps` | Daftar aplikasi milik developer |
| POST | `/api/apps` | Daftarkan aplikasi + terbitkan API Key (tampil sekali) |
| POST | `/api/apps/:id/rotate-key` | Rotasi API Key |
| POST | `/api/apps/:id/revoke` | Cabut API Key |

### Deck materi (`/api/dashboard/decks`)

| Method | Rute | Keterangan |
|---|---|---|
| GET | `/api/dashboard/decks` | Daftar deck (`?appId=`) |
| POST | `/api/dashboard/decks` | Buat deck |
| GET | `/api/dashboard/decks/:id` | Detail deck |
| PATCH | `/api/dashboard/decks/:id` | Ubah deck |
| DELETE | `/api/dashboard/decks/:id` | Nonaktifkan deck (soft delete) |

### Bank soal (`/api/dashboard/items`)

| Method | Rute | Keterangan |
|---|---|---|
| GET | `/api/dashboard/items` | Daftar item beserta kunci jawaban (`deckId, appId, type, search, includeInactive, page, pageSize`) |
| POST | `/api/dashboard/items` | Buat Flashcard / Multiple Choice |
| POST | `/api/dashboard/items/bulk` | Buat banyak item (maks. 100, satu transaksi) |
| GET | `/api/dashboard/items/:id` | Detail item |
| PATCH | `/api/dashboard/items/:id` | Ubah item |
| DELETE | `/api/dashboard/items/:id` | Nonaktifkan item (soft delete) |

### AI Generator (`/api/dashboard/ai`)

| Method | Rute | Keterangan |
|---|---|---|
| GET | `/api/dashboard/ai/status` | Status `GEMINI_API_KEY` dan model |
| POST | `/api/dashboard/ai/generate` | Teks/dokumen -> Flashcard + MC (`save` default `true`) |
| POST | `/api/dashboard/ai/commit` | Simpan draft hasil tinjauan lewat bulk create |

### Learning Analytics (`/api/dashboard/analytics`) — wajib `?deckId=`, opsional `externalUserId`, `limit`

| Method | Rute | Metrik |
|---|---|---|
| GET | `/api/dashboard/analytics/summary` | Keempat metrik sekaligus |
| GET | `/api/dashboard/analytics/retention` | Retention State (R_avg) |
| GET | `/api/dashboard/analytics/mastery` | Mastery Prediction (S >= 7 hari) |
| GET | `/api/dashboard/analytics/difficult-topics` | Difficult Topics |
| GET | `/api/dashboard/analytics/completion-time` | Completion Time Estimation |

## Aplikasi Client (game/Phaser.js) — header `X-API-Key: <key>`

| Method | Rute | Keterangan |
|---|---|---|
| GET | `/api/items` | Tarik materi (`deckId, type, tag, updatedSince, limit, cursor`); kunci jawaban disembunyikan |
| GET | `/api/items/:id` | Detail satu item |
| GET | `/api/assets/manifest` | Manifest aset untuk resource caching (`?deckId=`) |
| GET | `/api/evaluation/due` | Antrean kartu jatuh tempo (`externalUserId` wajib; `deckId, limit, newLimit`) |
| POST | `/api/evaluation/review` | Rating FSRS + response time + akurasi kuis; idempoten via `clientEventId` |
| POST | `/api/evaluation/quiz` | Pencocokan jawaban MC di server |
| GET | `/api/progress` | Progress user (`externalUserId` wajib; `deckId`) |
| PUT | `/api/progress` | Sinkronisasi poin, EXP, level, `clientState` |

## Catatan

- Rute dashboard memakai prefix `/api/dashboard/...`, **kecuali** `/api/apps` dan `/api/auth/developer/*`.
- Rute client memakai prefix `/api/items`, `/api/assets`, `/api/evaluation`, `/api/progress`.
- `/api/dashboard/items` (JWT, berisi kunci jawaban) berbeda dari `/api/items` (API Key, tanpa kunci jawaban).
