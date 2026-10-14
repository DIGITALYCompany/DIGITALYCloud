import { PUBLISH_DIR_CANDIDATES, nodeMajor, type NodeVersion } from '@digitalycloud/shared';

export const DOCKERFILE = 'Dockerfile.digitaly';
/** The static file server, added to the build context of static sites (see static-server.ts). */
export const STATIC_SERVER_FILE = '.digitaly-serve.mjs';

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
 * Picks the folder a static site publishes and copies it to /tmp/site. An empty `publishDir`
 * means the first candidate holding an index.html, else the project root. Lines starting with
 * `Error:` become the deployment's failure reason. `publishDir` is pre-validated (no quotes).
 */
function publishStep(publishDir: string | null) {
  return [
    'set -e',
    `d='${publishDir ?? ''}'`,
    `if [ -z "$d" ]; then for c in ${PUBLISH_DIR_CANDIDATES.join(' ')}; do if [ -f "$c/index.html" ]; then d="$c"; break; fi; done; fi`,
    'd="${d:-.}"',
    'if [ ! -d "$d" ]; then echo "Error: the publish directory \\"$d\\" does not exist after the build. Check the publish directory in Settings." >&2; exit 1; fi',
    'if [ ! -f "$d/index.html" ]; then echo "Error: there is no index.html in \\"$d\\". Set the publish directory to the folder that contains your site\'s index.html." >&2; exit 1; fi',
    'mkdir -p /tmp/site',
    'cp -R "$d/." /tmp/site/',
    `rm -rf /tmp/site/node_modules /tmp/site/.git /tmp/site/${DOCKERFILE} /tmp/site/${STATIC_SERVER_FILE}`,
    'echo "Publishing $d"',
  ].join('; ');
}

/**
 * Generated Dockerfile for GitHub/upload sources. Dependencies are installed with the detected
 * lockfile/package manager, a `build` script runs when present, and the image runs as the
 * unprivileged `node` user. No environment variables or credentials are available at build time;
 * the start command and env are applied when the container is created.
 *
 * Static sites build the same way, then a second stage keeps only the published folder (owned by
 * root, read-only for the server) and the platform's file server.
 */
export function dockerfileFor(opts: { nodeVersion: NodeVersion; baseImages: Record<string, string>; rootFiles: Set<string>; packageJson?: string; staticSite?: { publishDir: string | null } }) {
  const major = String(nodeMajor(opts.nodeVersion));
  const base = opts.baseImages[major];
  if (!base) throw new Error(`No base image configured for Node.js ${major}`);
  const pm = detectPackageManager(opts.rootFiles);
  const build = hasBuildScript(opts.packageJson) ? BUILD[pm] : 'true';
  const steps = [`FROM ${base}${opts.staticSite ? ' AS build' : ''}`, 'WORKDIR /app', 'RUN chown node:node /app', 'USER node', 'COPY --chown=node:node . .', `RUN ${INSTALL[pm]}`, `RUN ${build}`];
  if (!opts.staticSite) return { packageManager: pm, content: [...steps, 'ENV NODE_ENV=production', ''].join('\n') };
  return {
    packageManager: pm,
    content: [
      ...steps,
      `RUN ${publishStep(opts.staticSite.publishDir)}`,
      `FROM ${base}`,
      'COPY --from=build /tmp/site /srv/site',
      `COPY ${STATIC_SERVER_FILE} /opt/digitaly/serve.mjs`,
      'USER node',
      'ENV NODE_ENV=production',
      '',
    ].join('\n'),
  };
}
