import { NextResponse, type NextRequest } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { requireUser } from '@/lib/auth/require';
import { findSubmissionById } from '@/lib/repo/submissions';
import { findVendorByUserId, findVendorById } from '@/lib/repo/vendors';
import { readUploadAbsolute } from '@/lib/repo/storage';

/**
 * Auth-gated file read. Handles two URL shapes:
 *  - /api/uploads/<submissionId>/<filename>          → submission docs
 *  - /api/uploads/profile/<vendorId>/<filename>      → vendor-profile docs
 *
 * Permissions:
 *  - Internal users (admin/finance) can read anything.
 *  - Vendors can read their own submission docs AND their own profile docs.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  if (!path || path.length === 0) return new NextResponse('Not found', { status: 404 });

  let user;
  try {
    user = await requireUser();
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const storagePath = path.join('/');
  const located = readUploadAbsolute(storagePath);
  if (!located) return new NextResponse('Not found', { status: 404 });

  // Authorization per scope.
  if (located.scope === 'submission') {
    const submission = findSubmissionById(located.ownerId);
    if (!submission) return new NextResponse('Not found', { status: 404 });
    if (user.role === 'vendor') {
      const vendor = findVendorByUserId(user.appUserId);
      if (!vendor || vendor.id !== submission.vendorId) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }
  } else {
    // profile scope: ownerId is a vendorId
    if (user.role === 'vendor') {
      const vendor = findVendorByUserId(user.appUserId);
      if (!vendor || vendor.id !== located.ownerId) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    } else {
      // Sanity: vendor must exist for this id; otherwise 404.
      const v = findVendorById(located.ownerId);
      if (!v) return new NextResponse('Not found', { status: 404 });
    }
  }

  const stat = statSync(located.absolutePath);
  const stream = Readable.toWeb(createReadStream(located.absolutePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      'content-type': located.mime,
      'content-length': String(stat.size),
      'content-disposition': `inline; filename="${located.filename}"`,
      'cache-control': 'private, max-age=300',
    },
  });
}
