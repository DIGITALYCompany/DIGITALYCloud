import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** `apps/backend/package.json` version (same relative path from `src/` and `dist/`). */
export const VERSION: string = process.env.APP_VERSION ?? (require('../package.json') as { version: string }).version;
