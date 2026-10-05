import { nodeMajor, type NodeVersion } from '@digitalycloud/shared';

export const DOCKERFILE = 'Dockerfile.digitaly';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'none';

/** Picks the package manager from the lockfile at the project root. */
export function detectPackageManager(rootFiles: Set<string>): PackageManager {
  if (rootFiles.has('pnpm-lock.yaml')) return 'pnpm';
  if (rootFiles.has('yarn.lock')) return 'yarn';
  if (rootFiles.has('bun.lock') || rootFiles.has('bun.lockb')) return 'bun';
  if (rootFiles.has('package-lock.json') || rootFiles.has('npm-shrinkwrap.json')) return 'npm';
  return rootFiles.has('package.json') ? 'npm' : 'none';
}

function hasBuildScript(packageJson: string | undefined) {
  if (!packageJson) return false;
  try {
    const p = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    return typeof p.scripts?.build === 'string';
  } catch {
    return false;
  }
}

const INSTALL: Record<PackageManager, string> = {
  npm: 'if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi',
  // Run through corepack/npx so nothing is written outside the unprivileged user's home.
  pnpm: 'corepack pnpm install --frozen-lockfile',
  yarn: 'corepack yarn install --immutable || corepack yarn install --frozen-lockfile',
  bun: 'npx --yes bun@1 install --frozen-lockfile',
  none: 'true',
};

const BUILD: Record<PackageManager, string> = { npm: 'npm run build', pnpm: 'corepack pnpm run build', yarn: 'corepack yarn run build', bun: 'npx --yes bun@1 run build', none: 'true' };

/**
 * Generated Dockerfile for GitHub/upload sources. Dependencies are installed with the detected
 * lockfile/package manager, a `build` script runs when present, and the image runs as the
 * unprivileged `node` user. No environment variables or credentials are available at build time;
 * the start command and env are applied when the container is created.
 */
export function dockerfileFor(opts: { nodeVersion: NodeVersion; baseImages: Record<string, string>; rootFiles: Set<string>; packageJson?: string }) {
  const major = String(nodeMajor(opts.nodeVersion));
  const base = opts.baseImages[major];
  if (!base) throw new Error(`No base image configured for Node.js ${major}`);
  const pm = detectPackageManager(opts.rootFiles);
  const build = hasBuildScript(opts.packageJson) ? BUILD[pm] : 'true';
  return {
    packageManager: pm,
    content: [
      `FROM ${base}`,
      'WORKDIR /app',
      'RUN chown node:node /app',
      'USER node',
      'COPY --chown=node:node . .',
      `RUN ${INSTALL[pm]}`,
      `RUN ${build}`,
      'ENV NODE_ENV=production',
      '',
    ].join('\n'),
  };
}
