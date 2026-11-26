/**
 * @file modules/items/items.client.routes.ts
 * @description Endpoint pengambilan materi pembelajaran (`/api/items`) khusus aplikasi klien (`X-API-Key`),
 * dilengkapi perhitungan ETag konten deterministik untuk revalidasi cepat HTTP `304 Not Modified`.
 */
import crypto from 'crypto';
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
// ETag dihitung deterministik dari isi materi (tanpa serverTime yang berubah tiap milidetik)
// sehingga If-None-Match menghasilkan 304 Not Modified sampai guru mengubah materi (v1 -> v2).
const revalidate = 'private, max-age=0, must-revalidate';

// GET /api/items - tarik materi (cursor pagination, filter, dan delta sync lewat updatedSince).
router.get(
  '/',
  validate({ query: clientListQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await service.listItemsForClient(req.clientApp!.id, req.query as never);
    const contentHash = crypto
      .createHash('sha1')
      .update(JSON.stringify({ items: data.items, nextCursor: data.nextCursor }))
      .digest('base64url');
    const etag = `W/"items-${contentHash}"`;

    res.set('Cache-Control', revalidate);
    res.set('ETag', etag);

    const ifNoneMatch = req.headers['if-none-match'];
    if (
      typeof ifNoneMatch === 'string' &&
      ifNoneMatch
        .split(',')
        .map((v) => v.trim())
        .includes(etag)
    ) {
      res.status(304).end();
      return;
    }

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
