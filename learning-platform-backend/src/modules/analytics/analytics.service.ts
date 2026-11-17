import { CardStateType, ItemType, Rating } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { FSRS, Grade, State, createEmptyCard, retrievability, type Card } from '../../fsrs';
import { ApiError } from '../../utils/ApiError';
import { getOwnedApp, getOwnedDeck } from '../../utils/ownership';
import { computeDeckPriorityRank } from '../evaluation/evaluation.service';
import type { AnalyticsQuery, FsrsSimulateInput, MonitoringQuery, ShiftDueInput } from './analytics.schema';
import {
  computeCompletion,
  computeDifficultTopics,
  computeMastery,
  computeRetention,
  type CardRow,
  type QuizTally,
  type ReviewTally,
} from './analytics.calc';

// =============================================================================
// Pemuatan data (DB) -> diteruskan ke fungsi kalkulasi murni di analytics.calc.ts
// =============================================================================

// Konteks analitik: deck milik developer (atau gabungan seluruh deck aktif), (opsional) satu user, dan daftar flashcard aktif.
async function loadScope(developerId: string, q: AnalyticsQuery) {
  let deck: { id: string; title: string; appId: string; isAllDecks?: boolean };

  if (q.deckId) {
    const owned = await getOwnedDeck(developerId, q.deckId);
    deck = { id: owned.id, title: owned.title, appId: owned.appId, isAllDecks: false };
  } else {
    const primaryApp = await prisma.app.findFirst({
      where: { developerId },
      orderBy: [{ learningItems: { _count: 'desc' } }, { createdAt: 'desc' }],
      select: { id: true, name: true },
    });
    if (!primaryApp) throw ApiError.notFound('Aplikasi tidak ditemukan');
    deck = { id: 'all', title: 'Semua Materi Pembelajaran', appId: primaryApp.id, isAllDecks: true };
  }

  // Jika analitik untuk satu user, resolve userId internal dari externalUserId (dalam app yang sama).
  let userId: string | undefined;
  if (q.externalUserId) {
    const user = await prisma.user.findUnique({
      where: { appId_externalId: { appId: deck.appId, externalId: q.externalUserId } },
      select: { id: true },
    });
    if (!user) throw ApiError.notFound('User tidak ditemukan');
    userId = user.id;
  }

  const deckFilter = deck.isAllDecks ? { appId: deck.appId, deck: { isActive: true } } : { deckId: deck.id };

  // Seluruh flashcard aktif pada cakupan = penyebut "total kartu".
  const flashcards = await prisma.learningItem.findMany({
    where: { ...deckFilter, type: ItemType.FLASHCARD, isActive: true },
    select: { id: true, front: true, back: true, tags: true },
  });

  return { deck, deckFilter, userId, flashcards };
}

type Scope = Awaited<ReturnType<typeof loadScope>>;

// Muat state kartu (yang sudah pernah direview) dalam cakupan.
async function loadCardRows(scope: Scope): Promise<CardRow[]> {
  return prisma.cardState.findMany({
    where: {
      state: { not: CardStateType.NEW },
      item: { ...scope.deckFilter, type: ItemType.FLASHCARD, isActive: true },
      ...(scope.userId ? { userId: scope.userId } : {}),
    },
    select: { userId: true, itemId: true, stability: true, difficulty: true, lastReview: true, createdAt: true },
  });
}

// Ganti userId internal dengan externalUserId + displayName pada daftar perUser agar bermakna bagi developer.
async function labelUsers<T extends { userId: string }>(
  list: T[],
): Promise<Array<Omit<T, 'userId'> & { externalUserId: string; displayName: string | null }>> {
  if (list.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: list.map((l) => l.userId) } },
    select: { id: true, externalId: true, displayName: true },
  });
  const map = new Map(users.map((u) => [u.id, u]));
  return list.map(({ userId, ...rest }) => {
    const u = map.get(userId);
    return {
      ...rest,
      externalUserId: u?.externalId ?? 'unknown',
      displayName: u?.displayName ?? null,
    };
  });
}

// Metadata umum respons.
const metaOf = (scope: Scope, now: Date) => ({
  deckId: scope.deck.id,
  deckTitle: scope.deck.title,
  scope: scope.userId ? 'user' : 'deck',
  totalFlashcards: scope.flashcards.length,
  generatedAt: now.toISOString(),
});

// =============================================================================
// Metrik 1 - Retention State
// =============================================================================

export async function getRetention(developerId: string, q: AnalyticsQuery) {
  const scope = await loadScope(developerId, q);
  const now = new Date();
  const { perUser, ...rest } = computeRetention(await loadCardRows(scope), now);
  return { meta: metaOf(scope, now), ...rest, perUser: await labelUsers(perUser) };
}

