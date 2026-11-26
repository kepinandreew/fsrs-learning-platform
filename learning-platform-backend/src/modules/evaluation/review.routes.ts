import { Router } from 'express';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { dueQuerySchema, previewQuerySchema, reviewSchema } from './evaluation.schema';
import * as service from './evaluation.service';

/**
 * @file modules/evaluation/review.routes.ts
 * @description Endpoint REST API evaluasi pengulangan berjarak FSRS (`/api/review`),
 * diautentikasi menggunakan `X-API-Key` per aplikasi klien.
 */
const router = Router();
router.use(apiKeyAuth);

// POST /api/review - menerima input rating memori (AGAIN/HARD/GOOD/EASY), memprosesnya ke FSRS Engine,
// dan memperbarui jadwal interval review selanjutnya.
router.post(
  '/',
  validate({ body: reviewSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.reviewCard(req.clientApp!, req.body);
    res.status(data.duplicate ? 200 : 201).json({ success: true, data });
  }),
);

// GET /api/review - mengambil antrean kartu Flashcard yang jatuh tempo (due) + kartu baru.
router.get(
  '/',
  validate({ query: dueQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.getDueQueue(req.clientApp!, req.query as never);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  }),
);

// GET /api/review/due - alias eksplisit antrean kartu jatuh tempo.
router.get(
  '/due',
  validate({ query: dueQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.getDueQueue(req.clientApp!, req.query as never);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  }),
);

// GET /api/review/preview - pratinjau interval keempat rating FSRS (Again/Hard/Good/Easy) sebelum diklik.
router.get(
  '/preview',
  validate({ query: previewQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.previewReview(req.clientApp!, req.query as never);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  }),
);

export default router;
