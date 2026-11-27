import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { apiKeyAuth } from '../../middlewares/apiKeyAuth';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { sha256 } from '../../utils/hash';
import { renderVocabularyIllustrationSvg } from './illustrations';

// Manifest & ilustrasi aset untuk aplikasi klien (dimount di /api/assets).
const router = Router();

// GET /api/assets/illustration/:slug - ilustrasi vektor SVG kartu kosakata (publik untuk tag <img> lintas-origin).
router.get('/illustration/:slug', (req, res) => {
  const svg = renderVocabularyIllustrationSvg(req.params.slug || 'card');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/svg+xml; charset=utf-8').send(svg);
});

router.use(apiKeyAuth);

const manifestQuerySchema = z.object({ deckId: z.string().uuid().optional() });

// GET /api/assets/manifest - daftar seluruh aset multimedia (gambar/suara) yang perlu di-preload.
// Alur client: unduh manifest -> bandingkan cacheKey dengan cache lokal -> unduh hanya yang baru/berubah
// -> hapus cache untuk key yang sudah tidak ada di manifest.
router.get(
  '/manifest',
  validate({ query: manifestQuerySchema }),
  asyncHandler(async (req, res) => {
    const { deckId } = req.query as { deckId?: string };

    // Hanya item aktif milik aplikasi ini yang punya minimal satu aset media.
    const items = await prisma.learningItem.findMany({
      where: {
        appId: req.clientApp!.id,
        isActive: true,
        deck: { isActive: true },
        ...(deckId ? { deckId } : {}),
        OR: [{ imageUrl: { not: null } }, { audioUrl: { not: null } }],
      },
      select: { id: true, deckId: true, imageUrl: true, audioUrl: true, updatedAt: true },
      orderBy: { id: 'asc' }, // urutan stabil -> manifest deterministik -> ETag stabil
    });

    // Ratakan menjadi satu entri per aset. cacheKey diturunkan dari URL sehingga otomatis berubah
    // saat URL aset diganti, dan tetap sama bila aset tidak berubah.
    const assets = items.flatMap((item) => {
      const entries: Array<{ itemId: string; deckId: string; kind: 'image' | 'audio'; url: string; cacheKey: string }> = [];
      if (item.imageUrl) entries.push({ itemId: item.id, deckId: item.deckId, kind: 'image', url: item.imageUrl, cacheKey: sha256(item.imageUrl).slice(0, 16) });
      if (item.audioUrl) entries.push({ itemId: item.id, deckId: item.deckId, kind: 'audio', url: item.audioUrl, cacheKey: sha256(item.audioUrl).slice(0, 16) });
      return entries;
    });

    // manifestVersion: sidik jari seluruh manifest; jika sama dengan versi tersimpan, tidak perlu sinkron.
    const manifestVersion = sha256(assets.map((a) => `${a.itemId}:${a.kind}:${a.cacheKey}`).join('|')).slice(0, 16);

    // Body tidak memuat timestamp, jadi ETag otomatis Express stabil dan klien bisa memakai If-None-Match (304).
    res.set('Cache-Control', 'private, max-age=0, must-revalidate');
    res.json({ success: true, data: { manifestVersion, count: assets.length, assets } });
  }),
);

export default router;
