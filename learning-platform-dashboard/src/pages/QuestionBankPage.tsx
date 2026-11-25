import { useEffect, useState, FormEvent } from 'react';
import {
  Plus,
  Trash2,
  FolderPlus,
  Layers,
  CheckCircle2,
  Sparkles,
  Wrench,
  Link2,
  Pencil,
  Search,
} from 'lucide-react';
import { appsApi, decksApi, itemsApi, aiApi } from '../api/client';
import type { ClientApp, Deck, LearningItem, ItemType, AiVerifyDeckResponse } from '../api/types';

export function QuestionBankPage() {
  const [apps, setApps] = useState<ClientApp[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [items, setItems] = useState<LearningItem[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | ItemType>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDeckForm, setShowDeckForm] = useState(false);
  const [deckAppId, setDeckAppId] = useState('');
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDesc, setDeckDesc] = useState('');

  const [itemType, setItemType] = useState<ItemType>('FLASHCARD');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState<string[]>(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [sourceFlashcardId, setSourceFlashcardId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [verifyingDeck, setVerifyingDeck] = useState(false);
  const [verifyReport, setVerifyReport] = useState<AiVerifyDeckResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // State Edit Deck & Edit Soal (menaikkan contentVersion otomatis di server)
  const [editingDeck, setEditingDeck] = useState(false);
  const [editDeckTitle, setEditDeckTitle] = useState('');
  const [editDeckDesc, setEditDeckDesc] = useState('');
  const [editingItem, setEditingItem] = useState<LearningItem | null>(null);

  async function loadInitial() {
    setLoading(true);
    try {
      const [appsList, decksList] = await Promise.all([appsApi.list(), decksApi.list()]);
      const activeApps = appsList.filter((a) => a.isActive);
      setApps(activeApps);
      setDecks(decksList);
      if (activeApps[0] && !deckAppId) setDeckAppId(activeApps[0].id);
      if (decksList[0] && !selectedDeckId) {
        setSelectedDeckId(decksList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data awal');
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(deckId: string) {
    if (!deckId) {
      setItems([]);
      return;
    }
    try {
      const res = await itemsApi.list({ deckId, pageSize: 100 });
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat item');
    }
  }

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (selectedDeckId) loadItems(selectedDeckId);
  }, [selectedDeckId]);

  async function handleCreateDeck(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const newDeck = await decksApi.create({
        appId: deckAppId,
        title: deckTitle,
        description: deckDesc.trim() || undefined,
      });
      setDecks((prev) => [newDeck, ...prev]);
      setSelectedDeckId(newDeck.id);
      setDeckTitle('');
      setDeckDesc('');
      setShowDeckForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat deck');
    }
  }

  async function handleDeleteDeck(deck: Deck) {
    if (!confirm(`Hapus deck "${deck.title}" beserta seluruh soal di dalamnya?`)) return;
    try {
      await decksApi.remove(deck.id);
      const remaining = decks.filter((d) => d.id !== deck.id);
      setDecks(remaining);
      setSelectedDeckId(remaining[0]?.id ?? '');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus deck');
    }
  }

  async function handleVerifyDeck(autoFix: boolean) {
    if (!selectedDeckId) return;
    setVerifyingDeck(true);
    setError(null);
    try {
      const report = await aiApi.verifyDeck({ deckId: selectedDeckId, autoFix });
      setVerifyReport(report);
      if (autoFix && report.fixedCount > 0) {
        await loadItems(selectedDeckId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi deck');
    } finally {
      setVerifyingDeck(false);
    }
  }

  async function handleCreateItem(e: FormEvent) {
    e.preventDefault();
    if (!selectedDeckId) return;
    setSubmitting(true);
    setError(null);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingItem) {
        if (itemType === 'FLASHCARD') {
          await itemsApi.update(editingItem.id, { front, back, tags });
        } else {
          const cleanChoices = choices.map((c) => c.trim()).filter(Boolean);
          await itemsApi.update(editingItem.id, {
            question,
            choices: cleanChoices,
            correctIndex,
            explanation: explanation.trim() || null,
            sourceFlashcardId: sourceFlashcardId || null,
            tags,
          });
        }
        setEditingItem(null);
      } else if (itemType === 'FLASHCARD') {
        await itemsApi.createFlashcard({
          deckId: selectedDeckId,
          front,
          back,
          tags,
        });
      } else {
        const cleanChoices = choices.map((c) => c.trim()).filter(Boolean);
        await itemsApi.createMultipleChoice({
          deckId: selectedDeckId,
          question,
          choices: cleanChoices,
          correctIndex,
          explanation: explanation.trim() || undefined,
          sourceFlashcardId: sourceFlashcardId || undefined,
          tags,
        });
      }
      setFront('');
      setBack('');
      setQuestion('');
      setChoices(['', '', '', '']);
      setCorrectIndex(0);
      setExplanation('');
      setSourceFlashcardId('');
      setTagsInput('');
      await loadItems(selectedDeckId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan materi');
    } finally {
      setSubmitting(false);
    }
  }

  function startEditItem(item: LearningItem) {
    setEditingItem(item);
    setItemType(item.type);
    setTagsInput(item.tags.join(', '));
    if (item.type === 'FLASHCARD') {
      setFront(item.front ?? '');
      setBack(item.back ?? '');
    } else {
      setQuestion(item.question ?? '');
      const existing = item.choices ?? [];
      setChoices([existing[0] ?? '', existing[1] ?? '', existing[2] ?? '', existing[3] ?? '']);
      setCorrectIndex(item.correctIndex ?? 0);
      setExplanation(item.explanation ?? '');
      setSourceFlashcardId(item.sourceFlashcardId ?? '');
    }
    window.scrollTo({ top: 240, behavior: 'smooth' });
  }

  function cancelEditItem() {
    setEditingItem(null);
    setFront('');
    setBack('');
    setQuestion('');
    setChoices(['', '', '', '']);
    setCorrectIndex(0);
    setExplanation('');
    setSourceFlashcardId('');
    setTagsInput('');
  }

  async function handleSaveDeckEdit(e: FormEvent) {
    e.preventDefault();
    if (!selectedDeckId) return;
    setError(null);
    try {
      const updated = await decksApi.update(selectedDeckId, {
        title: editDeckTitle.trim(),
        description: editDeckDesc.trim() || null,
      });
      setDecks((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
      setEditingDeck(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui deck');
    }
  }

  function handleQuickCreateQuizFromCard(fc: LearningItem) {
    setItemType('MULTIPLE_CHOICE');
    setSourceFlashcardId(fc.id);
    setQuestion(`Apa arti atau pasangan yang tepat untuk "${fc.front ?? ''}"?`);
    const otherBacks = items
      .filter((i) => i.type === 'FLASHCARD' && i.id !== fc.id && i.back)
      .slice(0, 3)
      .map((i) => i.back ?? '');
    const padded = [
      fc.back ?? '',
      otherBacks[0] ?? 'Pilihan B',
      otherBacks[1] ?? 'Pilihan C',
      otherBacks[2] ?? 'Pilihan D',
    ];
    setChoices(padded);
    setCorrectIndex(0);
    setTagsInput(fc.tags.join(', '));
    window.scrollTo({ top: 220, behavior: 'smooth' });
  }

  async function handleDeleteItem(item: LearningItem) {
    if (!confirm('Hapus materi ini dari deck?')) return;
    try {
      await itemsApi.remove(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus item');
    }
  }

  const flashcardsInDeck = items.filter((i) => i.type === 'FLASHCARD');
  const quizzesInDeck = items.filter((i) => i.type === 'MULTIPLE_CHOICE');
  const linkedQuizzes = quizzesInDeck.filter((q) => Boolean(q.sourceFlashcardId));
  const filteredItems = items.filter((i) => {
    if (filterType !== 'ALL' && i.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (i.front ?? '').toLowerCase().includes(q) ||
        (i.back ?? '').toLowerCase().includes(q) ||
        (i.question ?? '').toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });
  const currentDeck = decks.find((d) => d.id === selectedDeckId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Bank Materi & Soal
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola deck pembelajaran, kartu memori FSRS, dan soal kuis pilihan ganda.
          </p>
        </div>
        <button
          onClick={() => setShowDeckForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-sm self-start"
        >
          <FolderPlus className="w-4 h-4" />
          {showDeckForm ? 'Tutup Form Deck' : 'Deck Baru'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Form Tambah Deck */}
      {showDeckForm && (
        <form
          onSubmit={handleCreateDeck}
          className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-4"
        >
          <h2 className="text-sm font-bold text-slate-900">Buat Deck Pembelajaran Baru</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Aplikasi *</label>
              <select
                required
                value={deckAppId}
                onChange={(e) => setDeckAppId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="">-- Pilih Aplikasi --</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Deck *</label>
              <input
                type="text"
                required
                value={deckTitle}
                onChange={(e) => setDeckTitle(e.target.value)}
                placeholder="Mis. Kosakata Bahasa Jepang N5"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi</label>
              <input
                type="text"
                value={deckDesc}
                onChange={(e) => setDeckDesc(e.target.value)}
                placeholder="Topik singkat deck"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              Simpan Deck
            </button>
          </div>
        </form>
      )}

      {/* Pemilih Deck & Statistik Komposisi */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[260px]">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Deck Aktif
              </label>
              <select
                value={selectedDeckId}
                onChange={(e) => {
                  setSelectedDeckId(e.target.value);
                  setVerifyReport(null);
                }}
                className="w-full mt-0.5 px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {decks.length === 0 && <option value="">-- Belum ada deck --</option>}
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d._count?.learningItems ?? 0} item)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentDeck && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditDeckTitle(currentDeck.title);
                  setEditDeckDesc(currentDeck.description ?? '');
                  setEditingDeck((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Deck
              </button>
              <button
                type="button"
                disabled={verifyingDeck || items.length === 0}
                onClick={() => handleVerifyDeck(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 border border-indigo-200 text-xs font-semibold transition-colors"
              >
                <Wrench className="w-3.5 h-3.5" />
                {verifyingDeck ? 'Memeriksa Deck...' : 'Audit & Perbaiki via AI'}
              </button>
              <button
                onClick={() => handleDeleteDeck(currentDeck)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-xs font-semibold text-rose-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Deck
              </button>
            </div>
          )}
        </div>

        {editingDeck && currentDeck && (
          <form
            onSubmit={handleSaveDeckEdit}
            className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
          >
            <div className="md:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Deck *</label>
              <input
                type="text"
                required
                value={editDeckTitle}
                onChange={(e) => setEditDeckTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="md:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi</label>
              <input
                type="text"
                value={editDeckDesc}
                onChange={(e) => setEditDeckDesc(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="md:col-span-2 flex gap-1.5">
              <button
                type="submit"
                className="flex-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={() => setEditingDeck(false)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-600"
              >
                ✕
              </button>
            </div>
          </form>
        )}

        {/* Strip Komposisi Deck */}
        {currentDeck && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <p className="text-[11px] text-slate-500">Total Materi</p>
              <p className="text-lg font-extrabold text-slate-900">{items.length}</p>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100">
              <p className="text-[11px] text-indigo-600 font-medium">Flashcard FSRS</p>
              <p className="text-lg font-extrabold text-indigo-900">{flashcardsInDeck.length}</p>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <p className="text-[11px] text-emerald-700 font-medium">Pilihan Ganda</p>
              <p className="text-lg font-extrabold text-emerald-900">{quizzesInDeck.length}</p>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/60 border border-amber-100">
              <p className="text-[11px] text-amber-700 font-medium">Kuis Terhubung FSRS</p>
              <p className="text-lg font-extrabold text-amber-900">{linkedQuizzes.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* Laporan Verifikasi AI */}
      {verifyReport && (
        <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              Hasil Audit AI ({verifyReport.model}): {verifyReport.checkedCount} diperiksa ·{' '}
              {verifyReport.fixedCount} diperbaiki
            </div>
            <button
              type="button"
              onClick={() => setVerifyReport(null)}
              className="text-xs text-indigo-600 hover:underline font-medium"
            >
              Tutup
            </button>
          </div>
          {verifyReport.changes.length === 0 ? (
            <p className="text-xs text-emerald-700 font-medium">
              Seluruh flashcard dan soal pilihan ganda pada deck ini sudah konsisten.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {verifyReport.changes.map((c, idx) => (
                <div
                  key={`${c.itemId}-${idx}`}
                  className="bg-white rounded-xl p-2.5 border border-indigo-100 text-xs"
                >
                  <span className="font-bold text-slate-800">{c.type}</span> —{' '}
                  <span className="text-amber-700">{c.reason}</span>
                  <div className="text-slate-500 mt-0.5">
                    Sebelum: <span className="line-through">{c.before}</span> → Sesudah:{' '}
                    <span className="font-medium text-emerald-700">{c.after}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedDeckId && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Kolom Kiri: Form Tambah / Edit Materi */}
          <form
            onSubmit={handleCreateItem}
            className={`lg:col-span-5 rounded-2xl border p-5 shadow-sm space-y-4 self-start ${
              editingItem
                ? 'bg-amber-50/40 border-amber-300'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                {editingItem ? (
                  <>
                    <Pencil className="w-4 h-4 text-amber-600" />
                    Edit Materi (v{editingItem.contentVersion} → v{editingItem.contentVersion + 1})
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-indigo-600" />
                    Tambah Materi
                  </>
                )}
              </h2>
              {editingItem ? (
                <button
                  type="button"
                  onClick={cancelEditItem}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal Edit ✕
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setItemType('FLASHCARD')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                      itemType === 'FLASHCARD'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    Flashcard
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemType('MULTIPLE_CHOICE')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                      itemType === 'MULTIPLE_CHOICE'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600'
                    }`}
                  >
                    Pilihan Ganda
                  </button>
                </div>
              )}
            </div>

            {itemType === 'FLASHCARD' ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sisi Depan (Pertanyaan / Istilah) *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={front}
                    onChange={(e) => setFront(e.target.value)}
                    placeholder="Contoh: Merci beaucoup"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sisi Belakang (Jawaban / Arti) *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={back}
                    onChange={(e) => setBack(e.target.value)}
                    placeholder="Contoh: Terima kasih banyak"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pertanyaan Kuis *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Tulis pertanyaan pilihan ganda..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Opsi Jawaban (klik radio untuk kunci benar) *
                  </label>
                  {choices.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correctIndex"
                        checked={correctIndex === idx}
                        onChange={() => setCorrectIndex(idx)}
                        className="text-indigo-600"
                      />
                      <input
                        type="text"
                        required={idx < 2}
                        value={c}
                        onChange={(e) => {
                          const next = [...choices];
                          next[idx] = e.target.value;
                          setChoices(next);
                        }}
                        placeholder={`Pilihan ${String.fromCharCode(65 + idx)}`}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kaitkan ke Flashcard FSRS (Opsional)
                  </label>
                  <select
                    value={sourceFlashcardId}
                    onChange={(e) => setSourceFlashcardId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                  >
                    <option value="">-- Tidak dikaitkan --</option>
                    {flashcardsInDeck.map((fc) => (
                      <option key={fc.id} value={fc.id}>
                        {fc.front?.slice(0, 50)} → {fc.back?.slice(0, 30)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Penjelasan Jawaban (Opsional)
                  </label>
                  <input
                    type="text"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Ditampilkan setelah siswa menjawab"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tag Sub-topik (pisahkan koma)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="kosakata, dasar"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-sm ${
                editingItem ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {submitting
                ? 'Menyimpan...'
                : editingItem
                  ? 'Simpan Perubahan Materi'
                  : 'Simpan ke Deck'}
            </button>
          </form>

          {/* Kolom Kanan: Daftar Materi */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Daftar Materi ({filteredItems.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari kata / soal..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                {(['ALL', 'FLASHCARD', 'MULTIPLE_CHOICE'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      filterType === t
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t === 'ALL'
                      ? 'Semua'
                      : t === 'FLASHCARD'
                        ? `Flashcard (${flashcardsInDeck.length})`
                        : `Kuis (${quizzesInDeck.length})`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat materi...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada materi untuk filter ini.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
                {filteredItems.map((item) => {
                  const linkedFc =
                    item.type === 'MULTIPLE_CHOICE' && item.sourceFlashcardId
                      ? flashcardsInDeck.find((f) => f.id === item.sourceFlashcardId)
                      : null;
                  return (
                    <div
                      key={item.id}
                      className="p-4 hover:bg-slate-50/70 flex items-start justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              item.type === 'FLASHCARD'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            }`}
                          >
                            {item.type === 'FLASHCARD' ? 'Flashcard' : 'Pilihan Ganda'}
                          </span>
                          <span
                            title="Versi konten otomatis untuk invalidasi cache ETag klien"
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono text-[10px] font-semibold"
                          >
                            v{item.contentVersion}
                          </span>
                          {linkedFc && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-semibold">
                              <Link2 className="w-3 h-3" />
                              FSRS: {linkedFc.front?.slice(0, 24)}
                            </span>
                          )}
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>

                        {item.type === 'FLASHCARD' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70">
                              <p className="text-[10px] font-bold uppercase text-slate-400">Depan</p>
                              <p className="text-sm font-semibold text-slate-900 mt-0.5">
                                {item.front}
                              </p>
                            </div>
                            <div className="px-3 py-2 rounded-xl bg-indigo-50/50 border border-indigo-100">
                              <p className="text-[10px] font-bold uppercase text-indigo-400">
                                Belakang
                              </p>
                              <p className="text-sm font-semibold text-indigo-950 mt-0.5">
                                {item.back}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5 pt-0.5">
                            <p className="text-sm font-semibold text-slate-900">{item.question}</p>
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                              {(item.choices ?? []).map((c, idx) => (
                                <li
                                  key={idx}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                                    item.correctIndex === idx
                                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800 font-semibold'
                                      : 'bg-slate-50/60 border-slate-200/60 text-slate-600'
                                  }`}
                                >
                                  <CheckCircle2
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      item.correctIndex === idx
                                        ? 'text-emerald-600'
                                        : 'text-slate-300'
                                    }`}
                                  />
                                  <span className="truncate">
                                    {String.fromCharCode(65 + idx)}. {c}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.type === 'FLASHCARD' && (
                          <button
                            type="button"
                            onClick={() => handleQuickCreateQuizFromCard(item)}
                            title="Buat Kuis Pilihan Ganda dari Flashcard ini"
                            className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-colors"
                          >
                            + Kuis
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEditItem(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit materi ini"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Hapus materi"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionBankPage;
