import { DEFAULT_WEIGHTS, FACTOR, retrievability } from '../../fsrs';

/**
 * @file modules/analytics/analytics.calc.ts
 * @description Fungsi kalkulasi murni (tanpa akses database) untuk empat indikator analitik pembelajaran
 * serta evaluasi akurasi prediktif & kalibrasi bobot empiris FSRS-5 (RMSE, Brier Score, Log-Loss).
 */

// Ambang stabilitas memori (dalam hari) agar sebuah kartu dikategorikan telah dikuasai jangka panjang.
export const MASTERY_STABILITY_DAYS = 7;

const MS_DAY = 86_400_000;

// Pembulatan keluaran supaya JSON rapi.
const round = (n: number, digits = 4) => Number(n.toFixed(digits));

// Data minimum satu kartu milik satu user yang dibutuhkan kalkulasi.
export interface CardRow {
  userId: string;
  itemId: string;
  stability: number;
  difficulty: number;
  lastReview: Date | null;
  createdAt: Date; // waktu pertama kali kartu direview user
}

// Kelompokkan baris kartu per user.
function groupByUser(rows: CardRow[]): Map<string, CardRow[]> {
  const map = new Map<string, CardRow[]>();
  for (const r of rows) {
    const list = map.get(r.userId);
    if (list) list.push(r);
    else map.set(r.userId, [r]);
  }
  return map;
}

// =============================================================================
// 1) Retention State: R_avg = (1/N) * sum(R_i), R_i dari kurva lupa FSRS
// =============================================================================

export interface RetentionResult {
  // Rata-rata retrievability seluruh kartu aktif; null bila belum ada kartu.
  averageRetention: number | null;
  activeCards: number;
  // Sebaran kartu berdasarkan R, berguna untuk grafik.
  distribution: { critical: number; fading: number; strong: number };
  perUser: Array<{ userId: string; averageRetention: number; activeCards: number }>;
}

export function computeRetention(rows: CardRow[], now: Date): RetentionResult {
  // Kartu aktif = pernah direview (punya lastReview) dan stabilitasnya valid.
  const active = rows.filter((r) => r.lastReview && r.stability > 0);

  // R_i = (1 + factor * t/S)^decay, t = hari sejak review terakhir.
  const withR = active.map((r) => ({
    userId: r.userId,
    R: retrievability((now.getTime() - r.lastReview!.getTime()) / MS_DAY, r.stability),
  }));

  // Sebaran: kritis (<70%), mulai lupa (70-90%), kuat (>=90%).
  const distribution = { critical: 0, fading: 0, strong: 0 };
  for (const { R } of withR) {
    if (R < 0.7) distribution.critical++;
    else if (R < 0.9) distribution.fading++;
    else distribution.strong++;
  }

  // Rata-rata per user.
  const perUserMap = new Map<string, number[]>();
  for (const { userId, R } of withR) {
    const list = perUserMap.get(userId);
    if (list) list.push(R);
    else perUserMap.set(userId, [R]);
  }
  const perUser = [...perUserMap.entries()].map(([userId, rs]) => ({
    userId,
    averageRetention: round(rs.reduce((a, b) => a + b, 0) / rs.length),
    activeCards: rs.length,
  }));

  return {
    averageRetention: withR.length ? round(withR.reduce((a, c) => a + c.R, 0) / withR.length) : null,
    activeCards: withR.length,
    distribution,
    perUser,
  };
}

// =============================================================================
// Statistik per user (dipakai Mastery & Completion)
// =============================================================================

interface UserStat {
  userId: string;
  mastered: number; // kartu dengan S >= 7 hari
  reviewedCards: number;
  remaining: number; // kartu yang belum stabil (termasuk yang belum pernah direview)
  daysActive: number; // hari kalender sejak kartu pertama direview (minimal 1)
  masteredPerDay: number;
}

