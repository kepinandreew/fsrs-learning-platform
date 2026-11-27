/**
 * @file pages/AppsPage.tsx
 * @description Halaman manajemen tenant aplikasi klien, konfigurasi target retensi FSRS-5,
 * rotasi kredensial X-API-Key, pembagi QR Deep-Link ke gim klien, serta penguji kontrak REST API langsung.
 */
import { useEffect, useState, FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  Plus,
  RefreshCw,
  Ban,
  Copy,
  Check,
  KeyRound,
  AlertTriangle,
  Terminal,
  Layers,
  Users,
  ShieldCheck,
  Trash2,
  Gamepad2,
  ChefHat,
  Share2,
  Pencil,
  Play,
  ShieldAlert,
} from 'lucide-react';
import { API_BASE_URL, appsApi, clearApiCache, decksApi } from '../api/client';
import type { ClientApp, Deck } from '../api/types';

const DEMO_SEEDED_API_KEY = 'lp_live_demo_pet_battle_sd_2026_secret_key';

const DEFAULT_FSRS_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

const KIDS_SHORT_WEIGHTS = [
  0.3, 0.9, 2.2, 8.5, 7.1949, 0.5345, 1.4604, 0.0046, 1.42, 0.14, 0.98, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.65, 0.51655, 0.6621,
];

const EXAM_INTENSIVE_WEIGHTS = [
  0.25, 0.75, 1.8, 6.5, 7.35, 0.5345, 1.4604, 0.0046, 1.35, 0.15, 0.95, 1.9395, 0.11, 0.29605,
  2.2698, 0.22, 2.4, 0.51655, 0.6621,
];

const INSPECTOR_ENDPOINTS = [
  { label: 'GET /health (Status Server)', path: '/health', needsKey: false },
  { label: 'GET /api/decks (Daftar Deck Klien)', path: '/api/decks', needsKey: true },
  {
    label: 'GET /api/items (Kontrak Materi + ETag)',
    path: '/api/items?type=FLASHCARD&pageSize=3',
    needsKey: true,
  },
  {
    label: 'GET /api/evaluation/due (Antrean Prioritas FSRS)',
    path: '/api/evaluation/due?externalUserId=siswa_01',
    needsKey: true,
  },
  {
    label: 'GET /api/progress/leaderboard (Klasemen Siswa)',
    path: '/api/progress/leaderboard',
    needsKey: true,
  },
] as const;

