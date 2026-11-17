import { CardStateType, ItemType, Prisma, Rating, type CardState, type ReviewLog } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { Grade, FSRS, State, createEmptyCard, type Card } from '../../fsrs';
import { ApiError } from '../../utils/ApiError';
import { ensureUser, touchProgress } from '../progress/progress.service';
import { toClientItem } from '../items/items.service';
import type { DueQuery, PreviewQuery, QuizInput, ReviewInput } from './evaluation.schema';
import { computeQuizScore } from './scoring';

// Info aplikasi client hasil apiKeyAuth.
type ClientApp = NonNullable<Express.Request['clientApp']>;

// =============================================================================
// Helper
// =============================================================================

// Peta rating dari API (string enum Prisma) ke nilai numerik FSRS Engine.
const GRADE: Record<Rating, Grade> = {
  [Rating.AGAIN]: Grade.Again,
  [Rating.HARD]: Grade.Hard,
  [Rating.GOOD]: Grade.Good,
  [Rating.EASY]: Grade.Easy,
};

// Engine default hanya untuk menghitung R (kurva lupa tidak bergantung pada bobot w).
const defaultEngine = new FSRS();

// Bangun FSRS Engine per aplikasi: target retensi dari App, dan bobot kustom (jika valid 19 angka).
async function buildEngine(appId: string, requestRetention: number): Promise<FSRS> {
  const app = await prisma.app.findUnique({ where: { id: appId }, select: { fsrsParams: true } });
  const raw = app?.fsrsParams;
  const w =
    Array.isArray(raw) && raw.length === 19 && raw.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? (raw as number[])
      : undefined;
  return new FSRS({ requestRetention, ...(w ? { w } : {}) });
}

// Baris CardState (DB) -> objek Card untuk FSRS Engine. Nilai enum state identik antara DB dan engine.
const rowToCard = (row: CardState): Card => ({
  state: row.state as string as State,
  difficulty: row.difficulty,
  stability: row.stability,
  due: row.due,
  lastReview: row.lastReview,
  reps: row.reps,
  lapses: row.lapses,
  hardCount: row.hardCount,
});

// Konversi state engine -> enum DB.
const toDbState = (s: State): CardStateType => s as string as CardStateType;

// Akurasi kuis terbaru untuk satu flashcard: dihitung dari 5 jawaban terakhir user pada soal MC
// yang bersumber dari flashcard tersebut. null bila belum ada data kuis.
async function deriveQuizAccuracy(userId: string, flashcardId: string): Promise<number | null> {
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, item: { sourceFlashcardId: flashcardId } },
    orderBy: { answeredAt: 'desc' },
    take: 5,
    select: { isCorrect: true },
  });
  if (attempts.length === 0) return null;
  return attempts.filter((a) => a.isCorrect).length / attempts.length;
}

// Prioritas urutan kartu di dalam deck: AGAIN paling depan (0), HARD agak depan (1), DUE (2), NEW (3), GOOD (4), EASY paling belakang (5).
export function computeDeckPriorityRank(lastRating: Rating | null, state: CardStateType, isDue: boolean): number {
  if (state === CardStateType.NEW) return 3;
  if (lastRating === Rating.AGAIN) return 0;
  if (lastRating === Rating.HARD || state === CardStateType.LEARNING || state === CardStateType.RELEARNING) return 1;
  if (isDue) return 2;
  if (lastRating === Rating.EASY) return 5;
  return 4;
}

