import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

// =============================================================================
// Klien Gemini. AI hanya berperan sebagai Content Generator (sesuai batasan proposal):
// tidak pernah menyentuh jadwal FSRS ataupun database.
// =============================================================================

// Klien dibuat sekali (lazy) agar server tetap bisa jalan tanpa GEMINI_API_KEY.
let client: GoogleGenAI | null = null;

export const isGeminiConfigured = () => Boolean(env.GEMINI_API_KEY);

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new ApiError(503, 'AI Generator belum dikonfigurasi (GEMINI_API_KEY kosong)', 'AI_NOT_CONFIGURED');
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
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

/**
 * Panggil Gemini dan kembalikan objek terstruktur yang sudah tervalidasi.
 * Mencoba maksimum 2 kali bila gagal/keluaran bukan JSON valid.
 */
export async function generateJson<T>(opts: CallOptions<T>): Promise<T> {
  const ai = getClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const interaction = await ai.interactions.create({
        model: env.GEMINI_MODEL,
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
    }
  }

  // Detail error hanya dicatat di server; client menerima pesan generik.
  console.error('[AI] Gagal memanggil Gemini:', lastError instanceof Error ? lastError.message : lastError);
  throw new ApiError(502, 'Layanan AI gagal menghasilkan konten, silakan coba lagi', 'AI_UPSTREAM_ERROR');
}