// =============================================================================
// Metrik 2 - Mastery Prediction
// =============================================================================

export async function getMastery(developerId: string, q: AnalyticsQuery) {
  const scope = await loadScope(developerId, q);
  const now = new Date();
  const { perUser, ...rest } = computeMastery(await loadCardRows(scope), scope.flashcards.length, now);
  return { meta: metaOf(scope, now), ...rest, perUser: await labelUsers(perUser) };
}

// =============================================================================
// Metrik 3 - Difficult Topics
// =============================================================================

// Hitung tally review (Again/Hard/total) per flashcard lewat agregasi di database.
async function loadReviewTallies(scope: Scope): Promise<Map<string, ReviewTally>> {
  const groups = await prisma.reviewLog.groupBy({
    by: ['itemId', 'rating'],
    where: {
      item: { ...scope.deckFilter, type: ItemType.FLASHCARD },
      ...(scope.userId ? { userId: scope.userId } : {}),
    },
    _count: { _all: true },
  });

  const map = new Map<string, ReviewTally>();
  for (const g of groups) {
    const t = map.get(g.itemId) ?? { again: 0, hard: 0, total: 0 };
    t.total += g._count._all;
    if (g.rating === Rating.AGAIN) t.again += g._count._all;
    if (g.rating === Rating.HARD) t.hard += g._count._all;
    map.set(g.itemId, t);
  }
  return map;
}

// Hitung tally jawaban kuis per flashcard sumber. Soal MC tanpa sourceFlashcardId tidak bisa
// dikaitkan ke kartu sehingga tidak ikut dihitung.
async function loadQuizTallies(scope: Scope): Promise<Map<string, QuizTally>> {
  const mcItems = await prisma.learningItem.findMany({
    where: { ...scope.deckFilter, type: ItemType.MULTIPLE_CHOICE, sourceFlashcardId: { not: null } },
    select: { id: true, sourceFlashcardId: true },
  });
  if (mcItems.length === 0) return new Map();

  // Peta id soal MC -> id flashcard sumber.
  const sourceOf = new Map(mcItems.map((m) => [m.id, m.sourceFlashcardId!]));

  const groups = await prisma.quizAttempt.groupBy({
    by: ['itemId', 'isCorrect'],
    where: { itemId: { in: [...sourceOf.keys()] }, ...(scope.userId ? { userId: scope.userId } : {}) },
    _count: { _all: true },
  });

  const map = new Map<string, QuizTally>();
  for (const g of groups) {
    const flashcardId = sourceOf.get(g.itemId)!;
    const t = map.get(flashcardId) ?? { attempts: 0, errors: 0 };
    t.attempts += g._count._all;
    if (!g.isCorrect) t.errors += g._count._all;
    map.set(flashcardId, t);
  }
  return map;
}

export async function getDifficultTopics(developerId: string, q: AnalyticsQuery) {
  const scope = await loadScope(developerId, q);
  const now = new Date();
  const [rows, reviews, quizzes] = await Promise.all([loadCardRows(scope), loadReviewTallies(scope), loadQuizTallies(scope)]);
  const result = computeDifficultTopics(scope.flashcards, reviews, quizzes, rows, q.limit);
  return { meta: metaOf(scope, now), cards: result.cards, tags: result.tags };
}

// =============================================================================
// Metrik 4 - Completion Time Estimation
// =============================================================================

export async function getCompletionTime(developerId: string, q: AnalyticsQuery) {
  const scope = await loadScope(developerId, q);
  const now = new Date();
  const { perUser, ...rest } = computeCompletion(await loadCardRows(scope), scope.flashcards.length, now);
  return { meta: metaOf(scope, now), ...rest, perUser: await labelUsers(perUser) };
}

// =============================================================================
// Ringkasan: keempat metrik sekaligus (untuk halaman Monitoring & Learning Analytics)
// =============================================================================

