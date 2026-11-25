import { useEffect, useState, FormEvent } from 'react';
import { Sparkles, Upload, FileText, Check, Trash2, Save, Wand2, ShieldCheck } from 'lucide-react';
import { aiApi, decksApi } from '../api/client';
import type { AiStatus, Deck, DraftFlashcard, DraftQuiz } from '../api/types';

const TOPIC_PRESETS = [
  {
    label: '🐾 Hewan & Alam SD',
    text: 'Klorofil adalah zat hijau daun yang berperan menyerap cahaya matahari untuk fotosintesis tumbuhan. Hewan herbivora memakan tumbuhan (contoh: sapi, kelinci), karnivora memakan daging (contoh: singa, elang), sedangkan omnivora memakan tumbuhan dan daging (contoh: ayam, beruang). Mamalia bernapas dengan paru-paru dan menyusui anaknya, sedangkan ikan bernapas menggunakan insang.',
  },
  {
    label: '🥐 Bahan Kue Inggris',
    text: 'Dalam pembuatan kue (baking), Flour artinya Tepung Terigu sebagai bahan utama adonan. Sugar artinya Gula Pasir untuk memberi rasa manis. Butter artinya Mentega agar tekstur kue lembut dan harum. Egg artinya Telur untuk mengikat adonan. Milk artinya Susu Segar, Yeast artinya Ragi Pengembang, dan Cinnamon artinya Kayu Manis.',
  },
  {
    label: '🇫🇷 Bahasa Perancis Dasar',
    text: 'Kosakata sapaan Bahasa Perancis dasar: Bonjour artinya Halo atau Selamat Pagi. Bonsoir artinya Selamat Malam. Merci beaucoup artinya Terima kasih banyak. Au revoir artinya Sampai jumpa. S il vous plait artinya Tolong atau Silakan. Excusez-moi artinya Permisi atau Maaf.',
  },
];

