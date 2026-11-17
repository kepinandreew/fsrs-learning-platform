import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer, { MulterError } from 'multer';
import { jwtAuth } from '../../middlewares/jwtAuth';
import { validate } from '../../middlewares/validate';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { commitSchema, generateSchema, verifyDeckSchema } from './ai.schema';
import * as service from './ai.service';

// =============================================================================
// Route AI Generator untuk Developer Dashboard (dimount di /api/dashboard/ai)
// =============================================================================

const router = Router();

// Seluruh route AI hanya boleh diakses oleh developer yang login (JWT).
router.use(jwtAuth);

// Rate limiter khusus endpoint AI agar kuota Gemini API terlindungi dari spam request.
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10, // Maksimal 10 kali generate per menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'AI_RATE_LIMITED', message: 'Terlalu banyak permintaan ke AI Generator, tunggu sebentar' },
  },
});

// Konfigurasi multer di memori (buffer) untuk menerima unggahan dokumen materi (PDF / TXT / MD).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: service.MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((service.ALLOWED_MIME as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(ApiError.badRequest(`Format berkas tidak didukung. Gunakan: ${service.ALLOWED_MIME.join(', ')}`));
    }
  },
});

// Middleware pembungkus unggahan opsional (field `document`): mendukung baik application/json maupun multipart/form-data.
const optionalDocumentUpload = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    next();
    return;
  }
  upload.single('document')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Ukuran berkas melebihi batas ${service.MAX_FILE_BYTES / 1024 / 1024} MB`
          : `Gagal mengunggah berkas: ${err.message}`;
      next(ApiError.badRequest(msg));
      return;
    }
    next(err);
  });
};

// GET /api/dashboard/ai/status - periksa apakah GEMINI_API_KEY aktif dan model apa yang dipakai.
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: service.getAiStatus() });
  }),
);

// POST /api/dashboard/ai/generate - proses teks materi bacaan (atau dokumen), panggil Gemini untuk
// membuat pasangan Flashcard & soal Multiple Choice beserta distractor, lalu langsung teruskan
// ke fungsi bulkCreateItems (kecuali jika parameter save=false).
router.post(
  '/generate',
  aiLimiter,
  optionalDocumentUpload,
  validate({ body: generateSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.generateAndSave(req.developer!.id, req.body, req.file);
    res.status(data.saved ? 201 : 200).json({ success: true, data });
  }),
);

// POST /api/dashboard/ai/commit - simpan draft hasil pratinjau/editan ke database via bulkCreateItems.
router.post(
  '/commit',
  validate({ body: commitSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.commitDraft(req.developer!.id, req.body);
    res.status(201).json({ success: true, data });
  }),
);

// POST /api/dashboard/ai/verify-deck - audit & perbaiki ejaan/bahasa/kunci jawaban pada deck eksisting.
router.post(
  '/verify-deck',
  aiLimiter,
  validate({ body: verifyDeckSchema }),
  asyncHandler(async (req, res) => {
    const data = await service.verifyExistingDeck(req.developer!.id, req.body);
    res.json({ success: true, data });
  }),
);

export default router;