// Bentuk respons review: state kartu terkini + log kejadian.
function formatReview(card: CardState, log: ReviewLog, duplicate: boolean) {
  const nextReviewInSeconds = Math.max(Math.round((log.due.getTime() - log.reviewedAt.getTime()) / 1000), 0);
  const scheduledMinutes = log.scheduledDays > 0 ? 0 : Math.max(Math.round(nextReviewInSeconds / 60), 1);
  return {
    duplicate, // true = request ini pernah diproses (clientEventId sama); hasil lama dikembalikan
    card: {
      itemId: card.itemId,
      state: card.state,
      difficulty: card.difficulty,
      stability: card.stability,
      due: card.due,
      reps: card.reps,
      lapses: card.lapses,
      scheduledDays: log.scheduledDays,
      scheduledMinutes,
      priorityRank: computeDeckPriorityRank(log.rating, card.state, false),
      // Jeda sampai review berikutnya dalam detik (mencakup learning step menit-an).
      nextReviewInSeconds,
    },
    log: {
      id: log.id,
      rating: log.rating,
      retrievability: log.retrievability,
      stabilityBefore: log.stabilityBefore,
      stabilityAfter: log.stabilityAfter,
      difficultyBefore: log.difficultyBefore,
      difficultyAfter: log.difficultyAfter,
      difficultyPenalty: log.difficultyPenalty,
      responseTimeMs: log.responseTimeMs,
      quizAccuracy: log.quizAccuracy,
      reviewedAt: log.reviewedAt,
    },
  };
}

// Cari hasil review lama berdasarkan clientEventId (untuk idempotensi).
async function findDuplicateReview(userId: string, clientEventId: string) {
  const log = await prisma.reviewLog.findUnique({ where: { userId_clientEventId: { userId, clientEventId } } });
  if (!log) return null;
  const card = await prisma.cardState.findUnique({ where: { userId_itemId: { userId, itemId: log.itemId } } });
  return card ? formatReview(card, log, true) : null;
}

// =============================================================================
// POST /api/evaluation/review
// =============================================================================

export async function reviewCard(app: ClientApp, input: ReviewInput) {
  const user = await ensureUser(app.id, input.externalUserId, input.displayName);

  // Idempotensi: jika event yang sama sudah diproses, kembalikan hasil lama tanpa menghitung ulang.
  if (input.clientEventId) {
    const dup = await findDuplicateReview(user.id, input.clientEventId);
    if (dup) return dup;
  }

  // Item harus flashcard aktif milik aplikasi ini (pada deck aktif). FSRS eksklusif untuk flashcard (Proposal Batasan #2).
  const item = await prisma.learningItem.findFirst({
    where: { id: input.itemId, appId: app.id, isActive: true, deck: { isActive: true } },
  });
  if (!item) throw ApiError.notFound('Item tidak ditemukan');
  if (item.type !== ItemType.FLASHCARD) throw ApiError.badRequest('Review FSRS hanya untuk flashcard');

  // State kartu saat ini (atau kartu baru jika belum pernah direview).
  const existing = await prisma.cardState.findUnique({ where: { userId_itemId: { userId: user.id, itemId: item.id } } });
  const now = new Date();
  const card = existing ? rowToCard(existing) : createEmptyCard(now);

  // Sesuai Proposal TA Rev 3 (Batasan #2, Batasan #7, & Rencana Uji Coba #2):
  // Kalkulasi interval jadwal FSRS murni mengikuti rumus matematis FSRS-5 berdasarkan rating subjektif
  // (AGAIN, HARD, GOOD, EASY) tanpa mencampurkan hasil evaluasi Multiple Choice maupun deteksi anomali waktu.
  const engine = await buildEngine(app.id, app.requestRetention);
  const { card: next, log } = engine.review(card, GRADE[input.rating], now);
  const quizAccuracy = input.quizAccuracy ?? null;

  // Data CardState baru.
  const cardData = {
    state: toDbState(next.state),
    difficulty: next.difficulty,
    stability: next.stability,
    due: next.due,
    lastReview: next.lastReview,
    reps: next.reps,
    lapses: next.lapses,
    hardCount: next.hardCount,
    elapsedDays: log.elapsedDays,
    scheduledDays: log.scheduledDays,
    difficultyPenalty: log.difficultyPenalty,
  };

  try {
    // Satu transaksi: CardState + ReviewLog + Progress harus tersimpan bersama atau tidak sama sekali.
    const saved = await prisma.$transaction(async (tx) => {
      let cardRow: CardState;
      if (existing) {
        // Optimistic locking: update hanya jika `reps` belum berubah. Mencegah dua review bersamaan
        // pada kartu yang sama saling menimpa.
        const upd = await tx.cardState.updateMany({ where: { id: existing.id, reps: existing.reps }, data: cardData });
        if (upd.count === 0) throw ApiError.conflict('Kartu sedang diproses request lain, coba ulang');
        cardRow = await tx.cardState.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        cardRow = await tx.cardState.create({ data: { userId: user.id, itemId: item.id, ...cardData } });
      }

      // Log immutable: dasar learning analytics (retensi, kartu tersulit, dsb).
      const logRow = await tx.reviewLog.create({
        data: {
          userId: user.id,
          itemId: item.id,
          rating: input.rating,
          stateBefore: toDbState(log.stateBefore),
          stabilityBefore: log.stabilityBefore,
          difficultyBefore: log.difficultyBefore,
          retrievability: log.retrievability,
          stateAfter: toDbState(log.stateAfter),
          stabilityAfter: log.stabilityAfter,
          difficultyAfter: log.difficultyAfter,
          scheduledDays: log.scheduledDays,
          elapsedDays: log.elapsedDays,
          due: log.due,
          responseTimeMs: input.responseTimeMs ?? null,
          quizAccuracy,
          difficultyPenalty: log.difficultyPenalty,
          clientEventId: input.clientEventId ?? null,
          reviewedAt: now,
        },
      });

      // Agregat progress (jumlah review + streak).
      await touchProgress(tx, user.id, item.deckId, { reviews: 1 }, now);
      return { cardRow, logRow };
    });

    return formatReview(saved.cardRow, saved.logRow, false);
  } catch (err) {
    // Race pada clientEventId yang sama: request lain menang lebih dulu -> kembalikan hasilnya.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && input.clientEventId) {
      const dup = await findDuplicateReview(user.id, input.clientEventId);
      if (dup) return dup;
    }
    throw err;
  }
}

