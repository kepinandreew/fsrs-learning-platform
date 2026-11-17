import { retrievability } from '../../fsrs';

// =============================================================================
// Kalkulasi Learning Analytics (fungsi MURNI: tanpa DB agar mudah diuji)
// Rumus mengacu pada proposal TA: Retention State, Mastery Prediction,
// Difficult Topics, dan Completion Time Estimation.
// =============================================================================

// Batas stabilitas (hari) untuk dianggap "dikuasai" (proposal: S >= 7 hari).
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
