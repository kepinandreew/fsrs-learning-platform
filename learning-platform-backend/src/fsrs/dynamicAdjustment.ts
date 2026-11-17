import type { AdjustmentConfig, BehaviorSignals, Grade } from './types';
import { Grade as G } from './types';

/**
 * Dynamic FSRS Adjustment.
 * Jika user menjawab BENAR (Good/Easy... atau Hard) tetapi response time lambat dan/atau akurasi kuis rendah,
 * kartu diberi penalti difficulty SEMENTARA (hanya dipakai saat menghitung stabilitas baru, tidak disimpan ke D),
 * sehingga stabilitas tumbuh lebih kecil dan interval review lebih pendek.
 * Rating Again tidak diberi penalti (sudah memangkas stabilitas).
 */
export function computeDifficultyPenalty(grade: Grade, signals: BehaviorSignals | undefined, cfg: AdjustmentConfig): number {
  if (!signals || grade === G.Again) return 0;

  let penalty = 0;

  const rt = signals.responseTimeMs;
  if (rt != null && rt > cfg.slowResponseMs) {
    const span = Math.max(cfg.verySlowResponseMs - cfg.slowResponseMs, 1);
    const ratio = Math.min((rt - cfg.slowResponseMs) / span, 1);
    penalty += ratio * cfg.maxResponsePenalty;
  }

  const acc = signals.quizAccuracy;
  if (acc != null && acc < cfg.lowAccuracy) {
    const ratio = Math.min((cfg.lowAccuracy - acc) / cfg.lowAccuracy, 1);
    penalty += ratio * cfg.maxAccuracyPenalty;
  }

  return Math.min(penalty, cfg.maxTotalPenalty);
}
