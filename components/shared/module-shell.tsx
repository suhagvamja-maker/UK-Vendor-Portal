import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import type { AppRole } from '@/types/roles';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/ui/toast';

interface NavItem {
  href: string;
  label: string;
  ownerOnly?: boolean;
}

const MODULES: Record<AppRole, { label: string; nav: NavItem[]; accent: string; ring: string; dot: string }> = {
  vendor: {
    label: 'Vendor',
    accent: 'text-blue-600',
    ring: 'ring-blue-200',
    dot: 'bg-blue-500',
    nav: [
      { href: '/vendor/dashboard',        label: 'Dashboard' },
      { href: '/vendor/submissions/new',  label: 'New submission' },
      { href: '/vendor/profile',          label: 'Profile' },
    ],
  },
  admin: {
    label: 'Admin · HOD',
    accent: 'text-amber-700',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
    nav: [
      { href: '/admin/invoices', label: 'Invoices' },
      { href: '/admin/team',     label: 'Team', ownerOnly: true },
    ],
  },
  finance: {
    label: 'Finance',
    accent: 'text-emerald-700',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
    nav: [
      { href: '/finance/invoices', label: 'Invoices' },
      { href: '/finance/payments', label: 'Payments' },
      { href: '/finance/exports',  label: 'Exports' },
      { href: '/finance/reports',  label: 'Reports' },
    ],
  },
};

const NOTIFICATIONS_PATH: Record<AppRole, string> = {
  vendor: '/vendor/notifications',
  admin: '/admin/notifications',
  finance: '/finance/notifications',
};

/**
 * Top-bar shell shared by all three modules. The role only changes the brand
 * mark colour + nav links — everything else stays consistent so users moving
 * between roles feel a single, coherent product.
 */
export function ModuleShell({
  role,
  userName,
  unreadCount = 0,
  isOwner = false,
  children,
}: {
  role: AppRole;
  userName?: string | null;
  unreadCount?: number;
  isOwner?: boolean;
  children: React.ReactNode;
}) {
  const cfg = MODULES[role];
  const visibleNav = cfg.nav.filter((item) => !item.ownerOnly || isOwner);
  return (
    <ToastProvider>
    <div className="flex flex-col min-h-screen">
      {/* Top bar — single thin border at the bottom; role colour appears only on the
          brand mark + active nav underline. Keeps the chrome quiet and the
          content commanding. */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 h-14">
          {/* Brand + nav */}
          <div className="flex items-center gap-6 min-w-0">
            <Link
              href={cfg.nav[0].href}
              className="flex items-center gap-2 group shrink-0"
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center w-8 h-8 rounded-lg bg-foreground text-background font-bold text-xs',
                )}
                aria-hidden
              >
                IC
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-sm font-semibold tracking-tight">
                  Invoice &amp; Compliance
                </span>
                <span className={cn('text-[10px] font-medium uppercase tracking-wider', cfg.accent)}>
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle', cfg.dot)} />
                  {cfg.label}
                </span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              {visibleNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right rail: inbox + profile */}
          <div className="flex items-center gap-3 text-sm">
            <Link
              href={NOTIFICATIONS_PATH[role]}
              className="relative inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition"
              aria-label={`${unreadCount} unread notifications`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              Inbox
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-foreground text-[10px] font-semibold text-background">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            {userName && (
              <span className="text-muted-foreground hidden lg:inline text-xs">
                {userName}
              </span>
            )}
            <div className={cn('rounded-full ring-2', cfg.ring)}>
              <UserButton />
            </div>
          </div>
        </div>

        {/* Mobile nav — visible only below md */}
        <nav className="md:hidden flex items-center gap-1 overflow-x-auto px-4 pb-2" aria-label="Mobile nav">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">{children}</main>
    </div>
    </ToastProvider>
  );
}
