import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // AI Generator (Google Gemini). Opsional: bila kosong, endpoint AI membalas 503 namun server tetap berjalan.
  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined), // string kosong di .env dianggap tidak diisi
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Konfigurasi environment tidak valid:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
