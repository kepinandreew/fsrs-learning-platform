/**
 * @file modules/progress/progress.service.ts
 * @description Layanan manajemen progres gamifikasi pemain (poin, EXP, level, streak harian),
 * penggabungan atribut `clientState` lintas-gim, serta agregasi papan peringkat kompetitif.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { computeStreak } from '../../utils/streak';
import type { GetProgressQuery, LeaderboardQuery, PutProgressInput, ResetProgressQuery } from './progress.schema';

// =============================================================================
// Helper bersama (juga dipakai modul evaluation)
// =============================================================================

// Ambil user berdasarkan (appId, externalId); dibuat otomatis jika belum ada.
// Kunci unik per aplikasi menjamin isolasi antar client.
export async function ensureUser(appId: string, externalId: string, displayName?: string) {
  const maybeEmail = externalId.includes('@') ? externalId.trim().toLowerCase() : undefined;
  return prisma.user.upsert({
    where: { appId_externalId: { appId, externalId } },
    create: { appId, externalId, displayName, ...(maybeEmail ? { email: maybeEmail } : {}) },
    // Nama hanya diperbarui bila client mengirimnya.
    update: {
      ...(displayName ? { displayName } : {}),
      ...(maybeEmail ? { email: maybeEmail } : {}),
    },
  });
}

// Counter statistik yang dikelola SERVER (diturunkan dari review & kuis).
export interface ProgressIncrement {
  reviews?: number;
  quizzes?: number;
  correct?: number;
  wrong?: number;
}

// Perbarui agregat Progress (counter + streak) di dalam transaksi yang sama dengan review/kuis,
// sehingga statistik selalu konsisten dengan log.
export async function touchProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  deckId: string,
  inc: ProgressIncrement,
  now: Date,
) {
  const existing = await tx.progress.findUnique({ where: { userId_deckId: { userId, deckId } } });
  const streak = computeStreak(existing?.lastStudiedAt ?? null, now, existing?.currentStreak ?? 0, existing?.longestStreak ?? 0);

  return tx.progress.upsert({
    where: { userId_deckId: { userId, deckId } },
    create: {
      userId,
      deckId,
      totalReviews: inc.reviews ?? 0,
      totalQuizzes: inc.quizzes ?? 0,
      correctAnswers: inc.correct ?? 0,
      wrongAnswers: inc.wrong ?? 0,
      lastStudiedAt: now,
      ...streak,
    },
    update: {
      totalReviews: { increment: inc.reviews ?? 0 },
      totalQuizzes: { increment: inc.quizzes ?? 0 },
      correctAnswers: { increment: inc.correct ?? 0 },
      wrongAnswers: { increment: inc.wrong ?? 0 },
      lastStudiedAt: now,
      ...streak,
    },
  });
}

// =============================================================================
// GET /api/progress
// =============================================================================

// Bentuk progress yang dikirim ke client.
const toClientProgress = (p: {
  deckId: string;
  points: number;
  exp: number;
  level: number;
  totalReviews: number;
  totalQuizzes: number;
  correctAnswers: number;
  wrongAnswers: number;
  currentStreak: number;
  longestStreak: number;
  lastStudiedAt: Date | null;
  clientState: Prisma.JsonValue;
  updatedAt: Date | null;
}) => ({
  deckId: p.deckId,
  points: p.points,
  exp: p.exp,
  level: p.level,
  totalReviews: p.totalReviews,
  totalQuizzes: p.totalQuizzes,
  correctAnswers: p.correctAnswers,
  wrongAnswers: p.wrongAnswers,
  // Akurasi kuis keseluruhan (0..1); null bila belum ada kuis.
  quizAccuracy: p.correctAnswers + p.wrongAnswers > 0 ? p.correctAnswers / (p.correctAnswers + p.wrongAnswers) : null,
  currentStreak: p.currentStreak,
  longestStreak: p.longestStreak,
  lastStudiedAt: p.lastStudiedAt,
  clientState: p.clientState,
  // Dipakai client sebagai `ifUnmodifiedSince` pada PUT berikutnya.
  updatedAt: p.updatedAt,
});

// Nilai awal untuk deck yang belum pernah dipelajari.
const emptyProgress = (deckId: string) =>
  toClientProgress({
    deckId, points: 0, exp: 0, level: 1, totalReviews: 0, totalQuizzes: 0, correctAnswers: 0, wrongAnswers: 0,
    currentStreak: 0, longestStreak: 0, lastStudiedAt: null, clientState: null, updatedAt: null,
  });

export async function getProgress(appId: string, q: GetProgressQuery) {
  // Jika deckId diberikan, pastikan deck tersebut milik aplikasi ini.
  if (q.deckId) {
    const deck = await prisma.deck.findFirst({ where: { id: q.deckId, appId }, select: { id: true } });
    if (!deck) throw ApiError.notFound('Deck tidak ditemukan');
  }

  // User yang belum pernah muncul = belum punya progress (tidak membuat user baru pada GET).
  const user = await prisma.user.findUnique({
    where: { appId_externalId: { appId, externalId: q.externalUserId } },
    select: { id: true },
  });
  if (!user) return { progress: q.deckId ? [emptyProgress(q.deckId)] : [] };

  const rows = await prisma.progress.findMany({
    where: { userId: user.id, ...(q.deckId ? { deckId: q.deckId } : {}) },
    orderBy: { updatedAt: 'desc' },
  });

  // Jika satu deck diminta tetapi belum ada baris, kembalikan nilai awal agar client tidak perlu menangani null.
  const progress = rows.map(toClientProgress);
  if (q.deckId && progress.length === 0) progress.push(emptyProgress(q.deckId));
  return { progress };
}

// =============================================================================
// PUT /api/progress
// =============================================================================

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function mergeStarMap(prev: unknown, next: unknown): Record<string, number> | undefined {
  if (!isPlainObject(prev) && !isPlainObject(next)) return undefined;
  const merged: Record<string, number> = {};
  if (isPlainObject(prev)) {
    for (const [k, v] of Object.entries(prev)) {
      if (typeof v === 'number' && Number.isFinite(v)) merged[k] = v;
    }
  }
  if (isPlainObject(next)) {
    for (const [k, v] of Object.entries(next)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        merged[k] = Math.max(merged[k] ?? 0, v);
      }
    }
  }
  return merged;
}

// Gabungkan clientState baru ke clientState lama agar atribut lintas-game
// (mis. speciesId/petName/wins di Pet Battle & chefRank/completedRecipes/recipeStars di Baking Chef)
// tidak saling menimpa maupun mengalami regresi bintang lintas perangkat.
export function mergeClientState(
  existing: Prisma.JsonValue | null | undefined,
  incoming: unknown,
): Prisma.InputJsonValue | undefined {
  if (incoming === undefined) return undefined;
  if (isPlainObject(existing) && isPlainObject(incoming)) {
    const merged: Record<string, unknown> = { ...existing, ...incoming };
    const stars = mergeStarMap(existing.recipeStars, incoming.recipeStars);
    if (stars !== undefined) merged.recipeStars = stars;
    if (typeof existing.wins === 'number' && typeof incoming.wins === 'number') {
      merged.wins = Math.max(existing.wins, incoming.wins);
    }
    if (typeof existing.completedRecipes === 'number' && typeof incoming.completedRecipes === 'number') {
      merged.completedRecipes = Math.max(existing.completedRecipes, incoming.completedRecipes);
    }
    return merged as Prisma.InputJsonValue;
  }
  return incoming as Prisma.InputJsonValue;
}

export async function putProgress(appId: string, input: PutProgressInput) {
  // Deck harus milik aplikasi ini (isolasi multi-client).
  const deck = await prisma.deck.findFirst({ where: { id: input.deckId, appId }, select: { id: true } });
  if (!deck) throw ApiError.notFound('Deck tidak ditemukan');

  const user = await ensureUser(appId, input.externalUserId, input.displayName);

  // Cek konflik: jika client mengirim ifUnmodifiedSince tetapi server sudah lebih baru,
  // tolak dengan 409 dan sertakan data terbaru agar client bisa menggabungkan.
  const current = await prisma.progress.findUnique({ where: { userId_deckId: { userId: user.id, deckId: deck.id } } });
  if (current && input.ifUnmodifiedSince && current.updatedAt.getTime() > input.ifUnmodifiedSince.getTime()) {
    throw new ApiError(409, 'Progress di server lebih baru dari data client', 'CONFLICT', toClientProgress(current));
  }

  // Hanya field yang dikirim yang diubah. Counter & streak TIDAK bisa diubah lewat endpoint ini
  // (dikelola server dari review/kuis) supaya data analitik tidak dapat dimanipulasi client.
  const mergedState = mergeClientState(current?.clientState, input.clientState);
  const data = {
    ...(input.points !== undefined ? { points: input.points } : {}),
    ...(input.exp !== undefined ? { exp: input.exp } : {}),
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(mergedState !== undefined ? { clientState: mergedState } : {}),
  };

  const saved = await prisma.progress.upsert({
    where: { userId_deckId: { userId: user.id, deckId: deck.id } },
    create: { userId: user.id, deckId: deck.id, ...data },
    update: data,
  });
  return toClientProgress(saved);
}

// =============================================================================
// DELETE /api/progress - Reset total progress & riwayat belajar (FSRS & kuis)
// =============================================================================

export async function resetProgress(appId: string, q: ResetProgressQuery) {
  const user = await prisma.user.findUnique({
    where: { appId_externalId: { appId, externalId: q.externalUserId } },
    select: { id: true },
  });

  if (!user) {
    return {
      message: `User ${q.externalUserId} belum memiliki data di server.`,
      reset: true,
      externalUserId: q.externalUserId,
    };
  }

  // Jika deckId diberikan, pastikan deck milik aplikasi ini
  if (q.deckId) {
    const deck = await prisma.deck.findFirst({ where: { id: q.deckId, appId }, select: { id: true } });
    if (!deck) throw ApiError.notFound('Deck tidak ditemukan');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Hapus progress agregat user
    await tx.progress.deleteMany({
      where: {
        userId: user.id,
        ...(q.deckId ? { deckId: q.deckId } : {}),
      },
    });

    // 2. Cari items yang relevan
    const items = await tx.learningItem.findMany({
      where: {
        appId,
        ...(q.deckId ? { deckId: q.deckId } : {}),
      },
      select: { id: true },
    });
    const itemIds = items.map((i) => i.id);

    if (itemIds.length > 0) {
      // Hapus memory state FSRS
      await tx.cardState.deleteMany({
        where: { userId: user.id, itemId: { in: itemIds } },
      });
      // Hapus riwayat log review FSRS
      await tx.reviewLog.deleteMany({
        where: { userId: user.id, itemId: { in: itemIds } },
      });
      // Hapus riwayat percobaan kuis
      await tx.quizAttempt.deleteMany({
        where: { userId: user.id, itemId: { in: itemIds } },
      });
    }

    return {
      message: `Progress dan riwayat belajar untuk ${q.externalUserId} berhasil direset bersih dari database server!`,
      reset: true,
      externalUserId: q.externalUserId,
    };
  });
}

// =============================================================================
// GET /api/progress/leaderboard - Peringkat kompetitif lintas perangkat
// =============================================================================

export interface RawLeaderboardUser {
  externalId: string;
  displayName: string | null;
  progresses: Array<{
    points: number;
    exp: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    totalReviews: number;
    totalQuizzes: number;
    correctAnswers: number;
    wrongAnswers: number;
    clientState: Prisma.JsonValue;
    updatedAt: Date;
  }>;
}

export function rankLeaderboardUsers(users: RawLeaderboardUser[], limit: number) {
  const entries = users
    .map((u) => {
      if (u.progresses.length === 0) return null;
      // Client game menyimpan poin/EXP/level kumulatif pada baris terbaru, sedangkan counter kuis bersifat per-deck.
      let points = 0;
      let exp = 0;
      let level = 1;
      let currentStreak = 0;
      let longestStreak = 0;
      let totalReviews = 0;
      let totalQuizzes = 0;
      let correctAnswers = 0;
      let wrongAnswers = 0;
      let mergedStateObj: Record<string, unknown> = {};
      let hasStateObj = false;
      let fallbackState: Prisma.JsonValue = null;
      let updatedAt: Date | null = null;

      // Urutkan dari terlama ke terbaru agar atribut clientState tergabung utuh tanpa kehilangan data game sebelumnya.
      const chronological = [...u.progresses].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      for (const p of chronological) {
        if (p.points > points) points = p.points;
        if (p.exp > exp) exp = p.exp;
        if (p.level > level) level = p.level;
        if (p.currentStreak > currentStreak) currentStreak = p.currentStreak;
        if (p.longestStreak > longestStreak) longestStreak = p.longestStreak;
        totalReviews += p.totalReviews;
        totalQuizzes += p.totalQuizzes;
        correctAnswers += p.correctAnswers;
        wrongAnswers += p.wrongAnswers;
        if (!updatedAt || p.updatedAt > updatedAt) {
          updatedAt = p.updatedAt;
        }
        if (isPlainObject(p.clientState)) {
          mergedStateObj = mergeClientState(
            mergedStateObj as Prisma.JsonObject,
            p.clientState,
          ) as Record<string, unknown>;
          hasStateObj = true;
        } else if (p.clientState !== null) {
          fallbackState = p.clientState;
        }
      }

      const latestState: Prisma.JsonValue = hasStateObj ? (mergedStateObj as Prisma.JsonObject) : fallbackState;
      const stateObj = hasStateObj ? mergedStateObj : {};
      const wins = typeof stateObj.wins === 'number' ? stateObj.wins : 0;
      const totalAns = correctAnswers + wrongAnswers;

      return {
        externalUserId: u.externalId,
        displayName: u.displayName || u.externalId,
        points,
        exp,
        level,
        wins,
        currentStreak,
        longestStreak,
        totalReviews,
        totalQuizzes,
        correctAnswers,
        quizAccuracy: totalAns > 0 ? Math.round((correctAnswers / totalAns) * 100) / 100 : null,
        clientState: latestState,
        updatedAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  entries.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.exp !== a.exp) return b.exp - a.exp;
    return a.externalUserId.localeCompare(b.externalUserId);
  });

  return {
    leaderboard: entries.slice(0, limit).map((row, idx) => ({ rank: idx + 1, ...row })),
    totalPlayers: entries.length,
  };
}

export async function getLeaderboard(appId: string, q: LeaderboardQuery) {
  if (q.deckId) {
    const deck = await prisma.deck.findFirst({ where: { id: q.deckId, appId }, select: { id: true } });
    if (!deck) throw ApiError.notFound('Deck tidak ditemukan');
  }

  const users = await prisma.user.findMany({
    where: { appId },
    select: {
      externalId: true,
      displayName: true,
      progresses: {
        where: q.deckId ? { deckId: q.deckId } : undefined,
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  return rankLeaderboardUsers(users, q.limit);
}


