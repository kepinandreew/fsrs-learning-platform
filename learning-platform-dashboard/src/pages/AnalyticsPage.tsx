/**
 * @file pages/AnalyticsPage.tsx
 * @description Halaman pemantauan progres siswa secara langsung, visualisasi empat metrik
 * Learning Analytics (Retensi, Penguasaan, Topik Sulit, Estimasi Waktu), serta Simulator Kurva FSRS-5.
 */
import { useEffect, useState } from 'react';
import {
  Brain,
  Award,
  AlertCircle,
  Clock,
  RefreshCw,
  Users,
  Activity,
  FlaskConical,
  Plus,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Flame,
  Trophy,
  Search,
  Download,
  FastForward,
  Trash2,
  FileText,
  Printer,
  CalendarDays,
} from 'lucide-react';
import { analyticsApi, appsApi, clearApiCache, decksApi } from '../api/client';
import type {
  AnalyticsSummaryResponse,
  ClientApp,
  Deck,
  FsrsCalibrationResponse,
  FsrsRating,
  FsrsSimulateInitialCard,
  FsrsSimulateResponse,
  FsrsSimulateStepInput,
  MonitoringCardState,
  MonitoringResponse,
  MonitoringUser,
} from '../api/types';

type TabMode = 'monitoring' | 'analytics' | 'simulator';

const RATING_BADGE: Record<FsrsRating, string> = {
  AGAIN: 'bg-rose-100 text-rose-700 border-rose-200',
  HARD: 'bg-amber-100 text-amber-800 border-amber-200',
  GOOD: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EASY: 'bg-sky-100 text-sky-700 border-sky-200',
};

const STATE_BADGE: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  LEARNING: 'bg-amber-100 text-amber-800',
  REVIEW: 'bg-emerald-100 text-emerald-700',
  RELEARNING: 'bg-rose-100 text-rose-700',
};

function renderQueuePositionBadge(cs: MonitoringCardState) {
  const rank = cs.priorityRank ?? 4;
  if (rank === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
        🔴 Paling Depan (Again)
      </span>
    );
  }
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
        🟠 Agak Depan (Hard)
      </span>
    );
  }
  if (rank === 2 || cs.isDue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        ⏰ Jatuh Tempo
      </span>
    );
  }
  if (rank === 5 || cs.lastRating === 'EASY') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">
        🔵 Paling Belakang (Easy)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
      🟢 Urutan Tengah (Good)
    </span>
  );
}

