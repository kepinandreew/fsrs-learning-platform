import { z } from 'zod';
import { checkChoices } from '../items/items.schema';

// =============================================================================
// Skema validasi modul AI Generator (Developer Dashboard, JWT)
// =============================================================================

// Helper konversi boolean untuk berjaga-jaga jika dikirim via form-data ('true'/'false') maupun JSON.
const boolish = (def: boolean) =>
  z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().default(def));

// Batas materi teks (karakter) yang dikirim ke AI.
export const MAX_SOURCE_CHARS = 50_000;

// POST /api/dashboard/ai/generate - hasilkan flashcard (+ soal MC) dari teks materi atau dokumen
// dan langsung simpan ke database melalui fungsi bulkCreateItems (kecuali save=false).
export const generateSchema = z.object({
  deckId: z.string().uuid(),
  // Materi bacaan teks. Boleh kosong hanya apabila mengunggah dokumen (dicek di service).
  text: z.string().trim().max(MAX_SOURCE_CHARS).optional(),
  // Jumlah flashcard maksimum yang diminta dari materi.
  flashcardCount: z.coerce.number().int().min(1).max(30).default(10),
  // Apakah sekaligus membuat soal pilihan ganda untuk setiap flashcard?
  includeQuiz: boolish(true),
  // Jumlah opsi pilihan jawaban per soal (termasuk 1 jawaban benar + distractor).
  choicesCount: z.coerce.number().int().min(3).max(5).default(4),
  // Instruksi atau arahan tambahan untuk AI (misal: "kosakata tema hewan bahasa Prancis untuk kelas 3 SD").
  instructions: z.string().trim().max(500).optional(),
  // Apakah hasil kata & soal wajib diperiksa ulang ejaan/bahasa/kebenarannya oleh AI Verifier? (Default: true)
  verifyWithAi: boolish(true),
  // Default true: langsung meneruskan hasil terstruktur ke fungsi bulkCreateItems sesuai alur utama.
  // Jika disetel false oleh dashboard, hanya mengembalikan pratinjau draft tanpa menyimpan ke DB.
  save: boolish(true),
});

// Skema item draft flashcard jika developer ingin meninjau/mengedit draft lalu memanggil /commit.
const draftFlashcardSchema = z.object({
  tempId: z.string().trim().min(1).max(50),
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(1000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

// Skema item draft soal Multiple Choice yang merujuk ke tempId flashcard.
const draftQuizSchema = z.object({
  sourceTempId: z.string().trim().min(1).max(50),
  question: z.string().trim().min(1).max(1000),
  choices: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().max(1000).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

// POST /api/dashboard/ai/commit - menyimpan draft hasil editan ke bank soal lewat bulkCreateItems.
export const commitSchema = z
  .object({
    deckId: z.string().uuid(),
    flashcards: z.array(draftFlashcardSchema).min(1).max(60),
    quizzes: z.array(draftQuizSchema).max(60).default([]),
  })
  .superRefine((data, ctx) => {
    // Pastikan seluruh tempId flashcard unik agar pemetaan ke sourceFlashcardId tidak ambigu.
    const ids = data.flashcards.map((f) => f.tempId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'tempId flashcard harus unik', path: ['flashcards'] });
    }
    // Pastikan setiap soal MC merujuk pada tempId flashcard yang valid dan opsi pilihannya konsisten.
    data.quizzes.forEach((q, i) => {
      if (!ids.includes(q.sourceTempId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sourceTempId tidak ditemukan pada daftar flashcards',
          path: ['quizzes', i, 'sourceTempId'],
        });
      }
      const msg = checkChoices(q.choices, q.correctIndex);
      if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: ['quizzes', i, 'correctIndex'] });
    });
  });

// POST /api/dashboard/ai/verify-deck - audit & koreksi otomatis item pada deck yang sudah ada menggunakan AI.
export const verifyDeckSchema = z.object({
  deckId: z.string().uuid(),
  autoFix: boolish(true),
});

export type GenerateInput = z.infer<typeof generateSchema>;
export type CommitInput = z.infer<typeof commitSchema>;
export type VerifyDeckInput = z.infer<typeof verifyDeckSchema>;
