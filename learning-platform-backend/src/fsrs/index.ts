/**
 * @file fsrs/index.ts
 * @description Mesin penjadwalan pengulangan berjarak FSRS-5 (Free Spaced Repetition Scheduler).
 * Modul murni (bebas ketergantungan database maupun HTTP) yang menghitung transisi status kartu
 * (NEW, LEARNING, REVIEW, RELEARNING), tingkat kesulitan (D), stabilitas memori (S), daya ingat R(t),
 * serta pratinjau interval keempat tombol penilaian (Again, Hard, Good, Easy).
 */
import { DEFAULT_CONFIG } from './constants';
import { computeDifficultyPenalty } from './dynamicAdjustment';
import {
  clampD,
  initialDifficulty,
  initialStability,
  nextDifficulty,
  nextInterval,
  retrievability,
  stabilityAfterForget,
  stabilityAfterRecall,
  stabilityAfterShortTerm,
} from './formulas';
import { Grade, State, type BehaviorSignals, type Card, type FsrsConfig, type ReviewResult } from './types';

const MS_DAY = 86_400_000;
const MS_MIN = 60_000;

export function createEmptyCard(now: Date = new Date()): Card {
  return { state: State.New, difficulty: 0, stability: 0, due: now, lastReview: null, reps: 0, lapses: 0, hardCount: 0 };
}

/** FSRS Engine murni (tanpa DB / Express) - mudah diuji. */
export class FSRS {
  readonly config: FsrsConfig;

