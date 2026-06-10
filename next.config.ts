import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; must not be bundled.
  // pdf-lib is pure JS but contains code paths Turbopack chokes on if bundled
  // inside server components — easier to mark external.
  serverExternalPackages: ['better-sqlite3', 'pdf-lib', '@react-pdf/renderer'],
  // Hide Next.js's on-screen dev indicator so it doesn't overlay the UI.
  // Build/runtime errors are still surfaced via the regular console + overlay.
  devIndicators: false,
};

export default nextConfig;
