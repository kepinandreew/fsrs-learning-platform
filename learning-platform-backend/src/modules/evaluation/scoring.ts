// Skor kuis pilihan ganda. Murni (tanpa DB) agar mudah diuji.

// Batas waktu per soal pada game client (15 detik, sesuai proposal).
export const QUIZ_TIME_LIMIT_MS = 15_000;
// Poin dasar untuk jawaban benar.
export const QUIZ_BASE_SCORE = 100;
// Bonus kecepatan maksimum (diberikan bila menjawab seketika).
export const QUIZ_MAX_SPEED_BONUS = 50;

/**
 * Skor = 0 jika salah. Jika benar: poin dasar + bonus kecepatan yang menurun linear
 * dari bonus maksimum (jawab instan) ke 0 (jawab tepat di batas waktu).
 * Jika response time tidak dikirim, hanya poin dasar yang diberikan.
 */
export function computeQuizScore(isCorrect: boolean, responseTimeMs?: number | null): number {
  if (!isCorrect) return 0;
  if (responseTimeMs == null) return QUIZ_BASE_SCORE;

  // Batasi 0..batas waktu agar nilai di luar rentang tidak menghasilkan bonus negatif/lebih besar.
  const t = Math.min(Math.max(responseTimeMs, 0), QUIZ_TIME_LIMIT_MS);
  const bonus = QUIZ_MAX_SPEED_BONUS * (1 - t / QUIZ_TIME_LIMIT_MS);
  return QUIZ_BASE_SCORE + Math.round(bonus);
}
