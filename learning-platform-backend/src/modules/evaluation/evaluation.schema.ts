import { z } from 'zod';

// =============================================================================
// Skema validasi modul evaluation (dipanggil aplikasi client lewat API Key)
// =============================================================================

// Identitas end-user di sisi aplikasi client. User dibuat otomatis saat pertama kali muncul.
const externalUserId = z.string().trim().min(1).max(100);

// ID unik per kejadian dari client; dipakai untuk idempotensi (aman dikirim ulang saat jaringan buruk).
const clientEventId = z.string().trim().min(1).max(100);

// POST /api/evaluation/review - review satu flashcard.
export const reviewSchema = z.object({
  externalUserId,
  displayName: z.string().trim().max(100).optional(),
  itemId: z.string().uuid(),
  // Rating memori yang dipilih user.
  rating: z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']),
  // Waktu tanggap menjawab kartu (ms), maksimum 10 menit.
  responseTimeMs: z.number().int().min(0).max(600_000).optional(),
  // Akurasi kuis terkait (0..1). Jika kosong, server menghitungnya dari riwayat kuis user.
  quizAccuracy: z.number().min(0).max(1).optional(),
  clientEventId: clientEventId.optional(),
});

// POST /api/evaluation/quiz - jawaban satu soal pilihan ganda.
export const quizSchema = z.object({
  externalUserId,
  displayName: z.string().trim().max(100).optional(),
  itemId: z.string().uuid(),
  // Indeks pilihan menurut urutan `choices` yang diterima client dari GET /api/items.
  selectedIndex: z.number().int().min(0).max(5),
  responseTimeMs: z.number().int().min(0).max(600_000).optional(),
  // Pengelompokan beberapa soal dalam satu sesi battle/quiz.
  sessionId: z.string().trim().max(100).optional(),
  clientEventId: clientEventId.optional(),
});

// GET /api/evaluation/due (dan /api/review/due) - antrean kartu jatuh tempo.
export const dueQuerySchema = z.object({
  externalUserId,
  deckId: z.string().uuid().optional(),
  // Jumlah maksimum kartu jatuh tempo yang dikembalikan.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Jumlah maksimum kartu baru (belum pernah direview) yang disisipkan.
  newLimit: z.coerce.number().int().min(0).max(50).default(10),
});

// GET /api/evaluation/preview (dan /api/review/preview) - pratinjau keempat rating FSRS (Again/Hard/Good/Easy).
export const previewQuerySchema = z.object({
  externalUserId: externalUserId.optional(),
  itemId: z.string().uuid(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
export type QuizInput = z.infer<typeof quizSchema>;
export type DueQuery = z.infer<typeof dueQuerySchema>;
export type PreviewQuery = z.infer<typeof previewQuerySchema>;
