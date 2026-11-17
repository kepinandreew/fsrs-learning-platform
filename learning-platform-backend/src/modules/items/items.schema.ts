import { z } from 'zod';

// =============================================================================
// Skema validasi modul items (Flashcard & Multiple Choice)
// =============================================================================

// URL media hanya boleh http(s) agar tidak ada skema berbahaya (javascript:, data:, dll).
const mediaUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'URL harus diawali http:// atau https://' });

// Tag bebas untuk sub-topik (dipakai Difficult Topics / filter).
const tags = z.array(z.string().trim().min(1).max(30)).max(10).default([]);

// Field media yang sama untuk kedua tipe item.
const media = {
  imageUrl: mediaUrl.nullish(),
  audioUrl: mediaUrl.nullish(),
};

// ---- Flashcard ----
const flashcardSchema = z.object({
  type: z.literal('FLASHCARD'),
  deckId: z.string().uuid(),
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(1000),
  tags,
  ...media,
});

// ---- Multiple Choice ----
const multipleChoiceSchema = z.object({
  type: z.literal('MULTIPLE_CHOICE'),
  deckId: z.string().uuid(),
  question: z.string().trim().min(1).max(1000),
  choices: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().max(1000).nullish(),
  // Flashcard sumber soal ini (agar akurasi kuis bisa dikaitkan ke kartu FSRS).
  sourceFlashcardId: z.string().uuid().nullish(),
  tags,
  ...media,
});

/**
 * Aturan konsistensi pilihan ganda: correctIndex harus berada dalam rentang pilihan
 * dan tidak boleh ada pilihan kembar. Mengembalikan pesan error, atau null jika valid.
 * Diekspor agar bisa dipakai ulang saat PATCH (validasi hasil gabungan data lama + baru).
 */
export function checkChoices(choices: string[], correctIndex: number): string | null {
  if (correctIndex >= choices.length) return 'correctIndex di luar jumlah pilihan';
  const normalized = choices.map((c) => c.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) return 'Pilihan jawaban tidak boleh duplikat';
  return null;
}

// Gabungan kedua tipe, dibedakan oleh field `type`, lalu dicek konsistensinya.
export const createItemSchema = z
  .discriminatedUnion('type', [flashcardSchema, multipleChoiceSchema])
  .superRefine((data, ctx) => {
    if (data.type === 'MULTIPLE_CHOICE') {
      const msg = checkChoices(data.choices, data.correctIndex);
      if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg, path: ['correctIndex'] });
    }
  });

// Pembuatan massal (mis. hasil AI Generator), maksimum 100 item per request.
export const bulkCreateItemsSchema = z.object({
  items: z.array(createItemSchema).min(1).max(100),
});

// Update parsial. `type` & `deckId` tidak boleh diubah; kecocokan field dengan tipe dicek di service.
export const updateItemSchema = z
  .object({
    front: z.string().trim().min(1).max(500),
    back: z.string().trim().min(1).max(1000),
    question: z.string().trim().min(1).max(1000),
    choices: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    explanation: z.string().trim().max(1000).nullable(),
    sourceFlashcardId: z.string().uuid().nullable(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10),
    imageUrl: mediaUrl.nullable(),
    audioUrl: mediaUrl.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Minimal satu field harus diisi' });

export const itemIdParamSchema = z.object({ id: z.string().uuid() });

// Query daftar item untuk dashboard (pagination berbasis halaman).
export const dashboardListQuerySchema = z.object({
  deckId: z.string().uuid().optional(),
  appId: z.string().uuid().optional(),
  type: z.enum(['FLASHCARD', 'MULTIPLE_CHOICE']).optional(),
  search: z.string().trim().max(100).optional(),
  includeInactive: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Query GET /api/items untuk aplikasi client (cursor pagination + delta sync).
export const clientListQuerySchema = z.object({
  deckId: z.string().uuid().optional(),
  type: z.enum(['FLASHCARD', 'MULTIPLE_CHOICE']).optional(),
  tag: z.string().trim().max(30).optional(),
  // Delta sync: hanya item yang berubah setelah waktu ini (ISO 8601).
  updatedSince: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type DashboardListQuery = z.infer<typeof dashboardListQuerySchema>;
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;
