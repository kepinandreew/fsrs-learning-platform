import { describe, expect, it } from 'vitest';
import { computeQuizScore } from '../../src/modules/evaluation/scoring';
import { reviewSchema, quizSchema } from '../../src/modules/evaluation/evaluation.schema';
import { putProgressSchema } from '../../src/modules/progress/progress.schema';
import { computeStreak, dayIndex } from '../../src/utils/streak';

// Tes fungsi murni & validasi skema modul evaluation/progress (tanpa database).
const uuid = '11111111-1111-4111-8111-111111111111';

describe('computeQuizScore', () => {
  it('salah = 0; benar instan = 150; benar tepat di batas = 100', () => {
    expect(computeQuizScore(false, 100)).toBe(0);
    expect(computeQuizScore(true, 0)).toBe(150);
    expect(computeQuizScore(true, 15000)).toBe(100);
    expect(computeQuizScore(true, 99999)).toBe(100); // dibatasi di batas waktu
    expect(computeQuizScore(true, null)).toBe(100);
  });
  it('lebih cepat = skor lebih tinggi', () => {
    expect(computeQuizScore(true, 2000)).toBeGreaterThan(computeQuizScore(true, 10000));
  });
});

describe('computeStreak', () => {
  const day = (iso: string) => new Date(iso);
  it('mulai dari 1, bertambah di hari berikutnya, tetap di hari sama, putus bila lewat >1 hari', () => {
    const d1 = day('2026-03-01T03:00:00Z');
    expect(computeStreak(null, d1, 0, 0)).toEqual({ currentStreak: 1, longestStreak: 1 });
    expect(computeStreak(d1, day('2026-03-01T10:00:00Z'), 1, 1).currentStreak).toBe(1);
    expect(computeStreak(d1, day('2026-03-02T03:00:00Z'), 1, 1)).toEqual({ currentStreak: 2, longestStreak: 2 });
    expect(computeStreak(d1, day('2026-03-05T03:00:00Z'), 4, 4)).toEqual({ currentStreak: 1, longestStreak: 4 });
  });
  it('batas hari mengikuti WIB (UTC+7)', () => {
    // 17:30 UTC = 00:30 WIB hari berikutnya.
    expect(dayIndex(day('2026-03-01T17:30:00Z'))).toBe(dayIndex(day('2026-03-02T03:00:00Z')));
  });
});

describe('skema evaluation & progress', () => {
  it('review menolak rating tak dikenal dan accuracy di luar 0..1', () => {
    expect(reviewSchema.safeParse({ externalUserId: 'u1', itemId: uuid, rating: 'GOOD' }).success).toBe(true);
    expect(reviewSchema.safeParse({ externalUserId: 'u1', itemId: uuid, rating: 'OK' }).success).toBe(false);
    expect(reviewSchema.safeParse({ externalUserId: 'u1', itemId: uuid, rating: 'GOOD', quizAccuracy: 1.5 }).success).toBe(false);
  });
  it('quiz mewajibkan selectedIndex bulat >= 0', () => {
    expect(quizSchema.safeParse({ externalUserId: 'u1', itemId: uuid, selectedIndex: 2 }).success).toBe(true);
    expect(quizSchema.safeParse({ externalUserId: 'u1', itemId: uuid, selectedIndex: -1 }).success).toBe(false);
  });
  it('put progress menolak poin negatif dan clientState terlalu besar', () => {
    expect(putProgressSchema.safeParse({ externalUserId: 'u1', deckId: uuid, points: 10 }).success).toBe(true);
    expect(putProgressSchema.safeParse({ externalUserId: 'u1', deckId: uuid, points: -1 }).success).toBe(false);
    expect(putProgressSchema.safeParse({ externalUserId: 'u1', deckId: uuid, clientState: { x: 'a'.repeat(25000) } }).success).toBe(false);
  });
});
