// Writes docs/openapi.json from src/openapi.ts.   npm run openapi
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../src/openapi';

const out = fileURLToPath(new URL('../../../docs/openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`Wrote ${out}`);