export async function getSummary(developerId: string, q: AnalyticsQuery) {
  const scope = await loadScope(developerId, q);
  const now = new Date();

  // Data dimuat paralel dan kartu hanya di-query sekali untuk ketiga metrik berbasis CardState.
  const [rows, reviews, quizzes] = await Promise.all([loadCardRows(scope), loadReviewTallies(scope), loadQuizTallies(scope)]);
  const total = scope.flashcards.length;

  const retention = computeRetention(rows, now);
  const mastery = computeMastery(rows, total, now);
  const completion = computeCompletion(rows, total, now);
  const difficult = computeDifficultTopics(scope.flashcards, reviews, quizzes, rows, q.limit);

  // Resolusi userId -> externalUserId + displayName cukup 1 query DB untuk ketiga metrik sekaligus.
  const uniqueUserIds = [
    ...new Set([
      ...retention.perUser.map((u) => u.userId),
      ...mastery.perUser.map((u) => u.userId),
      ...completion.perUser.map((u) => u.userId),
    ]),
  ];
  const users =
    uniqueUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: uniqueUserIds } },
          select: { id: true, externalId: true, displayName: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const mapList = <T extends { userId: string }>(list: T[]) =>
    list.map(({ userId, ...rest }) => {
      const u = userMap.get(userId);
      return { ...rest, externalUserId: u?.externalId ?? 'unknown', displayName: u?.displayName ?? null };
    });

  return {
    meta: metaOf(scope, now),
    retention: { ...retention, perUser: mapList(retention.perUser) },
    mastery: { ...mastery, perUser: mapList(mastery.perUser) },
    difficultTopics: { cards: difficult.cards, tags: difficult.tags },
    completionTime: { ...completion, perUser: mapList(completion.perUser) },
  };
}

// =============================================================================
// Monitoring Terpadu (Proposal Tujuan #4 & Bagian IV.3.A):
// Data Pengguna, Ringkasan Progres Belajar, Status Memori FSRS, & Riwayat Aktivitas
// =============================================================================

const monitorEngine = new FSRS();

