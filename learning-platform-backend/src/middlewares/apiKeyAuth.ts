import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { hashApiKey } from '../utils/apiKey';
import { asyncHandler } from '../utils/asyncHandler';

// Cache singkat (30 detik) untuk mengurangi roundtrip DB pada request beruntun dari game client.
const appKeyCache = new Map<
  string,
  {
    id: string;
    developerId: string;
    name: string;
    requestRetention: number;
    exp: number;
    lastTouch: number;
  }
>();

export function clearAppKeyCache(): void {
  appKeyCache.clear();
}

/**
 * Autentikasi aplikasi client: header `X-API-Key: <key>`.
 * Mengisi `req.clientApp` sehingga seluruh query downstream wajib difilter per appId (isolasi multi-client).
 */
export const apiKeyAuth = asyncHandler(async (req, _res, next) => {
  const key = req.header('x-api-key');
  if (!key) throw ApiError.unauthorized('Header X-API-Key diperlukan');

  const keyHash = hashApiKey(key);
  const now = Date.now();
  let cached = appKeyCache.get(keyHash);

  if (!cached || cached.exp < now) {
    const app = await prisma.app.findUnique({ where: { apiKeyHash: keyHash } });
    if (!app || !app.isActive || app.revokedAt) throw ApiError.unauthorized('API Key tidak valid');
    cached = {
      id: app.id,
      developerId: app.developerId,
      name: app.name,
      requestRetention: app.requestRetention,
      exp: now + 30_000,
      lastTouch: cached?.lastTouch ?? 0,
    };
    appKeyCache.set(keyHash, cached);
  }

  req.clientApp = {
    id: cached.id,
    developerId: cached.developerId,
    name: cached.name,
    requestRetention: cached.requestRetention,
  };

  // Perbarui lastUsedAt maksimal 1x per 60 detik agar tidak membebani pooler koneksi.
  if (now - cached.lastTouch > 60_000) {
    cached.lastTouch = now;
    prisma.app.update({ where: { id: cached.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  next();
});
