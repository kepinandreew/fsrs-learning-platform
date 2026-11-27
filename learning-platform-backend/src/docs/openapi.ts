/**
 * @file docs/openapi.ts
 * @description Spesifikasi kontrak REST API berstandar OpenAPI 3.0.3 beserta antarmuka dokumentasi
 * interaktif mandiri (`/api/docs` & `/api/openapi.json`) untuk pengujian langsung endpoint
 * Developer Dashboard (Bearer JWT) maupun Aplikasi Klien (X-API-Key).
 */

export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'FSRS-5 Multi-Tenant Learning Platform REST API',
      version: '1.0.0',
      description:
        'Layanan Backend-as-a-Service (BaaS) pembelajaran adaptif berbasis algoritma Free Spaced Repetition Scheduler (FSRS-5), AI Content Generator 2-Pass Verifier (Google Gemini), Learning Analytics, dan sinkronisasi gamifikasi lintas klien.',
    },
    servers: [{ url: baseUrl, description: 'Active API Server' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT Developer Dashboard dari POST /api/auth/developer/login',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Kunci tenant aplikasi klien (contoh demo: lp_live_demo_pet_battle_sd_2026_secret_key)',
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['1. Public & Health'],
          summary: 'Pemeriksaan kesehatan server & uptime',
          responses: { '200': { description: 'Server aktif dan sehat' } },
        },
      },
      '/api/auth/developer/login': {
        post: {
          tags: ['2. Authentication'],
          summary: 'Login pengajar/developer dan terbitkan token JWT',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: { email: 'developer@fsrs-platform.local', password: 'Password123!' },
              },
            },
          },
          responses: { '200': { description: 'Berhasil login' }, '401': { description: 'Kredensial salah' } },
        },
      },
      '/api/auth/player/login': {
        post: {
          tags: ['2. Authentication'],
          summary: 'Login akun siswa/pemain pada gim klien',
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: { email: 'siswa01@sekolah.id', password: 'Password123!' },
              },
            },
          },
          responses: { '200': { description: 'Profil pemain dikembalikan' } },
        },
      },
      '/api/apps': {
        get: {
          tags: ['3. Tenant Apps & FSRS-5 Config'],
          summary: 'Daftar aplikasi klien milik developer beserta target retensi & bobot FSRS-5',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Daftar aplikasi tenant' } },
        },
        post: {
          tags: ['3. Tenant Apps & FSRS-5 Config'],
          summary: 'Registrasi aplikasi klien baru & terbitkan X-API-Key',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                example: { name: 'Gim Kosakata Baru', description: 'Klien Phaser 3', requestRetention: 0.9 },
              },
            },
          },
          responses: { '201': { description: 'Aplikasi dibuat & X-API-Key ditampilkan sekali' } },
        },
      },
      '/api/apps/{id}': {
        patch: {
          tags: ['3. Tenant Apps & FSRS-5 Config'],
          summary: 'Perbarui profil aplikasi, requestRetention (0.70-0.99), atau 19 bobot fsrsParams (w0..w18)',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Konfigurasi aplikasi diperbarui' } },
        },
      },
      '/api/dashboard/decks': {
        get: {
          tags: ['4. Decks & Bulk Content I/O'],
          summary: 'Daftar deck pembelajaran milik developer',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Daftar deck' } },
        },
      },
      '/api/dashboard/decks/{id}/export': {
        get: {
          tags: ['4. Decks & Bulk Content I/O'],
          summary: 'Ekspor seluruh Flashcard & Pilihan Ganda dalam satu deck ke paket JSON portabel',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Paket JSON materi deck lengkap dengan relasi Flashcard -> Kuis' } },
        },
      },
      '/api/dashboard/decks/{id}/import': {
        post: {
          tags: ['4. Decks & Bulk Content I/O'],
          summary: 'Impor massal Flashcard & Pilihan Ganda ke dalam deck beserta pemetaan otomatis sourceFlashcardId',
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '201': { description: 'Materi berhasil diimpor secara transaksional' } },
        },
      },
      '/api/dashboard/items': {
        get: {
          tags: ['4. Decks & Bulk Content I/O'],
          summary: 'Daftar item bank materi dengan filter deckId, type, search, dan paginasi',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Daftar item' } },
        },
        post: {
          tags: ['4. Decks & Bulk Content I/O'],
          summary: 'Tambah Flashcard atau Pilihan Ganda (mendukung imageUrl & audioUrl)',
          security: [{ BearerAuth: [] }],
          responses: { '201': { description: 'Item tersimpan' } },
        },
      },
      '/api/dashboard/ai/generate': {
        post: {
          tags: ['5. AI Content Generator (Gemini)'],
          summary: 'Ekstrak teks/PDF menjadi draf Flashcard & Pilihan Ganda dengan verifikasi AI 2 tahap',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Draf terverifikasi dikembalikan untuk kurasi pengajar' } },
        },
      },
      '/api/dashboard/analytics/summary': {
        get: {
          tags: ['6. Learning Analytics & FSRS Simulator'],
          summary: 'Keempat indikator analitik pembelajaran sekaligus (Retention, Mastery, Difficult Topics, Completion)',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Ringkasan analitik FSRS-5' } },
        },
      },
      '/api/dashboard/analytics/monitoring': {
        get: {
          tags: ['6. Learning Analytics & FSRS Simulator'],
          summary: 'Data monitoring siswa, antrean CardState, proyeksi beban ulasan 14 hari, & riwayat kuis',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Data monitoring real-time' } },
        },
      },
      '/api/decks': {
        get: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Daftar deck aktif untuk aplikasi gim klien',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'Daftar deck aktif' }, '401': { description: 'X-API-Key tidak sah' } },
        },
      },
      '/api/items': {
        get: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Sinkronisasi materi klien dengan dukungan ETag / If-None-Match (HTTP 304 Not Modified)',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'deckId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Daftar materi tanpa pembocoran kunci jawaban' },
            '304': { description: 'Konten belum berubah sejak ETag terakhir (0 byte payload)' },
          },
        },
      },
      '/api/evaluation/due': {
        get: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Antrean prioritas kartu jatuh tempo FSRS-5 beserta pratinjau interval 4 tombol penilaian',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'externalUserId', in: 'query', required: true, schema: { type: 'string', default: 'siswa_01' } },
            { name: 'deckId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': { description: 'Antrean kartu due, new, dan preview interval' } },
        },
      },
      '/api/evaluation/review': {
        post: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Catat review kartu FSRS-5 (AGAIN/HARD/GOOD/EASY) secara idempoten dengan clientEventId',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'Transisi memori D, S, R, dan jadwal due berikutnya' } },
        },
      },
      '/api/evaluation/quiz': {
        post: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Evaluasi jawaban pilihan ganda di sisi server & kembalikan penjelasan pedagogis',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'Skor, status benar/salah, penjelasan, & akurasi topik' } },
        },
      },
      '/api/progress': {
        get: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Ambil progres gamifikasi, streak harian, & clientState lintas perangkat',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'externalUserId', in: 'query', required: true, schema: { type: 'string', default: 'siswa_01' } },
          ],
          responses: { '200': { description: 'Data progres pemain' } },
        },
        put: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Sinkronisasi poin, EXP, level, & penggabungan cerdas clientState (termasuk recipeStars)',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'Progres tersimpan' } },
        },
      },
      '/api/progress/leaderboard': {
        get: {
          tags: ['7. Game Client API (X-API-Key)'],
          summary: 'Papan peringkat kompetitif lintas gim dalam satu tenant aplikasi',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'Daftar peringkat pemain' } },
        },
      },
    },
  };
}

