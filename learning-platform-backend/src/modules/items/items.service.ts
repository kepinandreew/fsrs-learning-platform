import { ItemType, Prisma, type LearningItem } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../utils/ApiError';
import { sha256 } from '../../utils/hash';
import { getOwnedDeck, getOwnedItem } from '../../utils/ownership';
import {
  checkChoices,
  type ClientListQuery,
  type CreateItemInput,
  type DashboardListQuery,
  type UpdateItemInput,
} from './items.schema';

// =============================================================================
// Helper
// =============================================================================

// Hash konten: berubah hanya jika isi/media berubah. Dipakai untuk menaikkan contentVersion.
function computeContentHash(i: {
  type: ItemType;
  front?: string | null;
  back?: string | null;
  question?: string | null;
  choices?: unknown;
  correctIndex?: number | null;
  imageUrl?: string | null;
  audioUrl?: string | null;
}): string {
  return sha256(
    JSON.stringify([i.type, i.front, i.back, i.question, i.choices, i.correctIndex, i.imageUrl, i.audioUrl]),
  );
}

// Soal MC boleh menunjuk flashcard sumber, tetapi flashcard itu harus ada di deck yang sama.
async function assertSourceFlashcard(sourceFlashcardId: string, deckId: string) {
  const src = await prisma.learningItem.findFirst({
    where: { id: sourceFlashcardId, deckId, type: ItemType.FLASHCARD },
    select: { id: true },
  });
  if (!src) throw ApiError.badRequest('sourceFlashcardId harus flashcard pada deck yang sama');
}

// Pilihan jawaban disimpan sebagai JSON; baca kembali sebagai array string.
const choicesOf = (item: LearningItem): string[] => (Array.isArray(item.choices) ? (item.choices as string[]) : []);

// =============================================================================
// Dashboard (developer) - CRUD bank soal
// =============================================================================

// Bangun data Prisma dari input create (tanpa appId/deckId).
function buildCreateData(input: CreateItemInput, appId: string): Prisma.LearningItemUncheckedCreateInput {
  const base = {
    appId,
    deckId: input.deckId,
    tags: input.tags,
    imageUrl: input.imageUrl ?? null,
    audioUrl: input.audioUrl ?? null,
  };

  if (input.type === 'FLASHCARD') {
    return {
      ...base,
      type: ItemType.FLASHCARD,
      front: input.front,
      back: input.back,
      contentHash: computeContentHash({ ...base, type: ItemType.FLASHCARD, front: input.front, back: input.back }),
    };
  }

  return {
    ...base,
    type: ItemType.MULTIPLE_CHOICE,
    question: input.question,
    choices: input.choices,
    correctIndex: input.correctIndex,
    explanation: input.explanation ?? null,
    sourceFlashcardId: input.sourceFlashcardId ?? null,
    contentHash: computeContentHash({
      ...base,
      type: ItemType.MULTIPLE_CHOICE,
      question: input.question,
      choices: input.choices,
      correctIndex: input.correctIndex,
    }),
  };
}

// Buat satu item pada deck milik developer.
export async function createItem(developerId: string, input: CreateItemInput) {
  const deck = await getOwnedDeck(developerId, input.deckId);
  if (input.type === 'MULTIPLE_CHOICE' && input.sourceFlashcardId) {
    await assertSourceFlashcard(input.sourceFlashcardId, deck.id);
  }
  return prisma.learningItem.create({ data: buildCreateData(input, deck.appId) });
}

// Buat banyak item sekaligus dalam satu transaksi (semua berhasil atau semua gagal).
export async function bulkCreateItems(developerId: string, inputs: CreateItemInput[]) {
  // Validasi kepemilikan tiap deck hanya sekali per deckId unik.
  const deckIds = [...new Set(inputs.map((i) => i.deckId))];
  const decks = new Map<string, string>(); // deckId -> appId
  for (const id of deckIds) decks.set(id, (await getOwnedDeck(developerId, id)).appId);

  for (const i of inputs) {
    if (i.type === 'MULTIPLE_CHOICE' && i.sourceFlashcardId) await assertSourceFlashcard(i.sourceFlashcardId, i.deckId);
  }

  return prisma.$transaction(inputs.map((i) => prisma.learningItem.create({ data: buildCreateData(i, decks.get(i.deckId)!) })));
}

