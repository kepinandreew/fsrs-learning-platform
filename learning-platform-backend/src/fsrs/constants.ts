import type { AdjustmentConfig, FsrsConfig } from './types';

/** Bobot default FSRS-5 (w0..w18). */
export const DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

/** Konstanta kurva lupa: R(t,S) = (1 + FACTOR * t/S)^DECAY, dengan R(S,S)=0.9. */
export const DECAY = -0.5;
export const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81

export const D_MIN = 1;
export const D_MAX = 10;
export const S_MIN = 0.01;

export const DEFAULT_ADJUSTMENT: AdjustmentConfig = {
  slowResponseMs: 8000,
  verySlowResponseMs: 15000, // sesuai batas waktu soal 15 detik pada game client
  lowAccuracy: 0.6,
  maxResponsePenalty: 1.0,
  maxAccuracyPenalty: 1.5,
  maxTotalPenalty: 2.0,
};

export const DEFAULT_CONFIG: FsrsConfig = {
  w: DEFAULT_WEIGHTS,
  requestRetention: 0.9,
  maximumInterval: 36500,
  learningSteps: { again: 1, hard: 5 }, // menit (Again paling depan 1m, Hard agak depan 5m)
  relearningStepMinutes: 2, // menit saat lupa/ragu pada kartu lama agar tetap di depan Hard (6m)
  adjustment: DEFAULT_ADJUSTMENT,
};
