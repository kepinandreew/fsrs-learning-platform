import { z } from 'zod';

// Validasi 19 bobot kustom FSRS-5 (w0..w18); bernilai null untuk kembali ke bobot standar DEFAULT_WEIGHTS.
export const fsrsParamsSchema = z
  .array(z.number().finite().min(0).max(100))
  .length(19, { message: 'Parameter FSRS-5 wajib berisi tepat 19 bobot numerik (w0..w18)' });

export const createAppSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  requestRetention: z.number().min(0.7).max(0.99).optional(),
  fsrsParams: fsrsParamsSchema.nullish(),
});

export const updateAppSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).nullable(),
    requestRetention: z.number().min(0.7).max(0.99),
    fsrsParams: fsrsParamsSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Minimal satu field harus diisi' });

export const appIdParamSchema = z.object({ id: z.string().uuid() });