export function renderApiDocsHtml(specUrl = '/api/openapi.json'): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenAPI 3.0 Explorer — FSRS-5 Learning Platform</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #090d16; color: #e2e8f0; line-height: 1.5; }
    header { background: linear-gradient(135deg, #1e1b4b, #0f172a); border-bottom: 1px solid #1e293b; padding: 22px 24px; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 20px 24px 56px; }
    .badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid rgba(129,140,248,0.35); }
    .auth-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; margin-bottom: 22px; }
    label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; }
    input { width: 100%; padding: 8px 11px; border-radius: 9px; border: 1px solid #334155; background: #020617; color: #f8fafc; font-family: ui-monospace, monospace; font-size: 12px; }
    h2 { font-size: 15px; color: #cbd5e1; margin: 26px 0 10px; border-bottom: 1px solid #1e293b; padding-bottom: 6px; }
    .op { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
    .op-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .method { font-family: ui-monospace, monospace; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; }
    .GET { background: rgba(14,165,233,0.2); color: #38bdf8; }
    .POST { background: rgba(16,185,129,0.2); color: #34d399; }
    .PATCH, .PUT { background: rgba(245,158,11,0.2); color: #fbbf24; }
    .DELETE { background: rgba(244,63,94,0.2); color: #fb7185; }
    .path { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 700; color: #f8fafc; }
    .sum { font-size: 12.5px; color: #94a3b8; margin-top: 4px; }
    button { cursor: pointer; background: #4f46e5; color: #fff; border: 0; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; }
    button:hover { background: #6366f1; }
    pre { margin: 10px 0 0; padding: 12px; border-radius: 9px; background: #020617; border: 1px solid #1e293b; color: #6ee7b7; font-size: 11.5px; overflow-x: auto; max-height: 260px; }
    a { color: #818cf8; text-decoration: none; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <div class="wrap" style="padding:0">
      <span class="badge">OpenAPI 3.0.3</span>
      <h1 style="margin:8px 0 4px;font-size:22px">FSRS-5 Multi-Tenant Learning Platform — REST API Docs</h1>
      <p style="margin:0;font-size:13px;color:#94a3b8">
        Spesifikasi JSON mentah: <a href="${specUrl}" target="_blank" rel="noopener">${specUrl}</a>
      </p>
    </div>
  </header>
  <main class="wrap">
    <div class="auth-bar">
      <div>
        <label>X-API-Key Aplikasi Klien (Game)</label>
        <input id="inp-key" value="lp_live_demo_pet_battle_sd_2026_secret_key" />
      </div>
      <div>
        <label>Bearer JWT Developer (Opsional untuk rute /api/dashboard/*)</label>
        <input id="inp-jwt" placeholder="Tempel token dari POST /api/auth/developer/login..." />
      </div>
    </div>
    <div id="endpoints">Memuat spesifikasi OpenAPI...</div>
  </main>
  <script>
    async function boot() {
      const res = await fetch(${JSON.stringify(specUrl)});
      const spec = await res.json();
      const groups = {};
      for (const [p, methods] of Object.entries(spec.paths || {})) {
        for (const [m, info] of Object.entries(methods)) {
          const tag = (info.tags && info.tags[0]) || 'General';
          (groups[tag] = groups[tag] || []).push({ path: p, method: m.toUpperCase(), info });
        }
      }
      const root = document.getElementById('endpoints');
      root.innerHTML = '';
      Object.entries(groups).forEach(([tag, ops]) => {
        const h2 = document.createElement('h2');
        h2.textContent = tag;
        root.appendChild(h2);
        ops.forEach((op, idx) => {
          const card = document.createElement('div');
          card.className = 'op';
          const canTryGet = op.method === 'GET' && !op.path.includes('{');
          card.innerHTML =
            '<div class="op-head">' +
              '<div><span class="method ' + op.method + '">' + op.method + '</span> <span class="path">' + op.path + '</span></div>' +
              (canTryGet ? '<button type="button" data-try="' + op.path + '">Uji GET Live</button>' : '') +
            '</div>' +
            '<div class="sum">' + (op.info.summary || '') + '</div>' +
            '<pre hidden></pre>';
          const btn = card.querySelector('button[data-try]');
          const pre = card.querySelector('pre');
          if (btn) {
            btn.addEventListener('click', async () => {
              pre.hidden = false;
              pre.textContent = 'Menghubungi ' + op.path + ' ...';
              const headers = {};
              const key = document.getElementById('inp-key').value.trim();
              const jwt = document.getElementById('inp-jwt').value.trim();
              if (key) headers['X-API-Key'] = key;
              if (jwt) headers['Authorization'] = 'Bearer ' + jwt;
              const q = op.path === '/api/evaluation/due' || op.path === '/api/progress' ? '?externalUserId=siswa_01' : '';
              const t0 = performance.now();
              const r = await fetch(op.path + q, { headers });
              const ms = Math.round(performance.now() - t0);
              const txt = await r.text();
              let pretty = txt;
              try { pretty = JSON.stringify(JSON.parse(txt), null, 2); } catch {}
              pre.textContent = 'HTTP ' + r.status + ' (' + ms + ' ms)\\n' + pretty;
            });
          }
          root.appendChild(card);
        });
      });
    }
    boot();
  </script>
</body>
</html>`;
}
