import { ItemType } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { asyncHandler } from '../../utils/asyncHandler';

// Route daftar deck untuk aplikasi client (dimount di /api/decks), diautentikasi lewat X-API-Key.
const router = Router();
router.use(apiKeyAuth);

// GET /api/decks - daftar deck aktif milik aplikasi client ini beserta jumlah Flashcard & Multiple Choice.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const appId = req.clientApp!.id;

    const [decks, groupedCounts] = await Promise.all([
      prisma.deck.findMany({
        where: { appId, isActive: true },
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.learningItem.groupBy({
        by: ['deckId', 'type'],
        where: { appId, isActive: true, deck: { isActive: true } },
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map<string, { flashcards: number; multipleChoice: number }>();
    for (const g of groupedCounts) {
      const entry = countMap.get(g.deckId) ?? { flashcards: 0, multipleChoice: 0 };
      if (g.type === ItemType.FLASHCARD) entry.flashcards += g._count._all;
      if (g.type === ItemType.MULTIPLE_CHOICE) entry.multipleChoice += g._count._all;
      countMap.set(g.deckId, entry);
    }

    const data = decks.map((d) => {
      const counts = countMap.get(d.id) ?? { flashcards: 0, multipleChoice: 0 };
      return {
        ...d,
        counts: {
          total: counts.flashcards + counts.multipleChoice,
          flashcards: counts.flashcards,
          multipleChoice: counts.multipleChoice,
        },
      };
    });

    res.json({ success: true, data });
  }),
);

export default router;
