import { Router } from 'express';
import { jwtAuth } from '../../middlewares/jwtAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { getOwnedItem } from '../../utils/ownership';
import {
  bulkCreateItemsSchema,
  createItemSchema,
  dashboardListQuerySchema,
  itemIdParamSchema,
  updateItemSchema,
} from './items.schema';
import * as service from './items.service';

// Route bank soal untuk Developer Dashboard (dimount di /api/dashboard/items).
const router = Router();

// Seluruh route di sini hanya untuk developer yang login (JWT).
router.use(jwtAuth);

// Daftar item (dengan kunci jawaban) + pagination + filter.
router.get(
  '/',
  validate({ query: dashboardListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, meta } = await service.listItemsForDashboard(req.developer!.id, req.query as never);
    res.json({ success: true, data: items, meta });
  }),
);

// Buat satu item (Flashcard atau Multiple Choice).
router.post(
  '/',
  validate({ body: createItemSchema }),
  asyncHandler(async (req, res) => {
    const item = await service.createItem(req.developer!.id, req.body);
    res.status(201).json({ success: true, data: item });
  }),
);

// Buat banyak item sekaligus (mis. hasil AI Generator).
router.post(
  '/bulk',
  validate({ body: bulkCreateItemsSchema }),
  asyncHandler(async (req, res) => {
    const items = await service.bulkCreateItems(req.developer!.id, req.body.items);
    res.status(201).json({ success: true, data: items, meta: { created: items.length } });
  }),
);

// Detail satu item.
router.get(
  '/:id',
  validate({ params: itemIdParamSchema }),
  asyncHandler(async (req, res) => {
    const item = await getOwnedItem(req.developer!.id, req.params.id!);
    res.json({ success: true, data: item });
  }),
);

// Update parsial satu item.
router.patch(
  '/:id',
  validate({ params: itemIdParamSchema, body: updateItemSchema }),
  asyncHandler(async (req, res) => {
    const item = await service.updateItem(req.developer!.id, req.params.id!, req.body);
    res.json({ success: true, data: item });
  }),
);

// Nonaktifkan item (soft delete).
router.delete(
  '/:id',
  validate({ params: itemIdParamSchema }),
  asyncHandler(async (req, res) => {
    await service.deactivateItem(req.developer!.id, req.params.id!);
    res.status(204).send();
  }),
);

export default router;
