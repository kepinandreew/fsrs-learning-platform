import { z } from 'zod';

export const createAppSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  requestRetention: z.number().min(0.7).max(0.99).optional(),
});

export const updateAppSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).nullable(),
    requestRetention: z.number().min(0.7).max(0.99),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Minimal satu field harus diisi' });

export const appIdParamSchema = z.object({ id: z.string().uuid() });
