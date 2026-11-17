import { ItemType } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { getOwnedDeck } from '../../utils/ownership';
import { checkChoices, type CreateItemInput } from '../items/items.schema';
import { bulkCreateItems, updateItem } from '../items/items.service';
import {
  applyVerifiedDraft,
  buildQuizzes,
  rawDeckAuditSchema,
  rawFlashcardsSchema,
  rawQuizzesSchema,
  rawVerifiedDraftSchema,
  sanitizeFlashcards,
  type DraftFlashcard,
  type DraftQuiz,
} from './ai.draft';
import { generateJson, isGeminiConfigured, type AiInputPart } from './ai.gemini';
import {
  AUDIT_DECK_JSON_SCHEMA,
  AUDIT_DECK_SYSTEM,
  buildAuditDeckPrompt,
  buildFlashcardPrompt,
  buildQuizPrompt,
  buildVerifyDraftPrompt,
  FLASHCARD_JSON_SCHEMA,
  FLASHCARD_SYSTEM,
  QUIZ_JSON_SCHEMA,
  QUIZ_SYSTEM,
  VERIFY_DRAFT_JSON_SCHEMA,
  VERIFY_DRAFT_SYSTEM,
} from './ai.prompts';
import type { CommitInput, GenerateInput, VerifyDeckInput } from './ai.schema';

// =============================================================================
// Orkestrasi Layanan AI Generator & AI Content Verifier
// Alur: teks materi / dokumen -> (Gemini Tahap 1) Flashcards -> (Gemini Tahap 2) Multiple Choice
//       -> (Gemini Tahap 3) Verifikasi Ejaan, Bahasa, & Kunci Jawaban
//       -> Simpan ke DB via bulkCreateItems dengan pengikatan otomatis sourceFlashcardId.
// =============================================================================

// Batas ukuran dokumen unggahan (10 MB) dan tipe MIME yang diizinkan.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ['application/pdf', 'text/plain', 'text/markdown'] as const;
const MAX_TOTAL_CHARS = 100_000;

// Representasi berkas unggahan dari middleware multer (memory storage).
export interface UploadedDoc {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

// Cek status konfigurasi AI (dipakai oleh Developer Dashboard untuk mengecek kesiapan fitur AI).
export const getAiStatus = () => ({
  configured: isGeminiConfigured(),
  model: env.GEMINI_MODEL,
  maxFileMB: MAX_FILE_BYTES / 1024 / 1024,
  allowedFileTypes: ALLOWED_MIME,
});

// Siapkan sumber materi dari input teks dan/atau unggahan dokumen.
function prepareSource(text: string | undefined, file: UploadedDoc | undefined) {
  let combined = text ?? '';
  let pdf: { data: string; mimeType: string } | undefined;

  if (file) {
    if (file.mimetype === 'application/pdf') {
      // Validasi magic bytes header PDF (%PDF-) untuk memastikan berkas benar-benar PDF.
      if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw ApiError.badRequest('Berkas bukan PDF yang valid');
      }
      pdf = { data: file.buffer.toString('base64'), mimeType: 'application/pdf' };
    } else {
      // Berkas teks (.txt / .md) langsung digabungkan ke materi bacaan.
      combined = [combined, file.buffer.toString('utf8')].filter(Boolean).join('\n\n');
    }
  }

  combined = combined.trim();
  if (!combined && !pdf) {
    throw ApiError.badRequest('Sertakan teks materi bacaan atau unggah dokumen (PDF/TXT/MD)');
  }
  if (combined.length > MAX_TOTAL_CHARS) {
    throw ApiError.badRequest(`Materi terlalu panjang (maksimum ${MAX_TOTAL_CHARS} karakter)`);
  }
  return { text: combined, pdf };
}

// Struktur keluaran draft hasil pemrosesan Gemini.
export interface Draft {
  deckId: string;
  flashcards: DraftFlashcard[];
  quizzes: DraftQuiz[];
  warnings: string[];
  corrections: string[];
  verified: boolean;
  model: string;
}

// =============================================================================
// 1. Generate Draft dari Gemini (Flashcards + Multiple Choice + AI Verifier)
// =============================================================================