function formatCardSchedule(cs: MonitoringCardState): string {
  if (cs.isDue) return 'Jatuh Tempo';
  if (cs.scheduledDays === 0) {
    const mins = cs.scheduledMinutes && cs.scheduledMinutes > 0 ? cs.scheduledMinutes : 1;
    return `+${mins}m`;
  }
  return `+${cs.scheduledDays}h`;
}

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabMode>('monitoring');
  const [apps, setApps] = useState<ClientApp[]>([]);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [externalUserId, setExternalUserId] = useState('');

  const [data, setData] = useState<AnalyticsSummaryResponse | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringResponse | null>(null);
  const [calibration, setCalibration] = useState<FsrsCalibrationResponse | null>(null);
  const [applyingCalibration, setApplyingCalibration] = useState(false);
  const [calibrationNotice, setCalibrationNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter lokal tabel CardState & Rapor Siswa Individual
  const [cardSearch, setCardSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<'ALL' | 'DUE' | 'SHORT_TERM' | 'REVIEW'>('ALL');
  const [reportStudent, setReportStudent] = useState<MonitoringUser | null>(null);

  // State Export CSV & Simulasi Geser Hari (Time-Travel Demo Due)
  const [csvLoading, setCsvLoading] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftedDaysTotal, setShiftedDaysTotal] = useState(0);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);

  // Simulator FSRS state
  const [simRetention, setSimRetention] = useState(0.9);
  const [simCardId, setSimCardId] = useState<string>('');
  const [simInitialCard, setSimInitialCard] = useState<FsrsSimulateInitialCard | undefined>(
    undefined,
  );
  const [simSteps, setSimSteps] = useState<FsrsSimulateStepInput[]>([
    { rating: 'GOOD' },
    { rating: 'GOOD' },
    { rating: 'AGAIN' },
    { rating: 'GOOD' },
    { rating: 'EASY' },
  ]);
  const [simData, setSimData] = useState<FsrsSimulateResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    Promise.all([appsApi.list(), decksApi.list()])
      .then(([appList, deckList]) => {
        setApps(appList);
        setDecks(deckList);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Gagal memuat deck'));
  }, []);

  async function loadAll(deckId: string, userFilter?: string, appFilter?: string) {
    const resolvedAppId = appFilter !== undefined ? appFilter : selectedAppId;
    setLoading(true);
    setError(null);
    try {
      const [sumRes, monRes, calRes] = await Promise.all([
        analyticsApi.summary({
          appId: resolvedAppId || undefined,
          deckId: deckId || undefined,
          externalUserId: userFilter,
          limit: 25,
        }),
        analyticsApi.monitoring({
          appId: resolvedAppId || undefined,
          deckId: deckId || undefined,
          externalUserId: userFilter,
          limit: 25,
        }),
        analyticsApi
          .calibration({
            appId: resolvedAppId || undefined,
            deckId: deckId || undefined,
            externalUserId: userFilter,
          })
          .catch(() => null),
      ]);
      setData(sumRes);
      setMonitoring(monRes);
      setCalibration(calRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat analitik');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function runSimulation(
    stepsOverride?: FsrsSimulateStepInput[],
    retentionOverride?: number,
    initialCardOverride?: FsrsSimulateInitialCard | null,
  ) {
    const stepsToRun = stepsOverride ?? simSteps;
    const retToRun = retentionOverride ?? simRetention;
    const initCard =
      initialCardOverride === undefined ? simInitialCard : (initialCardOverride ?? undefined);
    if (stepsToRun.length === 0) return;
    setSimLoading(true);
    try {
      const activeAppId = selectedAppId || monitoring?.app?.id || undefined;
      const res = await analyticsApi.simulateFsrs({
        appId: activeAppId,
        requestRetention: retToRun,
        initialCard: initCard,
        steps: stepsToRun,
      });
      setSimData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menjalankan simulasi FSRS');
    } finally {
      setSimLoading(false);
    }
  }

  async function handleExportCsv() {
    setCsvLoading(true);
    setError(null);
    try {
      await analyticsApi.exportCsv({
        appId: selectedAppId || undefined,
        deckId: selectedDeckId || undefined,
        externalUserId: externalUserId || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh CSV');
    } finally {
      setCsvLoading(false);
    }
  }

  async function handleDeleteStudent(externalId: string, displayName: string | null) {
    const appId = monitoring?.app?.id;
    if (!appId) return;
    if (
      !confirm(
        `Hapus akun siswa "${displayName || externalId}" beserta SELURUH progres & riwayat belajarnya? Tindakan ini tidak bisa dibatalkan.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await analyticsApi.deleteUser({ appId, externalUserId: externalId });
      const nextFilter = externalUserId === externalId ? '' : externalUserId;
      setExternalUserId(nextFilter);
      await loadAll(selectedDeckId, nextFilter, selectedAppId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus siswa');
    }
  }

  async function handleShiftDays(days: number) {
    if (days === 0) return;
    setShiftLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.shiftDue({
        appId: selectedAppId || undefined,
        deckId: selectedDeckId || undefined,
        externalUserId: externalUserId || undefined,
        days,
      });
      const nextTotal = shiftedDaysTotal + days;
      setShiftedDaysTotal(nextTotal);
      setShiftNotice(
        nextTotal === 0
          ? `Jadwal ${res.updatedCards} kartu telah dikembalikan 100% ke waktu semula.`
          : `Simulasi Waktu Aktif (${nextTotal > 0 ? `+${nextTotal}` : nextTotal} hari): ${res.dueNowCount} dari ${res.updatedCards} kartu kini berstatus Jatuh Tempo (Due).`,
      );
      await loadAll(selectedDeckId, externalUserId, selectedAppId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menggeser jadwal kartu');
    } finally {
      setShiftLoading(false);
    }
  }

  function selectRealCardForSim(cs: MonitoringCardState | null, switchTab = false) {
    if (!cs) {
      setSimCardId('');
      setSimInitialCard(undefined);
      runSimulation(simSteps, simRetention, null);
      return;
    }
    const initCard: FsrsSimulateInitialCard = {
      label: `${cs.front} (${cs.back}) — ${cs.displayName || cs.externalUserId}`,
      state: cs.state,
      stability: cs.stability,
      difficulty: cs.difficulty,
      reps: cs.reps,
      lapses: cs.lapses,
    };
    const defaultNextSteps: FsrsSimulateStepInput[] = [
      { rating: 'GOOD' },
      { rating: 'GOOD' },
      { rating: 'EASY' },
    ];
    setSimCardId(cs.id);
    setSimInitialCard(initCard);
    setSimSteps(defaultNextSteps);
    if (switchTab) setActiveTab('simulator');
    runSimulation(defaultNextSteps, simRetention, initCard);
  }

  useEffect(() => {
    loadAll(selectedDeckId, externalUserId);
  }, [selectedDeckId]);

  useEffect(() => {
    runSimulation();
  }, []);

  function addSimStep(rating: FsrsRating) {
    const next = [...simSteps, { rating }];
    setSimSteps(next);
    runSimulation(next, simRetention, simInitialCard);
  }

  function removeSimStep(index: number) {
    if (simSteps.length <= 1) return;
    const next = simSteps.filter((_, i) => i !== index);
    setSimSteps(next);
    runSimulation(next, simRetention, simInitialCard);
  }

  function resetSimSteps(preset?: FsrsSimulateStepInput[]) {
    const def = preset ?? [{ rating: 'GOOD' }];
    setSimSteps(def);
    runSimulation(def, simRetention, simInitialCard);
  }

  async function handleApplySuggestedWeights() {
    if (!calibration) return;
    setApplyingCalibration(true);
    setError(null);
    setCalibrationNotice(null);
    try {
      await appsApi.update(calibration.appId, { fsrsParams: calibration.suggestedWeights });
      setCalibrationNotice(
        `19 bobot kalibrasi empiris berhasil diterapkan pada aplikasi "${calibration.appName}".`,
      );
      await Promise.all([
        loadAll(selectedDeckId, externalUserId, selectedAppId),
        runSimulation(simSteps, simRetention, simInitialCard),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menerapkan kalibrasi bobot');
    } finally {
      setApplyingCalibration(false);
    }
  }

  const pct = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;

  function handlePrintStudentReport(student: MonitoringUser) {
    if (!monitoring) return;
    const sCards = monitoring.cardStates.filter((c) => c.externalUserId === student.externalUserId);
    const avgR =
      sCards.length > 0 ? sCards.reduce((acc, c) => acc + c.retrievability, 0) / sCards.length : null;
    const mastered = sCards.filter((c) => c.stability >= 7 || c.retrievability >= 0.9);
    const struggling = sCards.filter((c) => c.lapses > 0 || c.lastRating === 'AGAIN' || c.lastRating === 'HARD');
    const win = window.open('', '_blank', 'width=860,height=920');
    if (!win) return;
    const esc = (t: string | null | undefined) =>
      String(t ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    win.document.write(`<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8" />
<title>Rapor Evaluasi FSRS-5 — ${esc(student.displayName || student.externalUserId)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #475569; font-size: 12px; margin-bottom: 18px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; }
  .lbl { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
  .val { font-size: 18px; font-weight: 800; margin-top: 2px; }
  h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #f8fafc; font-weight: 700; }
  @media print { body { margin: 14mm; } }
</style></head><body>
  <h1>Laporan Evaluasi Belajar Adaptif (FSRS-5)</h1>
  <div class="sub">
    Siswa: <strong>${esc(student.displayName || student.externalUserId)}</strong> (${esc(student.email || student.externalUserId)}) •
    Aplikasi: <strong>${esc(monitoring.app?.name || '-')}</strong> •
    Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}
  </div>
  <div class="grid">
    <div class="box"><div class="lbl">Level &amp; Poin</div><div class="val">Lv.${student.level} • ${student.points} pts</div></div>
    <div class="box"><div class="lbl">Daya Ingat FSRS</div><div class="val">${avgR !== null ? `${(avgR * 100).toFixed(1)}%` : '—'}</div></div>
    <div class="box"><div class="lbl">Akurasi Kuis MC</div><div class="val">${student.quizAccuracy !== null ? `${(student.quizAccuracy * 100).toFixed(1)}%` : '—'}</div></div>
    <div class="box"><div class="lbl">Streak Belajar</div><div class="val">${student.currentStreak} hari (Rekor ${student.longestStreak}h)</div></div>
  </div>
  <h2>Kosakata yang Sudah Dikuasai Kuat (${mastered.length} kartu)</h2>
  <table><thead><tr><th>Kosakata / Istilah</th><th>Arti</th><th>Stabilitas (Hari)</th><th>Daya Ingat</th></tr></thead><tbody>
    ${mastered.length === 0 ? '<tr><td colspan="4">Belum ada kartu pada kategori ini.</td></tr>' : mastered.slice(0, 20).map((c) => `<tr><td><strong>${esc(c.front)}</strong></td><td>${esc(c.back)}</td><td>${c.stability.toFixed(2)} hari</td><td>${Math.round(c.retrievability * 100)}%</td></tr>`).join('')}
  </tbody></table>
  <h2>Kosakata yang Perlu Pendampingan Ulang (${struggling.length} kartu)</h2>
  <table><thead><tr><th>Kosakata / Istilah</th><th>Arti</th><th>Lapses (Lupa)</th><th>Kesulitan (D)</th></tr></thead><tbody>
    ${struggling.length === 0 ? '<tr><td colspan="4">Tidak ada kosakata bermasalah — seluruh kartu terkendali baik.</td></tr>' : struggling.slice(0, 20).map((c) => `<tr><td><strong>${esc(c.front)}</strong></td><td>${esc(c.back)}</td><td>${c.lapses}x</td><td>${c.difficulty.toFixed(2)} / 10</td></tr>`).join('')}
  </tbody></table>
  <script>window.onload = () => { window.print(); };</script>
</body></html>`);
    win.document.close();
  }

  const filteredCardStates = (monitoring?.cardStates ?? []).filter((cs) => {
    if (cardFilter === 'DUE' && !cs.isDue) return false;
    if (cardFilter === 'SHORT_TERM' && cs.state !== 'LEARNING' && cs.state !== 'RELEARNING') {
      return false;
    }
    if (cardFilter === 'REVIEW' && cs.state !== 'REVIEW') return false;
    if (cardSearch.trim()) {
      const q = cardSearch.toLowerCase();
      return (
        cs.front.toLowerCase().includes(q) ||
        cs.back.toLowerCase().includes(q) ||
        cs.externalUserId.toLowerCase().includes(q) ||
        (cs.displayName ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Navigasi Tab */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Monitoring & FSRS Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pantau antrean memori kartu siswa secara langsung, evaluasi 4 metrik analitik, dan uji kurva FSRS-5.
          </p>
        </div>

        <div className="inline-flex bg-slate-200/80 p-1 rounded-2xl self-start">
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'monitoring'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Live Monitoring
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'analytics'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            4 Metrik Analitik
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'simulator'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Simulator FSRS-5
          </button>
        </div>
      </div>

      {/* Filter Bar (untuk Monitoring & Analytics) */}
      {activeTab !== 'simulator' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            {apps.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Aplikasi Klien (Multi-Tenant)
                </label>
                <select
                  value={selectedAppId}
                  onChange={(e) => {
                    const nextApp = e.target.value;
                    setSelectedAppId(nextApp);
                    setSelectedDeckId('');
                    setExternalUserId('');
                    loadAll('', '', nextApp);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
                >
                  <option value="">🏢 Aplikasi Utama ({monitoring?.app?.name ?? 'Default'})</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      🔑 {a.name} (Retensi {Math.round(a.requestRetention * 100)}%)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Deck Pembelajaran
              </label>
              <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold bg-white"
              >
                <option value="">🌟 Semua Deck</option>
                {decks
                  .filter((d) => !selectedAppId || d.appId === selectedAppId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      📘 {d.title}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Filter Siswa
              </label>
              <div className="flex gap-2">
                <select
                  value={externalUserId}
                  onChange={(e) => {
                    setExternalUserId(e.target.value);
                    loadAll(selectedDeckId, e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="">Semua Siswa ({monitoring?.users.length ?? 0})</option>
                  {(monitoring?.users ?? []).map((u) => (
                    <option key={u.externalUserId} value={u.externalUserId}>
                      {u.displayName
                        ? `${u.displayName} (${u.email || u.externalUserId})`
                        : u.externalUserId}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                clearApiCache();
                loadAll(selectedDeckId, externalUserId);
              }}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Segarkan
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={csvLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-sm"
              title="Unduh laporan data evaluasi lengkap (.csv) kompatibel Microsoft Excel"
            >
              <Download className="w-3.5 h-3.5" />
              {csvLoading ? 'Mengunduh...' : 'Ekspor CSV'}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all"
            >
              🖨️ Cetak
            </button>
          </div>

          {/* Bar Simulasi Pergeseran Hari (Uji Jatuh Tempo / Due) */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                <FastForward className="w-3.5 h-3.5 text-amber-600" />
                Simulasi Waktu Jatuh Tempo:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={shiftLoading}
                onClick={() => handleShiftDays(1)}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold transition-colors disabled:opacity-50"
              >
                ⏩ +1 Hari Esok
              </button>
              <button
                type="button"
                disabled={shiftLoading}
                onClick={() => handleShiftDays(3)}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold transition-colors disabled:opacity-50"
              >
                ⏩ +3 Hari Lusa
              </button>
              <button
                type="button"
                disabled={shiftLoading}
                onClick={() => handleShiftDays(7)}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold transition-colors disabled:opacity-50"
              >
                ⏩ +7 Hari Depan
              </button>
              {shiftedDaysTotal !== 0 && (
                <button
                  type="button"
                  disabled={shiftLoading}
                  onClick={() => handleShiftDays(-shiftedDaysTotal)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors disabled:opacity-50"
                >
                  ⏪ Kembalikan Jadwal Semula ({shiftedDaysTotal > 0 ? `+${shiftedDaysTotal}` : shiftedDaysTotal}h)
                </button>
              )}
            </div>
          </div>

          {shiftNotice && (
            <div className="px-3 py-2 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-between gap-2">
              <span>⏱️ {shiftNotice}</span>
              <button
                type="button"
                onClick={() => setShiftNotice(null)}
                className="text-amber-700 hover:text-amber-950 font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {reportStudent && monitoring && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                  Kartu Rapor Evaluasi Siswa
                </span>
                <h2 className="text-lg font-extrabold text-slate-900 mt-1">
                  {reportStudent.displayName || reportStudent.externalUserId}
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  {reportStudent.email || reportStudent.externalUserId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintStudentReport(reportStudent)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak / Simpan PDF
                </button>
                <button
                  type="button"
                  onClick={() => setReportStudent(null)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>
            </div>

            {(() => {
              const sCards = monitoring.cardStates.filter(
                (c) => c.externalUserId === reportStudent.externalUserId,
              );
              const avgR =
                sCards.length > 0
                  ? sCards.reduce((acc, c) => acc + c.retrievability, 0) / sCards.length
                  : null;
              const mastered = sCards.filter((c) => c.stability >= 7 || c.retrievability >= 0.9);
              const struggling = sCards.filter(
                (c) => c.lapses > 0 || c.lastRating === 'AGAIN' || c.lastRating === 'HARD',
              );
              return (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Level &amp; Poin</p>
                      <p className="text-base font-extrabold text-slate-900 mt-0.5">
                        Lv.{reportStudent.level} · {reportStudent.points}
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100">
                      <p className="text-[10px] font-bold uppercase text-indigo-500">Daya Ingat FSRS</p>
                      <p className="text-base font-extrabold text-indigo-900 mt-0.5">{pct(avgR)}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                      <p className="text-[10px] font-bold uppercase text-emerald-600">Akurasi Kuis</p>
                      <p className="text-base font-extrabold text-emerald-900 mt-0.5">
                        {pct(reportStudent.quizAccuracy)}
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100">
                      <p className="text-[10px] font-bold uppercase text-amber-600">Streak Harian</p>
                      <p className="text-base font-extrabold text-amber-900 mt-0.5">
                        🔥 {reportStudent.currentStreak}h (Max {reportStudent.longestStreak}h)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/70 space-y-1.5">
                      <p className="font-bold text-emerald-900">
                        ✅ Kosakata Hafal Kuat ({mastered.length})
                      </p>
                      {mastered.length === 0 ? (
                        <p className="text-slate-500">Belum ada kosakata stabil.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {mastered.slice(0, 12).map((c) => (
                            <span
                              key={c.id}
                              className="px-2 py-0.5 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-semibold"
                            >
                              {c.front} ({Math.round(c.stability)}h)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-3.5 rounded-2xl bg-rose-50/50 border border-rose-200/70 space-y-1.5">
                      <p className="font-bold text-rose-900">
                        🎯 Perlu Pendampingan Ulang ({struggling.length})
                      </p>
                      {struggling.length === 0 ? (
                        <p className="text-slate-500">Seluruh kosakata terkendali dengan baik.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {struggling.slice(0, 12).map((c) => (
                            <span
                              key={c.id}
                              className="px-2 py-0.5 rounded-lg bg-white border border-rose-200 text-rose-800 font-semibold"
                            >
                              {c.front} → {c.back}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* =======================================================================
          TAB 1: LIVE MONITORING SISWA, PROGRES, & ANTREAN KARTU FSRS
         ======================================================================= */}
      {activeTab === 'monitoring' && monitoring && (
        <div className="space-y-6">
          {/* 4 Kartu Ringkasan Utama */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Siswa Aktif</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1.5">
                {monitoring.overview.totalUsers}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Materi: {monitoring.overview.totalFlashcards} Flashcard ·{' '}
                {monitoring.overview.totalMultipleChoice} Kuis
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Kartu FSRS Dijejaki</span>
                <Brain className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1.5">
                {monitoring.overview.activeCardsCount}
              </p>
              <p className="text-[11px] text-amber-700 font-semibold mt-1">
                {monitoring.overview.dueNowCount} kartu jatuh tempo (Due)
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Total Review Flashcard</span>
                <Activity className="w-4 h-4 text-sky-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1.5">
                {monitoring.overview.totalReviews}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Target retensi aplikasi:{' '}
                {monitoring.app ? `${Math.round(monitoring.app.requestRetention * 100)}%` : '90%'}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Akurasi Kuis MC</span>
                <Award className="w-4 h-4 text-violet-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1.5">
                {pct(monitoring.overview.overallQuizAccuracy)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Dari {monitoring.overview.totalQuizAttempts} percobaan kuis
              </p>
            </div>
          </div>

          {/* =================================================================
              RINGKASAN LAPORAN AWAM / DOSEN & GRAFIK VISUAL INTERAKTIF
             ================================================================= */}
          {(() => {
            const cards = monitoring.cardStates;
            const strongCount = cards.filter((c) => c.retrievability >= 0.9).length;
            const fadingCount = cards.filter((c) => c.retrievability >= 0.7 && c.retrievability < 0.9).length;
            const criticalCount = cards.filter((c) => c.retrievability < 0.7).length;
            const totalTracked = Math.max(1, cards.length);
            const avgRet =
              data?.retention.averageRetention ??
              (cards.length > 0
                ? cards.reduce((s, c) => s + c.retrievability, 0) / cards.length
                : null);

            const qAgain = cards.filter((c) => (c.priorityRank ?? 4) === 0).length;
            const qHard = cards.filter((c) => (c.priorityRank ?? 4) === 1).length;
            const qDue = cards.filter((c) => (c.priorityRank ?? 4) === 2).length;
            const qGood = cards.filter((c) => (c.priorityRank ?? 4) === 4).length;
            const qEasy = cards.filter((c) => (c.priorityRank ?? 4) === 5).length;

            // Donut SVG parameters (r = 54, circumference = 339.29)
            const R = 54;
            const C = 2 * Math.PI * R;
            const strongLen = (strongCount / totalTracked) * C;
            const fadingLen = (fadingCount / totalTracked) * C;
            const critLen = (criticalCount / totalTracked) * C;

            const hardestWord = data?.difficultTopics.cards[0];

            return (
              <div className="space-y-6">
                {/* Ringkasan Eksekutif Bahasa Awam */}
                <div className="rounded-2xl bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 text-white p-5 shadow-md">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/25 border border-indigo-400/30 text-indigo-200 text-[11px] font-bold uppercase tracking-wider">
                        📊 Ringkasan Laporan Pembelajaran (Bahasa Awam)
                      </div>
                      <h2 className="text-base sm:text-lg font-extrabold">
                        Daya Ingat Kosakata Siswa Saat Ini:{' '}
                        <span className="text-emerald-300">{pct(avgRet)}</span>{' '}
                        <span className="text-xs font-normal text-indigo-200">
                          (Target Kurikulum FSRS: 90%)
                        </span>
                      </h2>
                      <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed max-w-4xl">
                        Berdasarkan <strong>{monitoring.overview.totalReviews}x latihan kartu</strong> dan{' '}
                        <strong>{monitoring.overview.totalQuizAttempts}x kuis game</strong> oleh{' '}
                        <strong>{monitoring.overview.totalUsers} siswa aktif</strong>, sebanyak{' '}
                        <strong className="text-emerald-300">{strongCount} kosakata</strong> sudah tersimpan kuat di ingatan jangka panjang,{' '}
                        <strong className="text-amber-300">{fadingCount + criticalCount} kosakata</strong> mulai menurun ingatannya, dan{' '}
                        <strong className="text-rose-300">{qAgain + qHard} kosakata</strong> otomatis ditaruh di urutan depan deck oleh mesin FSRS agar segera diulang siswa.
                        {hardestWord
                          ? ` Kata yang paling sering membuat siswa kesulitan saat ini adalah "${hardestWord.front}" (${hardestWord.back}).`
                          : ''}
                      </p>
                      <div className="pt-1 flex flex-wrap items-center gap-2 text-xs text-amber-200/95">
                        <span className="px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/30 font-bold text-amber-200">
                          💡 Rekomendasi Tindakan Guru:
                        </span>
                        <span>
                          {monitoring.overview.dueNowCount > 0
                            ? `Arahkan siswa membuka menu "Pelajari Kartu" terlebih dahulu untuk menyelesaikan ${monitoring.overview.dueNowCount} kosakata jatuh tempo (Due) sebelum bermain kuis.`
                            : qAgain + qHard > 0 && hardestWord
                              ? `Fokuskan pengulangan lisan/audio pada kosakata "${hardestWord.front}" (${hardestWord.back}) yang masih berada di antrean depan deck.`
                              : 'Seluruh kosakata yang dipelajari masih berada di atas ambang retensi 90% — siswa siap mempelajari kosakata baru di deck berikutnya.'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 shrink-0">
                      <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-center">
                        <div className="text-[10px] text-indigo-200 uppercase font-bold">Ingat Kuat</div>
                        <div className="text-lg font-extrabold text-emerald-300">{strongCount}</div>
                        <div className="text-[10px] text-indigo-200/80">≥90% ingat</div>
                      </div>
                      <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-center">
                        <div className="text-[10px] text-indigo-200 uppercase font-bold">Perlu Diulang</div>
                        <div className="text-lg font-extrabold text-amber-300">{monitoring.overview.dueNowCount}</div>
                        <div className="text-[10px] text-indigo-200/80">Jatuh tempo</div>
                      </div>
                      <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-center">
                        <div className="text-[10px] text-indigo-200 uppercase font-bold">Lulus Stabil</div>
                        <div className="text-lg font-extrabold text-sky-300">
                          {data?.mastery.masteredCards ?? cards.filter((c) => c.stability >= 7).length}
                        </div>
                        <div className="text-[10px] text-indigo-200/80">Ingat ≥7 hari</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3 GRAFIK VISUAL UTAMA: Donut Daya Ingat, Grafik Antrean Deck, & Perbandingan Siswa */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* GRAFIK 1: Donut Kesehatan Daya Ingat + Bar Urutan Antrean Deck */}
                  <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        1. Grafik Kesehatan Daya Ingat &amp; Antrean Kartu
                      </h3>
                      <p className="text-xs text-slate-500">
                        Proporsi kosakata yang masih diingat kuat vs yang otomatis ditaruh ke depan deck oleh FSRS.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-5">
                      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
                          {cards.length > 0 && (
                            <>
                              <circle
                                cx="70"
                                cy="70"
                                r={R}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="16"
                                strokeDasharray={`${strongLen} ${C}`}
                                strokeDashoffset={0}
                              />
                              <circle
                                cx="70"
                                cy="70"
                                r={R}
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="16"
                                strokeDasharray={`${fadingLen} ${C}`}
                                strokeDashoffset={-strongLen}
                              />
                              <circle
                                cx="70"
                                cy="70"
                                r={R}
                                fill="none"
                                stroke="#f43f5e"
                                strokeWidth="16"
                                strokeDasharray={`${critLen} ${C}`}
                                strokeDashoffset={-(strongLen + fadingLen)}
                              />
                            </>
                          )}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-xl font-extrabold text-slate-900">{pct(avgRet)}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Rata-rata Ingat</span>
                        </div>
                      </div>

                      <div className="flex-1 w-full space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            Ingatan Kuat (≥90%)
                          </span>
                          <span className="font-bold text-emerald-700">
                            {strongCount} kata ({Math.round((strongCount / totalTracked) * 100)}%)
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                            Mulai Lupa (70–89%)
                          </span>
                          <span className="font-bold text-amber-700">
                            {fadingCount} kata ({Math.round((fadingCount / totalTracked) * 100)}%)
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                            Kritis / Lupa (&lt;70%)
                          </span>
                          <span className="font-bold text-rose-700">
                            {criticalCount} kata ({Math.round((criticalCount / totalTracked) * 100)}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Visual Stacked Bar Posisi Antrean Deck */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                        <span>Urutan Antrean Kartu Otomatis di Game:</span>
                        <span>{cards.length} kartu aktif</span>
                      </div>
                      <div className="w-full h-3.5 rounded-full bg-slate-100 overflow-hidden flex">
                        <div
                          style={{ width: `${(qAgain / totalTracked) * 100}%` }}
                          className="bg-rose-500 h-full transition-all"
                          title={`Paling Depan (Lupa/Again): ${qAgain}`}
                        />
                        <div
                          style={{ width: `${((qHard + qDue) / totalTracked) * 100}%` }}
                          className="bg-amber-500 h-full transition-all"
                          title={`Agak Depan (Ragu/Hard & Due): ${qHard + qDue}`}
                        />
                        <div
                          style={{ width: `${(qGood / totalTracked) * 100}%` }}
                          className="bg-emerald-500 h-full transition-all"
                          title={`Urutan Tengah (Ingat/Good): ${qGood}`}
                        />
                        <div
                          style={{ width: `${(qEasy / totalTracked) * 100}%` }}
                          className="bg-sky-500 h-full transition-all"
                          title={`Paling Belakang (Hafal/Easy): ${qEasy}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-semibold text-slate-600 pt-0.5">
                        <span>🔴 Paling Depan: <strong>{qAgain}</strong></span>
                        <span>🟠 Agak Depan: <strong>{qHard + qDue}</strong></span>
                        <span>🟢 Tengah (Good): <strong>{qGood}</strong></span>
                        <span>🔵 Belakang (Easy): <strong>{qEasy}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* GRAFIK 2: Grafik Perbandingan Siswa (Daya Ingat, Akurasi Kuis, & Kartu Dikuasai) */}
                  <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          2. Grafik Perbandingan Capaian Belajar Siswa
                        </h3>
                        <p className="text-xs text-slate-500">
                          Bandingkan kekuatan daya ingat FSRS, ketepatan menjawab kuis game, dan jumlah kata yang dipelajari.
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                        Klik siswa untuk filter
                      </span>
                    </div>

                    <div className="space-y-4">
                      {monitoring.users.map((u) => {
                        const userCards = cards.filter((c) => c.externalUserId === u.externalUserId);
                        const uRet =
                          data?.retention.perUser.find((r) => r.externalUserId === u.externalUserId)
                            ?.averageRetention ??
                          (userCards.length > 0
                            ? userCards.reduce((s, c) => s + c.retrievability, 0) / userCards.length
                            : 0);
                        const uQuiz = u.quizAccuracy ?? 0;
                        const isSelected = externalUserId === u.externalUserId;

                        return (
                          <div
                            key={u.externalUserId}
                            onClick={() => {
                              const nextId = isSelected ? '' : u.externalUserId;
                              setExternalUserId(nextId);
                              loadAll(selectedDeckId, nextId);
                            }}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                              isSelected
                                ? 'bg-indigo-50/70 border-indigo-300 shadow-sm'
                                : 'bg-slate-50/70 border-slate-200/80 hover:border-indigo-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="text-sm font-extrabold text-slate-900">
                                  {u.displayName || u.externalUserId}
                                </span>
                                <span className="ml-2 text-[11px] font-mono text-slate-400">
                                  {u.email || u.externalUserId}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs font-bold">
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                  🏆 {u.points} Poin
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                  Lv.{u.level}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px] font-semibold">
                                  <span className="text-slate-600">🧠 Daya Ingat Kosakata (FSRS)</span>
                                  <span className="font-bold text-indigo-700">
                                    {Math.round(uRet * 100)}% ({u.trackedCards} kata)
                                  </span>
                                </div>
                                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, Math.round(uRet * 100))}%` }}
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px] font-semibold">
                                  <span className="text-slate-600">🎯 Ketepatan Kuis Pilihan Ganda</span>
                                  <span className="font-bold text-violet-700">
                                    {Math.round(uQuiz * 100)}% ({u.correctAnswers}/{u.totalQuizzes} benar)
                                  </span>
                                </div>
                                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, Math.round(uQuiz * 100))}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* GRAFIK 3: Peta Sebaran Memori Kosakata Real-Time (Stability S vs Difficulty D) */}
                {cards.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          3. Peta Sebaran Memori Kosakata Siswa (Ketahanan Ingatan vs Tingkat Kesulitan Kata)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Setiap titik adalah 1 kosakata nyata yang dipelajari siswa. Semakin ke kanan = semakin lama bertahan di ingatan; semakin ke atas = semakin sulit kata tersebut.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-semibold">
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Kuat (≥90%)
                        </span>
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Mulai Lupa
                        </span>
                        <span className="inline-flex items-center gap-1 text-rose-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Sering Lupa (Again)
                        </span>
                      </div>
                    </div>

                    <div className="w-full overflow-x-auto">
                      {(() => {
                        const maxS = Math.max(10, ...cards.map((c) => Math.min(30, c.stability)));
                        const toX = (s: number) => 56 + (Math.min(maxS, s) / maxS) * 690;
                        const toY = (d: number) => 185 - ((Math.max(1, Math.min(10, d)) - 1) / 9) * 155;

                        return (
                          <svg viewBox="0 0 780 220" className="w-full h-56 min-w-[580px]">
                            {/* Grid horizontal Difficulty (Mudah -> Sulit) */}
                            {[2, 5, 8].map((dVal) => {
                              const gy = toY(dVal);
                              const label = dVal === 2 ? 'Mudah (D=2)' : dVal === 5 ? 'Sedang (D=5)' : 'Sulit (D=8)';
                              return (
                                <g key={dVal}>
                                  <line x1={56} y1={gy} x2={750} y2={gy} stroke="#f1f5f9" strokeWidth={1} />
                                  <text x={50} y={gy + 3} textAnchor="end" className="fill-slate-400 text-[9px] font-mono">
                                    {label}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Garis vertikal batas Lulus Stabil (S = 7 hari) */}
                            {maxS >= 7 && (
                              <g>
                                <line
                                  x1={toX(7)}
                                  y1={20}
                                  x2={toX(7)}
                                  y2={190}
                                  stroke="#10b981"
                                  strokeDasharray="4 4"
                                  strokeWidth={1.5}
                                />
                                <text
                                  x={toX(7) + 5}
                                  y={30}
                                  className="fill-emerald-600 text-[9px] font-bold"
                                >
                                  Batas Hafal Stabil (≥7 Hari) →
                                </text>
                              </g>
                            )}

                            {/* Sumbu X & Y */}
                            <line x1={56} y1={190} x2={750} y2={190} stroke="#cbd5e1" strokeWidth={1.5} />
                            <line x1={56} y1={20} x2={56} y2={190} stroke="#cbd5e1" strokeWidth={1.5} />

                            {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                              const sVal = Math.round(f * maxS * 10) / 10;
                              const gx = 56 + f * 690;
                              return (
                                <text
                                  key={i}
                                  x={gx}
                                  y={208}
                                  textAnchor="middle"
                                  className="fill-slate-500 text-[9px] font-mono"
                                >
                                  Ketahanan {sVal} hari
                                </text>
                              );
                            })}

                            {/* Titik-titik kosakata nyata dengan pencegahan tumpang-tindih teks */}
                            {(() => {
                              const placed: Array<{ x: number; y: number }> = [];
                              return cards.slice(0, 35).map((c, idx) => {
                                const cx = toX(c.stability);
                                const cy = toY(c.difficulty) + ((idx % 3) - 1) * 4;
                                const color =
                                  c.lastRating === 'AGAIN' || c.retrievability < 0.7
                                    ? '#f43f5e'
                                    : c.retrievability < 0.9 || c.isDue
                                      ? '#f59e0b'
                                      : '#10b981';
                                const overlaps = placed.some(
                                  (p) => Math.abs(p.x - cx) < 68 && Math.abs(p.y - cy) < 13,
                                );
                                const showLabel = !overlaps;
                                if (showLabel) placed.push({ x: cx, y: cy });
                                return (
                                  <g key={c.id}>
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r={5.5}
                                      fill={color}
                                      fillOpacity={0.85}
                                      stroke="#ffffff"
                                      strokeWidth={1.5}
                                    >
                                      <title>{`${c.front} (${c.back}) — Siswa: ${c.displayName || c.externalUserId} | Ketahanan S=${c.stability.toFixed(2)} hari | Kesulitan D=${c.difficulty.toFixed(2)} | Ingat=${Math.round(c.retrievability * 100)}%`}</title>
                                    </circle>
                                    {showLabel && (
                                      <text
                                        x={cx + 7}
                                        y={cy + 3}
                                        className="fill-slate-700 text-[9px] font-semibold"
                                      >
                                        {c.front.length > 15 ? `${c.front.slice(0, 15)}…` : c.front}
                                      </text>
                                    )}
                                  </g>
                                );
                              });
                            })()}
                          </svg>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* GRAFIK 4: Kalender Proyeksi Beban Ulasan 14 Hari ke Depan (Upcoming Due Forecast) */}
                {monitoring.dueForecast14d && monitoring.dueForecast14d.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 text-indigo-600" />
                          4. Proyeksi Beban Ulasan 14 Hari ke Depan (Upcoming Due Forecast)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Distribusi jadwal jatuh tempo kartu aktif dari Hari Ini hingga H+13 untuk memprediksi beban belajar harian siswa.
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                        Total 14 Hari:{' '}
                        <strong>
                          {monitoring.dueForecast14d.reduce((s, b) => s + b.count, 0)} kartu
                        </strong>
                      </span>
                    </div>

                    {(() => {
                      const maxCount = Math.max(1, ...monitoring.dueForecast14d.map((b) => b.count));
                      return (
                        <div className="grid grid-cols-7 sm:grid-cols-14 gap-2 pt-2 items-end">
                          {monitoring.dueForecast14d.map((b) => {
                            const barHeightPct = b.count === 0 ? 6 : Math.max(14, Math.round((b.count / maxCount) * 100));
                            const isToday = b.dayOffset === 0;
                            return (
                              <div
                                key={b.dayOffset}
                                title={`${b.label} (${b.date}): ${b.count} kartu terjadwal`}
                                className="flex flex-col items-center gap-1"
                              >
                                <span
                                  className={`text-[11px] font-extrabold ${
                                    b.count === 0
                                      ? 'text-slate-300'
                                      : isToday
                                        ? 'text-amber-700'
                                        : 'text-indigo-700'
                                  }`}
                                >
                                  {b.count}
                                </span>
                                <div className="w-full h-24 rounded-xl bg-slate-100/90 flex items-end p-1">
                                  <div
                                    style={{ height: `${barHeightPct}%` }}
                                    className={`w-full rounded-lg transition-all ${
                                      b.count === 0
                                        ? 'bg-slate-200'
                                        : isToday
                                          ? 'bg-gradient-to-t from-amber-500 to-rose-500'
                                          : 'bg-gradient-to-t from-indigo-600 to-sky-400'
                                    }`}
                                  />
                                </div>
                                <span
                                  className={`text-[10px] font-bold truncate max-w-full ${
                                    isToday ? 'text-amber-700' : 'text-slate-500'
                                  }`}
                                >
                                  {b.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tabel Daftar Pengguna & Progres Belajar */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Data Siswa & Progres Pembelajaran ({monitoring.users.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Klik baris siswa untuk memfilter seluruh antrean kartu dan riwayat di bawah.
                </p>
              </div>
              {externalUserId && (
                <button
                  onClick={() => {
                    setExternalUserId('');
                    loadAll(selectedDeckId, '');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100"
                >
                  Reset Filter: {externalUserId} ✕
                </button>
              )}
            </div>

            {monitoring.users.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada siswa yang tercatat pada aplikasi ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 uppercase">
                    <tr>
                      <th className="text-left px-6 py-3">Siswa</th>
                      <th className="text-center px-3 py-3">Level & EXP</th>
                      <th className="text-center px-3 py-3">Poin</th>
                      <th className="text-center px-3 py-3">Streak</th>
                      <th className="text-center px-3 py-3">Kartu Aktif / Due</th>
                      <th className="text-center px-3 py-3">Review</th>
                      <th className="text-center px-3 py-3">Akurasi Kuis</th>
                      <th className="text-right px-3 py-3">Terakhir Belajar</th>
                      <th className="text-right px-6 py-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monitoring.users.map((u) => {
                      const isSelected = externalUserId === u.externalUserId;
                      return (
                        <tr
                          key={u.externalUserId}
                          onClick={() => {
                            const nextId = isSelected ? '' : u.externalUserId;
                            setExternalUserId(nextId);
                            loadAll(selectedDeckId, nextId);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-6 py-3.5">
                            <p className="font-bold text-slate-900">
                              {u.displayName || u.externalUserId}
                            </p>
                            <p className="font-mono text-[11px] text-slate-400">
                              {u.email || u.externalUserId}
                            </p>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">
                              Lv.{u.level}
                            </span>
                            <span className="text-slate-400 ml-1">({u.experience} XP)</span>
                          </td>
                          <td className="px-3 py-3.5 text-center font-bold text-amber-700">
                            <span className="inline-flex items-center gap-1">
                              <Trophy className="w-3.5 h-3.5 text-amber-500" />
                              {u.points}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <span className="inline-flex items-center gap-1 font-semibold text-orange-600">
                              <Flame className="w-3.5 h-3.5" />
                              {u.currentStreak}h
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <span className="font-bold text-slate-800">{u.trackedCards}</span>
                            {u.dueCards > 0 && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                                {u.dueCards} due
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-center font-semibold text-slate-700">
                            {u.totalReviews}x
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <span className="font-bold text-slate-800">{pct(u.quizAccuracy)}</span>
                            <span className="text-slate-400 ml-1">
                              ({u.correctAnswers}/{u.totalQuizzes})
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-right text-slate-500">
                            {u.lastStudiedAt
                              ? new Date(u.lastStudiedAt).toLocaleString('id-ID')
                              : 'Belum mulai'}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReportStudent(u);
                                }}
                                title="Lihat & cetak rapor evaluasi individual siswa"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[11px] font-semibold text-indigo-700"
                              >
                                <FileText className="w-3 h-3" />
                                Rapor
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteStudent(u.externalUserId, u.displayName);
                                }}
                                title="Hapus akun siswa uji coba ini"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-semibold text-rose-700"
                              >
                                <Trash2 className="w-3 h-3" />
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Status Memori Kartu FSRS (CardState) + Urutan Antrean Deck */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Antrean & Status Memori Kartu FSRS ({filteredCardStates.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Diurutkan otomatis sesuai prioritas antrean deck: Paling Depan (Again) → Agak Depan (Hard) → Jatuh Tempo → Tengah (Good) → Paling Belakang (Easy).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cardSearch}
                    onChange={(e) => setCardSearch(e.target.value)}
                    placeholder="Cari kartu / siswa..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="inline-flex bg-slate-100 p-1 rounded-xl text-[11px] font-semibold">
                  {(
                    [
                      ['ALL', 'Semua'],
                      ['DUE', 'Due'],
                      ['SHORT_TERM', 'Learning'],
                      ['REVIEW', 'Review'],
                    ] as const
                  ).map(([code, label]) => (
                    <button
                      key={code}
                      onClick={() => setCardFilter(code)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        cardFilter === code
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredCardStates.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Tidak ada kartu FSRS yang cocok dengan filter saat ini.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-6 py-2.5">Siswa</th>
                      <th className="text-left px-3 py-2.5">Flashcard</th>
                      <th className="text-left px-3 py-2.5">Posisi Antrean Deck</th>
                      <th className="text-center px-3 py-2.5">State</th>
                      <th className="text-center px-3 py-2.5">Stability (S)</th>
                      <th className="text-center px-3 py-2.5">Difficulty (D)</th>
                      <th className="text-center px-3 py-2.5">Retensi (R)</th>
                      <th className="text-center px-3 py-2.5">Reps / Lapse</th>
                      <th className="text-right px-3 py-2.5">Jadwal Berikutnya</th>
                      <th className="text-right px-6 py-2.5">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCardStates.map((cs) => (
                      <tr key={cs.id} className="hover:bg-slate-50/80">
                        <td className="px-6 py-2.5">
                          <span className="font-semibold text-slate-800">
                            {cs.displayName || cs.externalUserId}
                          </span>
                          <span className="block font-mono text-[10px] text-slate-400">
                            {cs.externalUserId}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 max-w-xs">
                          <p className="font-bold text-slate-900 truncate">{cs.front}</p>
                          <p className="text-slate-500 truncate">{cs.back}</p>
                        </td>
                        <td className="px-3 py-2.5">{renderQueuePositionBadge(cs)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                              STATE_BADGE[cs.state] ?? 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {cs.state}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-indigo-700">
                          {cs.stability.toFixed(2)}d
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-slate-700">
                          {cs.difficulty.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`font-bold ${
                              cs.retrievability >= 0.9
                                ? 'text-emerald-600'
                                : cs.retrievability >= 0.7
                                  ? 'text-amber-600'
                                  : 'text-rose-600'
                            }`}
                          >
                            {pct(cs.retrievability)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600">
                          {cs.reps}x / <span className="text-rose-600 font-semibold">{cs.lapses}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              cs.isDue
                                ? 'bg-amber-100 text-amber-800'
                                : cs.scheduledDays === 0
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {formatCardSchedule(cs)}
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => selectRealCardForSim(cs, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors"
                            title="Buka kartu nyata siswa ini di Simulator FSRS-5 untuk melihat proyeksi interval ke depan"
                          >
                            🧪 Simulasikan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Log Review FSRS & Log Percobaan Kuis MC */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Riwayat Review FSRS */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200/80">
                <h3 className="text-sm font-bold text-slate-900">
                  Riwayat Review Flashcard ({monitoring.recentReviews.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Transisi stabilitas (S) & kesulitan (D) setiap kali siswa menilai kartu.
                </p>
              </div>
              {monitoring.recentReviews.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Belum ada riwayat review.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {monitoring.recentReviews.map((r) => (
                    <div key={r.id} className="p-3.5 text-xs space-y-1 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded border font-bold text-[10px] ${RATING_BADGE[r.rating]}`}
                          >
                            {r.rating}
                          </span>
                          <span className="font-semibold text-slate-800">
                            {r.displayName || r.externalUserId}
                          </span>
                        </div>
                        <span className="text-slate-400">
                          {new Date(r.reviewedAt).toLocaleTimeString('id-ID')}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-900 truncate">
                        {r.front} → <span className="font-normal text-slate-600">{r.back}</span>
                      </p>
                      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 font-mono">
                        <span>
                          S: {r.stabilityBefore.toFixed(2)} →{' '}
                          <strong className="text-indigo-700">{r.stabilityAfter.toFixed(2)}d</strong>
                        </span>
                        <span>
                          D: {r.difficultyBefore.toFixed(2)} → {r.difficultyAfter.toFixed(2)}
                        </span>
                        <span>
                          Interval: {r.scheduledDays > 0 ? `+${r.scheduledDays}h` : 'Jangka Pendek'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riwayat Percobaan Kuis MC */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200/80">
                <h3 className="text-sm font-bold text-slate-900">
                  Riwayat Kuis Pilihan Ganda ({monitoring.recentQuizzes.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Pencocokan jawaban pilihan ganda, skor, dan waktu respons siswa.
                </p>
              </div>
              {monitoring.recentQuizzes.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Belum ada riwayat kuis.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {monitoring.recentQuizzes.map((q) => (
                    <div key={q.id} className="p-3.5 text-xs space-y-1 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {q.isCorrect ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span className="font-semibold text-slate-800">
                            {q.displayName || q.externalUserId}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                            +{q.score} pts
                          </span>
                        </div>
                        <span className="text-slate-400">
                          {new Date(q.answeredAt).toLocaleTimeString('id-ID')}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-900 line-clamp-1">{q.question}</p>
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span>
                          Jawaban:{' '}
                          <strong className={q.isCorrect ? 'text-emerald-700' : 'text-rose-700'}>
                            {q.selectedText ?? `Opsi #${q.selectedIndex}`}
                          </strong>
                        </span>
                        {!q.isCorrect && q.correctText && (
                          <span>
                            · Kunci: <strong className="text-slate-800">{q.correctText}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          TAB 2: 4 METRIK UTAMA LEARNING ANALYTICS
         ======================================================================= */}
      {activeTab === 'analytics' && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Retention State */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Retensi Memori (R_avg)
                </span>
                <Brain className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="text-3xl font-extrabold text-slate-900">
                {pct(data.retention.averageRetention)}
              </p>
              <p className="text-xs text-slate-500">
                Dari <strong>{data.retention.activeCards}</strong> kartu aktif yang telah dipelajari
              </p>
              <div className="pt-2 flex gap-1.5 text-[11px] font-semibold">
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                  Kuat: {data.retention.distribution.strong}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
                  Mulai Lupa: {data.retention.distribution.fading}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700">
                  Kritis: {data.retention.distribution.critical}
                </span>
              </div>
            </div>

            {/* 2. Mastery Prediction */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  Prediksi Penguasaan
                </span>
                <Award className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-extrabold text-slate-900">
                {pct(data.mastery.masteryRatio)}
              </p>
              <p className="text-xs text-slate-500">
                <strong>{data.mastery.masteredCards}</strong> kartu stabil (S ≥{' '}
                {data.mastery.thresholdDays} hari) dari {data.mastery.totalFlashcards} kartu deck
              </p>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (data.mastery.masteryRatio ?? 0) * 100)}%` }}
                />
              </div>
            </div>

            {/* 3. Difficult Topics */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
                  Kartu Tersulit
                </span>
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-3xl font-extrabold text-slate-900">
                {data.difficultTopics.cards.length}
              </p>
              <p className="text-xs text-slate-500">
                Kartu terdeteksi sering lupa (Again/Hard) atau salah saat menjawab kuis
              </p>
              <p className="text-xs text-slate-400 pt-1">
                Tag tersulit:{' '}
                <strong className="text-slate-700">
                  {data.difficultTopics.tags[0]?.tag
                    ? `#${data.difficultTopics.tags[0].tag}`
                    : 'Belum ada'}
                </strong>
              </p>
            </div>

            {/* 4. Completion Estimation */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Estimasi Lulus Deck
                </span>
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-3xl font-extrabold text-slate-900">
                {data.completionTime.status === 'COMPLETED'
                  ? 'Selesai!'
                  : data.completionTime.estimatedDays !== null
                    ? `${data.completionTime.estimatedDays} hari`
                    : '—'}
              </p>
              <p className="text-xs text-slate-500">
                Sisa <strong>{data.completionTime.remainingCards}</strong> kartu · Laju{' '}
                <strong>{data.completionTime.masteredPerDay}</strong> kartu/hari
              </p>
              <p className="text-xs text-slate-400 pt-1">
                Status:{' '}
                <strong className="text-slate-700">{data.completionTime.status}</strong>
              </p>
            </div>
          </div>

          {/* Detail Kartu Tersulit & Tag Tersulit */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200/80">
                <h2 className="text-sm font-bold text-slate-900">
                  Peringkat Kartu Tersulit pada Deck
                </h2>
                <p className="text-xs text-slate-500">
                  Kombinasi frekuensi rating Again/Hard (60%) dan rasio salah kuis MC (40%).
                </p>
              </div>
              {data.difficultTopics.cards.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  Belum ada data review atau percobaan kuis pada deck ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase">
                      <tr>
                        <th className="text-left px-6 py-2.5">Kartu (Depan → Belakang)</th>
                        <th className="text-center px-3 py-2.5">Again / Hard</th>
                        <th className="text-center px-3 py-2.5">Salah Kuis</th>
                        <th className="text-center px-3 py-2.5">Rata-rata D</th>
                        <th className="text-right px-6 py-2.5">Skor Kesulitan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.difficultTopics.cards.map((c) => (
                        <tr key={c.itemId} className="hover:bg-slate-50">
                          <td className="px-6 py-3">
                            <p className="font-semibold text-slate-900">{c.front}</p>
                            <p className="text-slate-500">{c.back}</p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-rose-600 font-bold">{c.againCount}</span> /{' '}
                            <span className="text-amber-600 font-bold">{c.hardCount}</span>{' '}
                            <span className="text-slate-400">({c.reviews}x)</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {c.quizErrors}/{c.quizAttempts}
                          </td>
                          <td className="px-3 py-3 text-center font-mono">
                            {c.averageDifficulty ?? '—'}
                          </td>
                          <td className="px-6 py-3 text-right min-w-[150px]">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full"
                                  style={{ width: `${Math.min(100, Math.round(c.score * 100))}%` }}
                                />
                              </div>
                              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold">
                                {(c.score * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200/80">
                <h2 className="text-sm font-bold text-slate-900">Sub-Topik (Tag) Tersulit</h2>
              </div>
              {data.difficultTopics.tags.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">Belum ada data tag.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.difficultTopics.tags.map((t) => (
                    <div key={t.tag} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">#{t.tag}</p>
                        <p className="text-xs text-slate-500">
                          {t.cards} kartu · {t.struggleEvents}x struggle · {t.quizErrors}x salah kuis
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-bold">
                        {(t.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabel Per-User Mastery & Completion */}
          {data.mastery.perUser.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200/80 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Penguasaan & Estimasi Lulus per Siswa
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="text-left px-6 py-2.5">Siswa</th>
                      <th className="text-center px-3 py-2.5">Retensi Rata-rata</th>
                      <th className="text-center px-3 py-2.5">Kartu Dikuasai (S ≥ 7h)</th>
                      <th className="text-center px-3 py-2.5">Rasio Penguasaan</th>
                      <th className="text-right px-6 py-2.5">Estimasi Selesai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.mastery.perUser.map((u) => {
                      const ret = data.retention.perUser.find(
                        (r) => r.externalUserId === u.externalUserId,
                      );
                      const comp = data.completionTime.perUser.find(
                        (c) => c.externalUserId === u.externalUserId,
                      );
                      return (
                        <tr key={u.externalUserId} className="hover:bg-slate-50">
                          <td className="px-6 py-3">
                            <span className="font-bold text-slate-900">
                              {u.displayName || u.externalUserId}
                            </span>
                            <span className="ml-2 font-mono text-slate-400">
                              ({u.externalUserId})
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold">
                            {pct(ret?.averageRetention)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {u.masteredCards} / {data.mastery.totalFlashcards}
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-emerald-700">
                            {pct(u.masteryRatio)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            {comp?.status === 'COMPLETED'
                              ? 'Lulus Semua'
                              : comp?.estimatedDays != null
                                ? `${comp.estimatedDays} hari lagi`
                                : 'Menunggu kartu stabil'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Panel Validasi Akurasi Model & Kalibrasi Bobot Empiris FSRS-5 */}
          {calibration && (
            <div className="bg-white rounded-2xl border border-indigo-200/90 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-indigo-600" />
                    Validasi Akurasi Prediktif &amp; Kalibrasi Bobot Empiris FSRS-5
                  </h2>
                  <p className="text-xs text-slate-500">
                    Membandingkan probabilitas ingat prediksi FSRS-5 terhadap kenyataan ingatan siswa pada{' '}
                    <strong>{calibration.evaluatedReviews}</strong> ulasan lanjutan (total{' '}
                    {calibration.totalReviewLogs} log).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={applyingCalibration || calibration.totalReviewLogs === 0}
                  onClick={handleApplySuggestedWeights}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
                >
                  {applyingCalibration ? 'Mengkalibrasi...' : '⚡ Terapkan Kalibrasi Bobot ke Aplikasi'}
                </button>
              </div>

              {calibrationNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  {calibrationNotice}
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Prediksi R Rata-rata</p>
                  <p className="text-lg font-extrabold text-indigo-700 mt-0.5">
                    {pct(calibration.meanPredicted)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Retensi Aktual Nyata</p>
                  <p className="text-lg font-extrabold text-emerald-700 mt-0.5">
                    {pct(calibration.actualRecallRate)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                  <p className="text-[10px] font-bold uppercase text-indigo-500">RMSE Kalibrasi</p>
                  <p className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">
                    {calibration.rmse !== null ? calibration.rmse.toFixed(4) : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                  <p className="text-[10px] font-bold uppercase text-indigo-500">Brier Score</p>
                  <p className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">
                    {calibration.brierScore !== null ? calibration.brierScore.toFixed(4) : '—'}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                  <p className="text-[10px] font-bold uppercase text-indigo-500">Binary Log-Loss</p>
                  <p className="text-lg font-extrabold text-slate-900 mt-0.5 font-mono">
                    {calibration.logLoss !== null ? calibration.logLoss.toFixed(4) : '—'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                <div className="lg:col-span-7 rounded-xl border border-slate-200/80 p-3.5 space-y-2">
                  <p className="font-bold text-slate-800">
                    Tabel Kalibrasi Rentang Probabilitas (Prediksi FSRS vs Aktual)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {calibration.bins.map((b) => (
                      <div key={b.label} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
                        <p className="text-[10px] font-bold text-slate-500">{b.label} ({b.count}x)</p>
                        <p className="text-xs font-semibold text-slate-700 mt-1">
                          Prediksi: <strong className="text-indigo-700">{pct(b.predictedAvg)}</strong>
                        </p>
                        <p className="text-xs font-semibold text-slate-700">
                          Aktual: <strong className="text-emerald-700">{pct(b.actualRate)}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-5 rounded-xl border border-slate-200/80 p-3.5 space-y-1.5">
                  <p className="font-bold text-slate-800">
                    Rekomendasi Bobot Stabilitas Awal (w0..w3)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Saat ini ({calibration.usingCustomWeights ? 'Kustom' : 'Standar'}):{' '}
                    <code className="font-mono text-slate-700">
                      [{calibration.currentWeights.slice(0, 4).join(', ')}]
                    </code>
                  </p>
                  <p className="text-[11px] text-indigo-700 font-semibold">
                    Saran Empiris:{' '}
                    <code className="font-mono bg-indigo-50 px-1.5 py-0.5 rounded">
                      [{calibration.suggestedWeights.slice(0, 4).join(', ')}]
                    </code>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =======================================================================
          TAB 3: SIMULATOR INTERAKTIF FSRS-5
         ======================================================================= */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">
          {/* Panel Kontrol Simulator */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-indigo-600" />
                  Simulator Transisi Memori & Interval FSRS-5
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Uji dari Kartu Baru atau pilih langsung <strong>Kartu Nyata Siswa</strong> untuk memproyeksikan Stability (S), Difficulty (D), &amp; jadwal review berikutnya.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[260px]">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase">
                    Ambil dari Kartu Nyata Siswa
                  </label>
                  <select
                    value={simCardId}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) {
                        selectRealCardForSim(null);
                      } else {
                        const found = (monitoring?.cardStates ?? []).find((c) => c.id === id) ?? null;
                        selectRealCardForSim(found);
                      }
                    }}
                    className="mt-0.5 w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="">✨ Kartu Baru (State: NEW · S=0 · D=5)</option>
                    {(monitoring?.cardStates ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        🎯 {c.front} ({c.back}) — {c.displayName || c.externalUserId} [S={c.stability.toFixed(1)}d, D={c.difficulty.toFixed(1)}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase">
                    Target Retensi (r)
                  </label>
                  <select
                    value={simRetention}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSimRetention(val);
                      runSimulation(simSteps, val, simInitialCard);
                    }}
                    className="mt-0.5 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value={0.8}>80% (Santai)</option>
                    <option value={0.85}>85%</option>
                    <option value={0.9}>90% (Default FSRS)</option>
                    <option value={0.95}>95% (Ketat)</option>
                  </select>
                </div>
                <button
                  onClick={() => {
                    selectRealCardForSim(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>

            {simInitialCard && (
              <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-extrabold text-indigo-950">
                    🎯 Titik Awal Kartu Nyata Siswa:{' '}
                  </span>
                  <span className="font-bold text-indigo-700">{simInitialCard.label}</span>
                  <span className="ml-2 font-mono text-slate-600">
                    (State Awal: <strong>{simInitialCard.state}</strong> · S₀ ={' '}
                    <strong>{simInitialCard.stability.toFixed(2)} hari</strong> · D₀ ={' '}
                    <strong>{simInitialCard.difficulty.toFixed(2)}</strong> · Reps = {simInitialCard.reps}x)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => selectRealCardForSim(null)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-bold hover:bg-indigo-100"
                >
                  Kembali ke Kartu Baru ✕
                </button>
              </div>
            )}

            {/* Skenario Cepat */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold uppercase text-slate-400">Skenario Uji:</span>
              <button
                type="button"
                onClick={() =>
                  resetSimSteps([
                    { rating: 'GOOD' },
                    { rating: 'GOOD' },
                    { rating: 'EASY' },
                    { rating: 'EASY' },
                  ])
                }
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-semibold transition-colors"
              >
                🚀 Cepat Hafal (Good → Easy)
              </button>
              <button
                type="button"
                onClick={() =>
                  resetSimSteps([
                    { rating: 'AGAIN' },
                    { rating: 'HARD' },
                    { rating: 'GOOD' },
                    { rating: 'GOOD' },
                  ])
                }
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-semibold transition-colors"
              >
                🔄 Lupa Lalu Bangkit (Again → Hard → Good)
              </button>
              <button
                type="button"
                onClick={() =>
                  resetSimSteps([
                    { rating: 'GOOD' },
                    { rating: 'GOOD' },
                    { rating: 'AGAIN' },
                    { rating: 'GOOD' },
                    { rating: 'EASY' },
                  ])
                }
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-semibold transition-colors"
              >
                📉 Lapse di Tengah (Good → Again → Easy)
              </button>
            </div>

            {/* Tombol Tambah Langkah Rating */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-600 mr-1">
                Tambah Langkah Review:
              </span>
              {(['AGAIN', 'HARD', 'GOOD', 'EASY'] as FsrsRating[]).map((r) => (
                <button
                  key={r}
                  onClick={() => addSimStep(r)}
                  disabled={simLoading || simSteps.length >= 20}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold transition-transform active:scale-95 ${RATING_BADGE[r]}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {r}
                </button>
              ))}
            </div>

            {/* Urutan Langkah Saat Ini (Klik untuk hapus) */}
            <div className="flex flex-wrap items-center gap-1.5">
              {simSteps.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => removeSimStep(idx)}
                  title="Klik untuk menghapus langkah ini"
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold hover:opacity-75 transition-opacity ${RATING_BADGE[s.rating]}`}
                >
                  <span className="opacity-60">#{idx + 1}</span> {s.rating}
                </button>
              ))}
            </div>
          </div>

          {simData && (
            <>
              {/* Tabel Jejak Perhitungan FSRS */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Jejak Kalkulasi Parameter Memori FSRS-5
                    </h3>
                    <p className="text-xs text-slate-500">
                      Menunjukkan perubahan State, Stability (S), Difficulty (D), dan Interval di setiap langkah.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                        simData.usingCustomWeights
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {simData.usingCustomWeights ? '⚙️ Bobot Kustom 19w Aktif' : '📐 Bobot Standar 19w'}
                    </span>
                    <span className="text-xs font-mono text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg font-bold">
                      S akhir = {simData.finalCard.stability.toFixed(2)}d · D akhir ={' '}
                      {simData.finalCard.difficulty.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase">
                      <tr>
                        <th className="text-center px-4 py-2.5">#</th>
                        <th className="text-left px-3 py-2.5">Rating</th>
                        <th className="text-left px-3 py-2.5">Transisi State</th>
                        <th className="text-center px-3 py-2.5">Elapsed</th>
                        <th className="text-center px-3 py-2.5">Retensi R(t)</th>
                        <th className="text-center px-3 py-2.5">Stability (S)</th>
                        <th className="text-center px-3 py-2.5">Difficulty (D)</th>
                        <th className="text-right px-6 py-2.5">Interval Berikutnya</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {simData.trace.map((row) => (
                        <tr key={row.step} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-500">
                            {row.step}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`px-2 py-0.5 rounded border font-bold text-[10px] ${RATING_BADGE[row.rating]}`}
                            >
                              {row.rating}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">
                            {row.stateBefore} →{' '}
                            <strong className="text-slate-900">{row.stateAfter}</strong>
                          </td>
                          <td className="px-3 py-3 text-center font-mono">+{row.elapsedDays}d</td>
                          <td className="px-3 py-3 text-center font-semibold">
                            {row.retrievabilityBefore !== null
                              ? pct(row.retrievabilityBefore)
                              : 'Kartu Baru'}
                          </td>
                          <td className="px-3 py-3 text-center font-mono">
                            {row.stabilityBefore.toFixed(2)} →{' '}
                            <strong className="text-indigo-700">
                              {row.stabilityAfter.toFixed(2)}d
                            </strong>
                          </td>
                          <td className="px-3 py-3 text-center font-mono">
                            {row.difficultyBefore.toFixed(2)} →{' '}
                            <strong>{row.difficultyAfter.toFixed(2)}</strong>
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-emerald-700">
                            {row.scheduledDays > 0
                              ? `${row.scheduledDays} hari`
                              : `${row.scheduledMinutes} menit`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Grafik Multi-Review Spaced Repetition Sawtooth Trajectory (Efek Pengulangan Berjarak FSRS-5) */}
              {simData.trace.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Lintasan Efek Pengulangan Berjarak (Multi-Review Spaced Repetition Curve)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Memperlihatkan bagaimana setiap pengulangan menaikkan kembali daya ingat ke 100% dan melandaikan kemiringan kurva lupa seiring bertambahnya Stability (S).
                      </p>
                    </div>
                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                      {simData.trace.length}x Review · Total Rentang{' '}
                      {Math.max(
                        1,
                        Math.round(
                          simData.trace.reduce(
                            (acc, r, i) =>
                              acc +
                              (i < simData.trace.length - 1
                                ? Math.max(0.2, simData.trace[i + 1]?.elapsedDays || r.scheduledDays || 0.2)
                                : Math.max(0.5, r.scheduledDays || 0.5)),
                            0,
                          ),
                        ),
                      )}{' '}
                      Hari
                    </span>
                  </div>

                  <div className="pt-1">
                    <svg viewBox="0 0 680 205" className="w-full h-56 overflow-visible">
                      <defs>
                        <linearGradient id="sawtoothFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.24" />
                          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      {(() => {
                        const segments: Array<{
                          step: number;
                          rating: FsrsRating;
                          startDay: number;
                          endDay: number;
                          stability: number;
                          pts: Array<{ d: number; r: number }>;
                        }> = [];
                        let cursorDay = 0;
                        simData.trace.forEach((tr, idx) => {
                          const dur =
                            idx < simData.trace.length - 1
                              ? Math.max(0.25, simData.trace[idx + 1]?.elapsedDays || tr.scheduledDays || 0.25)
                              : Math.max(0.5, tr.scheduledDays || 0.5);
                          const s = Math.max(0.08, tr.stabilityAfter);
                          const segPts: Array<{ d: number; r: number }> = [];
                          const samples = 10;
                          for (let k = 0; k <= samples; k++) {
                            const dt = (dur * k) / samples;
                            const rVal = Math.pow(1 + (19 / 81) * (dt / s), -0.5);
                            segPts.push({ d: cursorDay + dt, r: rVal });
                          }
                          segments.push({
                            step: tr.step,
                            rating: tr.rating,
                            startDay: cursorDay,
                            endDay: cursorDay + dur,
                            stability: tr.stabilityAfter,
                            pts: segPts,
                          });
                          cursorDay += dur;
                        });

                        const totalDays = Math.max(cursorDay, 1);
                        const allR = segments.flatMap((sg) => sg.pts.map((p) => p.r));
                        const minR = Math.max(
                          0,
                          Math.min(0.65, Math.floor((Math.min(...allR, simData.requestRetention) - 0.06) * 10) / 10),
                        );
                        const spanR = Math.max(1 - minR, 0.2);
                        const toX = (d: number) => 48 + (d / totalDays) * 612;
                        const toY = (r: number) => 24 + ((1 - r) / spanR) * 142;
                        const yBase = 166;
                        const yThresh = toY(simData.requestRetention);

                        const polyPts: string[] = [];
                        segments.forEach((sg) => {
                          sg.pts.forEach((p) => {
                            polyPts.push(`${toX(p.d).toFixed(1)},${toY(p.r).toFixed(1)}`);
                          });
                        });
                        const areaPts = `48,${yBase} ${polyPts.join(' ')} ${toX(totalDays).toFixed(1)},${yBase}`;
                        const dotColor: Record<FsrsRating, string> = {
                          AGAIN: '#e11d48',
                          HARD: '#d97706',
                          GOOD: '#059669',
                          EASY: '#0284c7',
                        };

                        return (
                          <g>
                            {[1, 0.9, 0.8, 0.7]
                              .filter((g) => g >= minR)
                              .map((g) => {
                                const gy = toY(g);
                                return (
                                  <g key={g}>
                                    <line x1={48} y1={gy} x2={660} y2={gy} stroke="#e2e8f0" strokeWidth={1} />
                                    <text x={42} y={gy + 3} textAnchor="end" className="fill-slate-400 text-[9px] font-mono">
                                      {Math.round(g * 100)}%
                                    </text>
                                  </g>
                                );
                              })}

                            <line
                              x1={48}
                              y1={yThresh}
                              x2={660}
                              y2={yThresh}
                              stroke="#f59e0b"
                              strokeDasharray="5 4"
                              strokeWidth={1.5}
                            />
                            <text
                              x={658}
                              y={yThresh - 4}
                              textAnchor="end"
                              className="fill-amber-600 text-[9px] font-mono font-semibold"
                            >
                              Target Retensi {Math.round(simData.requestRetention * 100)}%
                            </text>

                            <polygon points={areaPts} fill="url(#sawtoothFill)" />
                            <polyline
                              fill="none"
                              stroke="#4f46e5"
                              strokeWidth={2.4}
                              strokeLinejoin="round"
                              points={polyPts.join(' ')}
                            />

                            {segments.map((sg) => {
                              const cx = toX(sg.startDay);
                              const cy = toY(1);
                              return (
                                <g key={sg.step}>
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={4.5}
                                    fill={dotColor[sg.rating]}
                                    stroke="#ffffff"
                                    strokeWidth={1.8}
                                  />
                                  <text
                                    x={cx}
                                    y={14}
                                    textAnchor="middle"
                                    className="fill-slate-700 text-[9px] font-mono font-bold"
                                  >
                                    #{sg.step} {sg.rating[0]}
                                  </text>
                                  <text
                                    x={toX(sg.endDay)}
                                    y={184}
                                    textAnchor="middle"
                                    className="fill-slate-500 text-[9px] font-mono"
                                  >
                                    H+{Math.round(sg.endDay)}
                                  </text>
                                </g>
                              );
                            })}
                          </g>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}

              {/* Pratinjau 4 Pilihan & Grafik Kurva Lupa */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Pratinjau Saat Jatuh Tempo Berikutnya
                  </h3>
                  <p className="text-xs text-slate-500">
                    Jika siswa me-review kartu ini tepat saat jatuh tempo, berikut hasil untuk 4 tombol:
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {(['AGAIN', 'HARD', 'GOOD', 'EASY'] as FsrsRating[]).map((r) => {
                      const opt = simData.nextPreviewAtDue[r];
                      return (
                        <div key={r} className="p-3.5 rounded-xl border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 rounded border font-bold text-[10px] ${RATING_BADGE[r]}`}
                            >
                              {r}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {opt.scheduledDays > 0
                                ? `+${opt.scheduledDays} hari`
                                : `+${opt.scheduledMinutes} mnt`}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-slate-600 pt-1">
                            S: <strong>{opt.stability.toFixed(2)}d</strong> · D:{' '}
                            {opt.difficulty.toFixed(2)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Kurva Lupa (Forgetting Curve R(t)) */}
                <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Kurva Lupa Ebbinghaus / FSRS R(t)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Penurunan probabilitas ingat seiring hari berjalan untuk S ={' '}
                        {simData.finalCard.stability.toFixed(2)} hari
                      </p>
                    </div>
                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                      Ambang Due: {Math.round(simData.requestRetention * 100)}%
                    </span>
                  </div>

                  <div className="pt-2">
                    <svg viewBox="0 0 520 195" className="w-full h-52 overflow-visible">
                      <defs>
                        <linearGradient id="fsrsCurveFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>

                      {(() => {
                        const pts = simData.forgettingCurve;
                        const maxDay = pts[pts.length - 1]?.day || 1;
                        const minCurveR = Math.min(...pts.map((p) => p.retrievability));
                        const minR = Math.max(
                          0,
                          Math.min(0.7, Math.floor(( Math.min(minCurveR, simData.requestRetention) - 0.06) * 10) / 10),
                        );
                        const spanR = Math.max(1 - minR, 0.15);
                        const toY = (rVal: number) => 20 + ((1 - rVal) / spanR) * 135;
                        const toX = (dVal: number) => 46 + (dVal / maxDay) * 454;

                        const yTarget = toY(simData.requestRetention);
                        const coords = pts.map((p) => ({
                          x: toX(p.day),
                          y: toY(p.retrievability),
                          day: p.day,
                          r: p.retrievability,
                        }));
                        const linePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
                        const areaPoints = `46,155 ${linePoints} 500,155`;

                        const gridLevels = [1, 0.95, 0.9, 0.85, 0.8, 0.75].filter(
                          (g) => g >= minR && g <= 1,
                        );

                        return (
                          <g>
                            {/* Grid horizontal */}
                            {gridLevels.map((g) => {
                              const gy = toY(g);
                              return (
                                <g key={g}>
                                  <line
                                    x1={46}
                                    y1={gy}
                                    x2={500}
                                    y2={gy}
                                    stroke="#e2e8f0"
                                    strokeWidth={1}
                                  />
                                  <text
                                    x={40}
                                    y={gy + 3}
                                    textAnchor="end"
                                    className="fill-slate-400 text-[9px] font-mono"
                                  >
                                    {Math.round(g * 100)}%
                                  </text>
                                </g>
                              );
                            })}

                            {/* Garis horizontal ambang requestRetention */}
                            <line
                              x1={46}
                              y1={yTarget}
                              x2={500}
                              y2={yTarget}
                              stroke="#f59e0b"
                              strokeDasharray="5 4"
                              strokeWidth={1.5}
                            />
                            <text
                              x={498}
                              y={yTarget - 5}
                              textAnchor="end"
                              className="fill-amber-600 text-[9px] font-mono font-semibold"
                            >
                              Batas Due {Math.round(simData.requestRetention * 100)}%
                            </text>

                            {/* Area & Polyline kurva lupa */}
                            <polygon points={areaPoints} fill="url(#fsrsCurveFill)" />
                            <polyline
                              fill="none"
                              stroke="#4f46e5"
                              strokeWidth={2.5}
                              points={linePoints}
                            />
                            {coords.map((c, idx) => (
                              <g key={idx}>
                                <circle
                                  cx={c.x}
                                  cy={c.y}
                                  r={3.5}
                                  fill="#ffffff"
                                  stroke="#4f46e5"
                                  strokeWidth={2}
                                />
                                {idx % 3 === 0 && (
                                  <text
                                    x={c.x}
                                    y={175}
                                    textAnchor="middle"
                                    className="fill-slate-500 text-[9px] font-mono"
                                  >
                                    H+{Math.round(c.day)} ({(c.r * 100).toFixed(0)}%)
                                  </text>
                                )}
                              </g>
                            ))}
                          </g>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
