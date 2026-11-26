/**
 * @file scripts/benchmark-report.ts
 * @description Skrip pengujian performa otomatis (Automated Benchmark & Verification Suite)
 * untuk memvalidasi presisi matematika FSRS-5, throughput mesin penjadwal, latensi endpoint
 * REST API produksi, efisiensi caching ETag (HTTP 304), serta isolasi keamanan multi-tenant.
 * Menghasilkan laporan terstruktur pada `docs/BENCHMARK_REPORT.md` tanpa mengubah data siswa.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  DEFAULT_WEIGHTS,
  FSRS,
  Grade,
  State,
  createEmptyCard,
  nextInterval,
  retrievability,
} from '../src/fsrs';
import { initialDifficulty, initialStability } from '../src/fsrs/formulas';

const BASE_URL = (process.env.BENCHMARK_BASE_URL || 'https://fsrs-learning-platform.vercel.app').replace(/\/+$/, '');
const DEMO_API_KEY = process.env.BENCHMARK_API_KEY || 'lp_live_demo_pet_battle_sd_2026_secret_key';
const DEV_EMAIL = process.env.BENCHMARK_DEV_EMAIL || 'developer@fsrs-platform.local';
const DEV_PASSWORD = process.env.BENCHMARK_DEV_PASSWORD || 'Password123!';
const ITERATIONS = Number(process.env.BENCHMARK_ITERATIONS || 5);

interface LatencyRow {
  label: string;
  method: string;
  endpoint: string;
  authType: string;
  status: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  bytes: number;
}

interface SecurityCheckRow {
  scenario: string;
  endpoint: string;
  expectedStatus: number;
  actualStatus: number;
  passed: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function round(val: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  return Math.round(val * factor) / factor;
}

async function timedFetch(url: string, init?: RequestInit): Promise<{ status: number; ms: number; bytes: number; headers: Headers; text: string }> {
  const t0 = performance.now();
  const res = await fetch(url, init);
  const text = await res.text();
  const ms = performance.now() - t0;
  const bytes = Buffer.byteLength(text, 'utf8');
  return { status: res.status, ms, bytes, headers: res.headers, text };
}

function runFsrsMathVerification() {
  const fsrs = new FSRS();
  const now = new Date('2026-11-26T00:00:00.000Z');

  // 1. Parameter awal S0(G) dan D0(G)
  const initialRows = [
    { grade: 'AGAIN (1)', g: Grade.Again },
    { grade: 'HARD (2)', g: Grade.Hard },
    { grade: 'GOOD (3)', g: Grade.Good },
    { grade: 'EASY (4)', g: Grade.Easy },
  ].map((row) => ({
    grade: row.grade,
    s0: round(initialStability(DEFAULT_WEIGHTS, row.g), 4),
    d0: round(initialDifficulty(DEFAULT_WEIGHTS, row.g), 4),
  }));

  // 2. Kurva peluruhan Retrievability R(t, S=10)
  const stabilityRef = 10;
  const decayCurve = [0, 1, 3, 5, 10, 20, 30].map((t) => ({
    elapsedDays: t,
    retrievability: round(retrievability(t, stabilityRef), 4),
  }));

  // Validasi R(0) == 1 dan R(S) == 0.9000 (definisi faktor peluruhan FSRS-5)
  const rAtZero = retrievability(0, stabilityRef);
  const rAtStability = retrievability(stabilityRef, stabilityRef);
  const intervalAt10 = nextInterval(stabilityRef, 0.9, 36500);

  // 3. Monotonisitas interval & stabilitas pada kartu REVIEW aktif
  const activeReviewCard = {
    state: State.Review,
    difficulty: 5.2,
    stability: 6.5,
    due: now,
    lastReview: new Date(now.getTime() - 7 * 86_400_000),
    reps: 3,
    lapses: 0,
    hardCount: 0,
  };
  const preview = fsrs.preview(activeReviewCard, now);
  const dueOrderValid =
    preview.again.card.due.getTime() < preview.hard.card.due.getTime() &&
    preview.hard.card.due.getTime() < preview.good.card.due.getTime() &&
    preview.good.card.due.getTime() < preview.easy.card.due.getTime();
  const stabilityOrderValid =
    preview.again.card.stability < preview.hard.card.stability &&
    preview.hard.card.stability < preview.good.card.stability &&
    preview.good.card.stability < preview.easy.card.stability;

  // 4. Penyesuaian perilaku dinamis (waktu respons & akurasi kuis)
  const fastReview = fsrs.review(activeReviewCard, Grade.Good, now, {
    responseTimeMs: 1800,
    quizAccuracy: 1.0,
  });
  const slowStrugglingReview = fsrs.review(activeReviewCard, Grade.Good, now, {
    responseTimeMs: 15000,
    quizAccuracy: 0.4,
  });
  const dynamicPenaltyValid =
    slowStrugglingReview.log.difficultyPenalty > fastReview.log.difficultyPenalty &&
    slowStrugglingReview.card.stability < fastReview.card.stability;

  // 5. Throughput komputasi in-memory (10.000 siklus penjadwalan penuh)
  const totalCycles = 10_000;
  let simCard = createEmptyCard(now);
  const grades = [Grade.Good, Grade.Good, Grade.Hard, Grade.Easy, Grade.Again, Grade.Good];
  const benchStart = performance.now();
  let simTime = now.getTime();
  for (let i = 0; i < totalCycles; i++) {
    const g = grades[i % grades.length]!;
    const out = fsrs.review(simCard, g, new Date(simTime), { responseTimeMs: 2400, quizAccuracy: 0.85 });
    simCard = out.card;
    simTime = simCard.due.getTime();
  }
  const totalComputeMs = performance.now() - benchStart;
  const avgMicrosPerOp = (totalComputeMs * 1000) / totalCycles;
  const opsPerSec = Math.round(totalCycles / (totalComputeMs / 1000));

  const allInvariantsPassed =
    Math.abs(rAtZero - 1) < 1e-9 &&
    Math.abs(rAtStability - 0.9) < 1e-6 &&
    intervalAt10 === 10 &&
    dueOrderValid &&
    stabilityOrderValid &&
    dynamicPenaltyValid;

  return {
    initialRows,
    decayCurve,
    rAtZero: round(rAtZero, 4),
    rAtStability: round(rAtStability, 4),
    intervalAt10,
    previewSummary: {
      againMin: preview.again.log.scheduledMinutes,
      hardMin: preview.hard.log.scheduledMinutes,
      goodDays: preview.good.log.scheduledDays,
      easyDays: preview.easy.log.scheduledDays,
      sAgain: round(preview.again.card.stability, 2),
      sHard: round(preview.hard.card.stability, 2),
      sGood: round(preview.good.card.stability, 2),
      sEasy: round(preview.easy.card.stability, 2),
    },
    dynamicSummary: {
      fastStability: round(fastReview.card.stability, 2),
      slowStability: round(slowStrugglingReview.card.stability, 2),
      slowPenalty: round(slowStrugglingReview.log.difficultyPenalty, 2),
    },
    throughput: {
      totalCycles,
      totalComputeMs: round(totalComputeMs, 2),
      avgMicrosPerOp: round(avgMicrosPerOp, 2),
      opsPerSec,
    },
    dueOrderValid,
    stabilityOrderValid,
    dynamicPenaltyValid,
    allInvariantsPassed,
  };
}

async function loginDeveloper(): Promise<string> {
  const res = await timedFetch(`${BASE_URL}/api/auth/developer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  });
  if (res.status !== 200) {
    throw new Error(`Login developer gagal (${res.status}): ${res.text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(res.text);
  const token = parsed?.data?.token || parsed?.token;
  if (!token) throw new Error('Token JWT tidak ditemukan pada respons /api/auth/developer/login');
  return String(token);
}

async function benchmarkEndpoint(
  label: string,
  endpoint: string,
  authType: string,
  headers: Record<string, string>,
): Promise<LatencyRow> {
  const url = `${BASE_URL}${endpoint}`;
  // Warm-up 1x agar koneksi TLS/pool stabil
  await timedFetch(url, { headers });

  const samples: number[] = [];
  let lastStatus = 0;
  let lastBytes = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = await timedFetch(url, { headers });
    samples.push(r.ms);
    lastStatus = r.status;
    lastBytes = r.bytes;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((acc, v) => acc + v, 0) / samples.length;

  return {
    label,
    method: 'GET',
    endpoint,
    authType,
    status: lastStatus,
    minMs: round(sorted[0] ?? 0, 1),
    avgMs: round(avg, 1),
    p50Ms: round(percentile(sorted, 50), 1),
    p95Ms: round(percentile(sorted, 95), 1),
    bytes: lastBytes,
  };
}

async function benchmarkEtagCaching() {
  const url = `${BASE_URL}/api/items?limit=100`;
  const baseHeaders = { 'X-API-Key': DEMO_API_KEY };

  const initial = await timedFetch(url, { headers: baseHeaders });
  const etag = initial.headers.get('etag') || '';

  const cachedSamples: number[] = [];
  let cachedStatus = 0;
  let cachedBytes = 0;
  for (let i = 0; i < 3; i++) {
    const hit = await timedFetch(url, {
      headers: { ...baseHeaders, 'If-None-Match': etag },
    });
    cachedSamples.push(hit.ms);
    cachedStatus = hit.status;
    cachedBytes = hit.bytes;
  }

  const avgCachedMs = cachedSamples.reduce((a, b) => a + b, 0) / cachedSamples.length;
  const savedBytes = Math.max(0, initial.bytes - cachedBytes);
  const savedPct = initial.bytes > 0 ? round((savedBytes / initial.bytes) * 100, 2) : 0;

  return {
    etag,
    initialStatus: initial.status,
    initialBytes: initial.bytes,
    initialMs: round(initial.ms, 1),
    cachedStatus,
    cachedBytes,
    avgCachedMs: round(avgCachedMs, 1),
    savedBytes,
    savedPct,
    passed: initial.status === 200 && Boolean(etag) && cachedStatus === 304 && cachedBytes === 0,
  };
}

async function runSecurityIsolationChecks(jwtToken: string): Promise<SecurityCheckRow[]> {
  const cases: Array<{ scenario: string; endpoint: string; headers: Record<string, string>; expectedStatus: number }> = [
    {
      scenario: 'Akses klien tanpa header X-API-Key ditolak',
      endpoint: '/api/items?limit=5',
      headers: {},
      expectedStatus: 401,
    },
    {
      scenario: 'Akses klien dengan X-API-Key palsu ditolak',
      endpoint: '/api/items?limit=5',
      headers: { 'X-API-Key': 'lp_live_invalid_forged_key_000000' },
      expectedStatus: 401,
    },
    {
      scenario: 'Akses klien dengan X-API-Key aplikasi valid diizinkan',
      endpoint: '/api/items?limit=5',
      headers: { 'X-API-Key': DEMO_API_KEY },
      expectedStatus: 200,
    },
    {
      scenario: 'Akses analitik dashboard tanpa Bearer JWT ditolak',
      endpoint: '/api/dashboard/analytics/summary',
      headers: {},
      expectedStatus: 401,
    },
    {
      scenario: 'Akses analitik dashboard dengan JWT palsu ditolak',
      endpoint: '/api/dashboard/analytics/summary',
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.forged.signature' },
      expectedStatus: 401,
    },
    {
      scenario: 'Akses analitik dashboard dengan JWT developer valid diizinkan',
      endpoint: '/api/dashboard/analytics/summary',
      headers: { Authorization: `Bearer ${jwtToken}` },
      expectedStatus: 200,
    },
  ];

  const results: SecurityCheckRow[] = [];
  for (const c of cases) {
    const r = await timedFetch(`${BASE_URL}${c.endpoint}`, { headers: c.headers });
    results.push({
      scenario: c.scenario,
      endpoint: c.endpoint,
      expectedStatus: c.expectedStatus,
      actualStatus: r.status,
      passed: r.status === c.expectedStatus,
    });
  }
  return results;
}

async function main() {
  console.log(`🚀 Menjalankan FSRS-5 & Live REST API Benchmark terhadap ${BASE_URL} ...`);

  const fsrsReport = runFsrsMathVerification();
  const jwtToken = await loginDeveloper();

  const clientHeaders = { 'X-API-Key': DEMO_API_KEY };
  const devHeaders = { Authorization: `Bearer ${jwtToken}` };

  const latencyRows: LatencyRow[] = [];
  latencyRows.push(await benchmarkEndpoint('Health Check', '/health', 'Public', {}));
  latencyRows.push(await benchmarkEndpoint('Daftar Deck Klien', '/api/decks', 'X-API-Key', clientHeaders));
  latencyRows.push(await benchmarkEndpoint('Sinkronisasi Materi (100 Item)', '/api/items?limit=100', 'X-API-Key', clientHeaders));
  latencyRows.push(
    await benchmarkEndpoint(
      'Antrean Due FSRS-5 & Preview Interval',
      '/api/evaluation/due?externalUserId=siswa_01&limit=20',
      'X-API-Key',
      clientHeaders,
    ),
  );
  latencyRows.push(
    await benchmarkEndpoint('Klasemen Lintas Gim', '/api/progress/leaderboard?limit=10', 'X-API-Key', clientHeaders),
  );
  latencyRows.push(
    await benchmarkEndpoint('Ringkasan Analitik FSRS', '/api/dashboard/analytics/summary', 'Bearer JWT', devHeaders),
  );
  latencyRows.push(
    await benchmarkEndpoint('Monitoring Siswa & Retensi', '/api/dashboard/analytics/monitoring', 'Bearer JWT', devHeaders),
  );

  const etagReport = await benchmarkEtagCaching();
  const securityRows = await runSecurityIsolationChecks(jwtToken);

  const allSecurityPassed = securityRows.every((r) => r.passed);
  const allEndpoints200 = latencyRows.every((r) => r.status === 200);
  const timestampIso = new Date().toISOString();

  const md = `# Laporan Pengujian Performa & Validasi Algoritma FSRS-5

- **Waktu Eksekusi**: \`${timestampIso}\`
- **Target Backend Produksi**: \`${BASE_URL}\`
- **Jumlah Sampel per Endpoint**: \`${ITERATIONS}x\` (setelah *warm-up* koneksi TLS)
- **Status Keseluruhan**: **${fsrsReport.allInvariantsPassed && allEndpoints200 && etagReport.passed && allSecurityPassed ? 'LULUS 100% (PASS)' : 'PERLU PEMERIKSAAN'}**

---

## 1. Validasi Presisi Matematika & Throughput Mesin FSRS-5

### 1.1 Parameter Memori Awal $S_0(G)$ dan $D_0(G)$ (19 Bobot Standar FSRS-5)

| Rating Evaluasi | Stabilitas Awal $S_0$ (Hari) | Kesulitan Awal $D_0$ (Skala 1–10) |
| :--- | :---: | :---: |
${fsrsReport.initialRows.map((r) => `| **${r.grade}** | ${r.s0.toFixed(4)} | ${r.d0.toFixed(4)} |`).join('\n')}

### 1.2 Kurva Peluruhan Daya Ingat $R(t, S = 10\\text{ hari})$

| Hari Berlalu ($t$) | Retrievability $R(t, S)$ | Persentase Daya Ingat |
| :---: | :---: | :---: |
${fsrsReport.decayCurve.map((d) => `| ${d.elapsedDays} hari | ${d.retrievability.toFixed(4)} | ${(d.retrievability * 100).toFixed(2)}% |`).join('\n')}

### 1.3 Invarian Penjadwalan & Penyesuaian Perilaku Dinamis

| Pengujian Invarian Algoritma | Hasil Pengukuran | Status |
| :--- | :--- | :---: |
| Presisi $R(0, S) = 1.0000$ dan $R(S, S) = 0.9000$ | \`R(0)=${fsrsReport.rAtZero}\`, \`R(10)=${fsrsReport.rAtStability}\`, \`I(10)=${fsrsReport.intervalAt10}d\` | ${fsrsReport.allInvariantsPassed ? '✅ Valid' : '❌ Gagal'} |
| Monotonisitas Interval (\`Again < Hard < Good < Easy\`) | \`${fsrsReport.previewSummary.againMin}m < ${fsrsReport.previewSummary.hardMin}m < ${fsrsReport.previewSummary.goodDays}d < ${fsrsReport.previewSummary.easyDays}d\` | ${fsrsReport.dueOrderValid ? '✅ Valid' : '❌ Gagal'} |
| Monotonisitas Stabilitas Pasca-Ulasan ($S'$) | \`${fsrsReport.previewSummary.sAgain} < ${fsrsReport.previewSummary.sHard} < ${fsrsReport.previewSummary.sGood} < ${fsrsReport.previewSummary.sEasy}\` hari | ${fsrsReport.stabilityOrderValid ? '✅ Valid' : '❌ Gagal'} |
| Penalti Perilaku Dinamis (Respons Lambat & Akurasi Rendah) | Stabilitas \`${fsrsReport.dynamicSummary.fastStability}d\` → \`${fsrsReport.dynamicSummary.slowStability}d\` (penalti \`+${fsrsReport.dynamicSummary.slowPenalty}\`) | ${fsrsReport.dynamicPenaltyValid ? '✅ Valid' : '❌ Gagal'} |
| Throughput Komputasi In-Memory (${fsrsReport.throughput.totalCycles.toLocaleString('en-US')} siklus) | \`${fsrsReport.throughput.totalComputeMs} ms\` total (\`${fsrsReport.throughput.avgMicrosPerOp} µs/op\`, \`~${fsrsReport.throughput.opsPerSec.toLocaleString('en-US')} ops/detik\`) | ✅ Sangat Cepat |

---

## 2. Pengukuran Latensi Endpoint REST API Produksi

| Komponen Layanan | Endpoint | Autentikasi | Status | Min (ms) | Rata-rata (ms) | Median p50 (ms) | p95 (ms) | Payload (Bytes) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${latencyRows
  .map(
    (r) =>
      `| ${r.label} | \`${r.method} ${r.endpoint}\` | \`${r.authType}\` | \`${r.status}\` | ${r.minMs} | **${r.avgMs}** | ${r.p50Ms} | ${r.p95Ms} | ${r.bytes.toLocaleString('en-US')} |`,
  )
  .join('\n')}

---

## 3. Efisiensi Caching Kondisional HTTP \`ETag\` / \`If-None-Match\`

| Tahap Permintaan (\`GET /api/items?limit=100\`) | Status HTTP | Ukuran Payload | Latensi (ms) | Penghematan Bandwidth |
| :--- | :---: | :---: | :---: | :---: |
| Unduhan Awal (Tanpa \`If-None-Match\`) | \`${etagReport.initialStatus} OK\` | ${etagReport.initialBytes.toLocaleString('en-US')} B | ${etagReport.initialMs} ms | — |
| Sinkronisasi Ulang (\`If-None-Match: ${etagReport.etag}\`) | \`${etagReport.cachedStatus} Not Modified\` | **${etagReport.cachedBytes} B** | **${etagReport.avgCachedMs} ms** | **${etagReport.savedPct}% (${etagReport.savedBytes.toLocaleString('en-US')} B dihemat)** |

---

## 4. Verifikasi Isolasi Keamanan Multi-Tenant (\`X-API-Key\` & \`Bearer JWT\`)

| Skenario Uji Keamanan | Endpoint | Ekspektasi | Aktual | Status |
| :--- | :--- | :---: | :---: | :---: |
${securityRows
  .map(
    (s) =>
      `| ${s.scenario} | \`${s.endpoint}\` | \`${s.expectedStatus}\` | \`${s.actualStatus}\` | ${s.passed ? '✅ Lulus' : '❌ Gagal'} |`,
  )
  .join('\n')}
`;

  const outDir = path.resolve(__dirname, '../docs');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'BENCHMARK_REPORT.md');
  await fs.writeFile(outPath, md, 'utf8');

  console.log(`✅ Laporan benchmark berhasil ditulis ke: ${outPath}`);
  console.log(
    `   • FSRS-5 Throughput : ~${fsrsReport.throughput.opsPerSec.toLocaleString('en-US')} ops/sec (${fsrsReport.throughput.avgMicrosPerOp} µs/op)`,
  );
  console.log(
    `   • ETag Caching      : ${etagReport.initialStatus} (${etagReport.initialBytes} B) -> ${etagReport.cachedStatus} (${etagReport.cachedBytes} B, hemat ${etagReport.savedPct}%)`,
  );
  console.log(`   • Security Checks   : ${securityRows.filter((r) => r.passed).length}/${securityRows.length} passed`);

  if (!fsrsReport.allInvariantsPassed || !allEndpoints200 || !etagReport.passed || !allSecurityPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('❌ Benchmark gagal dijalankan:', err);
  process.exitCode = 1;
});
