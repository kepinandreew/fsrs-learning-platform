import { describe, expect, it } from 'vitest';
import {
  computeCompletion,
  computeDifficultTopics,
  computeMastery,
  computeRetention,
  smoothRate,
  type CardRow,
} from '../../src/modules/analytics/analytics.calc';

// Tes kalkulasi analitik (murni, tanpa database).
const now = new Date('2026-03-31T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const card = (userId: string, itemId: string, stability: number, lastReviewDaysAgo: number, createdDaysAgo = 10): CardRow => ({
  userId, itemId, stability, difficulty: 5, lastReview: daysAgo(lastReviewDaysAgo), createdAt: daysAgo(createdDaysAgo),
});

describe('Retention State', () => {
  it('R=0.9 saat t=S, dan rata-rata dihitung atas kartu aktif', () => {
    const r = computeRetention([card('u1', 'a', 10, 10), card('u1', 'b', 10, 0)], now);
    // R(10,10)=0.9 dan R(0,10)=1 -> rata-rata 0.95
    expect(r.averageRetention).toBeCloseTo(0.95, 4);
    expect(r.activeCards).toBe(2);
    expect(r.distribution.strong).toBe(2);
  });
  it('tanpa kartu -> null', () => {
    expect(computeRetention([], now).averageRetention).toBeNull();
  });
});

describe('Mastery Prediction', () => {
  it('rasio kartu dengan S >= 7 terhadap total kartu deck', () => {
    const rows = [card('u1', 'a', 7, 1), card('u1', 'b', 6.9, 1), card('u1', 'c', 30, 1)];
    const m = computeMastery(rows, 5, now); // deck punya 5 kartu
    expect(m.masteredCards).toBe(2);
    expect(m.masteryRatio).toBeCloseTo(0.4, 4);
  });
});

describe('Completion Time Estimation', () => {
  it('sisa kartu / (kartu dikuasai per hari)', () => {
    // 2 kartu dikuasai dalam 10 hari (createdAt 9 hari lalu => 10 hari inklusif) -> 0.2/hari; sisa 8 -> 40 hari
    const rows = [card('u1', 'a', 10, 1, 9), card('u1', 'b', 10, 1, 9)];
    const c = computeCompletion(rows, 10, now);
    expect(c.status).toBe('ESTIMATED');
    expect(c.estimatedDays).toBe(40);
  });
  it('selesai bila semua stabil; tidak cukup data bila belum ada yang stabil', () => {
    expect(computeCompletion([card('u1', 'a', 10, 1)], 1, now).status).toBe('COMPLETED');
    const none = computeCompletion([card('u1', 'a', 2, 1)], 5, now);
    expect(none.status).toBe('INSUFFICIENT_DATA');
    expect(none.estimatedDays).toBeNull();
  });
});

describe('Difficult Topics', () => {
  const flashcards = [
    { id: 'a', front: 'Apple', back: 'Apel', tags: ['fruit'] },
    { id: 'b', front: 'Cat', back: 'Kucing', tags: ['animal'] },
    { id: 'c', front: 'Dog', back: 'Anjing', tags: ['animal'] },
  ];
  it('mengurutkan berdasarkan Again/Hard dan kesalahan kuis; sampel kecil tidak mendominasi', () => {
    const reviews = new Map([
      ['a', { again: 1, hard: 0, total: 1 }], // 1/1 tapi sampel kecil
      ['b', { again: 6, hard: 4, total: 12 }], // sering gagal
      ['c', { again: 0, hard: 0, total: 10 }], // mudah
    ]);
    const quizzes = new Map([['b', { attempts: 5, errors: 4 }]]);
    const r = computeDifficultTopics(flashcards, reviews, quizzes, [], 10);
    expect(r.cards[0]!.itemId).toBe('b');
    expect(r.cards[r.cards.length - 1]!.itemId).toBe('c');
    expect(r.tags[0]!.tag).toBe('animal');
  });
  it('smoothing: 1/1 < 10/12', () => {
    expect(smoothRate(1, 1)).toBeLessThan(smoothRate(10, 12));
  });
});

describe('FSRS Simulator (Kartu Baru vs Kartu Nyata Siswa)', async () => {
  const { simulateFsrs } = await import('../../src/modules/analytics/analytics.service');

  it('mensimulasikan evolusi memori dari titik awal kartu nyata siswa (initialCard)', () => {
    const res = simulateFsrs({
      requestRetention: 0.9,
      initialCard: {
        label: "L'ours (Beruang) — Kevin Andrew",
        state: 'REVIEW',
        stability: 12.5,
        difficulty: 3.2,
        reps: 4,
        lapses: 0,
        hardCount: 0,
      },
      steps: [{ rating: 'GOOD' }, { rating: 'EASY' }],
    });

    expect(res.initialCard?.label).toContain("L'ours");
    expect(res.trace[0]?.stabilityBefore).toBeCloseTo(12.5, 2);
    expect(res.trace[0]?.stabilityAfter).toBeGreaterThan(12.5);
    expect(res.finalCard.reps).toBe(6);
  });
});