export function AiGeneratorPage() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState('');
  const [sourceMode, setSourceMode] = useState<'text' | 'file'>('text');

  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [flashcardCount, setFlashcardCount] = useState(5);
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [choicesCount, setChoicesCount] = useState(4);
  const [instructions, setInstructions] = useState('');

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [draftCards, setDraftCards] = useState<(DraftFlashcard & { selected: boolean })[]>([]);
  const [draftQuizzes, setDraftQuizzes] = useState<(DraftQuiz & { selected: boolean })[]>([]);
  const [genMeta, setGenMeta] = useState<{
    model: string;
    verified: boolean;
    corrections: string[];
    warnings: string[];
    durationSec: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([aiApi.status(), decksApi.list()])
      .then(([sData, dList]) => {
        setStatus(sData);
        setDecks(dList);
        if (dList[0]) setDeckId(dList[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat status AI'));
  }, []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setGenMeta(null);
    setGenerating(true);
    const t0 = performance.now();

    try {
      const res = await aiApi.generate({
        deckId,
        text: sourceMode === 'text' ? text : undefined,
        file: sourceMode === 'file' ? file : null,
        flashcardCount,
        includeQuiz,
        choicesCount,
        instructions: instructions.trim() || undefined,
        verifyWithAi: true,
        save: false,
      });

      const draft = res.draft;
      setDraftCards((draft?.flashcards ?? []).map((fc) => ({ ...fc, selected: true })));
      setDraftQuizzes((draft?.quizzes ?? []).map((qz) => ({ ...qz, selected: true })));
      setGenMeta({
        model: res.model,
        verified: Boolean(res.verified),
        corrections: res.corrections ?? [],
        warnings: res.warnings ?? [],
        durationSec: ((performance.now() - t0) / 1000).toFixed(1),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghasilkan soal via AI');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveApproved() {
    if (!deckId) return;
    const selectedCards = draftCards
      .filter((c) => c.selected)
      .map(({ selected: _s, ...rest }) => rest);
    const selectedQuizzes = draftQuizzes
      .filter((q) => q.selected)
      .map(({ selected: _s, ...rest }) => rest);

    if (selectedCards.length === 0 && selectedQuizzes.length === 0) {
      alert('Pilih minimal satu flashcard atau kuis untuk disimpan.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await aiApi.commit({
        deckId,
        flashcards: selectedCards,
        quizzes: selectedQuizzes,
      });
      setSuccessMsg(
        `${res.counts.flashcards} Flashcard & ${res.counts.quizzes} Pilihan Ganda berhasil disimpan ke Bank Materi.`,
      );
      setDraftCards([]);
      setDraftQuizzes([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan draft');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            AI Question Generator
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ekstrak materi teks atau dokumen PDF menjadi paket Flashcard FSRS & Kuis Pilihan Ganda.
          </p>
        </div>
        {status && (
          <div className="flex items-center gap-2 self-start">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                status.configured
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {status.configured ? `Model: ${status.model}` : 'GEMINI_API_KEY belum diatur'}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Form Konfigurasi Generator */}
      <form
        onSubmit={handleGenerate}
        className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-5"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Deck Tujuan *</label>
            <select
              required
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              {decks.length === 0 && <option value="">-- Buat deck dulu --</option>}
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Jumlah Flashcard (1–20)
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={flashcardCount}
              onChange={(e) => setFlashcardCount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Jumlah Opsi Kuis MC
            </label>
            <select
              value={includeQuiz ? choicesCount : 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v === 0) setIncludeQuiz(false);
                else {
                  setIncludeQuiz(true);
                  setChoicesCount(v);
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value={4}>4 Pilihan Ganda (A–D)</option>
              <option value={3}>3 Pilihan Ganda (A–C)</option>
              <option value={0}>Hanya Flashcard (Tanpa Kuis)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instruksi Tambahan (Opsional)
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Mis. Bahasa ramah anak SD"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        {/* Pemilih Mode Input & Preset Topik */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="inline-flex gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setSourceMode('text')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sourceMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Teks Materi
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('file')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sourceMode === 'file' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Dokumen (PDF / TXT / MD)
            </button>
          </div>

          {sourceMode === 'text' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Wand2 className="w-3 h-3" /> Contoh Cepat:
              </span>
              {TOPIC_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setText(preset.text)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-medium transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {sourceMode === 'text' ? (
          <div>
            <textarea
              required
              minLength={30}
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tempelkan ringkasan materi, catatan bab, atau daftar kosakata (minimal 30 karakter)..."
              className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        ) : (
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-slate-50/50">
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600"
            />
            <p className="text-xs text-slate-500 mt-2">
              Format didukung: PDF, TXT, Markdown (maks. {status?.maxFileMB ?? 15} MB)
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={generating || !deckId}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? 'Menghasilkan Draft...' : 'Generate Draft via Gemini AI'}
          </button>
        </div>
      </form>

      {/* Panel Review & Kurasi Draft */}
      {(draftCards.length > 0 || draftQuizzes.length > 0) && (
        <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Kurasi Draft Soal ({draftCards.filter((c) => c.selected).length} Flashcard &{' '}
                {draftQuizzes.filter((q) => q.selected).length} Kuis dipilih)
              </h2>
              <p className="text-xs text-slate-500">
                Sunting redaksi soal langsung di bawah sebelum menyimpan ke Bank Materi.
              </p>
            </div>
            <button
              onClick={handleSaveApproved}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Materi Terpilih'}
            </button>
          </div>

          {/* Banner Bukti Verifikasi AI 2nd-Pass (Rencana Uji Coba #3 Proposal TA) */}
          {genMeta && (
            <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {genMeta.verified
                      ? 'Lolos Verifikasi Otomatis AI Lapis ke-2 (2nd-Pass Verifier)'
                      : 'Draft Dihasilkan oleh AI Content Generator'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700 font-semibold">
                    Model: {genMeta.model}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700 font-semibold">
                    Waktu: {genMeta.durationSec} dtk
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold">
                    Koreksi AI: {genMeta.corrections.length}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Sesuai batasan arsitektur Proposal TA, AI hanya menghasilkan draf konten terstruktur dan tidak mengubah jadwal memori FSRS maupun database sebelum disetujui pengajar (<em>Human-in-the-Loop</em>).
              </p>
              {genMeta.corrections.length > 0 && (
                <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5 pt-1">
                  {genMeta.corrections.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              {genMeta.warnings.length > 0 && (
                <ul className="list-disc list-inside text-xs text-rose-700 space-y-0.5">
                  {genMeta.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Draft Flashcard */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Draft Flashcard ({draftCards.length})
            </h3>
            {draftCards.map((fc, idx) => (
              <div
                key={fc.tempId}
                className={`p-4 rounded-xl border flex items-start gap-3 transition-colors ${
                  fc.selected ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200 opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={fc.selected}
                  onChange={(e) => {
                    const next = [...draftCards];
                    next[idx] = { ...fc, selected: e.target.checked };
                    setDraftCards(next);
                  }}
                  className="mt-1"
                />
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Depan (Pertanyaan/Istilah)
                    </label>
                    <input
                      type="text"
                      value={fc.front}
                      onChange={(e) => {
                        const next = [...draftCards];
                        next[idx] = { ...fc, front: e.target.value };
                        setDraftCards(next);
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Belakang (Jawaban/Arti)
                    </label>
                    <input
                      type="text"
                      value={fc.back}
                      onChange={(e) => {
                        const next = [...draftCards];
                        next[idx] = { ...fc, back: e.target.value };
                        setDraftCards(next);
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftCards(draftCards.filter((_, i) => i !== idx))}
                  className="p-1.5 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Draft Multiple Choice */}
          {draftQuizzes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Draft Pilihan Ganda ({draftQuizzes.length})
              </h3>
              {draftQuizzes.map((qz, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    qz.selected
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : 'border-slate-200 opacity-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={qz.selected}
                      onChange={(e) => {
                        const next = [...draftQuizzes];
                        next[idx] = { ...qz, selected: e.target.checked };
                        setDraftQuizzes(next);
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={qz.question}
                        onChange={(e) => {
                          const next = [...draftQuizzes];
                          next[idx] = { ...qz, question: e.target.value };
                          setDraftQuizzes(next);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium bg-white"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {qz.choices.map((c, cIdx) => (
                          <div key={cIdx} className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={qz.correctIndex === cIdx}
                              onChange={() => {
                                const next = [...draftQuizzes];
                                next[idx] = { ...qz, correctIndex: cIdx };
                                setDraftQuizzes(next);
                              }}
                            />
                            <input
                              type="text"
                              value={c}
                              onChange={(e) => {
                                const nextChoices = [...qz.choices];
                                nextChoices[cIdx] = e.target.value;
                                const next = [...draftQuizzes];
                                next[idx] = { ...qz, choices: nextChoices };
                                setDraftQuizzes(next);
                              }}
                              className="flex-1 px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraftQuizzes(draftQuizzes.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AiGeneratorPage;
