import { useEffect, useState, FormEvent } from 'react';
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
} from 'lucide-react';
import { appsApi } from '../api/client';
import type { ClientApp } from '../api/types';

export function AppsPage() {
  const [apps, setApps] = useState<ClientApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requestRetention, setRequestRetention] = useState('0.9');
  const [submitting, setSubmitting] = useState(false);

  const [revealedKey, setRevealedKey] = useState<{ appName: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);

  async function loadApps() {
    setLoading(true);
    setError(null);
    try {
      const list = await appsApi.list();
      setApps(list);
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

  async function copyKey(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyCurlSnippet(app: ClientApp) {
    const snippet = `curl -H "X-API-Key: ${app.apiKeyPrefix}YOUR_KEY" http://localhost:3000/api/evaluation/due`;
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
          onClick={loadApps}
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
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                        {Math.round(app.requestRetention * 100)}%
                      </span>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referensi Cepat Endpoint */}
      <div className="bg-slate-900 text-slate-200 rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
            <Terminal className="w-4 h-4" />
            Integrasi Client SDK / REST API
          </div>
          <p className="text-xs text-slate-400">
            Sertakan header <code className="text-amber-300">X-API-Key</code> pada setiap request dari game atau aplikasi klien.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-sky-300 border border-slate-700">
            GET /api/evaluation/due
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-emerald-300 border border-slate-700">
            POST /api/evaluation/review
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-violet-300 border border-slate-700">
            POST /api/evaluation/quiz
          </span>
        </div>
      </div>
    </div>
  );
}

export default AppsPage;
