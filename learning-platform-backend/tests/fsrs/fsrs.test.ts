import { CardStateType, Rating } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { createEmptyCard, FSRS, Grade, retrievability, nextInterval, State, FACTOR } from '../../src/fsrs';
import { simulateFsrs } from '../../src/modules/analytics/analytics.service';
import { computeDeckPriorityRank } from '../../src/modules/evaluation/evaluation.service';

const fsrs = new FSRS();
const t0 = new Date('2026-01-01T00:00:00Z');
const days = (n: number) => new Date(t0.getTime() + n * 86_400_000);

describe('formula dasar', () => {
  it('R(S,S) = 0.9 dan R(0,S) = 1', () => {
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 10);
    expect(retrievability(0, 10)).toBe(1);
    expect(FACTOR).toBeCloseTo(19 / 81, 10);
  });
  it('interval pada r=0.9 sama dengan S', () => {
    expect(nextInterval(10, 0.9, 36500)).toBe(10);
  });
});

describe('review kartu baru', () => {
  it('urutan interval: again < hard < good < easy', () => {
    const p = fsrs.preview(createEmptyCard(t0), t0);
    expect(p.again.card.due.getTime()).toBeLessThan(p.hard.card.due.getTime());
    expect(p.hard.card.due.getTime()).toBeLessThan(p.good.card.due.getTime());
    expect(p.good.card.due.getTime()).toBeLessThan(p.easy.card.due.getTime());
    expect(p.again.log.scheduledMinutes).toBe(1);
    expect(p.good.log.scheduledDays).toBeGreaterThanOrEqual(1);
  });
  it('S awal = w[G-1]', () => {
    expect(fsrs.review(createEmptyCard(t0), Grade.Good, t0).card.stability).toBeCloseTo(3.173, 3);
  });
});

describe('review lanjutan', () => {
  const learned = fsrs.review(createEmptyCard(t0), Grade.Good, t0).card;
  it('recall berhasil menaikkan stabilitas; Again memangkasnya dan menambah lapse', () => {
    const due = learned.due;
    const good = fsrs.review(learned, Grade.Good, due);
    const again = fsrs.review(learned, Grade.Again, due);
    expect(good.card.stability).toBeGreaterThan(learned.stability);
    expect(again.card.stability).toBeLessThan(learned.stability);
    expect(again.card.state).toBe(State.Relearning);
    expect(again.card.lapses).toBe(1);
  });
  it('Again/Hard menaikkan D, Easy menurunkan D', () => {
    const due = learned.due;
    expect(fsrs.review(learned, Grade.Again, due).card.difficulty).toBeGreaterThan(learned.difficulty);
    expect(fsrs.review(learned, Grade.Hard, due).card.difficulty).toBeGreaterThan(learned.difficulty);
    expect(fsrs.review(learned, Grade.Easy, due).card.difficulty).toBeLessThan(learned.difficulty);
  });
});

describe('Dynamic FSRS Adjustment', () => {
  it('jawab benar tapi lambat + akurasi rendah => interval lebih pendek', () => {
    const learned = fsrs.review(createEmptyCard(t0), Grade.Good, t0).card;
    const at = days(Math.ceil(learned.stability));
    const normal = fsrs.review(learned, Grade.Good, at, { responseTimeMs: 2000, quizAccuracy: 0.9 });
    const slow = fsrs.review(learned, Grade.Good, at, { responseTimeMs: 15000, quizAccuracy: 0.2 });
    expect(slow.log.difficultyPenalty).toBeGreaterThan(0);
    expect(slow.card.stability).toBeLessThan(normal.card.stability);
    expect(slow.log.scheduledDays).toBeLessThanOrEqual(normal.log.scheduledDays);
  });
});

describe('Simulator FSRS & pengaruh requestRetention', () => {
  it('target retensi lebih tinggi (0.95) menghasilkan interval lebih rapat daripada 0.85', () => {
    const strict = new FSRS({ requestRetention: 0.95 });
    const relaxed = new FSRS({ requestRetention: 0.85 });
    const cStrict = strict.review(createEmptyCard(t0), Grade.Easy, t0);
    const cRelaxed = relaxed.review(createEmptyCard(t0), Grade.Easy, t0);
    expect(cStrict.log.scheduledDays).toBeLessThan(cRelaxed.log.scheduledDays);
  });

  it('simulateFsrs menjalankan rangkaian rating multi-langkah secara presisi', () => {
    const sim = simulateFsrs({
      requestRetention: 0.9,
      steps: [{ rating: 'GOOD' }, { rating: 'GOOD' }, { rating: 'AGAIN' }, { rating: 'EASY' }],
    });
    expect(sim.trace).toHaveLength(4);
    expect(sim.trace[0]!.stateAfter).toBe('REVIEW');
    expect(sim.trace[1]!.stabilityAfter).toBeGreaterThan(sim.trace[0]!.stabilityAfter);
    expect(sim.trace[2]!.stateAfter).toBe('RELEARNING');
    expect(sim.trace[2]!.lapses).toBe(1);
    expect(sim.trace[3]!.stateAfter).toBe('REVIEW');
    expect(sim.forgettingCurve.length).toBeGreaterThan(5);
    expect(sim.forgettingCurve[0]!.retrievability).toBe(1);
  });

  it('interval awal bertahap (tidak loncat jauh) & prioritas deck AGAIN < HARD < NEW < GOOD < EASY', () => {
    const p = fsrs.preview(createEmptyCard(t0), t0);
    expect(p.again.log.scheduledDays).toBe(0);
    expect(p.again.log.scheduledMinutes).toBe(1);
    expect(p.hard.log.scheduledDays).toBe(0);
    expect(p.hard.log.scheduledMinutes).toBe(5);
    expect(p.good.log.scheduledDays).toBe(1);
    expect(p.easy.log.scheduledDays).toBeLessThanOrEqual(4);

    // Kartu Review yang dinilai Hard kembali ke jangka pendek (menit), bukan berhari-hari.
    const hardOnReview = fsrs.review(p.good.card, Grade.Hard, p.good.card.due);
    expect(hardOnReview.log.scheduledDays).toBe(0);
    expect(hardOnReview.log.scheduledMinutes).toBeGreaterThan(p.again.log.scheduledMinutes);

    const rAgain = computeDeckPriorityRank(Rating.AGAIN, CardStateType.RELEARNING, false);
    const rHard = computeDeckPriorityRank(Rating.HARD, CardStateType.LEARNING, false);
    const rDue = computeDeckPriorityRank(Rating.GOOD, CardStateType.REVIEW, true);
    const rNew = computeDeckPriorityRank(null, CardStateType.NEW, false);
    const rGood = computeDeckPriorityRank(Rating.GOOD, CardStateType.REVIEW, false);
    const rEasy = computeDeckPriorityRank(Rating.EASY, CardStateType.REVIEW, false);
    expect(rAgain).toBeLessThan(rHard);
    expect(rHard).toBeLessThan(rDue);
    expect(rDue).toBeLessThan(rNew);
    expect(rNew).toBeLessThan(rGood);
    expect(rGood).toBeLessThan(rEasy);
  });
});
