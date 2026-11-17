import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

interface JwtPayload {
  sub: string;
  email: string;
}

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

  const dev = await prisma.developer.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, isActive: true },
  });
  if (!dev || !dev.isActive) throw ApiError.unauthorized('Akun developer tidak aktif');

  req.developer = { id: dev.id, email: dev.email };
  next();
});
