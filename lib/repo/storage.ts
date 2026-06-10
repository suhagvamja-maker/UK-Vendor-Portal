import path from 'node:path';
import fs from 'node:fs';

/**
 * Local filesystem storage adapter. Dev-only.
 *
 * Layout:
 *   submissions: .data/uploads/<submissionId>/<docCode>_v<n>.<ext>
 *   profile docs: .data/uploads/profile/<vendorId>/<docCode>_v<n>.<ext>
 *
 * The DB stores `file_url` as the relative path; reads go through
 * /api/uploads/[...path]/route.ts which enforces auth.
 *
 * Swap path: in production, replace these helpers to upload to Supabase
 * Storage and return the storage path. The auth-gated read handler can
 * fetch a signed URL instead of streaming from disk.
 */

const UPLOADS_DIR = path.join(process.cwd(), '.data', 'uploads');
const PROFILE_PREFIX = 'profile';

function safeSegment(s: string) {
  if (s.includes('..') || s.includes('/') || s.includes('\\')) {
    throw new Error(`Invalid path segment: ${s}`);
  }
  return s;
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function extFromMime(mime: string) {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'bin';
}

export interface SaveResult {
  storagePath: string; // relative to UPLOADS_DIR — what we store in DB
  sizeBytes: number;
}

/** Save a submission-scoped upload. */
export async function saveUpload(args: {
  submissionId: string;
  docCode: string;
  version: number;
  mime: string;
  buffer: Buffer;
}): Promise<SaveResult> {
  const sid = safeSegment(args.submissionId);
  const code = safeSegment(args.docCode);
  const dir = path.join(UPLOADS_DIR, sid);
  ensureDir(dir);
  const filename = `${code}_v${args.version}.${extFromMime(args.mime)}`;
  fs.writeFileSync(path.join(dir, filename), args.buffer);
  return { storagePath: `${sid}/${filename}`, sizeBytes: args.buffer.length };
}

/** Save a vendor-profile upload (not tied to any submission). */
export async function saveVendorUpload(args: {
  vendorId: string;
  docCode: string;
  version: number;
  mime: string;
  buffer: Buffer;
}): Promise<SaveResult> {
  const vid = safeSegment(args.vendorId);
  const code = safeSegment(args.docCode);
  const dir = path.join(UPLOADS_DIR, PROFILE_PREFIX, vid);
  ensureDir(dir);
  const filename = `${code}_v${args.version}.${extFromMime(args.mime)}`;
  fs.writeFileSync(path.join(dir, filename), args.buffer);
  return { storagePath: `${PROFILE_PREFIX}/${vid}/${filename}`, sizeBytes: args.buffer.length };
}

export interface ResolvedRead {
  absolutePath: string;
  mime: string;
  /** 'submission' or 'profile' — drives auth checks in the route handler. */
  scope: 'submission' | 'profile';
  /** Owning submissionId (scope='submission') or vendorId (scope='profile'). */
  ownerId: string;
  filename: string;
}

export function readUploadAbsolute(storagePath: string): ResolvedRead | null {
  const parts = storagePath.split('/').map(safeSegment);
  let scope: 'submission' | 'profile';
  let ownerId: string;
  let filename: string;
  if (parts[0] === PROFILE_PREFIX && parts.length === 3) {
    scope = 'profile';
    ownerId = parts[1];
    filename = parts[2];
  } else if (parts.length === 2) {
    scope = 'submission';
    ownerId = parts[0];
    filename = parts[1];
  } else {
    return null;
  }
  const full = path.join(UPLOADS_DIR, ...parts);
  if (!fs.existsSync(full)) return null;
  const ext = path.extname(filename).slice(1);
  const mime =
    ext === 'pdf' ? 'application/pdf' :
    ext === 'jpg' ? 'image/jpeg' :
    ext === 'png' ? 'image/png' :
    'application/octet-stream';
  return { absolutePath: full, mime, scope, ownerId, filename };
}