export async function generateDraft(developerId: string, input: GenerateInput, file?: UploadedDoc): Promise<Draft> {
  // Pastikan deck benar-benar milik developer & ambil konteks judul/deskripsi deck agar bahasa selalu akurat.
  const deck = await getOwnedDeck(developerId, input.deckId);
  const source = prepareSource(input.text, file);
  const warnings: string[] = [];
  let corrections: string[] = [];
  let verified = false;

  // ---- Tahap 1: Meringkas & mengekstrak materi menjadi pasangan Flashcard ----
  const parts: AiInputPart[] = [];
  if (source.pdf) {
    parts.push({ type: 'document', data: source.pdf.data, mime_type: source.pdf.mimeType });
  }
  parts.push({
    type: 'text',
    text: buildFlashcardPrompt({
      count: input.flashcardCount,
      text: source.text,
      hasDocument: Boolean(source.pdf),
      instructions: input.instructions,
      deckTitle: deck.title,
      deckDescription: deck.description,
    }),
  });

  const rawCards = await generateJson({
    systemInstruction: FLASHCARD_SYSTEM,
    input: parts,
    jsonSchema: FLASHCARD_JSON_SCHEMA,
    validator: rawFlashcardsSchema,
  });

  // Bersihkan hasil ekstraksi, buang duplikat, dan berikan tempId ("f1", "f2", dst.).
  const sanitized = sanitizeFlashcards(rawCards, input.flashcardCount);
  let flashcards = sanitized.flashcards;
  warnings.push(...sanitized.warnings);
  if (flashcards.length === 0) {
    throw new ApiError(422, 'AI tidak menghasilkan flashcard yang valid dari materi ini', 'AI_EMPTY_RESULT');
  }

  // ---- Tahap 2: Menghasilkan soal Multiple Choice beserta distractor dari Flashcard ----
  let quizzes: DraftQuiz[] = [];
  if (input.includeQuiz) {
    try {
      const rawQuizzes = await generateJson({
        systemInstruction: QUIZ_SYSTEM,
        input: [
          {
            type: 'text',
            text: buildQuizPrompt({
              flashcards: flashcards.map(({ tempId, front, back }) => ({ tempId, front, back })),
              choicesCount: input.choicesCount,
              instructions: input.instructions,
              deckTitle: deck.title,
              deckDescription: deck.description,
            }),
          },
        ],
        jsonSchema: QUIZ_JSON_SCHEMA,
        validator: rawQuizzesSchema,
      });

      // Susun opsi jawaban (acak posisi jawaban benar & distractor) dan hitung correctIndex di server.
      const built = buildQuizzes(rawQuizzes, flashcards, input.choicesCount);
      quizzes = built.quizzes;
      warnings.push(...built.warnings);
    } catch (err) {
      // Jika tahap pembuatan kuis gagal dari sisi AI, tetap kembalikan flashcard yang sudah berhasil dibuat.
      if (err instanceof ApiError && err.code === 'AI_UPSTREAM_ERROR') {
        warnings.push('Soal pilihan ganda gagal dibuat; hanya flashcard yang dihasilkan');
      } else {
        throw err;
      }
    }
  }

  // ---- Tahap 3: Verifikasi Ejaan Bahasa, Terjemahan, & Kebenaran Soal oleh AI Auditor ----
  if (input.verifyWithAi !== false) {
    try {
      const rawVerify = await generateJson({
        systemInstruction: VERIFY_DRAFT_SYSTEM,
        input: [
          {
            type: 'text',
            text: buildVerifyDraftPrompt({
              deckTitle: deck.title,
              deckDescription: deck.description,
              instructions: input.instructions,
              flashcards,
              quizzes: quizzes.map((q) => {
                const correctAnswer = q.choices[q.correctIndex] ?? q.choices[0] ?? '';
                const distractors = q.choices.filter((_, idx) => idx !== q.correctIndex);
                return {
                  sourceTempId: q.sourceTempId,
                  question: q.question,
                  correctAnswer,
                  distractors,
                  explanation: q.explanation,
                };
              }),
            }),
          },
        ],
        jsonSchema: VERIFY_DRAFT_JSON_SCHEMA,
        validator: rawVerifiedDraftSchema,
      });

      const applied = applyVerifiedDraft(rawVerify, flashcards, input.choicesCount);
      flashcards = applied.flashcards;
      if (input.includeQuiz && applied.quizzes.length > 0) {
        quizzes = applied.quizzes;
      }
      corrections = applied.corrections;
      verified = true;
    } catch {
      warnings.push('Tahap verifikasi ulang AI dilewati; menggunakan hasil ekstraksi utama');
    }
  }

  return {
    deckId: input.deckId,
    flashcards,
    quizzes,
    warnings,
    corrections,
    verified,
    model: env.GEMINI_MODEL,
  };
}

