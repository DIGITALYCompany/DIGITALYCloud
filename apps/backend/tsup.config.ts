import { defineConfig } from 'tsup';

// Bundles each process entry point. npm dependencies stay external (installed in the image);
// the workspace `@digitalycloud/shared` package is TypeScript source, so it is bundled in.
export default defineConfig({
  entry: { server: 'src/server.ts', worker: 'src/worker.ts', cli: 'src/cli.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: ['@digitalycloud/shared'],
});
