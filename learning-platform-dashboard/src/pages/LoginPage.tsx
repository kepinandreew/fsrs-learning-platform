import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrainCircuit, Eye, EyeOff, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('developer@fsrs-platform.local');
  const [password, setPassword] = useState('Password123!');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate('/apps', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke dashboard');
    } finally {
      setLoading(false);
    }
  }

  function fillDemoAccount() {
    setMode('login');
    setEmail('developer@fsrs-platform.local');
    setPassword('Password123!');
    setError(null);
  }

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Radial Highlights */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 rounded-3xl overflow-hidden border border-slate-800/90 bg-slate-900/70 backdrop-blur-xl shadow-2xl">
        {/* Panel Kiri: Highlight Platform */}
        <div className="md:col-span-5 bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-6 relative z-10">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15">
              <BrainCircuit className="w-5 h-5 text-white" />
              <span className="text-xs font-bold tracking-wide uppercase text-white">
                Learning Platform API
              </span>
            </div>

            <div className="space-y-2.5">
              <h1 className="text-2xl font-extrabold tracking-tight text-white leading-snug">
                Backend Spaced Repetition & Kuis Adaptif
              </h1>
              <p className="text-xs text-indigo-100/85 leading-relaxed">
                Kelola kredensial aplikasi, bank materi, generator soal Gemini AI, serta pantau kurva retensi FSRS-5 secara real-time.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-2.5 text-xs text-indigo-100">
                <Zap className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <span>Penjadwalan memori FSRS-5 otomatis (Again, Hard, Good, Easy)</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-indigo-100">
                <Sparkles className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                <span>Auto-draft Flashcard & Pilihan Ganda dengan Gemini AI</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-indigo-100">
                <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                <span>Multi-aplikasi terisolasi dengan autentikasi X-API-Key</span>
              </div>
            </div>
          </div>

          <div className="pt-8 relative z-10">
            <div className="rounded-xl bg-black/25 border border-white/10 p-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Akun Demo Default
                </p>
                <p className="text-xs font-mono text-white mt-0.5">developer@fsrs-platform.local</p>
              </div>
              <button
                type="button"
                onClick={fillDemoAccount}
                className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
              >
                Isi Otomatis
              </button>
            </div>
          </div>
        </div>

        {/* Panel Kanan: Form Autentikasi */}
        <div className="md:col-span-7 p-8 md:p-10 bg-white text-slate-900 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              {mode === 'login' ? 'Masuk ke Developer Console' : 'Buat Akun Developer'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {mode === 'login'
                ? 'Gunakan akun developer untuk mengelola aplikasi dan materi.'
                : 'Daftarkan akun baru untuk mulai mengintegrasikan API.'}
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Daftar Akun
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mis. Budi Developer"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@learning.local"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-md shadow-indigo-600/20"
            >
              {loading
                ? 'Memproses...'
                : mode === 'login'
                  ? 'Masuk ke Console'
                  : 'Buat Akun & Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
