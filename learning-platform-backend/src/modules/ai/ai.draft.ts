import { randomInt } from 'crypto';
import { z } from 'zod';

// =============================================================================
// Logika murni AI Generator: validasi & pembersihan keluaran LLM, serta penyusunan soal MC.
// Keluaran LLM TIDAK dipercaya: semuanya divalidasi ulang dan dinormalisasi di sini.
// Modul ini tidak memanggil jaringan/DB sehingga mudah diuji.
// =============================================================================

// ---- Bentuk mentah keluaran Gemini (sesudah JSON.parse) ----

// Tahap 1: daftar flashcard.
export const rawFlashcardsSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      tags: z.array(z.string()).optional(),
    }),
  ),
});

// Tahap 2: soal MC. LLM memberi jawaban benar + pengecoh (BUKAN indeks) karena LLM sering salah menghitung indeks;
// urutan pilihan diacak dan correctIndex dihitung oleh server.
export const rawQuizzesSchema = z.object({
  quizzes: z.array(
    z.object({
      sourceTempId: z.string(),
      question: z.string(),
      correctAnswer: z.string(),
      distractors: z.array(z.string()),
      explanation: z.string().optional(),
    }),
  ),
});

// Tahap 3: hasil verifikasi & koreksi ejaan/bahasa oleh AI Auditor.
export const rawVerifiedDraftSchema = z.object({
  flashcards: z.array(
    z.object({
      tempId: z.string(),
      front: z.string(),
      back: z.string(),
      tags: z.array(z.string()).optional(),
    }),
  ),
  quizzes: z.array(
    z.object({
      sourceTempId: z.string(),
      question: z.string(),
      correctAnswer: z.string(),
      distractors: z.array(z.string()),
      explanation: z.string().optional(),
    }),
  ),
  corrections: z.array(z.string()).optional(),
});

// Hasil audit item bank soal yang sudah tersimpan di database.
export const rawDeckAuditSchema = z.object({
  fixes: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['FLASHCARD', 'MULTIPLE_CHOICE']),
      reason: z.string(),
      front: z.string().optional(),
      back: z.string().optional(),
      question: z.string().optional(),
      choices: z.array(z.string()).optional(),
      correctIndex: z.number().int().min(0).optional(),
      explanation: z.string().optional(),
    }),
  ),
});

// ---- Bentuk draft yang dikirim ke dashboard ----

export interface DraftFlashcard {
  // ID sementara (f1, f2, ...) agar soal MC dapat merujuk flashcard sebelum tersimpan di DB.
  tempId: string;
  front: string;
  back: string;
  tags: string[];
}

export interface DraftQuiz {
  sourceTempId: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string | null;
  tags: string[];
}

// Batas panjang field agar sesuai dengan skema item di database/validasi.
const MAX_FRONT = 500;
const MAX_BACK = 1000;
const MAX_QUESTION = 1000;
const MAX_CHOICE = 300;
const MAX_EXPLANATION = 1000;
const MAX_TAG_LEN = 30;
const MAX_TAGS = 5;

// Rapikan spasi dan potong sesuai batas.
const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);

// Acak Fisher-Yates. `rand(n)` mengembalikan bilangan bulat acak [0, n). Default memakai CSPRNG.
export function shuffle<T>(arr: readonly T[], rand: (n: number) => number = (n) => randomInt(n)): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// Bersihkan tag: huruf kecil, unik, panjang dibatasi.
function cleanTags(tags: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const t of tags ?? []) {
    const v = clean(t, MAX_TAG_LEN).toLowerCase();
    if (v) out.add(v);
    if (out.size >= MAX_TAGS) break;
  }
  return [...out];
}

/**
 * Bersihkan flashcard hasil LLM: buang yang kosong/duplikat, potong panjang,
 * batasi jumlah, dan beri tempId berurutan.
 */
export function sanitizeFlashcards(
  raw: z.infer<typeof rawFlashcardsSchema>,
  maxCount: number,
): { flashcards: DraftFlashcard[]; warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const flashcards: DraftFlashcard[] = [];

  for (const f of raw.flashcards) {
    const front = clean(f.front, MAX_FRONT);
    const back = clean(f.back, MAX_BACK);
    if (!front || !back) {
      warnings.push('Satu flashcard kosong dibuang');
      continue;
    }
    // Duplikat dideteksi dari sisi depan (tanpa membedakan huruf besar/kecil).
    const key = front.toLowerCase();
    if (seen.has(key)) {
      warnings.push(`Flashcard duplikat dibuang: "${front}"`);
      continue;
    }
    seen.add(key);
    if (flashcards.length >= maxCount) {
      warnings.push(`Jumlah flashcard dibatasi ${maxCount}; sisanya dibuang`);
      break;
    }
    flashcards.push({ tempId: `f${flashcards.length + 1}`, front, back, tags: cleanTags(f.tags) });
  }
  return { flashcards, warnings };
}

