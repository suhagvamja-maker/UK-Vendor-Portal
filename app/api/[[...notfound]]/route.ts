import { NextResponse } from 'next/server';

/**
 * Catch-all for `/api/*` paths that no other route handler matches.
 * Returns a clean JSON 404 — per OWASP REST Security Cheat Sheet and the
 * API9:2023 Improper Inventory Management category.
 *
 * Why this exists:
 *   Without it, Next.js renders its HTML 404 page (Content-Type: text/html,
 *   status 200 from the browser's perspective when streamed). Two problems:
 *     1. Security scanners interpret "200 + HTML body" as "endpoint exists
 *        and may be leaking data" — false positives flood the report.
 *     2. CVE-2025-29927 / CVE-2024-51479 allow attackers to skip Next.js
 *        middleware. If they probe undefined endpoints, they shouldn't get
 *        positive signals (HTML 200) that hint at the API surface.
 *
 * Static and specific dynamic routes (e.g. /api/exports, /api/uploads/[...path])
 * win over this catch-all in Next.js routing, so this only fires for genuinely
 * undefined paths.
 */
const NOT_FOUND_BODY = { error: 'Not Found' };

function notFound() {
  return NextResponse.json(NOT_FOUND_BODY, {
    status: 404,
    headers: {
      // Belt-and-braces: explicit content-type so the scanner cannot
      // misclassify this as HTML even if the JSON helper changes.
      'content-type': 'application/json',
      // Don't let the response sit in any CDN — these are probes, not data.
      'cache-control': 'no-store',
    },
  });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