// =============================================================================
// POST /api/evaluation/quiz
// =============================================================================

// Bentuk respons kuis (dipakai juga untuk hasil duplikat).
function formatQuiz(
  attempt: { isCorrect: boolean; score: number; responseTimeMs: number | null; selectedIndex: number | null },
  item: { correctIndex: number | null; explanation: string | null; sourceFlashcardId: string | null },
  topicAccuracy: number | null,
  duplicate: boolean,
) {
  return {
    duplicate,
    isCorrect: attempt.isCorrect,
    selectedIndex: attempt.selectedIndex,
    // Kunci jawaban baru dibuka SETELAH user menjawab.
    correctIndex: item.correctIndex,
    explanation: item.explanation,
    score: attempt.score,
    responseTimeMs: attempt.responseTimeMs,
    sourceFlashcardId: item.sourceFlashcardId,
    // Akurasi terbaru pada flashcard sumber; boleh diteruskan client ke /review sebagai quizAccuracy.
    topicAccuracy,
  };
}

export async function answerQuiz(app: ClientApp, input: QuizInput) {
  const user = await ensureUser(app.id, input.externalUserId, input.displayName);

  // Item harus soal MC aktif milik aplikasi ini (pada deck aktif).
  const item = await prisma.learningItem.findFirst({
    where: { id: input.itemId, appId: app.id, isActive: true, deck: { isActive: true } },
  });
  if (!item) throw ApiError.notFound('Item tidak ditemukan');
  if (item.type !== ItemType.MULTIPLE_CHOICE || item.correctIndex === null) {
    throw ApiError.badRequest('Item ini bukan soal pilihan ganda');
  }

  // Idempotensi: kembalikan hasil lama bila event yang sama sudah tercatat.
  if (input.clientEventId) {
    const old = await prisma.quizAttempt.findUnique({
      where: { userId_clientEventId: { userId: user.id, clientEventId: input.clientEventId } },
    });
    if (old) {
      const acc = item.sourceFlashcardId ? await deriveQuizAccuracy(user.id, item.sourceFlashcardId) : null;
      return formatQuiz(old, item, acc, true);
    }
  }

  // Validasi indeks terhadap jumlah pilihan.
  const choiceCount = Array.isArray(item.choices) ? item.choices.length : 0;
  if (input.selectedIndex >= choiceCount) throw ApiError.badRequest('selectedIndex di luar jumlah pilihan');

  // Pencocokan jawaban dilakukan di server, lalu hitung skor (benar + cepat = lebih tinggi).
  const isCorrect = input.selectedIndex === item.correctIndex;
  const score = computeQuizScore(isCorrect, input.responseTimeMs);
  const now = new Date();

  try {
    // Transaksi: catat jawaban + perbarui agregat progress.
    const attempt = await prisma.$transaction(async (tx) => {
      const row = await tx.quizAttempt.create({
        data: {
          userId: user.id,
          itemId: item.id,
          selectedIndex: input.selectedIndex,
          isCorrect,
          responseTimeMs: input.responseTimeMs ?? null,
          score,
          sessionId: input.sessionId ?? null,
          clientEventId: input.clientEventId ?? null,
          answeredAt: now,
        },
      });
      await touchProgress(tx, user.id, item.deckId, { quizzes: 1, correct: isCorrect ? 1 : 0, wrong: isCorrect ? 0 : 1 }, now);
      return row;
    });

    // Hitung akurasi topik SETELAH jawaban ini tersimpan.
    const topicAccuracy = item.sourceFlashcardId ? await deriveQuizAccuracy(user.id, item.sourceFlashcardId) : null;
    return formatQuiz(attempt, item, topicAccuracy, false);
  } catch (err) {
    // Race pada clientEventId yang sama -> kembalikan hasil request pemenang.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && input.clientEventId) {
      const old = await prisma.quizAttempt.findUnique({
        where: { userId_clientEventId: { userId: user.id, clientEventId: input.clientEventId } },
      });
      if (old) return formatQuiz(old, item, null, true);
    }
    throw err;
  }
}

