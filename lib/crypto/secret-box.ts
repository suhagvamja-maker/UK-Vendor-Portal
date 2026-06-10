import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Symmetric encryption for sensitive at-rest fields (bank details, TIN, DOB
 * per CLAUDE.md §14). Uses AES-256-GCM with a per-message nonce; the secret
 * is derived from APP_ENCRYPTION_KEY (or CLERK_SECRET_KEY in dev).
 *
 * Output format (all hex, colon-separated):
 *   <iv>:<authTag>:<ciphertext>
 */

function getKey(): Buffer {
  const e = env();
  // Prefer APP_ENCRYPTION_KEY (32-byte hex). Fall back to deriving from
  // CLERK_SECRET_KEY in dev so things "just work" without extra config.
  const raw = e.APP_ENCRYPTION_KEY ?? e.CLERK_SECRET_KEY;
  return createHash('sha256').update(raw).digest();
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [ivHex, tagHex, encHex] = payload.split(':');
    if (!ivHex || !tagHex || !encHex) return null;
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    console.error('[crypto] decrypt failed', err);
    return null;
  }
}

export function encryptJson<T>(obj: T): string {
  return encrypt(JSON.stringify(obj));
}

export function decryptJson<T>(payload: string | null | undefined): T | null {
  const raw = decrypt(payload);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