  constructor(config: Partial<FsrsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.w.length !== 19) throw new Error('FSRS-5 membutuhkan 19 bobot (w0..w18)');
  }

  /** R saat ini untuk sebuah kartu. */
  getRetrievability(card: Card, now: Date = new Date()): number {
    if (card.state === State.New || !card.lastReview) return 0;
    return retrievability((now.getTime() - card.lastReview.getTime()) / MS_DAY, card.stability);
  }

  /** Interval hari (>=1) untuk stabilitas S pada target retensi saat ini. */
  intervalFor(stability: number): number {
    return nextInterval(stability, this.config.requestRetention, this.config.maximumInterval);
  }

  /** Pratinjau keempat rating (untuk UI tombol: "Again < 1m, Good 3d, ..."). */
  preview(card: Card, now: Date = new Date(), signals?: BehaviorSignals): Record<'again' | 'hard' | 'good' | 'easy', ReviewResult> {
    return {
      again: this.review(card, Grade.Again, now, signals),
      hard: this.review(card, Grade.Hard, now, signals),
      good: this.review(card, Grade.Good, now, signals),
      easy: this.review(card, Grade.Easy, now, signals),
    };
  }

  review(card: Card, grade: Grade, now: Date = new Date(), signals?: BehaviorSignals): ReviewResult {
    const { w } = this.config;
    const penalty = computeDifficultyPenalty(grade, signals, this.config.adjustment);

    const elapsedMs = card.lastReview ? Math.max(now.getTime() - card.lastReview.getTime(), 0) : 0;
    const elapsedDays = elapsedMs / MS_DAY;

    let difficulty: number;
    let stability: number;
    let r: number | null = null;

    if (card.state === State.New) {
      difficulty = initialDifficulty(w, grade);
      stability = initialStability(w, grade);
      // Penalti juga berlaku pada kartu baru (jawab benar tapi lambat/akurasi rendah): S awal diperkecil.
      if (penalty > 0) {
        const dEff = clampD(difficulty + penalty);
        stability = Math.max(stability * ((11 - dEff) / (11 - difficulty)), 0.01);
      }
    } else {
      r = retrievability(elapsedDays, card.stability);
      difficulty = nextDifficulty(w, card.difficulty, grade);
      const dEff = clampD(difficulty + penalty); // hanya untuk hitung S
      if (elapsedDays < 1) {
        stability = stabilityAfterShortTerm(w, card.stability, grade);
        if (card.state !== State.Review) {
          if (grade === Grade.Good) stability = Math.max(stability, 1.0);
          else if (grade === Grade.Easy) stability = Math.max(stability, initialStability(w, Grade.Good));
        }
        if (penalty > 0 && grade >= Grade.Good) {
          stability = Math.max(card.stability, stability * ((11 - dEff) / (11 - difficulty)));
        }
      } else if (grade === Grade.Again) {
        stability = stabilityAfterForget(w, card.difficulty, card.stability, r);
      } else {
        stability = stabilityAfterRecall(w, dEff, card.stability, r, grade);
      }
    }

    const lapsed = grade === Grade.Again && card.state === State.Review;
    const next: Card = {
      state: card.state,
      difficulty,
      stability,
      due: now,
      lastReview: now,
      reps: card.reps + 1,
      lapses: card.lapses + (lapsed ? 1 : 0),
      hardCount: card.hardCount + (grade === Grade.Hard ? 1 : 0),
    };

    let scheduledDays = 0;
    let scheduledMinutes = 0;

    if (grade === Grade.Again) {
      next.state = card.state === State.Review || card.state === State.Relearning ? State.Relearning : State.Learning;
      scheduledMinutes = next.state === State.Relearning ? this.config.relearningStepMinutes : this.config.learningSteps.again;
    } else if (grade === Grade.Hard) {
      // Hard ("Ragu") selalu dijadwalkan jangka pendek (menit) agar ditaruh agak depan & diulang lagi, tidak loncat berhari-hari.
      next.state = card.state === State.Review || card.state === State.Relearning ? State.Relearning : State.Learning;
      scheduledMinutes =
        next.state === State.Relearning
          ? Math.max(this.config.learningSteps.hard + 1, this.config.relearningStepMinutes + 4)
          : this.config.learningSteps.hard;
    } else {
      // Lulus ke Review dengan interval hari bertahap (tidak langsung loncat jauh berhari-hari saat baru belajar).
      const isInitialGraduation = card.state !== State.Review;
      next.state = State.Review;
      const goodS = this.stabilityFor(card, Grade.Good, now, penalty);
      const easyRawI = this.intervalFor(this.stabilityFor(card, Grade.Easy, now, 0));
      const own = this.intervalFor(stability);

      if (isInitialGraduation) {
        const initGoodI = 1;
        const initEasyI = Math.max(initGoodI + 1, Math.min(7, Math.round(easyRawI * 0.2)));
        scheduledDays = grade === Grade.Good ? initGoodI : initEasyI;
      } else {
        const goodI = Math.max(1, Math.min(this.intervalFor(goodS), Math.max(2, Math.round(card.stability * 2.2))));
        const easyI = Math.max(goodI + 1, Math.min(easyRawI, Math.max(4, Math.round(card.stability * 3.2))));
        scheduledDays = grade === Grade.Good ? Math.min(Math.max(goodI, 1), own) : Math.max(goodI + 1, Math.min(easyI, own));
      }
      scheduledDays = Math.min(scheduledDays, this.config.maximumInterval);
    }

    next.due = scheduledDays > 0 ? new Date(now.getTime() + scheduledDays * MS_DAY) : new Date(now.getTime() + scheduledMinutes * MS_MIN);

    return {
      card: next,
      log: {
        grade,
        stateBefore: card.state,
        stabilityBefore: card.stability,
        difficultyBefore: card.difficulty,
        retrievability: r,
        stateAfter: next.state,
        stabilityAfter: next.stability,
        difficultyAfter: next.difficulty,
        elapsedDays: Math.floor(elapsedDays),
        scheduledDays,
        scheduledMinutes,
        due: next.due,
        difficultyPenalty: penalty,
      },
    };
  }

  /** Stabilitas hipotetis untuk rating tertentu (dipakai menjaga urutan interval hard<good<easy). */
  private stabilityFor(card: Card, grade: Grade, now: Date, penalty: number): number {
    const { w } = this.config;
    if (card.state === State.New) {
      const d0 = initialDifficulty(w, grade);
      const s0 = initialStability(w, grade);
      return penalty > 0 ? s0 * ((11 - clampD(d0 + penalty)) / (11 - d0)) : s0;
    }
    const elapsedDays = card.lastReview ? (now.getTime() - card.lastReview.getTime()) / MS_DAY : 0;
    const r = retrievability(elapsedDays, card.stability);
    const d = clampD(nextDifficulty(w, card.difficulty, grade) + penalty);
    if (elapsedDays < 1) return stabilityAfterShortTerm(w, card.stability, grade);
    return stabilityAfterRecall(w, d, card.stability, r, grade);
  }
}

export * from './types';
export { retrievability, nextInterval } from './formulas';
export { DEFAULT_WEIGHTS, FACTOR, DECAY } from './constants';
