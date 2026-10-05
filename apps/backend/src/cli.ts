import { bootstrap, shutdown } from './bootstrap';
import { dropUndeclaredIndexes, verifyIndexes } from './db/indexes';
import { migrationStatus, runMigrations } from './db/migrations';
import { COMMANDS as EXTRA_COMMANDS } from './cli-commands';

/**
 * Operator CLI. Examples:
 *   npm run cli -- migrate up            apply pending migrations (non-destructive)
 *   npm run cli -- migrate status
 *   npm run cli -- indexes verify        compare declared vs actual indexes
 *   npm run cli -- indexes sync --confirm  drop undeclared indexes (destructive, deliberate)
 * Production: `node dist/cli.js <command>`.
 */
const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  'migrate up': async () => {
    await runMigrations((m) => console.log(m));
    console.log('migrations up to date');
  },
  'migrate status': async () => {
    for (const m of await migrationStatus()) console.log(`${m.version} ${m.name.padEnd(36)} ${m.applied ? `applied ${m.appliedAt?.toISOString()}` : 'PENDING'}${m.changed ? ' (source changed since applied!)' : ''}`);
  },
  'indexes verify': async () => {
    const r = await verifyIndexes();
    if (!r.length) console.log('all declared indexes exist; no undeclared indexes');
    for (const x of r) console.log(`${x.collection}: missing [${x.missing.join(', ')}] extra [${x.extra.join(', ')}]`);
  },
  'indexes sync': async (args) => {
    if (!args.includes('--confirm')) throw new Error('This drops undeclared indexes. Re-run with --confirm.');
    await dropUndeclaredIndexes((m) => console.log(m));
  },
  ...EXTRA_COMMANDS,
};

async function main() {
  const argv = process.argv.slice(2);
  const key = Object.keys(COMMANDS)
    .sort((a, b) => b.length - a.length)
    .find((k) => argv.join(' ').startsWith(k));
  if (!key) {
    console.log(`Usage: cli <command>\n\nCommands:\n  ${Object.keys(COMMANDS).sort().join('\n  ')}`);
    process.exit(argv.length ? 1 : 0);
  }
  const c = await bootstrap('cli');
  try {
    await COMMANDS[key]!(argv.slice(key.split(' ').length));
  } finally {
    await shutdown(c);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
