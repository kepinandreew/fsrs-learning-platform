import { ItemType } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { jwtAuth } from '../../middlewares/jwtAuth';
import { validate } from '../../middlewares/validate';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { sha256 } from '../../utils/hash';
import { getOwnedApp, getOwnedDeck } from '../../utils/ownership';
import { checkChoices } from '../items/items.schema';
import {
  createDeckSchema,
  deckIdParamSchema,
  importDeckSchema,
  listDecksQuerySchema,
  updateDeckSchema,
} from './decks.schema';

const router = Router();

// Seluruh route deck hanya untuk developer yang login (JWT).
router.use(jwtAuth);

// Daftar deck milik developer, beserta jumlah item aktif per deck.
router.get(
  '/',
  validate({ query: listDecksQuerySchema }),
  asyncHandler(async (req, res) => {
    const { appId, includeInactive } = req.query as { appId?: string; includeInactive?: boolean };
    const decks = await prisma.deck.findMany({
      // Filter lewat relasi app memastikan hanya deck milik developer ini yang muncul.
      where: {
        app: { developerId: req.developer!.id },
        ...(appId ? { appId } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: { _count: { select: { learningItems: { where: { isActive: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: decks });
  }),
);

// Buat deck baru pada salah satu aplikasi milik developer.
router.post(
  '/',
  validate({ body: createDeckSchema }),
  asyncHandler(async (req, res) => {
    // Pastikan appId memang milik developer (404 jika bukan).
    await getOwnedApp(req.developer!.id, req.body.appId);
    const deck = await prisma.deck.create({ data: req.body });
    res.status(201).json({ success: true, data: deck });
  }),
);

// Detail satu deck.
router.get(
  '/:id',
  validate({ params: deckIdParamSchema }),
  asyncHandler(async (req, res) => {
    const deck = await getOwnedDeck(req.developer!.id, req.params.id!);
    res.json({ success: true, data: deck });
  }),
);

// Ubah judul / deskripsi / status aktif deck.
router.patch(
  '/:id',
  validate({ params: deckIdParamSchema, body: updateDeckSchema }),
  asyncHandler(async (req, res) => {
    const deck = await getOwnedDeck(req.developer!.id, req.params.id!);
    const updated = await prisma.deck.update({ where: { id: deck.id }, data: req.body });
    res.json({ success: true, data: updated });
  }),
);

// Nonaktifkan deck (soft delete). Sengaja TIDAK menghapus permanen supaya riwayat review
// (ReviewLog/CardState) yang menjadi dasar learning analytics tidak ikut hilang.
router.delete(
  '/:id',
  validate({ params: deckIdParamSchema }),
  asyncHandler(async (req, res) => {
    const deck = await getOwnedDeck(req.developer!.id, req.params.id!);
    await prisma.deck.update({ where: { id: deck.id }, data: { isActive: false } });
    res.status(204).send();
  }),
);

// Ekspor seluruh materi aktif dalam satu deck sebagai paket portabel (termasuk tautan Flashcard -> Kuis).
router.get(
  '/:id/export',
  validate({ params: deckIdParamSchema }),
  asyncHandler(async (req, res) => {
    const deck = await getOwnedDeck(req.developer!.id, req.params.id!);
    const rows = await prisma.learningItem.findMany({
      where: { deckId: deck.id, isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const frontById = new Map(
      rows.filter((r) => r.type === ItemType.FLASHCARD).map((r) => [r.id, r.front ?? '']),
    );
    const items = rows.map((r) =>
      r.type === ItemType.FLASHCARD
        ? {
            type: 'FLASHCARD' as const,
            tempId: r.id,
            front: r.front ?? '',
            back: r.back ?? '',
            tags: r.tags,
            imageUrl: r.imageUrl,
            audioUrl: r.audioUrl,
          }
        : {
            type: 'MULTIPLE_CHOICE' as const,
            sourceTempId: r.sourceFlashcardId,
            sourceFront: r.sourceFlashcardId ? (frontById.get(r.sourceFlashcardId) ?? null) : null,
            question: r.question ?? '',
            choices: Array.isArray(r.choices) ? (r.choices as string[]) : [],
            correctIndex: r.correctIndex ?? 0,
            explanation: r.explanation,
            tags: r.tags,
            imageUrl: r.imageUrl,
            audioUrl: r.audioUrl,
          },
    );
    res.json({
      success: true,
      data: {
        version: 1,
        exportedAt: new Date().toISOString(),
        deck: { id: deck.id, title: deck.title, description: deck.description },
        counts: {
          flashcards: items.filter((i) => i.type === 'FLASHCARD').length,
          quizzes: items.filter((i) => i.type === 'MULTIPLE_CHOICE').length,
          total: items.length,
        },
        items,
      },
    });
  }),
);

// Impor massal Flashcard & Pilihan Ganda ke dalam satu deck secara transaksional.
router.post(
  '/:id/import',
  validate({ params: deckIdParamSchema, body: importDeckSchema }),
  asyncHandler(async (req, res) => {
    const deck = await getOwnedDeck(req.developer!.id, req.params.id!);
    const rawItems = req.body.items as Array<
      | {
          type: 'FLASHCARD';
          tempId?: string;
          front: string;
          back: string;
          tags: string[];
          imageUrl?: string | null;
          audioUrl?: string | null;
        }
      | {
          type: 'MULTIPLE_CHOICE';
          sourceTempId?: string | null;
          sourceFront?: string | null;
          question: string;
          choices: string[];
          correctIndex: number;
          explanation?: string | null;
          tags: string[];
          imageUrl?: string | null;
          audioUrl?: string | null;
        }
    >;

    for (const it of rawItems) {
      if (it.type === 'MULTIPLE_CHOICE') {
        const err = checkChoices(it.choices, it.correctIndex);
        if (err) throw ApiError.badRequest(err);
      }
    }

    const existingFlashcards = await prisma.learningItem.findMany({
      where: { deckId: deck.id, type: ItemType.FLASHCARD, isActive: true },
      select: { id: true, front: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const idByTemp = new Map<string, string>();
      const idByFront = new Map<string, string>();
      for (const fc of existingFlashcards) {
        if (fc.front) idByFront.set(fc.front.trim().toLowerCase(), fc.id);
      }

      let fcCount = 0;
      let qzCount = 0;

      for (const it of rawItems) {
        if (it.type !== 'FLASHCARD') continue;
        const created = await tx.learningItem.create({
          data: {
            appId: deck.appId,
            deckId: deck.id,
            type: ItemType.FLASHCARD,
            front: it.front,
            back: it.back,
            tags: it.tags ?? [],
            imageUrl: it.imageUrl ?? null,
            audioUrl: it.audioUrl ?? null,
            contentHash: sha256(
              JSON.stringify([
                ItemType.FLASHCARD,
                it.front,
                it.back,
                null,
                null,
                null,
                it.imageUrl ?? null,
                it.audioUrl ?? null,
              ]),
            ),
          },
        });
        fcCount += 1;
        if (it.tempId) idByTemp.set(it.tempId, created.id);
        idByFront.set(it.front.trim().toLowerCase(), created.id);
      }

      for (const it of rawItems) {
        if (it.type !== 'MULTIPLE_CHOICE') continue;
        const linkedId =
          (it.sourceTempId && idByTemp.get(it.sourceTempId)) ||
          (it.sourceFront && idByFront.get(it.sourceFront.trim().toLowerCase())) ||
          null;
        await tx.learningItem.create({
          data: {
            appId: deck.appId,
            deckId: deck.id,
            type: ItemType.MULTIPLE_CHOICE,
            question: it.question,
            choices: it.choices,
            correctIndex: it.correctIndex,
            explanation: it.explanation ?? null,
            sourceFlashcardId: linkedId,
            tags: it.tags ?? [],
            imageUrl: it.imageUrl ?? null,
            audioUrl: it.audioUrl ?? null,
            contentHash: sha256(
              JSON.stringify([
                ItemType.MULTIPLE_CHOICE,
                null,
                null,
                it.question,
                it.choices,
                it.correctIndex,
                it.imageUrl ?? null,
                it.audioUrl ?? null,
              ]),
            ),
          },
        });
        qzCount += 1;
      }

      return { flashcards: fcCount, quizzes: qzCount, total: fcCount + qzCount };
    });

    res.status(201).json({ success: true, data: { counts: result } });
  }),
);

export default router;
