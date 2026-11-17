import { Router } from 'express';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { dueQuerySchema, previewQuerySchema, quizSchema, reviewSchema } from './evaluation.schema';
import * as service from './evaluation.service';

// Route evaluation untuk aplikasi client (dimount di /api/evaluation), diautentikasi lewat X-API-Key.
const router = Router();
router.use(apiKeyAuth);

// POST /api/evaluation/review - proses rating FSRS (AGAIN/HARD/GOOD/EASY) dan perbarui jadwal review.
router.post(
  '/review',
  validate({ body: reviewSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.reviewCard(req.clientApp!, req.body);
    // 200 untuk hasil ulang (duplikat), 201 untuk review baru.
    res.status(data.duplicate ? 200 : 201).json({ success: true, data });
  }),
);

// POST /api/evaluation/quiz - cocokkan jawaban pilihan ganda di server (evaluasi mutlak).
router.post(
  '/quiz',
  validate({ body: quizSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.answerQuiz(req.clientApp!, req.body);
    res.status(data.duplicate ? 200 : 201).json({ success: true, data });
  }),
);

// GET /api/evaluation/due - antrean kartu jatuh tempo + kartu baru.
router.get(
  '/due',
  validate({ query: dueQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.getDueQueue(req.clientApp!, req.query as never);
    // Antrean berubah tiap saat; jangan di-cache.
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  }),
);

// GET /api/evaluation/preview - pratinjau interval 4 tombol rating FSRS (Again, Hard, Good, Easy).
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
