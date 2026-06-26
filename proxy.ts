import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/inngest(.*)',
  '/api/webhooks/(.*)',
]);

const isApi = createRouteMatcher(['/api/(.*)']);

/**
 * Page routes: require a Clerk session (redirect unauthenticated visitors
 * to /sign-in). Role-based gating (vendor → /vendor, admin → /admin,
 * finance → /finance) lives in lib/auth/require.ts so we can use the
 * SQLite-synced role rather than guessing from Clerk metadata in middleware.
 *
 * API routes (/api/*): defense-in-depth — middleware DOES NOT enforce auth.
 * Each route handler is responsible for calling requireRole / requireUser
 * inside a try/catch and returning the appropriate status code.
 *
 * Why: CVE-2025-29927 (and CVE-2024-51479) let attackers skip Next.js
 * middleware via crafted headers. Middleware-only auth would silently fail
 * open on those exploits. Handlers MUST validate auth themselves.
 *
 * Side benefit: undefined /api/* paths fall through to the catch-all at
 * app/api/[...notfound]/route.ts and return a proper 404 (OWASP REST
 * Security Cheat Sheet, API9:2023). That stops security scanners from
 * receiving "200 HTML" signals on every probe.
 *
 * Strict rule: any NEW /api/* route MUST enforce its own auth. There is
 * no middleware safety net for these routes.
 */
/**
 * Reconstruct the visitor-facing URL from forwarded headers. Next.js's
 * built-in `req.url` uses `HOSTNAME` / `PORT` (which we set to 127.0.0.1:3002
 * so the listener binds to loopback only). Without this fix, post-sign-in
 * redirects would send the browser to `localhost:3002` and break login.
 */
function publicUrlOf(req: Request): string {
  const orig = new URL(req.url);
  const fwdHostRaw = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? orig.host;
  // Strip any port from the forwarded host — production traffic is on
  // standard 80/443 via the ALB; internal :3002 must never leak into URLs.
  const fwdHost = fwdHostRaw.split(':')[0];
  // Treat localhost / 127.x as "no good public hostname" and fall back to original.
  const safeHost = (fwdHost === 'localhost' || fwdHost.startsWith('127.'))
    ? orig.hostname
    : fwdHost;
  const fwdProto = (req.headers.get('x-forwarded-proto') ?? orig.protocol.replace(':', '')).split(',')[0].trim();
  // Rebuild from scratch so any stale port from the loopback listener is dropped.
  return `${fwdProto}://${safeHost}${orig.pathname}${orig.search}`;
}

export const proxy = clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  // /api/* routes self-enforce — let them through. Catch-all returns 404
  // for undefined ones; defined handlers return 401/403 on auth failure.
  if (isApi(req)) return;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: publicUrlOf(req) });
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