// =============================================================================
// GET /api/evaluation/due
// =============================================================================

export async function getDueQueue(app: ClientApp, q: DueQuery) {
  const now = new Date();

  // Filter item dasar: flashcard aktif milik aplikasi ini (pada deck aktif).
  const itemWhere: Prisma.LearningItemWhereInput = {
    appId: app.id,
    isActive: true,
    type: ItemType.FLASHCARD,
    deck: { isActive: true },
    ...(q.deckId ? { deckId: q.deckId } : {}),
  };

  // GET tidak membuat user baru: user yang belum dikenal berarti semua kartu masih baru.
  const user = await prisma.user.findUnique({
    where: { appId_externalId: { appId: app.id, externalId: q.externalUserId } },
    select: { id: true },
  });

  const allItems = await prisma.learningItem.findMany({
    where: itemWhere,
    include: { deck: { select: { title: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const [stateRows, latestLogs] =
    user && allItems.length > 0
      ? await Promise.all([
          prisma.cardState.findMany({
            where: { userId: user.id, itemId: { in: allItems.map((i) => i.id) } },
          }),
          prisma.reviewLog.findMany({
            where: { userId: user.id, itemId: { in: allItems.map((i) => i.id) } },
            orderBy: { reviewedAt: 'desc' },
            distinct: ['itemId'],
            select: { itemId: true, rating: true, scheduledDays: true },
          }),
        ])
      : [[], []];

  const stateByItem = new Map(stateRows.map((s) => [s.itemId, s]));
  const logByItem = new Map(latestLogs.map((l) => [l.itemId, l]));

  const deckQueue = allItems
    .map((item, origIdx) => {
      const st = stateByItem.get(item.id);
      const lastLog = logByItem.get(item.id);
      if (!st || st.state === CardStateType.NEW) {
        return {
          item: toClientItem(item),
          card: null,
          priorityRank: 3,
          origIdx,
        };
      }
      const isDue = st.due.getTime() <= now.getTime();
      const lastRating = lastLog?.rating ?? null;
      const priorityRank = computeDeckPriorityRank(lastRating, st.state, isDue);
      return {
        item: toClientItem(item),
        card: {
          state: st.state,
          lastRating,
          due: st.due,
          isDue,
          scheduledDays: st.scheduledDays,
          stability: st.stability,
          difficulty: st.difficulty,
          reps: st.reps,
          lapses: st.lapses,
          priorityRank,
          retrievability: defaultEngine.getRetrievability(rowToCard(st), now),
        },
        priorityRank,
        origIdx,
      };
    })
    .sort((a, b) => {
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      if (a.card && b.card) {
        const dueDiff = a.card.due.getTime() - b.card.due.getTime();
        if (dueDiff !== 0) return dueDiff;
        if (a.priorityRank === 5) return a.card.stability - b.card.stability;
      }
      return a.origIdx - b.origIdx;
    });

  // Kartu yang perlu diprioritaskan di depan: jatuh tempo ATAU berstatus AGAIN/HARD (learning/relearning).
  const urgentEntries = deckQueue.filter((e) => e.card !== null && (e.card.isDue || e.priorityRank <= 1));
  const dueSlice = urgentEntries.slice(0, q.limit);
  const newSlice = q.newLimit > 0 ? deckQueue.filter((e) => e.card === null).slice(0, q.newLimit) : [];

  return {
    due: dueSlice.map((e) => ({ item: e.item, card: e.card! })),
    new: newSlice.map((e) => ({ item: e.item })),
    // Urutan deck lengkap: AGAIN (paling depan) -> HARD (agak depan) -> DUE -> NEW -> GOOD -> EASY (paling belakang).
    deckQueue: deckQueue.map(({ item, card, priorityRank }) => ({ item, card, priorityRank })),
    counts: { totalDue: urgentEntries.length, returnedDue: dueSlice.length, returnedNew: newSlice.length },
    serverTime: now.toISOString(),
  };
}

// =============================================================================
// GET /api/evaluation/preview & GET /api/review/preview
// =============================================================================

export async function previewReview(app: ClientApp, q: PreviewQuery) {
  const item = await prisma.learningItem.findFirst({
    where: { id: q.itemId, appId: app.id, isActive: true, deck: { isActive: true } },
  });
  if (!item) throw ApiError.notFound('Item tidak ditemukan');
  if (item.type !== ItemType.FLASHCARD) throw ApiError.badRequest('Preview FSRS hanya untuk flashcard');

  const now = new Date();
  let card = createEmptyCard(now);
  if (q.externalUserId) {
    const user = await prisma.user.findUnique({
      where: { appId_externalId: { appId: app.id, externalId: q.externalUserId } },
      select: { id: true },
    });
    if (user) {
      const existing = await prisma.cardState.findUnique({
        where: { userId_itemId: { userId: user.id, itemId: item.id } },
      });
      if (existing) card = rowToCard(existing);
    }
  }

  const engine = await buildEngine(app.id, app.requestRetention);
  const raw = engine.preview(card, now);

  const mapOption = (res: ReturnType<FSRS['review']>) => ({
    state: res.card.state,
    stability: res.card.stability,
    difficulty: res.card.difficulty,
    scheduledDays: res.log.scheduledDays,
    scheduledMinutes: res.log.scheduledMinutes,
    due: res.card.due,
    nextReviewInSeconds: Math.max(Math.round((res.card.due.getTime() - now.getTime()) / 1000), 0),
  });

  return {
    itemId: item.id,
    requestRetention: app.requestRetention,
    currentCard: {
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      retrievability: engine.getRetrievability(card, now),
      due: card.due,
    },
    options: {
      AGAIN: mapOption(raw.again),
      HARD: mapOption(raw.hard),
      GOOD: mapOption(raw.good),
      EASY: mapOption(raw.easy),
    },
    serverTime: now.toISOString(),
  };
}