/**
 * Susun soal MC dari keluaran LLM:
 * - hanya untuk flashcard yang ada, maksimum satu soal per flashcard;
 * - pengecoh dibersihkan (tidak kosong, unik, tidak sama dengan jawaban benar);
 * - pilihan diacak lalu correctIndex dihitung server;
 * - soal tanpa pengecoh sama sekali dibuang.
 */
export function buildQuizzes(
  raw: z.infer<typeof rawQuizzesSchema>,
  flashcards: DraftFlashcard[],
  choicesCount: number,
  rand?: (n: number) => number,
): { quizzes: DraftQuiz[]; warnings: string[] } {
  const warnings: string[] = [];
  const byId = new Map(flashcards.map((f) => [f.tempId, f]));
  const used = new Set<string>();
  const quizzes: DraftQuiz[] = [];

  for (const q of raw.quizzes) {
    const source = byId.get(q.sourceTempId);
    // Acuan ke flashcard yang tidak ada (halusinasi) atau soal ke-2 untuk flashcard yang sama diabaikan.
    if (!source) {
      warnings.push(`Soal dengan sourceTempId tidak dikenal dibuang: ${q.sourceTempId}`);
      continue;
    }
    if (used.has(source.tempId)) continue;

    const question = clean(q.question, MAX_QUESTION);
    const correct = clean(q.correctAnswer, MAX_CHOICE);
    if (!question || !correct) {
      warnings.push(`Soal untuk "${source.front}" tidak lengkap dan dibuang`);
      continue;
    }

    // Pengecoh unik & berbeda dari jawaban benar.
    const taken = new Set([correct.toLowerCase()]);
    const distractors: string[] = [];
    for (const d of q.distractors) {
      const v = clean(d, MAX_CHOICE);
      if (!v || taken.has(v.toLowerCase())) continue;
      taken.add(v.toLowerCase());
      distractors.push(v);
      if (distractors.length >= choicesCount - 1) break;
    }

    if (distractors.length === 0) {
      warnings.push(`Soal untuk "${source.front}" dibuang: tidak ada pengecoh yang valid`);
      continue;
    }
    if (distractors.length < choicesCount - 1) {
      warnings.push(`Soal untuk "${source.front}" hanya memiliki ${distractors.length + 1} pilihan`);
    }

    const choices = shuffle([correct, ...distractors], rand);
    const explanation = q.explanation ? clean(q.explanation, MAX_EXPLANATION) : '';
    used.add(source.tempId);
    quizzes.push({
      sourceTempId: source.tempId,
      question,
      choices,
      correctIndex: choices.indexOf(correct),
      explanation: explanation || null,
      tags: source.tags,
    });
  }
  return { quizzes, warnings };
}

/**
 * Terapkan hasil verifikasi Tahap 3 dengan tetap menjaga integritas tempId,
 * keunikan pilihan jawaban, dan perhitungan correctIndex di sisi server.
 */
export function applyVerifiedDraft(
  verified: z.infer<typeof rawVerifiedDraftSchema>,
  originalFlashcards: DraftFlashcard[],
  choicesCount: number,
  rand?: (n: number) => number,
): { flashcards: DraftFlashcard[]; quizzes: DraftQuiz[]; corrections: string[]; warnings: string[] } {
  const byTempId = new Map(verified.flashcards.map((f) => [f.tempId, f]));
  const mergedCards: DraftFlashcard[] = originalFlashcards.map((orig) => {
    const upd = byTempId.get(orig.tempId);
    if (!upd) return orig;
    const front = clean(upd.front, MAX_FRONT) || orig.front;
    const back = clean(upd.back, MAX_BACK) || orig.back;
    const tags = upd.tags ? cleanTags(upd.tags) : orig.tags;
    return {
      tempId: orig.tempId,
      front,
      back,
      tags: tags.length > 0 ? tags : orig.tags,
    };
  });

  const built = buildQuizzes({ quizzes: verified.quizzes }, mergedCards, choicesCount, rand);
  const corrections = (verified.corrections ?? [])
    .map((c) => clean(c, 300))
    .filter(Boolean);

  return {
    flashcards: mergedCards,
    quizzes: built.quizzes,
    corrections,
    warnings: built.warnings,
  };
}
