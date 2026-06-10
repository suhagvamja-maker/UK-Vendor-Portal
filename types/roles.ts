export type AppRole = 'vendor' | 'admin' | 'finance';

export const APP_ROLES: readonly AppRole[] = ['vendor', 'admin', 'finance'] as const;

export const isAppRole = (v: unknown): v is AppRole =>
  typeof v === 'string' && (APP_ROLES as readonly string[]).includes(v);
