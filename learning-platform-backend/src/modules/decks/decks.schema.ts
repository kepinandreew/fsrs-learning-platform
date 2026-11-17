import { z } from 'zod';

// Skema validasi modul decks (Developer Dashboard).

export const deckIdParamSchema = z.object({ id: z.string().uuid() });

// Query daftar deck: boleh difilter per aplikasi.
export const listDecksQuerySchema = z.object({
  appId: z.string().uuid().optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export const createDeckSchema = z.object({
  appId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

// Update parsial: hanya field yang dikirim yang diubah.
export const updateDeckSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Minimal satu field harus diisi' });
