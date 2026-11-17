import { Router } from 'express';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { clientListQuerySchema, itemIdParamSchema } from './items.schema';
import * as service from './items.service';

// Route item untuk aplikasi client (dimount di /api/items), diautentikasi lewat X-API-Key.
const router = Router();
router.use(apiKeyAuth);

// Header cache: client boleh menyimpan salinan, tetapi wajib revalidasi.
// Express otomatis menambahkan ETag pada res.json dan membalas 304 jika If-None-Match cocok,
// sehingga client yang datanya belum berubah tidak perlu mengunduh ulang body.
const revalidate = 'private, max-age=0, must-revalidate';

// GET /api/items - tarik materi (cursor pagination, filter, dan delta sync lewat updatedSince).
router.get(
  '/',
  validate({ query: clientListQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.listItemsForClient(req.clientApp!.id, req.query as never);
    res.set('Cache-Control', revalidate);
    res.json({
      success: true,
      data: data.items,
      meta: { nextCursor: data.nextCursor, serverTime: data.serverTime },
    });
  }),
);

// GET /api/items/:id - detail satu item.
router.get(
  '/:id',
  validate({ params: itemIdParamSchema }),
  asyncHandler(async (req, res) => {
    const item = await service.getItemForClient(req.clientApp!.id, req.params.id!);
    res.set('Cache-Control', revalidate);
    res.json({ success: true, data: item });
  }),
);

export default router;
