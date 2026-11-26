# Laporan Pengujian Performa & Validasi Algoritma FSRS-5

- **Waktu Eksekusi**: `2026-11-26T05:39:16.157Z`
- **Target Backend Produksi**: `https://fsrs-learning-platform.vercel.app`
- **Jumlah Sampel per Endpoint**: `5x` (setelah *warm-up* koneksi TLS)
- **Status Keseluruhan**: **LULUS 100% (PASS)**

---

## 1. Validasi Presisi Matematika & Throughput Mesin FSRS-5

### 1.1 Parameter Memori Awal $S_0(G)$ dan $D_0(G)$ (19 Bobot Standar FSRS-5)

| Rating Evaluasi | Stabilitas Awal $S_0$ (Hari) | Kesulitan Awal $D_0$ (Skala 1–10) |
| :--- | :---: | :---: |
| **AGAIN (1)** | 0.4026 | 7.1949 |
| **HARD (2)** | 1.1839 | 6.4883 |
| **GOOD (3)** | 3.1730 | 5.2824 |
| **EASY (4)** | 15.6911 | 3.2245 |

### 1.2 Kurva Peluruhan Daya Ingat $R(t, S = 10\text{ hari})$

| Hari Berlalu ($t$) | Retrievability $R(t, S)$ | Persentase Daya Ingat |
| :---: | :---: | :---: |
| 0 hari | 1.0000 | 100.00% |
| 1 hari | 0.9885 | 98.85% |
| 3 hari | 0.9666 | 96.66% |
| 5 hari | 0.9461 | 94.61% |
| 10 hari | 0.9000 | 90.00% |
| 20 hari | 0.8250 | 82.50% |
| 30 hari | 0.7661 | 76.61% |

### 1.3 Invarian Penjadwalan & Penyesuaian Perilaku Dinamis

| Pengujian Invarian Algoritma | Hasil Pengukuran | Status |
| :--- | :--- | :---: |
| Presisi $R(0, S) = 1.0000$ dan $R(S, S) = 0.9000$ | `R(0)=1`, `R(10)=0.9`, `I(10)=10d` | ✅ Valid |
| Monotonisitas Interval (`Again < Hard < Good < Easy`) | `2m < 6m < 14d < 21d` | ✅ Valid |
| Monotonisitas Stabilitas Pasca-Ulasan ($S'$) | `1.68 < 9.76 < 22.75 < 61.57` hari | ✅ Valid |
| Penalti Perilaku Dinamis (Respons Lambat & Akurasi Rendah) | Stabilitas `22.75d` → `18.55d` (penalti `+1.5`) | ✅ Valid |
| Throughput Komputasi In-Memory (10,000 siklus) | `27.74 ms` total (`2.77 µs/op`, `~360,510 ops/detik`) | ✅ Sangat Cepat |

---

## 2. Pengukuran Latensi Endpoint REST API Produksi

| Komponen Layanan | Endpoint | Autentikasi | Status | Min (ms) | Rata-rata (ms) | Median p50 (ms) | p95 (ms) | Payload (Bytes) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Health Check | `GET /health` | `Public` | `200` | 155.4 | **162** | 160 | 170.6 | 62 |
| Daftar Deck Klien | `GET /api/decks` | `X-API-Key` | `200` | 166.3 | **174.4** | 174.1 | 184.6 | 1,318 |
| Sinkronisasi Materi (100 Item) | `GET /api/items?limit=100` | `X-API-Key` | `200` | 167.3 | **173.3** | 174.9 | 180.2 | 29,596 |
| Antrean Due FSRS-5 & Preview Interval | `GET /api/evaluation/due?externalUserId=siswa_01&limit=20` | `X-API-Key` | `200` | 175 | **189.6** | 180.5 | 214.6 | 39,169 |
| Klasemen Lintas Gim | `GET /api/progress/leaderboard?limit=10` | `X-API-Key` | `200` | 157 | **167.3** | 168 | 182.9 | 1,624 |
| Ringkasan Analitik FSRS | `GET /api/dashboard/analytics/summary` | `Bearer JWT` | `200` | 170.3 | **189.2** | 184.3 | 225 | 6,001 |
| Monitoring Siswa & Retensi | `GET /api/dashboard/analytics/monitoring` | `Bearer JWT` | `200` | 214.4 | **280.5** | 289.7 | 372.3 | 53,610 |

---

## 3. Efisiensi Caching Kondisional HTTP `ETag` / `If-None-Match`

| Tahap Permintaan (`GET /api/items?limit=100`) | Status HTTP | Ukuran Payload | Latensi (ms) | Penghematan Bandwidth |
| :--- | :---: | :---: | :---: | :---: |
| Unduhan Awal (Tanpa `If-None-Match`) | `200 OK` | 29,596 B | 178.5 ms | — |
| Sinkronisasi Ulang (`If-None-Match: W/"items-tsZq7i9jpLNguOBtEoDE2GhoM44"`) | `304 Not Modified` | **0 B** | **193.8 ms** | **100% (29,596 B dihemat)** |

---

## 4. Verifikasi Isolasi Keamanan Multi-Tenant (`X-API-Key` & `Bearer JWT`)

| Skenario Uji Keamanan | Endpoint | Ekspektasi | Aktual | Status |
| :--- | :--- | :---: | :---: | :---: |
| Akses klien tanpa header X-API-Key ditolak | `/api/items?limit=5` | `401` | `401` | ✅ Lulus |
| Akses klien dengan X-API-Key palsu ditolak | `/api/items?limit=5` | `401` | `401` | ✅ Lulus |
| Akses klien dengan X-API-Key aplikasi valid diizinkan | `/api/items?limit=5` | `200` | `200` | ✅ Lulus |
| Akses analitik dashboard tanpa Bearer JWT ditolak | `/api/dashboard/analytics/summary` | `401` | `401` | ✅ Lulus |
| Akses analitik dashboard dengan JWT palsu ditolak | `/api/dashboard/analytics/summary` | `401` | `401` | ✅ Lulus |
| Akses analitik dashboard dengan JWT developer valid diizinkan | `/api/dashboard/analytics/summary` | `200` | `200` | ✅ Lulus |
