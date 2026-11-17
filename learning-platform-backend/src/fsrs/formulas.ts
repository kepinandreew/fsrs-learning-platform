import { D_MAX, D_MIN, DECAY, FACTOR, S_MIN } from './constants';
import { Grade } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
export const clampD = (d: number) => clamp(d, D_MIN, D_MAX);
export const clampS = (s: number) => Math.max(s, S_MIN);

/**
 * Retrievability: R(t,S) = (1 + FACTOR * t/S)^DECAY
 * t = hari sejak review terakhir, S = stability (hari).
 */
export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(elapsedDays, 0)) / stability, DECAY);
}

/**
 * Interval (hari) agar R turun ke target retensi r:
 * I(r,S) = S / FACTOR * (r^(1/DECAY) - 1)
 */
export function nextInterval(stability: number, requestRetention: number, maximumInterval: number): number {
  const raw = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, maximumInterval);
}

/** S0(G) = w[G-1] */
export function initialStability(w: readonly number[], g: Grade): number {
  return clampS(w[g - 1]!);
}

/** D0(G) = w4 - exp(w5 * (G-1)) + 1 */
export function initialDifficulty(w: readonly number[], g: Grade): number {
  return clampD(w[4]! - Math.exp(w[5]! * (g - 1)) + 1);
}

/**
 * D' = w7 * D0(Easy) + (1 - w7) * (D + dD * (10 - D)/9),  dD = -w6 * (G-3)
 * Again/Hard -> D naik; Good -> relatif tetap; Easy -> turun.
 */
export function nextDifficulty(w: readonly number[], d: number, g: Grade): number {
  const deltaD = -w[6]! * (g - 3);
  const damped = d + (deltaD * (D_MAX - d)) / 9;
  const reverted = w[7]! * initialDifficulty(w, Grade.Easy) + (1 - w[7]!) * damped;
  return clampD(reverted);
}

/**
 * Stabilitas setelah recall berhasil (Hard/Good/Easy):
 * S' = S * (1 + e^w8 * (11-D) * S^-w9 * (e^(w10*(1-R)) - 1) * hardPenalty * easyBonus)
 */
export function stabilityAfterRecall(w: readonly number[], d: number, s: number, r: number, g: Grade): number {
  const hardPenalty = g === Grade.Hard ? w[15]! : 1;
  const easyBonus = g === Grade.Easy ? w[16]! : 1;
  const growth =
    Math.exp(w[8]!) * (11 - d) * Math.pow(s, -w[9]!) * (Math.exp(w[10]! * (1 - r)) - 1) * hardPenalty * easyBonus;
  return clampS(s * (1 + growth));
}

/**
 * Stabilitas setelah lapse (Again) - stability reset:
 * S' = min(S, w11 * D^-w12 * ((S+1)^w13 - 1) * e^(w14*(1-R)))
 */
export function stabilityAfterForget(w: readonly number[], d: number, s: number, r: number): number {
  const sf = w[11]! * Math.pow(d, -w[12]!) * (Math.pow(s + 1, w[13]!) - 1) * Math.exp(w[14]! * (1 - r));
  return clampS(Math.min(s, sf));
}

/** Review pada hari yang sama (<1 hari): S' = S * e^(w17*(G-3+w18)); tidak turun bila G>=3. */
export function stabilityAfterShortTerm(w: readonly number[], s: number, g: Grade): number {
  const next = s * Math.exp(w[17]! * (g - 3 + w[18]!));
  return clampS(g >= Grade.Good ? Math.max(next, s) : next);
}
