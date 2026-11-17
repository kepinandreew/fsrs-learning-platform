import rateLimit from 'express-rate-limit';

const message = {
  success: false,
  error: { code: 'RATE_LIMITED', message: 'Terlalu banyak request, coba lagi nanti' },
};

/** Pembatas umum untuk seluruh API. */
export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message });

/** Lebih ketat untuk login/register agar tahan brute force. */
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message });
