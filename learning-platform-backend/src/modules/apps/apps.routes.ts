import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { clearAppKeyCache } from '../../middlewares/apiKeyAuth';
import { jwtAuth } from '../../middlewares/jwtAuth';
import { validate } from '../../middlewares/validate';
import { ApiError } from '../../utils/ApiError';
import { generateApiKey } from '../../utils/apiKey';
import { asyncHandler } from '../../utils/asyncHandler';
import { appIdParamSchema, createAppSchema, updateAppSchema } from './apps.schema';

const router = Router();
router.use(jwtAuth);

const appSelect = {
  id: true,
  name: true,
  description: true,
  apiKeyPrefix: true,
  isActive: true,
  requestRetention: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  _count: {
    select: {
      decks: { where: { isActive: true } },
      users: true,
      learningItems: { where: { isActive: true } },
    },
  },
} as const;

// Daftar aplikasi milik developer
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const apps = await prisma.app.findMany({
      where: { developerId: req.developer!.id },
      select: appSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: apps });
  }),
);

// Daftarkan aplikasi baru + terbitkan API Key (ditampilkan sekali)
router.post(
  '/',
  validate({ body: createAppSchema }),
  asyncHandler(async (req, res) => {
    const key = generateApiKey();
    const app = await prisma.app.create({
      data: { ...req.body, developerId: req.developer!.id, apiKeyHash: key.hash, apiKeyPrefix: key.prefix },
      select: appSelect,
    });
    res.status(201).json({ success: true, data: { app, apiKey: key.plain } });
  }),
);

// Perbarui profil aplikasi & target retensi FSRS
router.patch(
  '/:id',
  validate({ params: appIdParamSchema, body: updateAppSchema }),
  asyncHandler(async (req, res) => {
    const found = await prisma.app.findFirst({ where: { id: req.params.id!, developerId: req.developer!.id } });
    if (!found) throw ApiError.notFound('Aplikasi tidak ditemukan');
    const data = {
      ...req.body,
      ...(req.body.isActive === true ? { revokedAt: null } : {}),
    };
    const app = await prisma.app.update({
      where: { id: found.id },
      data,
      select: appSelect,
    });
    clearAppKeyCache();
    res.json({ success: true, data: app });
  }),
);

// Rotasi API Key (key lama langsung tidak berlaku)
router.post(
  '/:id/rotate-key',
  validate({ params: appIdParamSchema }),
  asyncHandler(async (req, res) => {
    const found = await prisma.app.findFirst({ where: { id: req.params.id!, developerId: req.developer!.id } });
    if (!found) throw ApiError.notFound('Aplikasi tidak ditemukan');
    const key = generateApiKey();
    const app = await prisma.app.update({
      where: { id: found.id },
      data: { apiKeyHash: key.hash, apiKeyPrefix: key.prefix, revokedAt: null, isActive: true },
      select: appSelect,
    });
    clearAppKeyCache();
    res.json({ success: true, data: { app, apiKey: key.plain } });
  }),
);

// Cabut API Key
router.post(
  '/:id/revoke',
  validate({ params: appIdParamSchema }),
  asyncHandler(async (req, res) => {
    const found = await prisma.app.findFirst({ where: { id: req.params.id!, developerId: req.developer!.id } });
    if (!found) throw ApiError.notFound('Aplikasi tidak ditemukan');
    const app = await prisma.app.update({
      where: { id: found.id },
      data: { isActive: false, revokedAt: new Date() },
      select: appSelect,
    });
    clearAppKeyCache();
    res.json({ success: true, data: app });
  }),
);

// Hapus permanen aplikasi. Pengaman: hanya boleh bila aplikasi masih kosong (tanpa materi & tanpa riwayat belajar),
// supaya data analitik yang menjadi dasar evaluasi tidak hilang tanpa sengaja.
router.delete(
  '/:id',
  validate({ params: appIdParamSchema }),
  asyncHandler(async (req, res) => {
    const found = await prisma.app.findFirst({ where: { id: req.params.id!, developerId: req.developer!.id } });
    if (!found) throw ApiError.notFound('Aplikasi tidak ditemukan');

    const [items, cards, reviews, quizzes] = await Promise.all([
      prisma.learningItem.count({ where: { appId: found.id } }),
      prisma.cardState.count({ where: { user: { appId: found.id } } }),
      prisma.reviewLog.count({ where: { user: { appId: found.id } } }),
      prisma.quizAttempt.count({ where: { user: { appId: found.id } } }),
    ]);
    if (items + cards + reviews + quizzes > 0) {
      throw new ApiError(
        409,
        'Aplikasi sudah memiliki materi atau riwayat belajar. Gunakan "Cabut" untuk menonaktifkan saja.',
        'APP_NOT_EMPTY',
      );
    }

    await prisma.app.delete({ where: { id: found.id } });
    clearAppKeyCache();
    res.status(204).send();
  }),
);

export default router;
