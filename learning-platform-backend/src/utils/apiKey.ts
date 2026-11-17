import { createHash, randomBytes } from 'crypto';

export const API_KEY_PREFIX = 'lp_live_';

export interface GeneratedApiKey {
  /** Key asli - hanya ditampilkan SEKALI ke developer. */
  plain: string;
  /** SHA-256 hex - disimpan di DB. */
  hash: string;
  /** Awalan untuk identifikasi di dashboard. */
  prefix: string;
}

export function hashApiKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export function generateApiKey(): GeneratedApiKey {
  const plain = API_KEY_PREFIX + randomBytes(32).toString('base64url');
  return { plain, hash: hashApiKey(plain), prefix: plain.slice(0, API_KEY_PREFIX.length + 4) };
}
