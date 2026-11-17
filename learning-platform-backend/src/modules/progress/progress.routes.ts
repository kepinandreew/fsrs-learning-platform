import { Router } from 'express';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getProgressQuerySchema, leaderboardQuerySchema, putProgressSchema, resetProgressQuerySchema } from './progress.schema';
import * as service from './progress.service';

// Route progress untuk aplikasi client (dimount di /api/progress), diautentikasi lewat X-API-Key.
const router = Router();
router.use(apiKeyAuth);

// GET /api/progress/leaderboard - peringkat poin & EXP seluruh pemain di aplikasi ini.
router.get(
  '/leaderboard',
  validate({ query: leaderboardQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.getLeaderboard(req.clientApp!.id, req.query as never);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  }),
);

// GET /api/progress - ambil progress user (semua deck, atau satu deck lewat ?deckId=).
router.get(
  '/',
  validate({ query: getProgressQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.getProgress(req.clientApp!.id, req.query as never);
    // Data user bersifat dinamis; jangan di-cache oleh perantara.
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  }),
);

// PUT /api/progress - sinkronisasi poin, EXP, level, dan state client.
router.put(
  '/',
  validate({ body: putProgressSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.putProgress(req.clientApp!.id, req.body);
    res.json({ success: true, data });
  }),
);

// DELETE /api/progress - reset total progress & riwayat belajar (FSRS & kuis)
router.delete(
  '/',
  validate({ query: resetProgressQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.resetProgress(req.clientApp!.id, req.query as never);
    res.json({ success: true, data });
  }),
);


export default router;
