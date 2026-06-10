'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  tone: Tone;
  /** Optional small action button. */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss in ms (default 3500). Set 0 to keep open until dismissed. */
  durationMs?: number;
}

interface ToastContextValue {
  push: (msg: string, opts?: { tone?: Tone; durationMs?: number; action?: Toast['action'] }) => void;
  success: (msg: string, opts?: { durationMs?: number; action?: Toast['action'] }) => void;
  error: (msg: string, opts?: { durationMs?: number; action?: Toast['action'] }) => void;
  info: (msg: string, opts?: { durationMs?: number; action?: Toast['action'] }) => void;
  warning: (msg: string, opts?: { durationMs?: number; action?: Toast['action'] }) => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error:   'border-rose-200 bg-rose-50 text-rose-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info:    'border-slate-200 bg-white text-foreground',
};

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-emerald-500',
  error:   'bg-rose-500',
  warning: 'bg-amber-500',
  info:    'bg-slate-500',
};

/**
 * Lightweight toast provider. Renders a fixed-bottom-right stack. Toasts are
 * stored in state and auto-dismiss after `durationMs`. The `useToast()` hook
 * exposes both generic `push` and per-tone shortcuts.
 *
 * Mount once near the root (we mount it inside ModuleShell so every
 * authenticated page gets it for free).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue['push']>((message, opts = {}) => {
    const id = crypto.randomUUID();
    const tone = opts.tone ?? 'info';
    const durationMs = opts.durationMs ?? 3500;
    const t: Toast = { id, message, tone, durationMs, action: opts.action };
    setToasts((prev) => [...prev, t]);
    if (durationMs > 0) {
      const timer = setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timer);
    }
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({
    push,
    success: (msg, opts) => push(msg, { ...opts, tone: 'success' }),
    error:   (msg, opts) => push(msg, { ...opts, tone: 'error' }),
    info:    (msg, opts) => push(msg, { ...opts, tone: 'info' }),
    warning: (msg, opts) => push(msg, { ...opts, tone: 'warning' }),
    dismiss,
  }), [push, dismiss]);

  useEffect(() => () => {
    for (const t of timersRef.current.values()) clearTimeout(t);
    timersRef.current.clear();
  }, []);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-md border shadow-sm px-3 py-2 text-sm flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200',
              TONE_STYLES[t.tone],
            )}
          >
            <span className={cn('mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0', TONE_DOT[t.tone])} aria-hidden />
            <span className="flex-1 leading-snug">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                className="text-xs font-semibold underline hover:no-underline shrink-0"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback so a missing provider never crashes a component — calls become no-ops.
    return {
      push: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}
