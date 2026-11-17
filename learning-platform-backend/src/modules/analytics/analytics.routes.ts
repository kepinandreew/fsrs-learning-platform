import { Router } from 'express';
import { jwtAuth } from '../../middlewares/jwtAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  analyticsQuerySchema,
  fsrsSimulateSchema,
  monitoringQuerySchema,
  shiftDueSchema,
} from './analytics.schema';
import * as service from './analytics.service';

// Route Learning Analytics untuk Developer Dashboard (dimount di /api/dashboard/analytics).
const router = Router();

// Hanya developer yang login (JWT) yang dapat melihat analitik.
router.use(jwtAuth);

// Analitik bersifat dinamis (R berubah seiring waktu), jadi jangan di-cache.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// GET /summary - keempat metrik sekaligus.
router.get(
  '/summary',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getSummary(req.developer!.id, req.query as never) });
  }),
);

// GET /retention - Retention State (R_avg).
router.get(
  '/retention',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getRetention(req.developer!.id, req.query as never) });
  }),
);

// GET /mastery - Mastery Prediction (S >= 7 hari).
router.get(
  '/mastery',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getMastery(req.developer!.id, req.query as never) });
  }),
);

// GET /difficult-topics - kartu & sub-topik (tag) tersulit.
router.get(
  '/difficult-topics',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getDifficultTopics(req.developer!.id, req.query as never) });
  }),
);

// GET /completion-time - estimasi hari kelulusan materi.
router.get(
  '/completion-time',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getCompletionTime(req.developer!.id, req.query as never) });
  }),
);

// GET /monitoring - pemantauan data pengguna, progres belajar, status kartu FSRS, dan riwayat aktivitas.
router.get(
  '/monitoring',
  validate({ query: monitoringQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getMonitoring(req.developer!.id, req.query as never) });
  }),
);

// POST /fsrs-simulate - simulator interaktif FSRS Engine (validasi Rencana Uji Coba #2 Proposal TA).
router.post(
  '/fsrs-simulate',
  validate({ body: fsrsSimulateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: service.simulateFsrs(req.body) });
  }),
);

// POST /shift-due - simulasi majukan/kembalikan hari untuk demo kartu jatuh tempo (Due) secara live.
router.post(
  '/shift-due',
  validate({ body: shiftDueSchema }),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.shiftDueDates(req.developer!.id, req.body) });
  }),
);

// GET /export-csv - unduh laporan evaluasi lengkap berformat CSV (UTF-8 BOM, siap buka di Microsoft Excel).
router.get(
  '/export-csv',
  validate({ query: monitoringQuerySchema }),
  asyncHandler(async (req, res) => {
    const csv = await service.exportAnalyticsCsv(req.developer!.id, req.query as never);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-evaluasi-fsrs-${stamp}.csv"`);
    res.send(csv);
  }),
);

export default router;
