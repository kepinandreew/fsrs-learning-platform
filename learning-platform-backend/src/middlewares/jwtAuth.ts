/**
 * @file middlewares/jwtAuth.ts
 * @description Middleware autentikasi pengajar/pengembang berbasis JSON Web Token (`Authorization: Bearer <JWT>`).
 * Memverifikasi tanda tangan token serta status aktif akun developer sebelum mengakses endpoint konsol.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

interface JwtPayload {
  sub: string;
  email: string;
}

// Cache singkat di memori (60 detik) agar tidak melakukan query DB berulang di setiap request paralel dashboard.
const devCache = new Map<string, { id: string; email: string; isActive: boolean; exp: number }>();

/** Autentikasi Developer Dashboard: header `Authorization: Bearer <JWT>`. */
export const jwtAuth = asyncHandler(async (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized('Token tidak ditemukan');

  let payload: JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET) as JwtPayload;
  } catch {
    throw ApiError.unauthorized('Token tidak valid atau kedaluwarsa');
  }

  const now = Date.now();
  let dev = devCache.get(payload.sub);
  if (!dev || dev.exp < now) {
    const row = await prisma.developer.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true },
    });
    if (!row || !row.isActive) throw ApiError.unauthorized('Akun developer tidak aktif');
    dev = { ...row, exp: now + 60_000 };
    devCache.set(payload.sub, dev);
  } else if (!dev.isActive) {
    throw ApiError.unauthorized('Akun developer tidak aktif');
  }

  req.developer = { id: dev.id, email: dev.email };
  next();
});