export async function getMonitoring(developerId: string, q: MonitoringQuery) {
  const now = new Date();

  let app: { id: string; name: string; requestRetention: number } | null = null;
  let deck: { id: string; title: string; appId: string } | null = null;

  if (q.deckId) {
    const ownedDeck = await getOwnedDeck(developerId, q.deckId);
    deck = { id: ownedDeck.id, title: ownedDeck.title, appId: ownedDeck.appId };
    const ownedApp = await getOwnedApp(developerId, ownedDeck.appId);
    app = { id: ownedApp.id, name: ownedApp.name, requestRetention: ownedApp.requestRetention };
  } else if (q.appId) {
    const ownedApp = await getOwnedApp(developerId, q.appId);
    app = { id: ownedApp.id, name: ownedApp.name, requestRetention: ownedApp.requestRetention };
  } else {
    const firstApp = await prisma.app.findFirst({
      where: { developerId },
      orderBy: [{ learningItems: { _count: 'desc' } }, { createdAt: 'desc' }],
      select: { id: true, name: true, requestRetention: true },
    });
    app = firstApp;
  }

  if (!app) {
    return {
      app: null,
      deck: null,
      overview: {
        totalUsers: 0,
        totalFlashcards: 0,
        totalMultipleChoice: 0,
        activeCardsCount: 0,
        dueNowCount: 0,
        totalReviews: 0,
        totalQuizAttempts: 0,
        overallQuizAccuracy: null,
      },
      users: [],
      cardStates: [],
      recentReviews: [],
      recentQuizzes: [],
      generatedAt: now.toISOString(),
    };
  }

  // Filter opsional satu end-user (jika tidak ditemukan, kembalikan kosong tanpa melempar 404 agar UI aman).
  let filterUserId: string | undefined;
  let userMissing = false;
  if (q.externalUserId) {
    const foundUser = await prisma.user.findUnique({
      where: { appId_externalId: { appId: app.id, externalId: q.externalUserId } },
      select: { id: true },
    });
    if (foundUser) filterUserId = foundUser.id;
    else userMissing = true;
  }

  const itemScope = {
    appId: app.id,
    isActive: true,
    deck: { isActive: true },
    ...(deck ? { deckId: deck.id } : {}),
  };

  const [
    totalFlashcards,
    totalMultipleChoice,
    allAppUsers,
    cardStateCounts,
    dueNowCount,
    cardRows,
    reviewLogs,
    quizAttempts,
    totalReviewCount,
    quizGroupCounts,
  ] = await Promise.all([
    prisma.learningItem.count({ where: { ...itemScope, type: ItemType.FLASHCARD } }),
    prisma.learningItem.count({ where: { ...itemScope, type: ItemType.MULTIPLE_CHOICE } }),
    prisma.user.findMany({
      where: { appId: app.id },
      include: {
        progresses: {
          where: deck ? { deckId: deck.id } : { deck: { isActive: true } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.cardState.groupBy({
      by: ['userId'],
      where: { item: itemScope, state: { not: CardStateType.NEW } },
      _count: { _all: true },
    }),
    userMissing
      ? Promise.resolve(0)
      : prisma.cardState.count({
          where: {
            item: itemScope,
            state: { not: CardStateType.NEW },
            due: { lte: now },
            ...(filterUserId ? { userId: filterUserId } : {}),
          },
        }),
    userMissing
      ? Promise.resolve([])
      : prisma.cardState.findMany({
          where: {
            item: itemScope,
            ...(filterUserId ? { userId: filterUserId } : {}),
          },
          include: {
            user: { select: { externalId: true, displayName: true } },
            item: {
              select: {
                id: true,
                front: true,
                back: true,
                deckId: true,
                deck: { select: { title: true } },
              },
            },
          },
          orderBy: [{ due: 'asc' }, { updatedAt: 'desc' }],
          take: 100,
        }),
    userMissing
      ? Promise.resolve([])
      : prisma.reviewLog.findMany({
          where: {
            item: { appId: app.id, ...(deck ? { deckId: deck.id } : {}) },
            ...(filterUserId ? { userId: filterUserId } : {}),
          },
          include: {
            user: { select: { externalId: true, displayName: true } },
            item: { select: { id: true, front: true, back: true, deck: { select: { title: true } } } },
          },
          orderBy: { reviewedAt: 'desc' },
          take: q.limit,
        }),
    userMissing
      ? Promise.resolve([])
      : prisma.quizAttempt.findMany({
          where: {
            item: { appId: app.id, ...(deck ? { deckId: deck.id } : {}) },
            ...(filterUserId ? { userId: filterUserId } : {}),
          },
          include: {
            user: { select: { externalId: true, displayName: true } },
            item: {
              select: {
                id: true,
                question: true,
                choices: true,
                correctIndex: true,
                deck: { select: { title: true } },
              },
            },
          },
          orderBy: { answeredAt: 'desc' },
          take: q.limit,
        }),
    userMissing
      ? Promise.resolve(0)
      : prisma.reviewLog.count({
          where: {
            item: { appId: app.id, ...(deck ? { deckId: deck.id } : {}) },
            ...(filterUserId ? { userId: filterUserId } : {}),
          },
        }),
    userMissing
      ? Promise.resolve([])
      : prisma.quizAttempt.groupBy({
          by: ['isCorrect'],
          where: {
            item: { appId: app.id, ...(deck ? { deckId: deck.id } : {}) },
            ...(filterUserId ? { userId: filterUserId } : {}),
          },
          _count: { _all: true },
        }),
  ]);

  const dueByUser = await prisma.cardState.groupBy({
    by: ['userId'],
    where: { item: itemScope, state: { not: CardStateType.NEW }, due: { lte: now } },
    _count: { _all: true },
  });

  const trackedMap = new Map(cardStateCounts.map((c) => [c.userId, c._count._all]));
  const dueMap = new Map(dueByUser.map((c) => [c.userId, c._count._all]));

  const users = allAppUsers
    .filter((u) => Boolean(u.email) || u.progresses.length > 0 || (trackedMap.get(u.id) ?? 0) > 0)
    .map((u) => {
      const progs = u.progresses;
      const points = progs.reduce((sum, p) => sum + p.points, 0);
      const experience = progs.reduce((sum, p) => sum + p.exp, 0);
      const level = progs.reduce((max, p) => Math.max(max, p.level), 1);
      const totalReviews = progs.reduce((sum, p) => sum + p.totalReviews, 0);
      const totalQuizzes = progs.reduce((sum, p) => sum + p.totalQuizzes, 0);
      const correctAnswers = progs.reduce((sum, p) => sum + p.correctAnswers, 0);
      const wrongAnswers = progs.reduce((sum, p) => sum + p.wrongAnswers, 0);
      const currentStreak = progs.reduce((max, p) => Math.max(max, p.currentStreak), 0);
      const longestStreak = progs.reduce((max, p) => Math.max(max, p.longestStreak), 0);
      const lastStudiedAt = progs.reduce<Date | null>(
        (latest, p) => (!p.lastStudiedAt ? latest : !latest || p.lastStudiedAt > latest ? p.lastStudiedAt : latest),
        null,
      );
      const totalJudged = correctAnswers + wrongAnswers;
      return {
        externalUserId: u.externalId,
        email: u.email || (u.externalId.includes('@') ? u.externalId : null),
        displayName: u.displayName,
        points,
        experience,
        level,
        totalReviews,
        totalQuizzes,
        correctAnswers,
        wrongAnswers,
        quizAccuracy: totalJudged > 0 ? correctAnswers / totalJudged : null,
        currentStreak,
        longestStreak,
        trackedCards: trackedMap.get(u.id) ?? 0,
        dueCards: dueMap.get(u.id) ?? 0,
        lastStudiedAt,
        lastSeenAt: u.updatedAt,
      };
    })
    .sort((a, b) => b.points - a.points || b.experience - a.experience || b.totalReviews - a.totalReviews);

  let totalQuizAttempts = 0;
  let totalCorrectQuizzes = 0;
  for (const g of quizGroupCounts) {
    totalQuizAttempts += g._count._all;
    if (g.isCorrect) totalCorrectQuizzes += g._count._all;
  }

  const activeCardsCount = userMissing
    ? 0
    : filterUserId
      ? (trackedMap.get(filterUserId) ?? 0)
      : cardStateCounts.reduce((sum, c) => sum + c._count._all, 0);

  const latestRatings =
    cardRows.length === 0
      ? []
      : await prisma.reviewLog.findMany({
          where: {
            userId: { in: [...new Set(cardRows.map((r) => r.userId))] },
            itemId: { in: [...new Set(cardRows.map((r) => r.itemId))] },
          },
          orderBy: { reviewedAt: 'desc' },
          distinct: ['userId', 'itemId'],
          select: { userId: true, itemId: true, rating: true },
        });
  const lastRatingMap = new Map(latestRatings.map((r) => [`${r.userId}:${r.itemId}`, r.rating]));

  const cardStates = cardRows
    .map((row) => {
      const fsrsCard: Card = {
        state: row.state as string as State,
        difficulty: row.difficulty,
        stability: row.stability,
        due: row.due,
        lastReview: row.lastReview,
        reps: row.reps,
        lapses: row.lapses,
        hardCount: row.hardCount,
      };
      const isDue = row.state !== CardStateType.NEW && row.due.getTime() <= now.getTime();
      const lastRating = lastRatingMap.get(`${row.userId}:${row.itemId}`) ?? null;
      const priorityRank = computeDeckPriorityRank(lastRating, row.state, isDue);
      const scheduledMinutes =
        row.scheduledDays === 0 && row.lastReview
          ? Math.max(1, Math.round((row.due.getTime() - row.lastReview.getTime()) / 60_000))
          : 0;
      return {
        id: row.id,
        externalUserId: row.user.externalId,
        displayName: row.user.displayName,
        itemId: row.item.id,
        front: row.item.front ?? '',
        back: row.item.back ?? '',
        deckId: row.item.deckId,
        deckTitle: row.item.deck.title,
        state: row.state,
        lastRating,
        priorityRank,
        stability: row.stability,
        difficulty: row.difficulty,
        retrievability: monitorEngine.getRetrievability(fsrsCard, now),
        reps: row.reps,
        lapses: row.lapses,
        scheduledDays: row.scheduledDays,
        scheduledMinutes,
        elapsedDays: row.elapsedDays,
        lastReview: row.lastReview,
        due: row.due,
        isDue,
      };
    })
    .sort((a, b) => a.priorityRank - b.priorityRank || a.due.getTime() - b.due.getTime());

  const recentReviews = reviewLogs.map((l) => ({
    id: l.id,
    externalUserId: l.user.externalId,
    displayName: l.user.displayName,
    itemId: l.item.id,
    front: l.item.front ?? '',
    back: l.item.back ?? '',
    deckTitle: l.item.deck.title,
    rating: l.rating,
    stateBefore: l.stateBefore,
    stateAfter: l.stateAfter,
    stabilityBefore: l.stabilityBefore,
    stabilityAfter: l.stabilityAfter,
    difficultyBefore: l.difficultyBefore,
    difficultyAfter: l.difficultyAfter,
    retrievability: l.retrievability,
    scheduledDays: l.scheduledDays,
    elapsedDays: l.elapsedDays,
    due: l.due,
    responseTimeMs: l.responseTimeMs,
    reviewedAt: l.reviewedAt,
  }));

  const recentQuizzes = quizAttempts.map((a) => {
    const choices = Array.isArray(a.item.choices) ? (a.item.choices as string[]) : [];
    return {
      id: a.id,
      externalUserId: a.user.externalId,
      displayName: a.user.displayName,
      itemId: a.item.id,
      question: a.item.question ?? '',
      deckTitle: a.item.deck.title,
      selectedIndex: a.selectedIndex,
      selectedText: a.selectedIndex != null ? (choices[a.selectedIndex] ?? null) : null,
      correctIndex: a.item.correctIndex,
      correctText: a.item.correctIndex != null ? (choices[a.item.correctIndex] ?? null) : null,
      isCorrect: a.isCorrect,
      score: a.score,
      responseTimeMs: a.responseTimeMs,
      answeredAt: a.answeredAt,
    };
  });

  return {
    app,
    deck,
    overview: {
      totalUsers: users.length,
      totalFlashcards,
      totalMultipleChoice,
      activeCardsCount,
      dueNowCount,
      totalReviews: totalReviewCount,
      totalQuizAttempts,
      overallQuizAccuracy: totalQuizAttempts > 0 ? totalCorrectQuizzes / totalQuizAttempts : null,
    },
    users,
    cardStates,
    recentReviews,
    recentQuizzes,
    generatedAt: now.toISOString(),
  };
}

// =============================================================================
// Simulator Interaktif FSRS Engine (Rencana Uji Coba #2 Proposal TA Rev 3)
// =============================================================================

const SIM_GRADE: Record<'AGAIN' | 'HARD' | 'GOOD' | 'EASY', Grade> = {
  AGAIN: Grade.Again,
  HARD: Grade.Hard,
  GOOD: Grade.Good,
  EASY: Grade.Easy,
};

export function simulateFsrs(input: FsrsSimulateInput) {
  const engine = new FSRS({ requestRetention: input.requestRetention });
  const t0 = new Date('2026-01-01T08:00:00.000Z');
  const hasInitialCard = Boolean(
    input.initialCard && input.initialCard.state !== 'NEW' && input.initialCard.stability > 0,
  );

  let card: Card;
  if (hasInitialCard && input.initialCard) {
    const initScheduledDays = Math.max(1, engine.intervalFor(input.initialCard.stability));
    card = {
      state: input.initialCard.state as State,
      stability: input.initialCard.stability,
      difficulty: input.initialCard.difficulty,
      reps: input.initialCard.reps,
      lapses: input.initialCard.lapses,
      hardCount: input.initialCard.hardCount ?? 0,
      lastReview: t0,
      due: new Date(t0.getTime() + initScheduledDays * 86_400_000),
    };
  } else {
    card = createEmptyCard(t0);
  }

  const trace = input.steps.map((step, idx) => {
    const reviewAt =
      !hasInitialCard && idx === 0
        ? t0
        : step.elapsedDays !== undefined
          ? new Date((card.lastReview ?? t0).getTime() + step.elapsedDays * 86_400_000)
          : new Date(card.due.getTime());

    const actualElapsedDays = card.lastReview
      ? Math.max((reviewAt.getTime() - card.lastReview.getTime()) / 86_400_000, 0)
      : 0;

    const result = engine.review(card, SIM_GRADE[step.rating], reviewAt);
    card = result.card;

    return {
      step: idx + 1,
      rating: step.rating,
      reviewedAt: reviewAt.toISOString(),
      elapsedDays: Number(actualElapsedDays.toFixed(3)),
      stateBefore: result.log.stateBefore,
      stateAfter: result.log.stateAfter,
      retrievabilityBefore: result.log.retrievability,
      difficultyBefore: result.log.difficultyBefore,
      difficultyAfter: result.log.difficultyAfter,
      stabilityBefore: result.log.stabilityBefore,
      stabilityAfter: result.log.stabilityAfter,
      scheduledDays: result.log.scheduledDays,
      scheduledMinutes: result.log.scheduledMinutes,
      due: result.log.due.toISOString(),
      reps: card.reps,
      lapses: card.lapses,
    };
  });

  // Pratinjau 4 pilihan berikutnya saat kartu jatuh tempo (due) berikutnya tiba.
  const nextDuePreviewRaw = engine.preview(card, card.due);
  const mapPreview = (r: ReturnType<FSRS['review']>) => ({
    state: r.card.state,
    stability: r.card.stability,
    difficulty: r.card.difficulty,
    scheduledDays: r.log.scheduledDays,
    scheduledMinutes: r.log.scheduledMinutes,
    due: r.card.due.toISOString(),
  });

  // Titik kurva lupa R(t) = (1 + 19/81 * t/S)^(-0.5) dari t=0 sampai 2*S untuk visualisasi grafik.
  const horizonDays = Math.max(Math.ceil(card.stability * 2), 7);
  const pointCount = 14;
  const forgettingCurve = Array.from({ length: pointCount + 1 }, (_, i) => {
    const day = Number(((horizonDays * i) / pointCount).toFixed(2));
    return {
      day,
      retrievability: retrievability(day, card.stability),
    };
  });

  return {
    requestRetention: input.requestRetention,
    initialCard: hasInitialCard && input.initialCard ? input.initialCard : null,
    finalCard: {
      state: card.state,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: card.lastReview?.toISOString() ?? null,
      due: card.due.toISOString(),
    },
    trace,
    nextPreviewAtDue: {
      AGAIN: mapPreview(nextDuePreviewRaw.again),
      HARD: mapPreview(nextDuePreviewRaw.hard),
      GOOD: mapPreview(nextDuePreviewRaw.good),
      EASY: mapPreview(nextDuePreviewRaw.easy),
    },
    forgettingCurve,
  };
}

// =============================================================================
// Simulasi Pergeseran Hari / Time-Travel Jadwal Jatuh Tempo (Demo Sidang TA)
// Menggeser `due` dan `lastReview` mundur (-days) untuk memajukan hari (+days),
// atau menggeser maju (+days) saat dikembalikan (-days) tanpa kehilangan data.
// =============================================================================

export async function shiftDueDates(developerId: string, input: ShiftDueInput) {
  const scope = await loadScope(developerId, {
    deckId: input.deckId,
    externalUserId: input.externalUserId,
    limit: 10,
  });

  const cards = await prisma.cardState.findMany({
    where: {
      state: { not: CardStateType.NEW },
      item: { ...scope.deckFilter, type: ItemType.FLASHCARD, isActive: true },
      ...(scope.userId ? { userId: scope.userId } : {}),
    },
    select: { id: true, due: true, lastReview: true },
  });

  const deltaMs = -input.days * 86_400_000;
  const now = new Date();

  if (cards.length > 0) {
    await prisma.$transaction(
      cards.map((c) =>
        prisma.cardState.update({
          where: { id: c.id },
          data: {
            due: new Date(c.due.getTime() + deltaMs),
            ...(c.lastReview ? { lastReview: new Date(c.lastReview.getTime() + deltaMs) } : {}),
          },
        }),
      ),
    );
  }

  const dueNowCount = cards.filter((c) => c.due.getTime() + deltaMs <= now.getTime()).length;

  return {
    shiftedDays: input.days,
    updatedCards: cards.length,
    dueNowCount,
    scopeTitle: scope.deck.title,
  };
}

// =============================================================================
// Export CSV Data Evaluasi Uji Coba (Bab IV/V Skripsi - Microsoft Excel Ready)
// =============================================================================

function csvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/\r?\n/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cols: unknown[]): string {
  return cols.map(csvCell).join(',');
}

export async function exportAnalyticsCsv(developerId: string, q: MonitoringQuery): Promise<string> {
  const [summary, monitoring] = await Promise.all([
    getSummary(developerId, { deckId: q.deckId, externalUserId: q.externalUserId, limit: 25 }),
    getMonitoring(developerId, { ...q, limit: 100 }),
  ]);

  const lines: string[] = [];

  lines.push(csvRow(['LAPORAN DATA EVALUASI PEMBELAJARAN ADAPTIF FSRS-5 (TUGAS AKHIR / SKRIPSI)']));
  lines.push(csvRow(['Aplikasi Client', monitoring.app?.name ?? '-']));
  lines.push(csvRow(['Cakupan Materi (Deck)', summary.meta.deckTitle]));
  lines.push(csvRow(['Filter Siswa', q.externalUserId ?? 'Semua Siswa Aktif']));
  lines.push(csvRow(['Waktu Ekspor (ISO)', monitoring.generatedAt]));
  lines.push('');

  lines.push(csvRow(['=== 1. RINGKASAN 4 INDIKATOR ANALITIK UTAMA PROPOSAL TA ===']));
  lines.push(
    csvRow([
      'TotalSiswaAktif',
      'TotalFlashcardMateri',
      'KartuAktifDipelajari',
      'KartuJatuhTempo_Due',
      'RataRataRetensiPersen_Ravg',
      'KartuKuat_R_ge_85',
      'KartuMulaiPudar_R_70_85',
      'KartuKritis_R_lt_70',
      'KartuHafalJangkaPanjang_S_ge_7Hari',
      'RasioPenguasaanPersen',
      'TotalReviewFSRS',
      'TotalKuisDijawab',
      'AkurasiKuisPersen',
      'StatusEstimasiKelulusan',
      'EstimasiHariLulus',
    ]),
  );
  lines.push(
    csvRow([
      monitoring.overview.totalUsers,
      summary.meta.totalFlashcards,
      summary.retention.activeCards,
      monitoring.overview.dueNowCount,
      summary.retention.averageRetention !== null ? (summary.retention.averageRetention * 100).toFixed(2) : '',
      summary.retention.distribution.strong,
      summary.retention.distribution.fading,
      summary.retention.distribution.critical,
      summary.mastery.masteredCards,
      summary.mastery.masteryRatio !== null ? (summary.mastery.masteryRatio * 100).toFixed(2) : '',
      monitoring.overview.totalReviews,
      monitoring.overview.totalQuizAttempts,
      monitoring.overview.overallQuizAccuracy !== null
        ? (monitoring.overview.overallQuizAccuracy * 100).toFixed(2)
        : '',
      summary.completionTime.status,
      summary.completionTime.estimatedDays ?? 0,
    ]),
  );
  lines.push('');

  lines.push(csvRow(['=== 2. REKAPITULASI CAPAIAN PER SISWA (USER PROGRESS) ===']));
  lines.push(
    csvRow([
      'ExternalUserId',
      'NamaSiswa',
      'Email',
      'Level',
      'ExperienceXP',
      'Points',
      'KartuDilacakFSRS',
      'KartuDueSaatIni',
      'TotalReviewFSRS',
      'TotalKuis',
      'KuisBenar',
      'KuisSalah',
      'AkurasiKuisPersen',
      'StreakHari',
      'TerakhirBelajar',
    ]),
  );
  for (const u of monitoring.users) {
    lines.push(
      csvRow([
        u.externalUserId,
        u.displayName ?? u.externalUserId,
        u.email ?? '',
        u.level,
        u.experience,
        u.points,
        u.trackedCards,
        u.dueCards,
        u.totalReviews,
        u.totalQuizzes,
        u.correctAnswers,
        u.wrongAnswers,
        u.quizAccuracy !== null ? (u.quizAccuracy * 100).toFixed(2) : '',
        u.currentStreak,
        u.lastStudiedAt ?? '',
      ]),
    );
  }
  lines.push('');

  lines.push(csvRow(['=== 3. STATUS PARAMETER MEMORI KARTU FSRS-5 REAL-TIME (CARD STATE) ===']));
  lines.push(
    csvRow([
      'PrioritasAntrean',
      'ExternalUserId',
      'NamaSiswa',
      'DeckMateri',
      'KosakataDepan',
      'ArtiBelakang',
      'StateFSRS',
      'RatingTerakhir',
      'StabilityHari_S',
      'Difficulty_D',
      'RetrievabilityPersen_R',
      'Reps',
      'Lapses',
      'IntervalTerjadwalHari',
      'HariBerlaluSejakReview',
      'StatusDueSaatIni',
      'WaktuReviewTerakhir',
      'JadwalDueBerikutnya',
    ]),
  );
  for (const c of monitoring.cardStates) {
    lines.push(
      csvRow([
        c.priorityRank ?? '',
        c.externalUserId,
        c.displayName ?? c.externalUserId,
        c.deckTitle,
        c.front,
        c.back,
        c.state,
        c.lastRating ?? '',
        c.stability.toFixed(4),
        c.difficulty.toFixed(4),
        (c.retrievability * 100).toFixed(2),
        c.reps,
        c.lapses,
        c.scheduledDays,
        c.elapsedDays.toFixed(3),
        c.isDue ? 'YA (DUE)' : 'BELUM DUE',
        c.lastReview ?? '',
        c.due,
      ]),
    );
  }
  lines.push('');

  lines.push(csvRow(['=== 4. RIWAYAT LOG TRANSISI PARAMETER FSRS-5 (REVIEW LOG) ===']));
  lines.push(
    csvRow([
      'WaktuReview',
      'ExternalUserId',
      'NamaSiswa',
      'DeckMateri',
      'KosakataDepan',
      'ArtiBelakang',
      'Rating',
      'StateSebelum',
      'StateSesudah',
      'StabilitySebelum_S',
      'StabilitySesudah_S',
      'DifficultySebelum_D',
      'DifficultySesudah_D',
      'RetrievabilitySaatReviewPersen_R',
      'IntervalTerjadwalHari',
      'WaktuResponsMs',
    ]),
  );
  for (const r of monitoring.recentReviews) {
    lines.push(
      csvRow([
        r.reviewedAt,
        r.externalUserId,
        r.displayName ?? r.externalUserId,
        r.deckTitle,
        r.front,
        r.back,
        r.rating,
        r.stateBefore,
        r.stateAfter,
        r.stabilityBefore.toFixed(4),
        r.stabilityAfter.toFixed(4),
        r.difficultyBefore.toFixed(4),
        r.difficultyAfter.toFixed(4),
        r.retrievability !== null ? (r.retrievability * 100).toFixed(2) : '',
        r.scheduledDays,
        r.responseTimeMs ?? '',
      ]),
    );
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
