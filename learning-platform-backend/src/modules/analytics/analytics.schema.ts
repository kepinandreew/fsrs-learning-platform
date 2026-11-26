import { z } from 'zod';

// =============================================================================
// Skema validasi modul analytics (Developer Dashboard, JWT)
// =============================================================================

export const analyticsQuerySchema = z.object({
  // Opsional: filter aplikasi client tertentu (isolasi multi-tenant).
  appId: z.string().uuid().optional(),
  // Opsional: bila kosong, digabungkan untuk seluruh deck aktif pada aplikasi terpilih / utama developer.
  deckId: z.string().uuid().optional(),
  // Opsional: bila diisi, analitik hanya untuk satu end-user; bila kosong, gabungan seluruh user deck.
  externalUserId: z.string().trim().min(1).max(100).optional(),
  // Jumlah maksimum entri pada daftar Difficult Topics.
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Query pemantauan terpadu: data pengguna, progres belajar, state kartu FSRS, dan riwayat aktivitas.
export const monitoringQuerySchema = z.object({
  appId: z.string().uuid().optional(),
  deckId: z.string().uuid().optional(),
  externalUserId: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(5).max(100).default(25),
});

// Skema input simulator interaktif FSRS-5.
export const fsrsSimulateSchema = z.object({
  requestRetention: z.number().min(0.7).max(0.99).default(0.9),
  // Opsional: gunakan state kartu nyata milik siswa sebagai titik awal simulasi.
  initialCard: z
    .object({
      label: z.string().trim().max(200).optional(),
      state: z.enum(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING']).default('NEW'),
      stability: z.number().min(0).max(36500).default(0),
      difficulty: z.number().min(1).max(10).default(5),
      reps: z.number().int().min(0).default(0),
      lapses: z.number().int().min(0).default(0),
      hardCount: z.number().int().min(0).default(0),
    })
    .optional(),
  steps: z
    .array(
      z.object({
        rating: z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']),
        // Jika kosong pada review ke-2 dst., disimulasikan tepat saat jadwal `due` tiba.
        elapsedDays: z.number().min(0).max(36500).optional(),
      }),
    )
    .min(1)
    .max(50),
});

// Input simulasi pergeseran hari (Time-Travel Demo Jadwal Jatuh Tempo / Due).
export const shiftDueSchema = z.object({
  appId: z.string().uuid().optional(),
  deckId: z.string().uuid().optional(),
  externalUserId: z.string().trim().min(1).max(100).optional(),
  days: z
    .number()
    .int()
    .min(-30)
    .max(30)
    .refine((n) => n !== 0, 'days tidak boleh 0'),
});

export const deleteUserParamsSchema = z.object({
  externalUserId: z.string().trim().min(1).max(100),
});
export const deleteUserQuerySchema = z.object({
  appId: z.string().uuid(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type MonitoringQuery = z.infer<typeof monitoringQuerySchema>;
export type FsrsSimulateInput = z.infer<typeof fsrsSimulateSchema>;
export type ShiftDueInput = z.infer<typeof shiftDueSchema>;
