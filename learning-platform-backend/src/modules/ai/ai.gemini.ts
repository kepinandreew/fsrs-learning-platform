import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

/**
 * @file modules/ai/ai.gemini.ts
 * @description Klien integrasi Google Gemini API dengan keluaran JSON terstruktur (Structured Output)
 * dan validasi skema Zod berlapis. Berperan murni sebagai pembangkit & pemeriksa draf materi tanpa
 * memodifikasi jadwal FSRS maupun basis data secara langsung.
 */

// Klien dibuat sekali (lazy) agar server tetap bisa jalan tanpa GEMINI_API_KEY.
let client: GoogleGenAI | null = null;

export const isGeminiConfigured = () => Boolean(env.GEMINI_API_KEY);

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new ApiError(503, 'AI Generator belum dikonfigurasi (GEMINI_API_KEY kosong)', 'AI_NOT_CONFIGURED');
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 22_000 } });
  return client;
}

// Bagian input multimodal: teks atau dokumen (PDF) inline.
export type AiInputPart = { type: 'text'; text: string } | { type: 'document'; data: string; mime_type: string };

interface CallOptions<T> {
  // Instruksi sistem: peran + aturan keamanan (materi dianggap data, bukan perintah).
  systemInstruction: string;
  input: AiInputPart[];
  // JSON Schema yang dipaksakan pada keluaran model (structured output).
  jsonSchema: Record<string, unknown>;
  // Validasi ulang di sisi server; keluaran model tetap tidak dipercaya.
  validator: z.ZodType<T>;
}

// Urutan model hemat & cepat; otomatis fallback bila model utama sedang 503/rate-limited.
function getCandidateModels(): string[] {
  return [...new Set([env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-4-hydrogen'])];
}

/**
 * Panggil Gemini dan kembalikan objek terstruktur yang sudah tervalidasi.
 * Mencoba model utama lalu fallback otomatis ke model ringan berikutnya bila 503/gagal.
 */
export async function generateJson<T>(opts: CallOptions<T>): Promise<T> {
  const ai = getClient();
  const candidates = getCandidateModels();
  let lastError: unknown;

  for (const modelName of candidates) {
    try {
      const interaction = await ai.interactions.create({
        model: modelName,
        system_instruction: opts.systemInstruction,
        input: opts.input,
        response_format: { type: 'text', mime_type: 'application/json', schema: opts.jsonSchema },
        // Materi pengajar bersifat privat: jangan simpan interaksi di sisi Google.
        store: false,
      });

      const text = interaction.output_text;
      if (!text) throw new Error('Respons AI kosong');
      return opts.validator.parse(JSON.parse(text));
    } catch (err) {
      lastError = err;
      console.warn(`[AI] Model ${modelName} gagal, mencoba fallback bila ada:`, err instanceof Error ? err.message : err);
    }
  }

  // Detail error hanya dicatat di server; client menerima pesan generik.
  console.error('[AI] Seluruh model kandidat gagal:', lastError instanceof Error ? lastError.message : lastError);
  throw new ApiError(502, 'Layanan AI gagal menghasilkan konten, silakan coba lagi', 'AI_UPSTREAM_ERROR');
}
