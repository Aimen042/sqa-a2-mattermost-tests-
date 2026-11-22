/** Central environment settings. Override any of these with environment variables. */
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8065';
export const RUN_NAME = process.env.RUN_NAME ?? 'full';

/** Test-environment system admin (created automatically on a fresh server). */
export const ADMIN = {
  username: process.env.MM_ADMIN_USER ?? 'qa.admin',
  password: process.env.MM_ADMIN_PASS ?? 'QaAdmin#2026',
  email: process.env.MM_ADMIN_EMAIL ?? 'qa.admin@example.com',
};

/** Application configuration applied by global setup. Changing this is the documented regression change. */
export const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? '1');
