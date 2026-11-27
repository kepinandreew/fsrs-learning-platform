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

const optionalHttpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'URL harus diawali http:// atau https://' })
  .nullish();

export const importDeckSchema = z.object({
  items: z
    .array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('FLASHCARD'),
          tempId: z.string().trim().max(100).optional(),
          front: z.string().trim().min(1).max(500),
          back: z.string().trim().min(1).max(1000),
          tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
          imageUrl: optionalHttpUrl,
          audioUrl: optionalHttpUrl,
        }),
        z.object({
          type: z.literal('MULTIPLE_CHOICE'),
          sourceTempId: z.string().trim().max(100).nullish(),
          sourceFront: z.string().trim().max(500).nullish(),
          question: z.string().trim().min(1).max(1000),
          choices: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
          correctIndex: z.number().int().min(0),
          explanation: z.string().trim().max(1000).nullish(),
          tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
          imageUrl: optionalHttpUrl,
          audioUrl: optionalHttpUrl,
        }),
      ]),
    )
    .min(1)
    .max(200),
});
