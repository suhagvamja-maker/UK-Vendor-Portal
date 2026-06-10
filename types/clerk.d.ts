import type { AppRole } from './roles';

export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: AppRole;
      appUserId?: string;
    };
  }
}