// =============================================================================
// 2. Simpan ke Database menggunakan fungsi bulkCreateItems yang sudah ada
// =============================================================================

export async function commitDraft(developerId: string, input: CommitInput) {
  // Langkah A: Siapkan payload CreateItemInput untuk seluruh Flashcard.
  const flashcardInputs: CreateItemInput[] = input.flashcards.map((f) => ({
    type: 'FLASHCARD',
    deckId: input.deckId,
    front: f.front,
    back: f.back,
    tags: f.tags,
  }));

  // Simpan seluruh flashcard terlebih dahulu melalui fungsi bulkCreateItems yang sudah ada.
  const createdFlashcards = await bulkCreateItems(developerId, flashcardInputs);

  // Petakan tempId ("f1", "f2", ...) ke UUID asli flashcard yang baru saja dibuat di database.
  const tempIdToRealId = new Map<string, string>();
  input.flashcards.forEach((f, idx) => {
    const created = createdFlashcards[idx];
    if (created) tempIdToRealId.set(f.tempId, created.id);
  });

  // Langkah B: Siapkan payload CreateItemInput untuk soal Multiple Choice,
  // dengan mengikat setiap soal ke `sourceFlashcardId` asli milik flashcard sumbernya.
  const quizInputs: CreateItemInput[] = input.quizzes.map((q) => {
    const sourceFlashcardId = tempIdToRealId.get(q.sourceTempId);
    if (!sourceFlashcardId) {
      throw ApiError.badRequest(`Flashcard sumber untuk tempId "${q.sourceTempId}" tidak ditemukan`);
    }
    return {
      type: 'MULTIPLE_CHOICE',
      deckId: input.deckId,
      question: q.question,
      choices: q.choices,
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? null,
      sourceFlashcardId,
      tags: q.tags,
    };
  });

  const createdQuizzes = quizInputs.length > 0 ? await bulkCreateItems(developerId, quizInputs) : [];

  return {
    counts: {
      flashcards: createdFlashcards.length,
      quizzes: createdQuizzes.length,
      total: createdFlashcards.length + createdQuizzes.length,
    },
    flashcards: createdFlashcards,
    quizzes: createdQuizzes,
    items: [...createdFlashcards, ...createdQuizzes],
  };
}

// =============================================================================
// 3. Generate & Langsung Simpan (Alur Satu Langkah untuk POST /generate)
// =============================================================================

export async function generateAndSave(developerId: string, input: GenerateInput, file?: UploadedDoc) {
  // Panggil Gemini untuk mengekstrak flashcard, menyusun soal MC, dan memverifikasi kebenarannya.
  const draft = await generateDraft(developerId, input, file);

  // Jika developer menyetel save=false, kembalikan draft saja untuk ditinjau di UI sebelum di-commit.
  if (!input.save) {
    return {
      saved: false,
      verified: draft.verified,
      corrections: draft.corrections,
      model: draft.model,
      warnings: draft.warnings,
      counts: {
        flashcards: draft.flashcards.length,
        quizzes: draft.quizzes.length,
        total: draft.flashcards.length + draft.quizzes.length,
      },
      draft: {
        deckId: draft.deckId,
        flashcards: draft.flashcards,
        quizzes: draft.quizzes,
      },
    };
  }

  // Default (save=true): langsung teruskan struktur data hasil AI ke bulkCreateItems via commitDraft.
  const committed = await commitDraft(developerId, {
    deckId: draft.deckId,
    flashcards: draft.flashcards,
    quizzes: draft.quizzes,
  });

  return {
    saved: true,
    verified: draft.verified,
    corrections: draft.corrections,
    model: draft.model,
    warnings: draft.warnings,
    ...committed,
  };
}

// =============================================================================
// 4. Audit & Perbaiki Deck Bank Soal Eksisting dengan AI (POST /verify-deck)
// =============================================================================

