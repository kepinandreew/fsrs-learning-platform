import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { hashApiKey } from '../utils/apiKey';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Autentikasi aplikasi client: header `X-API-Key: <key>`.
 * Mengisi `req.clientApp` sehingga seluruh query downstream wajib difilter per appId (isolasi multi-client).
 */
export const apiKeyAuth = asyncHandler(async (req, _res, next) => {
  const key = req.header('x-api-key');
  if (!key) throw ApiError.unauthorized('Header X-API-Key diperlukan');

  const app = await prisma.app.findUnique({ where: { apiKeyHash: hashApiKey(key) } });
  if (!app || !app.isActive || app.revokedAt) throw ApiError.unauthorized('API Key tidak valid');

  req.clientApp = {
    id: app.id,
    developerId: app.developerId,
    name: app.name,
    requestRetention: app.requestRetention,
  };

  // Tidak di-await agar tidak menambah latensi request.
  prisma.app.update({ where: { id: app.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  next();
});