function computeUserStats(rows: CardRow[], totalFlashcards: number, now: Date): UserStat[] {
  return [...groupByUser(rows).entries()].map(([userId, cards]) => {
    const mastered = cards.filter((c) => c.stability >= MASTERY_STABILITY_DAYS).length;

    // Hari sejak kartu pertama direview, dihitung inklusif agar sesi hari pertama = 1 hari.
    const first = Math.min(...cards.map((c) => c.createdAt.getTime()));
    const daysActive = Math.max(Math.floor((now.getTime() - first) / MS_DAY) + 1, 1);

    return {
      userId,
      mastered,
      reviewedCards: cards.length,
      remaining: Math.max(totalFlashcards - mastered, 0),
      daysActive,
      masteredPerDay: mastered / daysActive,
    };
  });
}

// =============================================================================
// 2) Mastery Prediction: kartu dengan S >= 7 hari / total kartu dalam deck
// =============================================================================

export interface MasteryResult {
  thresholdDays: number;
  totalFlashcards: number;
  // Persentase penguasaan (0..1) gabungan seluruh user; null bila tak ada data.
  masteryRatio: number | null;
  masteredCards: number;
  users: number;
  perUser: Array<{ userId: string; masteredCards: number; reviewedCards: number; masteryRatio: number }>;
}

export function computeMastery(rows: CardRow[], totalFlashcards: number, now: Date): MasteryResult {
  const stats = computeUserStats(rows, totalFlashcards, now);
  const masteredSum = stats.reduce((a, s) => a + s.mastered, 0);

  return {
    thresholdDays: MASTERY_STABILITY_DAYS,
    totalFlashcards,
    // Gabungan = total kartu dikuasai / (jumlah user x total kartu deck).
    masteryRatio: stats.length && totalFlashcards ? round(masteredSum / (stats.length * totalFlashcards)) : null,
    masteredCards: masteredSum,
    users: stats.length,
    perUser: stats.map((s) => ({
      userId: s.userId,
      masteredCards: s.mastered,
      reviewedCards: s.reviewedCards,
      masteryRatio: totalFlashcards ? round(s.mastered / totalFlashcards) : 0,
    })),
  };
}

// =============================================================================
// 4) Completion Time Estimation: sisa kartu belum stabil / rata-rata kartu dikuasai per hari
// =============================================================================

export type CompletionStatus = 'COMPLETED' | 'ESTIMATED' | 'INSUFFICIENT_DATA';

export interface CompletionEntry {
  status: CompletionStatus;
  remainingCards: number;
  masteredPerDay: number;
  // Prediksi hari sampai seluruh kartu stabil; null bila data belum cukup.
  estimatedDays: number | null;
  estimatedCompletionDate: Date | null;
}

// Hitung satu estimasi dari sisa kartu dan laju penguasaan harian.
function estimate(remaining: number, perDay: number, now: Date): CompletionEntry {
  if (remaining === 0) {
    return { status: 'COMPLETED', remainingCards: 0, masteredPerDay: round(perDay), estimatedDays: 0, estimatedCompletionDate: now };
  }
  // Belum ada kartu yang dikuasai -> laju 0 -> tidak bisa diprediksi (hindari pembagian dengan nol).
  if (perDay <= 0) {
    return { status: 'INSUFFICIENT_DATA', remainingCards: remaining, masteredPerDay: 0, estimatedDays: null, estimatedCompletionDate: null };
  }
  const days = Math.ceil(remaining / perDay);
  return {
    status: 'ESTIMATED',
    remainingCards: remaining,
    masteredPerDay: round(perDay),
    estimatedDays: days,
    estimatedCompletionDate: new Date(now.getTime() + days * MS_DAY),
  };
}

export interface CompletionResult extends CompletionEntry {
  perUser: Array<CompletionEntry & { userId: string }>;
}

export function computeCompletion(rows: CardRow[], totalFlashcards: number, now: Date): CompletionResult {
  const stats = computeUserStats(rows, totalFlashcards, now);

  // Gabungan: total sisa kartu seluruh user dibagi total laju penguasaan seluruh user.
  const remainingSum = stats.reduce((a, s) => a + s.remaining, 0);
  const rateSum = stats.reduce((a, s) => a + s.masteredPerDay, 0);
  const pooled = stats.length
    ? estimate(remainingSum, rateSum, now)
    : estimate(totalFlashcards, 0, now); // belum ada user yang belajar

  return { ...pooled, perUser: stats.map((s) => ({ userId: s.userId, ...estimate(s.remaining, s.masteredPerDay, now) })) };
}

