import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { jwtAuth } from '../../middlewares/jwtAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getOwnedApp, getOwnedDeck } from '../../utils/ownership';
import { createDeckSchema, deckIdParamSchema, listDecksQuerySchema, updateDeckSchema } from './decks.schema';

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

export default router;