// Daftar item untuk dashboard (dengan kunci jawaban), lengkap dengan pagination.
export async function listItemsForDashboard(developerId: string, q: DashboardListQuery) {
  const where: Prisma.LearningItemWhereInput = {
    app: { developerId }, // isolasi kepemilikan
    ...(q.deckId ? { deckId: q.deckId } : {}),
    ...(q.appId ? { appId: q.appId } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.includeInactive ? {} : { isActive: true }),
    // Pencarian sederhana pada teks flashcard/soal.
    ...(q.search
      ? {
          OR: [
            { front: { contains: q.search, mode: 'insensitive' } },
            { back: { contains: q.search, mode: 'insensitive' } },
            { question: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.learningItem.count({ where }),
    prisma.learningItem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return { items, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) } };
}

// Update parsial satu item. Versi konten naik hanya bila isi/media benar-benar berubah.
export async function updateItem(developerId: string, id: string, input: UpdateItemInput) {
  const item = await getOwnedItem(developerId, id);
  const isFlashcard = item.type === ItemType.FLASHCARD;

  // Tolak field yang tidak cocok dengan tipe item.
  const mcOnly = ['question', 'choices', 'correctIndex', 'explanation', 'sourceFlashcardId'] as const;
  const fcOnly = ['front', 'back'] as const;
  const forbidden = (isFlashcard ? mcOnly : fcOnly).filter(
    (k) => (input as Record<string, unknown>)[k] !== undefined,
  );
  if (forbidden.length) throw ApiError.badRequest(`Field tidak berlaku untuk tipe ${item.type}: ${forbidden.join(', ')}`);

  // Untuk MC, validasi ulang konsistensi pada hasil gabungan data lama + data baru.
  if (!isFlashcard) {
    const choices = input.choices ?? choicesOf(item);
    const correctIndex = input.correctIndex ?? item.correctIndex ?? 0;
    const msg = checkChoices(choices, correctIndex);
    if (msg) throw ApiError.badRequest(msg);
    if (input.sourceFlashcardId) await assertSourceFlashcard(input.sourceFlashcardId, item.deckId);
  }

  const merged = {
    type: item.type,
    front: input.front ?? item.front,
    back: input.back ?? item.back,
    question: input.question ?? item.question,
    choices: input.choices ?? item.choices,
    correctIndex: input.correctIndex ?? item.correctIndex,
    imageUrl: input.imageUrl !== undefined ? input.imageUrl : item.imageUrl,
    audioUrl: input.audioUrl !== undefined ? input.audioUrl : item.audioUrl,
  };
  const newHash = computeContentHash(merged);
  const contentChanged = newHash !== item.contentHash;

  return prisma.learningItem.update({
    where: { id: item.id },
    data: {
      ...input,
      choices: input.choices,
      contentHash: newHash,
      // Naikkan versi supaya client tahu cache item ini sudah usang.
      ...(contentChanged ? { contentVersion: { increment: 1 } } : {}),
    },
  });
}

// Nonaktifkan item (soft delete) agar riwayat review tetap utuh untuk analitik.
export async function deactivateItem(developerId: string, id: string) {
  const item = await getOwnedItem(developerId, id);
  await prisma.learningItem.update({ where: { id: item.id }, data: { isActive: false } });
}

// =============================================================================
// Client (API Key) - GET /api/items
// =============================================================================

// Bentuk item untuk client. PENTING: correctIndex & explanation SENGAJA disembunyikan,
// karena pencocokan jawaban dilakukan server (/api/evaluation) agar kunci tidak bocor ke client.
export function toClientItem(item: LearningItem & { deck?: { title: string } | null }) {
  const common = {
    id: item.id,
    deckId: item.deckId,
    ...(item.deck?.title ? { deckTitle: item.deck.title } : {}),
    type: item.type,
    imageUrl: item.imageUrl,
    audioUrl: item.audioUrl,
    tags: item.tags,
    contentVersion: item.contentVersion,
    updatedAt: item.updatedAt,
    isActive: item.isActive, // false = client harus menghapus item dari cache lokal (delta sync)
  };
  return item.type === ItemType.FLASHCARD
    ? { ...common, front: item.front, back: item.back }
    : {
        ...common,
        question: item.question,
        choices: choicesOf(item),
        sourceFlashcardId: item.sourceFlashcardId,
      };
}

// Daftar item untuk client: scoped ke appId dari API Key, cursor pagination, dukungan delta sync.
export async function listItemsForClient(appId: string, q: ClientListQuery) {
  const where: Prisma.LearningItemWhereInput = {
    appId, // isolasi multi-client: client hanya melihat item aplikasinya sendiri
    deck: { isActive: true },
    ...(q.deckId ? { deckId: q.deckId } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.tag ? { tags: { has: q.tag } } : {}),
    // Pada delta sync, item nonaktif ikut dikirim (isActive=false) agar client bisa menghapusnya.
    ...(q.updatedSince ? { updatedAt: { gt: q.updatedSince } } : { isActive: true }),
  };

  // Ambil limit+1 untuk mengetahui apakah masih ada halaman berikutnya.
  const rows = await prisma.learningItem.findMany({
    where,
    include: { deck: { select: { title: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  return {
    items: page.map(toClientItem),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    // Client menyimpan nilai ini sebagai `updatedSince` untuk sinkronisasi berikutnya.
    serverTime: new Date().toISOString(),
  };
}

// Detail satu item untuk client.
export async function getItemForClient(appId: string, id: string) {
  const item = await prisma.learningItem.findFirst({
    where: { id, appId, isActive: true, deck: { isActive: true } },
    include: { deck: { select: { title: true } } },
  });
  if (!item) throw ApiError.notFound('Item tidak ditemukan');
  return toClientItem(item);
}
