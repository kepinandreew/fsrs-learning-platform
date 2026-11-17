/** Rating FSRS (konvensi numerik FSRS: Again=1 ... Easy=4). */
export enum Grade {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export enum State {
  New = 'NEW',
  Learning = 'LEARNING',
  Review = 'REVIEW',
  Relearning = 'RELEARNING',
}

/** Memory state satu kartu untuk satu user. */
export interface Card {
  state: State;
  /** Difficulty D, 1..10 */
  difficulty: number;
  /** Stability S, hari */
  stability: number;
  due: Date;
  lastReview: Date | null;
  reps: number;
  /** Jumlah Again pada kartu yang sudah pernah lulus (state Review) */
  lapses: number;
  hardCount: number;
}

/** Input pendukung untuk Dynamic FSRS Adjustment. */
export interface BehaviorSignals {
  /** Waktu tanggap menjawab (ms) */
  responseTimeMs?: number | null;
  /** Akurasi kuis MC terkait, 0..1 */
  quizAccuracy?: number | null;
}

export interface ReviewResult {
  card: Card;
  log: {
    grade: Grade;
    stateBefore: State;
    stabilityBefore: number;
    difficultyBefore: number;
    /** R saat review; null untuk kartu baru */
    retrievability: number | null;
    stateAfter: State;
    stabilityAfter: number;
    difficultyAfter: number;
    elapsedDays: number;
    /** Interval hari terjadwal (0 = ulang pada sesi/menit berikutnya) */
    scheduledDays: number;
    /** Interval aktual dalam menit (untuk learning steps) */
    scheduledMinutes: number;
    due: Date;
    difficultyPenalty: number;
  };
}

export interface FsrsConfig {
  /** Bobot w0..w18 (FSRS-5). */
  w: readonly number[];
  /** Target retensi r, default 0.9 */
  requestRetention: number;
  maximumInterval: number;
  /** Langkah menit untuk fase belajar */
  learningSteps: { again: number; hard: number };
  relearningStepMinutes: number;
  /** Parameter Dynamic Adjustment */
  adjustment: AdjustmentConfig;
}

export interface AdjustmentConfig {
  /** Response time (ms) di atas ini dianggap lambat */
  slowResponseMs: number;
  /** Di atas ini dianggap sangat lambat (penalti maksimum) */
  verySlowResponseMs: number;
  /** Akurasi kuis di bawah ini dianggap rendah */
  lowAccuracy: number;
  maxResponsePenalty: number;
  maxAccuracyPenalty: number;
  /** Batas total penalti difficulty */
  maxTotalPenalty: number;
}
