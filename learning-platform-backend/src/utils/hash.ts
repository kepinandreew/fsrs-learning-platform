import { createHash } from 'crypto';

// SHA-256 dalam format hex; dipakai untuk content hash dan cache key.
export const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');