export interface VerifiedItemChange {
  itemId: string;
  type: 'FLASHCARD' | 'MULTIPLE_CHOICE';
  reason: string;
  before: string;
  after: string;
  applied: boolean;
}

export async function verifyExistingDeck(developerId: string, input: VerifyDeckInput) {
  const deck = await getOwnedDeck(developerId, input.deckId);
  const items = await prisma.learningItem.findMany({
    where: { deckId: deck.id, isActive: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 80,
  });

  if (items.length === 0) {
    return {
      deckId: deck.id,
      deckTitle: deck.title,
      checkedCount: 0,
      fixedCount: 0,
      changes: [] as VerifiedItemChange[],
      model: env.GEMINI_MODEL,
    };
  }

  const byId = new Map(items.map((it) => [it.id, it]));
  const serializedItems = items.map((it) =>
    it.type === ItemType.FLASHCARD
      ? { id: it.id, type: 'FLASHCARD', front: it.front, back: it.back }
      : {
          id: it.id,
          type: 'MULTIPLE_CHOICE',
          question: it.question,
          choices: Array.isArray(it.choices) ? it.choices : [],
          correctIndex: it.correctIndex,
          explanation: it.explanation,
        },
  );

  const audit = await generateJson({
    systemInstruction: AUDIT_DECK_SYSTEM,
    input: [
      {
        type: 'text',
        text: buildAuditDeckPrompt({
          deckTitle: deck.title,
          deckDescription: deck.description,
          items: serializedItems,
        }),
      },
    ],
    jsonSchema: AUDIT_DECK_JSON_SCHEMA,
    validator: rawDeckAuditSchema,
  });

  const changes: VerifiedItemChange[] = [];
  let fixedCount = 0;

  for (const fix of audit.fixes) {
    const orig = byId.get(fix.id);
    if (!orig || orig.type !== fix.type) continue;

    if (fix.type === 'FLASHCARD') {
      const nextFront = fix.front?.trim();
      const nextBack = fix.back?.trim();
      if (!nextFront || !nextBack) continue;
      if (nextFront === orig.front && nextBack === orig.back) continue;

      let applied = false;
      if (input.autoFix) {
        await updateItem(developerId, orig.id, { front: nextFront, back: nextBack });
        applied = true;
        fixedCount += 1;
      }
      changes.push({
        itemId: orig.id,
        type: 'FLASHCARD',
        reason: fix.reason.trim(),
        before: `${orig.front} → ${orig.back}`,
        after: `${nextFront} → ${nextBack}`,
        applied,
      });
    } else {
      const origChoices = Array.isArray(orig.choices) ? (orig.choices as string[]) : [];
      const nextQuestion = fix.question?.trim() || orig.question || '';
      const nextChoices = Array.isArray(fix.choices)
        ? fix.choices.map((c) => c.trim()).filter(Boolean)
        : origChoices;
      const nextCorrectIndex =
        typeof fix.correctIndex === 'number' ? fix.correctIndex : (orig.correctIndex ?? 0);
      const nextExplanation =
        fix.explanation !== undefined ? fix.explanation.trim() || null : orig.explanation;

      if (!nextQuestion || checkChoices(nextChoices, nextCorrectIndex)) continue;
      const unchanged =
        nextQuestion === orig.question &&
        JSON.stringify(nextChoices) === JSON.stringify(origChoices) &&
        nextCorrectIndex === orig.correctIndex &&
        nextExplanation === orig.explanation;
      if (unchanged) continue;

      let applied = false;
      if (input.autoFix) {
        await updateItem(developerId, orig.id, {
          question: nextQuestion,
          choices: nextChoices,
          correctIndex: nextCorrectIndex,
          explanation: nextExplanation,
        });
        applied = true;
        fixedCount += 1;
      }
      changes.push({
        itemId: orig.id,
        type: 'MULTIPLE_CHOICE',
        reason: fix.reason.trim(),
        before: `${orig.question} [${origChoices.join(' | ')}]`,
        after: `${nextQuestion} [${nextChoices.join(' | ')}]`,
        applied,
      });
    }
  }

  return {
    deckId: deck.id,
    deckTitle: deck.title,
    checkedCount: items.length,
    fixedCount,
    changes,
    model: env.GEMINI_MODEL,
  };
}
