import { z } from 'zod';

// =============================================================================
// Skema validasi modul progress (dipanggil aplikasi client lewat API Key)
// =============================================================================

const externalUserId = z.string().trim().min(1).max(100);

// GET /api/progress - progress satu user (opsional: satu deck saja).
export const getProgressQuerySchema = z.object({
  externalUserId,
  deckId: z.string().uuid().optional(),
});

// PUT /api/progress - sinkronisasi poin/EXP/level + state bebas milik client (mis. evolusi pet).
export const putProgressSchema = z.object({
  externalUserId,
  displayName: z.string().trim().max(100).optional(),
  deckId: z.string().uuid(),
  // Nilai absolut terbaru dari client; hanya field yang dikirim yang diubah.
  points: z.number().int().min(0).max(2_000_000_000).optional(),
  exp: z.number().int().min(0).max(2_000_000_000).optional(),
  level: z.number().int().min(1).max(1000).optional(),
  // Data bebas client (inventori, evolusi pet, dll). Dibatasi ukurannya agar tidak membebani DB.
  clientState: z
    .record(z.unknown())
    .refine((v) => JSON.stringify(v).length <= 20_000, { message: 'clientState maksimum 20KB' })
    .optional(),
  // Kontrol konflik (optimistic concurrency): jika diisi dan data di server sudah lebih baru, ditolak 409.
  ifUnmodifiedSince: z.coerce.date().optional(),
});

export type GetProgressQuery = z.infer<typeof getProgressQuerySchema>;
export type PutProgressInput = z.infer<typeof putProgressSchema>;

// DELETE /api/progress - reset data progress & riwayat belajar (FSRS & kuis)
export const resetProgressQuerySchema = z.object({
  externalUserId,
  deckId: z.string().uuid().optional(),
});
export type ResetProgressQuery = z.infer<typeof resetProgressQuerySchema>;

// GET /api/progress/leaderboard - papan peringkat lintas perangkat per aplikasi client
export const leaderboardQuerySchema = z.object({
  deckId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;