// =============================================================================
// 3) Difficult Topics: frekuensi Again/Hard (lapse) + tingkat kesalahan kuis MC
// =============================================================================

// Bobot skor: perilaku review (Again/Hard) lebih dominan daripada kesalahan kuis.
export const REVIEW_WEIGHT = 0.6;
export const QUIZ_WEIGHT = 0.4;

/**
 * Smoothing aditif agar sampel kecil tidak mendominasi: 1 salah dari 1 percobaan (100%)
 * tidak otomatis mengalahkan 10 salah dari 12 percobaan.
 * rate = (events + prior*k) / (n + k)
 */
export function smoothRate(events: number, n: number, prior = 0.25, k = 2): number {
  return (events + prior * k) / (n + k);
}

export interface FlashcardMeta {
  id: string;
  front: string | null;
  back: string | null;
  tags: string[];
}

export interface ReviewTally {
  again: number;
  hard: number;
  total: number;
}

export interface QuizTally {
  attempts: number;
  errors: number;
}

export interface DifficultTopic {
  itemId: string;
  front: string | null;
  back: string | null;
  tags: string[];
  reviews: number;
  againCount: number;
  hardCount: number;
  struggleRate: number | null; // (Again+Hard)/total review (mentah)
  quizAttempts: number;
  quizErrors: number;
  quizErrorRate: number | null; // kesalahan/percobaan (mentah)
  averageDifficulty: number | null; // rata-rata D FSRS
  score: number; // skor gabungan 0..1 (makin tinggi makin sulit)
}

export interface DifficultTagTopic {
  tag: string;
  cards: number;
  struggleEvents: number;
  reviews: number;
  quizErrors: number;
  quizAttempts: number;
  score: number;
}

// Gabungkan dua rate ber-bobot; bila salah satu sumber tidak ada, bobot dinormalisasi ke sumber yang ada.
function combine(reviewRate: number | null, quizRate: number | null): number {
  if (reviewRate !== null && quizRate !== null) return REVIEW_WEIGHT * reviewRate + QUIZ_WEIGHT * quizRate;
  return reviewRate ?? quizRate ?? 0;
}

export function computeDifficultTopics(
  flashcards: FlashcardMeta[],
  reviews: Map<string, ReviewTally>,
  quizzes: Map<string, QuizTally>, // kunci = id flashcard sumber soal
  rows: CardRow[],
  limit: number,
): { cards: DifficultTopic[]; tags: DifficultTagTopic[] } {
  // Rata-rata difficulty D per kartu dari seluruh user dalam cakupan.
  const dSum = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const e = dSum.get(r.itemId) ?? { sum: 0, n: 0 };
    e.sum += r.difficulty;
    e.n += 1;
    dSum.set(r.itemId, e);
  }

  const cards: DifficultTopic[] = [];
  for (const f of flashcards) {
    const rv = reviews.get(f.id);
    const qz = quizzes.get(f.id);
    // Kartu tanpa data sama sekali tidak bisa dinilai kesulitannya.
    if (!rv?.total && !qz?.attempts) continue;

    const struggle = rv ? rv.again + rv.hard : 0;
    const reviewRate = rv?.total ? smoothRate(struggle, rv.total) : null;
    const quizRate = qz?.attempts ? smoothRate(qz.errors, qz.attempts) : null;
    const d = dSum.get(f.id);

    cards.push({
      itemId: f.id,
      front: f.front,
      back: f.back,
      tags: f.tags,
      reviews: rv?.total ?? 0,
      againCount: rv?.again ?? 0,
      hardCount: rv?.hard ?? 0,
      struggleRate: rv?.total ? round(struggle / rv.total) : null,
      quizAttempts: qz?.attempts ?? 0,
      quizErrors: qz?.errors ?? 0,
      quizErrorRate: qz?.attempts ? round(qz.errors / qz.attempts) : null,
      averageDifficulty: d ? round(d.sum / d.n, 2) : null,
      score: round(combine(reviewRate, quizRate)),
    });
  }

  // Urutkan: skor tertinggi dulu; seri dipecah oleh jumlah kejadian sulit (Again/Hard + salah kuis).
  cards.sort((a, b) => b.score - a.score || b.againCount + b.hardCount + b.quizErrors - (a.againCount + a.hardCount + a.quizErrors));

  // Agregasi tingkat sub-topik berdasarkan tag.
  const tagAgg = new Map<string, Omit<DifficultTagTopic, 'tag' | 'score'>>();
  for (const c of cards) {
    for (const tag of c.tags) {
      const e = tagAgg.get(tag) ?? { cards: 0, struggleEvents: 0, reviews: 0, quizErrors: 0, quizAttempts: 0 };
      e.cards += 1;
      e.struggleEvents += c.againCount + c.hardCount;
      e.reviews += c.reviews;
      e.quizErrors += c.quizErrors;
      e.quizAttempts += c.quizAttempts;
      tagAgg.set(tag, e);
    }
  }
  const tags: DifficultTagTopic[] = [...tagAgg.entries()]
    .map(([tag, e]) => ({
      tag,
      ...e,
      score: round(
        combine(
          e.reviews ? smoothRate(e.struggleEvents, e.reviews) : null,
          e.quizAttempts ? smoothRate(e.quizErrors, e.quizAttempts) : null,
        ),
      ),
    }))
    .sort((a, b) => b.score - a.score);

  return { cards: cards.slice(0, limit), tags: tags.slice(0, limit) };
}

