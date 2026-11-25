import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  KeyRound,
  BookOpen,
  Sparkles,
  BarChart3,
  LogOut,
  BrainCircuit,
  Gamepad2,
  ChefHat,
  ExternalLink,
  Activity,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../api/client';

const navItems = [
  {
    to: '/apps',
    label: 'Aplikasi & API Key',
    sub: 'Kredensial & Deck',
    icon: KeyRound,
  },
  {
    to: '/question-bank',
    label: 'Bank Materi',
    sub: 'Flashcard & Kuis',
    icon: BookOpen,
  },
  {
    to: '/ai-generator',
    label: 'AI Generator',
    sub: 'Gemini Auto-Draft',
    icon: Sparkles,
  },
  {
    to: '/analytics',
    label: 'Analytics & FSRS',
    sub: 'Monitoring & Simulator',
    icon: BarChart3,
  },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { developer, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeNav = navItems.find((n) => location.pathname.startsWith(n.to)) ?? navItems[0];

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-slate-900">
      {/* Backdrop Mobile & Tablet */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Navigasi Modern (Responsif Drawer di Mobile/Tablet, Sticky di Desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 h-screen bg-gradient-to-b from-[#090D16] via-[#0F172A] to-[#0B1120] text-slate-100 flex flex-col shrink-0 border-r border-slate-800/80 shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-tight text-white">Learning Cloud</h1>
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/25">
                  FSRS-5
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Developer Console</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Tutup menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Menu Utama */}
        <div className="px-4 pt-5 pb-2">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Workspace
          </p>
          <nav className="space-y-1.5">
            {navItems.map(({ to, label, sub, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600/95 to-violet-600/90 text-white shadow-md shadow-indigo-950/50 ring-1 ring-white/15'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          isActive
                            ? 'bg-white/15 text-white'
                            : 'bg-slate-800/90 text-slate-400 group-hover:text-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                      </div>
                      <div className="truncate">
                        <p className="font-semibold leading-tight truncate">{label}</p>
                        <p
                          className={`text-[11px] truncate ${
                            isActive
                              ? 'text-indigo-100/90'
                              : 'text-slate-500 group-hover:text-slate-400'
                          }`}
                        >
                          {sub}
                        </p>
                      </div>
                    </div>
                    {isActive && <span className="w-1.5 h-5 rounded-full bg-white/90 shrink-0" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Simulasi Aplikasi Klien (Phaser.js Games) */}
        <div className="px-4 pt-4 mt-auto">
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800/90 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Client Games (Live API)
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Phaser 3
              </span>
            </div>

            <a
              href="/pet-battle.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-200 border border-indigo-500/25 transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Gamepad2 className="w-3.5 h-3.5" />
                </span>
                <span>
                  <span className="block font-semibold text-white group-hover:text-indigo-200">
                    Pet Battle RPG
                  </span>
                  <span className="text-[10px] text-indigo-300/75">Turn-based · 3 Deck</span>
                </span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </a>

            <a
              href="/baking-chef.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium bg-amber-950/40 hover:bg-amber-900/50 text-amber-200 border border-amber-500/25 transition-all group"
            >
              <span className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <ChefHat className="w-3.5 h-3.5" />
                </span>
                <span>
                  <span className="block font-semibold text-white group-hover:text-amber-200">
                    Baking Chef
                  </span>
                  <span className="text-[10px] text-amber-300/75">Simulasi · English Deck</span>
                </span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </a>
          </div>
        </div>

        {/* Profil Developer */}
        <div className="p-4 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {(developer?.name || 'D').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {developer?.name ?? 'Developer'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{developer?.email ?? '-'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Keluar dari sesi"
            className="p-2 rounded-lg bg-slate-800/90 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700/70 hover:border-rose-500/30 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Area Konten Utama */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Utility Header */}
        <header className="h-14 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 text-sm min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Buka navigasi"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="hidden sm:inline text-slate-400 font-medium">Console</span>
            <span className="hidden sm:inline text-slate-300">/</span>
            <span className="font-semibold text-slate-800 truncate">{activeNav?.label}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden xs:inline">FSRS-5</span> Ready
            </span>
            <span
              title={API_BASE_URL}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200/80 max-w-[240px] truncate"
            >
              API v1 · {API_BASE_URL.replace(/^https?:\/\//, '')}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default Layout;