// Panel interaktif pengujian kontrak JSON, header ETag, dan validasi keamanan X-API-Key
function LiveApiInspector({ defaultKey }: { defaultKey: string }) {
  const [selectedPath, setSelectedPath] = useState<string>(INSPECTOR_ENDPOINTS[1].path);
  const [apiKeyInput, setApiKeyInput] = useState<string>(defaultKey);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    status: number;
    ok: boolean;
    ms: number;
    etag: string | null;
    body: string;
  } | null>(null);

  useEffect(() => {
    if (defaultKey) setApiKeyInput(defaultKey);
  }, [defaultKey]);

  async function runProbe(overrideKey?: string, overridePath?: string) {
    const pathToCall = overridePath ?? selectedPath;
    const keyToUse = overrideKey !== undefined ? overrideKey : apiKeyInput.trim();
    const ep = INSPECTOR_ENDPOINTS.find((e) => e.path === pathToCall);
    setTesting(true);
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (ep?.needsKey !== false && keyToUse) {
        headers['X-API-Key'] = keyToUse;
      }
      const res = await fetch(`${API_BASE_URL}${pathToCall}`, { headers });
      const ms = Math.round(performance.now() - t0);
      const etag = res.headers.get('etag');
      const json = await res.json().catch(() => null);
      setResult({
        status: res.status,
        ok: res.ok,
        ms,
        etag,
        body: json ? JSON.stringify(json, null, 2) : '(kosong)',
      });
    } catch (err) {
      setResult({
        status: 0,
        ok: false,
        ms: Math.round(performance.now() - t0),
        etag: null,
        body: err instanceof Error ? err.message : 'Gagal menghubungi server',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-slate-900 text-slate-200 rounded-2xl p-5 sm:p-6 border border-slate-800 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
            <Terminal className="w-4 h-4" />
            Live REST API Contract &amp; Security Inspector
          </div>
          <p className="text-xs text-slate-400">
            Uji respons JSON, latensi (<code className="text-emerald-300">ms</code>), header{' '}
            <code className="text-sky-300">ETag</code>, serta penolakan <code className="text-rose-300">401</code> secara langsung.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={() => runProbe()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {testing ? 'Menguji...' : 'Kirim Request Valid'}
          </button>
          <button
            type="button"
            disabled={testing}
            onClick={() => runProbe('lp_live_kunci_palsu_tidak_sah_000', '/api/decks')}
            title="Buktikan server menolak X-API-Key tidak sah dengan HTTP 401"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 text-xs font-bold transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Simulasi Key Palsu (401)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6">
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            Pilih Endpoint Uji
          </label>
          <select
            value={selectedPath}
            onChange={(e) => setSelectedPath(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-slate-100"
          >
            {INSPECTOR_ENDPOINTS.map((ep) => (
              <option key={ep.path} value={ep.path}>
                {ep.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-6">
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            Header X-API-Key Klien
          </label>
          <input
            type="text"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Tempel X-API-Key aplikasi..."
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-amber-300"
          />
        </div>
      </div>

      {result && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold ${
                result.ok
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              HTTP {result.status || 'ERR'}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700">
              Latensi: {result.ms} ms
            </span>
            {result.etag && (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-violet-300 border border-slate-700">
                ETag: {result.etag}
              </span>
            )}
          </div>
          <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-64 overflow-y-auto">
            {result.body}
          </pre>
        </div>
      )}
    </div>
  );
}

// Kartu "Bagikan Game ke Anak-Anak": link siap salin + QR Code yang bisa langsung di-scan dari HP/tablet
// (mendukung deep-link ?deckId= & ?apiKey= agar scan QR langsung mengikat tenant & topik materi tanpa setel manual).
function ShareGamesCard({ decks, customApiKey }: { decks: Deck[]; customApiKey?: string }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const games = [
    { key: 'pet', title: 'Pet Battle RPG', path: '/pet-battle.html', icon: Gamepad2, tone: 'indigo' },
    { key: 'chef', title: 'Baking Chef', path: '/baking-chef.html', icon: ChefHat, tone: 'amber' },
  ] as const;
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [useNewKeyInQr, setUseNewKeyInQr] = useState(true);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function buildGameUrl(path: string) {
    const qs = new URLSearchParams();
    if (selectedDeckId) qs.set('deckId', selectedDeckId);
    if (customApiKey && useNewKeyInQr) qs.set('apiKey', customApiKey);
    const qStr = qs.toString();
    return `${origin}${path}${qStr ? `?${qStr}` : ''}`;
  }

  useEffect(() => {
    games.forEach((g) => {
      QRCode.toDataURL(buildGameUrl(g.path), { margin: 1, width: 220 })
        .then((url) => setQr((prev) => ({ ...prev, [g.key]: url })))
        .catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, selectedDeckId, customApiKey, useNewKeyInQr]);

  async function copyLink(key: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Share2 className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">Bagikan Game ke Anak-Anak (Deep-Link QR)</h2>
          <span className="text-[11px] text-slate-400">Scan QR dari HP/tablet langsung membuka topik terpilih</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-700"
          >
            <option value="">🎯 Topik Default Otomatis</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                📘 Arahkan ke: {d.title}
              </option>
            ))}
          </select>
          {customApiKey && (
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200">
              <input
                type="checkbox"
                checked={useNewKeyInQr}
                onChange={(e) => setUseNewKeyInQr(e.target.checked)}
              />
              Sertakan API Key Baru di QR
            </label>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {games.map((g) => {
          const url = buildGameUrl(g.path);
          const Icon = g.icon;
          return (
            <div
              key={g.key}
              className={`flex items-center gap-4 p-4 rounded-2xl border ${
                g.tone === 'indigo' ? 'bg-indigo-50/60 border-indigo-200' : 'bg-amber-50/60 border-amber-200'
              }`}
            >
              {qr[g.key] ? (
                <img src={qr[g.key]} alt={`QR ${g.title}`} className="w-28 h-28 rounded-xl bg-white p-1 shrink-0" />
              ) : (
                <div className="w-28 h-28 rounded-xl bg-white shrink-0" />
              )}
              <div className="min-w-0 space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <Icon className="w-4 h-4" /> {g.title}
                </p>
                <p className="text-[11px] font-mono text-slate-500 break-all line-clamp-2">{url}</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => copyLink(g.key, url)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    {copiedKey === g.key ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === g.key ? 'Tersalin' : 'Salin Link'}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white"
                  >
                    Buka
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AppsPage() {
  const [apps, setApps] = useState<ClientApp[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requestRetention, setRequestRetention] = useState('0.9');
  const [submitting, setSubmitting] = useState(false);

  const [revealedKey, setRevealedKey] = useState<{ appName: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);

  // State Edit Aplikasi, Target Retensi, & 19 Bobot Kustom FSRS-5
  const [editingApp, setEditingApp] = useState<ClientApp | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRetention, setEditRetention] = useState('0.9');
  const [editUseCustomWeights, setEditUseCustomWeights] = useState(false);
  const [editWeightsText, setEditWeightsText] = useState(DEFAULT_FSRS_WEIGHTS.join(', '));
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  function startEditApp(app: ClientApp) {
    setEditingApp(app);
    setEditName(app.name);
    setEditDesc(app.description ?? '');
    setEditRetention(String(app.requestRetention));
    const hasCustom = Array.isArray(app.fsrsParams) && app.fsrsParams.length === 19;
    setEditUseCustomWeights(hasCustom);
    setEditWeightsText((hasCustom ? app.fsrsParams! : DEFAULT_FSRS_WEIGHTS).join(', '));
    setEditActive(app.isActive);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingApp) return;
    setSavingEdit(true);
    setError(null);
    try {
      let parsedParams: number[] | null = null;
      if (editUseCustomWeights) {
        const nums = editWeightsText
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number);
        if (nums.length !== 19 || nums.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) {
          throw new Error(
            `Bobot FSRS-5 wajib berisi tepat 19 angka positif (saat ini terdeteksi ${nums.length} angka).`,
          );
        }
        parsedParams = nums;
      }
      await appsApi.update(editingApp.id, {
        name: editName.trim(),
        description: editDesc.trim() || null,
        requestRetention: Number(editRetention),
        fsrsParams: parsedParams,
        isActive: editActive,
      });
      setEditingApp(null);
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui aplikasi');
    } finally {
      setSavingEdit(false);
    }
  }

  async function loadApps() {
    setLoading(true);
    setError(null);
    try {
      const [list, deckList] = await Promise.all([appsApi.list(), decksApi.list().catch(() => [])]);
      setApps(list);
      setDecks(deckList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat aplikasi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApps();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await appsApi.create({
        name,
        description: description.trim() || undefined,
        requestRetention: Number(requestRetention),
      });
      setRevealedKey({ appName: res.app.name, apiKey: res.apiKey });
      setName('');
      setDescription('');
      setRequestRetention('0.9');
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat aplikasi');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotate(app: ClientApp) {
    if (!confirm(`Putar ulang API Key untuk "${app.name}"? Key lama langsung tidak berlaku.`)) return;
    try {
      const res = await appsApi.rotateKey(app.id);
      setRevealedKey({ appName: res.app.name, apiKey: res.apiKey });
      await loadApps();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal memutar ulang API Key');
    }
  }

  async function handleRevoke(app: ClientApp) {
    if (!confirm(`Nonaktifkan aplikasi "${app.name}"? Request API dari aplikasi ini akan ditolak.`)) return;
    try {
      await appsApi.revokeKey(app.id);
      await loadApps();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menonaktifkan aplikasi');
    }
  }

  async function handleDelete(app: ClientApp) {
    if (!confirm(`Hapus permanen aplikasi kosong "${app.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await appsApi.remove(app.id);
      await loadApps();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus aplikasi');
    }
  }

  async function copyKey(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyCurlSnippet(app: ClientApp) {
    const snippet = `curl -H "X-API-Key: ${app.apiKeyPrefix}YOUR_KEY" ${API_BASE_URL}/api/evaluation/due`;
    await navigator.clipboard.writeText(snippet);
    setCopiedAppId(app.id);
    setTimeout(() => setCopiedAppId(null), 2000);
  }

  const activeApps = apps.filter((a) => a.isActive).length;
  const totalDecks = apps.reduce((sum, a) => sum + (a._count?.decks ?? 0), 0);
  const totalUsers = apps.reduce((sum, a) => sum + (a._count?.users ?? 0), 0);
  const avgRetention =
    apps.length > 0
      ? Math.round((apps.reduce((sum, a) => sum + a.requestRetention, 0) / apps.length) * 100)
      : 90;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Aplikasi & Kredensial API
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola integrasi aplikasi klien, parameter target retensi FSRS, dan rotasi kunci API.
          </p>
        </div>
        <button
          onClick={() => {
            clearApiCache();
            loadApps();
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Segarkan
        </button>
      </div>

      {/* Ringkasan Statistik */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Aplikasi Aktif</p>
            <p className="text-xl font-extrabold text-slate-900">
              {activeApps} <span className="text-xs font-normal text-slate-400">/ {apps.length}</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Deck Materi</p>
            <p className="text-xl font-extrabold text-slate-900">{totalDecks}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Siswa Terdaftar</p>
            <p className="text-xl font-extrabold text-slate-900">{totalUsers}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Rata-rata Target Retensi</p>
            <p className="text-xl font-extrabold text-slate-900">{avgRetention}%</p>
          </div>
        </div>
      </div>

      {/* Bagikan Game ke Anak-Anak (link + QR Code) */}
      <ShareGamesCard decks={decks} customApiKey={revealedKey?.apiKey} />

      {/* Banner API Key Baru */}
      {revealedKey && (
        <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-300 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  Simpan API Key untuk "{revealedKey.appName}"
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Kunci ini hanya ditampilkan satu kali karena server hanya menyimpan hash SHA-256.
                </p>
              </div>
            </div>
            <button
              onClick={() => setRevealedKey(null)}
              className="text-xs text-amber-800 hover:underline font-semibold"
            >
              Tutup
            </button>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 text-emerald-300 font-mono text-xs select-all break-all">
              {revealedKey.apiKey}
            </code>
            <button
              onClick={() => copyKey(revealedKey.apiKey)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Tersalin' : 'Salin Key'}
            </button>
          </div>
        </div>
      )}

      {/* Form Registrasi Aplikasi */}
      <form
        onSubmit={handleCreate}
        className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" />
            Daftarkan Aplikasi Klien Baru
          </h2>
          <span className="text-[11px] text-slate-400">Otomatis menghasilkan X-API-Key</span>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Aplikasi *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mis. Game Edukasi Bahasa"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Singkat
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Platform atau genre aplikasi klien"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Retensi FSRS (0.70–0.97)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.7"
              max="0.97"
              required
              value={requestRetention}
              onChange={(e) => setRequestRetention(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-sm"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {submitting ? 'Membuat...' : 'Buat Aplikasi & Generate Key'}
          </button>
        </div>
      </form>

      {/* Panel Edit Aplikasi & Target Retensi FSRS */}
      {editingApp && (
        <form
          onSubmit={handleSaveEdit}
          className="bg-indigo-50/70 rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-indigo-600" />
              Atur Profil &amp; Target Retensi FSRS — {editingApp.name}
            </h2>
            <button
              type="button"
              onClick={() => setEditingApp(null)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Batal ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Aplikasi *
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi
              </label>
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Retensi FSRS (0.70–0.97)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  min="0.7"
                  max="0.97"
                  required
                  value={editRetention}
                  onChange={(e) => setEditRetention(e.target.value)}
                  className="w-24 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold text-indigo-700"
                />
                {(['0.85', '0.9', '0.95'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEditRetention(preset)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                      Number(editRetention) === Number(preset)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {Math.round(Number(preset) * 100)}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white/90 border border-indigo-200/80 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Parameter Bobot Algoritma FSRS-5 (<code className="text-indigo-700">w0..w18</code>)
                </p>
                <p className="text-[11px] text-slate-500">
                  Gunakan bobot standar FSRS-5 atau terapkan profil interval khusus untuk karakteristik pembelajar.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditUseCustomWeights(false);
                    setEditWeightsText(DEFAULT_FSRS_WEIGHTS.join(', '));
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                    !editUseCustomWeights
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Standar FSRS-5 (Default)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditUseCustomWeights(true);
                    setEditWeightsText(KIDS_SHORT_WEIGHTS.join(', '));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                >
                  Preset Anak SD (Interval Rapat)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditUseCustomWeights(true);
                    setEditWeightsText(EXAM_INTENSIVE_WEIGHTS.join(', '));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                >
                  Preset Intensif Ujian
                </button>
              </div>
            </div>
            {editUseCustomWeights && (
              <div>
                <textarea
                  rows={2}
                  value={editWeightsText}
                  onChange={(e) => setEditWeightsText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-mono text-xs text-slate-800"
                  placeholder="19 bobot FSRS-5 dipisahkan koma (w0..w18)"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Format: 19 angka desimal untuk w0..w18. Klik &quot;Standar FSRS-5 (Default)&quot; untuk mengembalikan bobot bawaan.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              Status Aplikasi Aktif (izinkan akses X-API-Key)
            </label>
            <button
              type="submit"
              disabled={savingEdit}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm"
            >
              {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      )}

      {/* Tabel Daftar Aplikasi */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Daftar Aplikasi Terdaftar</h2>
          <span className="text-xs text-slate-500">{apps.length} aplikasi</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Memuat data aplikasi...</div>
        ) : apps.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Belum ada aplikasi. Buat aplikasi pertama Anda pada form di atas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-slate-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold">Aplikasi</th>
                  <th className="text-left px-4 py-3 font-semibold">Prefix Key</th>
                  <th className="text-center px-4 py-3 font-semibold">Target Retensi</th>
                  <th className="text-center px-4 py-3 font-semibold">Deck / Materi</th>
                  <th className="text-center px-4 py-3 font-semibold">Siswa</th>
                  <th className="text-center px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-6 py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{app.name}</p>
                      {app.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {app.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <code className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200/80">
                        {app.apiKeyPrefix}...
                      </code>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                          {Math.round(app.requestRetention * 100)}%
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            Array.isArray(app.fsrsParams) && app.fsrsParams.length === 19
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'text-slate-400'
                          }`}
                        >
                          {Array.isArray(app.fsrsParams) && app.fsrsParams.length === 19
                            ? 'Kustom 19w'
                            : 'Standar 19w'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-xs text-slate-700 font-medium">
                      {app._count?.decks ?? 0} deck · {app._count?.learningItems ?? 0} item
                    </td>
                    <td className="px-4 py-4 text-center text-xs font-semibold text-slate-700">
                      {app._count?.users ?? 0}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {app.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => startEditApp(app)}
                          title="Ubah nama atau Target Retensi FSRS aplikasi"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Atur
                        </button>
                        <button
                          onClick={() => copyCurlSnippet(app)}
                          title="Salin contoh perintah cURL"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors"
                        >
                          {copiedAppId === app.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Terminal className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          {copiedAppId === app.id ? 'Tersalin' : 'cURL'}
                        </button>
                        <button
                          onClick={() => handleRotate(app)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Rotate
                        </button>
                        {app.isActive && (
                          <button
                            onClick={() => handleRevoke(app)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-xs font-medium text-rose-600 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cabut
                          </button>
                        )}
                        {(app._count?.learningItems ?? 0) === 0 && (
                          <button
                            onClick={() => handleDelete(app)}
                            title="Hapus permanen (hanya untuk aplikasi kosong)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-medium text-rose-700 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live REST API Contract & Security Inspector */}
      <LiveApiInspector defaultKey={revealedKey?.apiKey ?? DEMO_SEEDED_API_KEY} />
    </div>
  );
}

export default AppsPage;