// =============================================================================
// 5) Evaluasi Akurasi Prediktif & Kalibrasi Bobot Empiris FSRS-5
// =============================================================================

export interface CalibrationLogRow {
  userId: string;
  itemId: string;
  rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
  stateBefore: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';
  retrievability: number | null;
  elapsedDays: number;
  reviewedAt: Date;
}

export interface CalibrationBin {
  label: string;
  count: number;
  predictedAvg: number | null;
  actualRate: number | null;
}

export interface FsrsCalibrationResult {
  totalReviewLogs: number;
  evaluatedReviews: number;
  meanPredicted: number | null;
  actualRecallRate: number | null;
  rmse: number | null;
  brierScore: number | null;
  logLoss: number | null;
  bins: CalibrationBin[];
  currentWeights: number[];
  suggestedWeights: number[];
}

export function computeFsrsCalibration(
  logs: CalibrationLogRow[],
  currentWeightsInput?: readonly number[] | null,
): FsrsCalibrationResult {
  const baseW =
    Array.isArray(currentWeightsInput) && currentWeightsInput.length === 19
      ? [...currentWeightsInput]
      : [...DEFAULT_WEIGHTS];

  const evalRows = logs.filter(
    (l) =>
      l.stateBefore !== 'NEW' &&
      typeof l.retrievability === 'number' &&
      Number.isFinite(l.retrievability) &&
      l.retrievability > 0,
  );

  const binDefs = [
    { label: '< 70%', lo: 0, hi: 0.7 },
    { label: '70–85%', lo: 0.7, hi: 0.85 },
    { label: '85–93%', lo: 0.85, hi: 0.93 },
    { label: '93–100%', lo: 0.93, hi: 1.01 },
  ];

  if (evalRows.length === 0) {
    return {
      totalReviewLogs: logs.length,
      evaluatedReviews: 0,
      meanPredicted: null,
      actualRecallRate: null,
      rmse: null,
      brierScore: null,
      logLoss: null,
      bins: binDefs.map((b) => ({ label: b.label, count: 0, predictedAvg: null, actualRate: null })),
      currentWeights: baseW.map((v) => round(v, 5)),
      suggestedWeights: baseW.map((v) => round(v, 5)),
    };
  }

  let sumPred = 0;
  let sumActual = 0;
  let sumBrier = 0;
  let sumLogLoss = 0;
  const bucketItems = binDefs.map(() => [] as Array<{ p: number; y: number }>);

  for (const r of evalRows) {
    const p = Math.min(0.999999, Math.max(0.000001, r.retrievability!));
    const y = r.rating === 'AGAIN' ? 0 : 1;
    sumPred += p;
    sumActual += y;
    sumBrier += (p - y) * (p - y);
    sumLogLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));

    const bIdx = binDefs.findIndex((b) => p >= b.lo && p < b.hi);
    if (bIdx >= 0) bucketItems[bIdx]!.push({ p, y });
  }

  const N = evalRows.length;
  let weightedSqErr = 0;
  const bins: CalibrationBin[] = binDefs.map((b, idx) => {
    const arr = bucketItems[idx]!;
    if (arr.length === 0) {
      return { label: b.label, count: 0, predictedAvg: null, actualRate: null };
    }
    const pAvg = arr.reduce((s, x) => s + x.p, 0) / arr.length;
    const yAvg = arr.reduce((s, x) => s + x.y, 0) / arr.length;
    weightedSqErr += (arr.length / N) * (pAvg - yAvg) * (pAvg - yAvg);
    return {
      label: b.label,
      count: arr.length,
      predictedAvg: round(pAvg),
      actualRate: round(yAvg),
    };
  });

  const meanPredicted = sumPred / N;
  const actualRecallRate = sumActual / N;

  // Estimasi stabilitas awal empiris w0..w3 dari pasangan review ke-1 (NEW) -> review ke-2 kartu yang sama.
  const byCard = new Map<string, CalibrationLogRow[]>();
  for (const l of logs) {
    const key = `${l.userId}:${l.itemId}`;
    const arr = byCard.get(key);
    if (arr) arr.push(l);
    else byCard.set(key, [l]);
  }

  const firstStats: Array<{ sumY: number; sumT: number; n: number }> = [
    { sumY: 0, sumT: 0, n: 0 },
    { sumY: 0, sumT: 0, n: 0 },
    { sumY: 0, sumT: 0, n: 0 },
    { sumY: 0, sumT: 0, n: 0 },
  ];
  const gradeIndex: Record<CalibrationLogRow['rating'], number> = {
    AGAIN: 0,
    HARD: 1,
    GOOD: 2,
    EASY: 3,
  };

  for (const seq of byCard.values()) {
    if (seq.length < 2) continue;
    seq.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
    const first = seq[0]!;
    const second = seq[1]!;
    if (first.stateBefore !== 'NEW') continue;
    const dtDays = Math.max(
      second.elapsedDays || 0,
      (second.reviewedAt.getTime() - first.reviewedAt.getTime()) / MS_DAY,
      0.15,
    );
    const st = firstStats[gradeIndex[first.rating]]!;
    st.sumY += second.rating === 'AGAIN' ? 0 : 1;
    st.sumT += dtDays;
    st.n += 1;
  }

  const suggested = [...baseW];
  for (let g = 0; g < 4; g++) {
    const st = firstStats[g]!;
    if (st.n === 0) continue;
    const smoothedR = Math.min(0.97, Math.max(0.55, (st.sumY + 4 * 0.9) / (st.n + 4)));
    const avgT = Math.max(0.25, st.sumT / st.n);
    const denom = Math.pow(smoothedR, -2) - 1;
    if (denom > 0.001) {
      const empS = Math.min(35, Math.max(0.1, (FACTOR * avgT) / denom));
      const alpha = Math.min(0.6, st.n / (st.n + 6));
      suggested[g] = (1 - alpha) * baseW[g]! + alpha * empS;
    }
  }
  // Jaga monotonisitas ketat w0 < w1 < w2 < w3
  for (let g = 1; g < 4; g++) {
    if (suggested[g]! <= suggested[g - 1]!) {
      suggested[g] = Number((suggested[g - 1]! * 1.35 + 0.15).toFixed(5));
    }
  }
  if (N >= 3) {
    const delta = actualRecallRate - meanPredicted;
    suggested[8] = Math.min(2.5, Math.max(0.8, baseW[8]! + 0.35 * delta));
  }

  return {
    totalReviewLogs: logs.length,
    evaluatedReviews: N,
    meanPredicted: round(meanPredicted),
    actualRecallRate: round(actualRecallRate),
    rmse: round(Math.sqrt(weightedSqErr)),
    brierScore: round(sumBrier / N),
    logLoss: round(sumLogLoss / N),
    bins,
    currentWeights: baseW.map((v) => round(v, 5)),
    suggestedWeights: suggested.map((v) => round(v, 5)),
  };
}
