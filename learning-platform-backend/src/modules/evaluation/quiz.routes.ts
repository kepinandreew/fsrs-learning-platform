import { Router } from 'express';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { quizSchema } from './evaluation.schema';
import * as service from './evaluation.service';

// Route alias langsung evaluasi Multiple Choice (/api/quiz) dengan autentikasi X-API-Key.
const router = Router();
router.use(apiKeyAuth);

// POST /api/quiz - evaluasi jawaban tebakan Multiple Choice secara mutlak (tanpa jadwal FSRS).
router.post(
  '/',
  validate({ body: quizSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.answerQuiz(req.clientApp!, req.body);
    res.status(data.duplicate ? 200 : 201).json({ success: true, data });
  }),
);

export default router;
