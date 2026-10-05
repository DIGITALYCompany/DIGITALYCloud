import path from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import yauzl from 'yauzl';
import type { UploadFormat } from '@digitalycloud/shared';

/** A problem with the archive itself; the message is safe to show to the user. */
export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

export interface ArchiveLimits {
  maxExpandedBytes: number;
  maxFiles: number;
}

export interface EntryInfo {
  /** Normalized relative path, without leading `./` or trailing `/`. */
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mode: number;
  linkTarget?: string;
}

/** Identifies the format from the first bytes, not the file name. `.gz` must be a gzipped tar. */
export function sniffFormat(head: Buffer): UploadFormat | null {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return 'zip';
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return 'tar.gz';
  if (head.length >= 262 && head.subarray(257, 262).toString('latin1') === 'ustar') return 'tar';
  return null;
}

const SKIP_SEGMENTS = new Set(['node_modules', '.git', '__MACOSX']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

/** Rejects absolute paths, traversal and odd encodings; returns null for entries we skip. */
export function normalizeEntryPath(raw: string): string | null {
  if (raw.includes('\0') || raw.includes('\\')) throw new ArchiveError('Archive entry names must use forward slashes.');
  const p = raw.replace(/^(\.\/)+/, '');
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) throw new ArchiveError('Archives can’t contain absolute paths.');
  const norm = path.posix.normalize(p).replace(/\/+$/, '');
  if (norm === '' || norm === '.') return null;
  if (norm === '..' || norm.startsWith('../') || norm.split('/').includes('..')) throw new ArchiveError('Archives can’t contain paths outside the project folder.');
  if (norm.length > 1024 || norm.split('/').length > 64) throw new ArchiveError('An archive path is too long.');
  const segments = norm.split('/');
  if (segments.some((s) => SKIP_SEGMENTS.has(s)) || SKIP_FILES.has(segments[segments.length - 1]!)) return null;
  return norm;
}

function checkLink(entryPath: string, target: string) {
  if (!target || target.startsWith('/') || target.includes('\0') || target.includes('\\')) throw new ArchiveError('Archives can’t contain links that point outside the project.');
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entryPath), target));
  if (resolved === '..' || resolved.startsWith('../')) throw new ArchiveError('Archives can’t contain links that point outside the project.');
}

/** Counts bytes flowing through and fails once the archive expands past the limit. */
class Budget {
  bytes = 0;
  files = 0;
  constructor(private readonly limits: ArchiveLimits) {}
  addFile() {
    if (++this.files > this.limits.maxFiles) throw new ArchiveError(`The archive contains more than ${this.limits.maxFiles} files.`);
  }
  /** Counts `src` through a budget transform. Source errors are forwarded (plain `.pipe()` would leave them unhandled). */
  count(src: Readable) {
    const counter = this.counter();
    src.once('error', (e) => counter.destroy(e));
    return src.pipe(counter);
  }
  private counter() {
    return new Transform({
      transform: (chunk: Buffer, _enc, cb) => {
        this.bytes += chunk.length;
        if (this.bytes > this.limits.maxExpandedBytes) return cb(new ArchiveError(`The archive expands to more than ${Math.round(this.limits.maxExpandedBytes / 1024 / 1024)} MB.`));
        cb(null, chunk);
      },
    });
  }
}

export type EntryHandler = (entry: EntryInfo, content: Readable | null) => Promise<void>;

/**
 * Walks an archive without writing anything to disk. Content streams are counted against the
 * expanded-size budget as they are read (sizes declared in headers are never trusted alone).
 */
export async function walkArchive(src: { format: UploadFormat; filePath?: string; stream?: Readable }, limits: ArchiveLimits, onEntry: EntryHandler) {
  const budget = new Budget(limits);
  if (src.format === 'zip') {
    if (!src.filePath) throw new Error('zip archives are read from a file');
    await walkZip(src.filePath, budget, onEntry);
  } else {
    if (!src.stream) throw new Error('tar archives are read from a stream');
    await walkTar(src.stream, src.format === 'tar.gz', budget, limits, onEntry);
  }
  return { files: budget.files, bytes: budget.bytes };
}

async function walkZip(filePath: string, budget: Budget, onEntry: EntryHandler) {
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.openPromise(filePath, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true, decodeStrings: true });
  } catch (e) {
    throw new ArchiveError(/backslash|absolute|relative/i.test((e as Error).message) ? 'Archives can’t contain absolute paths or paths outside the project folder.' : 'This file isn’t a valid .zip archive.');
  }
  try {
    for (;;) {
      const entry = await new Promise<yauzl.Entry | null>((resolve, reject) => {
        zip.once('entry', resolve);
        zip.once('end', () => resolve(null));
        zip.once('error', reject);
        zip.readEntry();
      }).catch((e: Error) => {
        throw new ArchiveError(/size/i.test(e.message) ? 'The archive’s declared sizes don’t match its contents.' : 'This file isn’t a valid .zip archive.');
      });
      zip.removeAllListeners('entry');
      zip.removeAllListeners('end');
      zip.removeAllListeners('error');
      if (!entry) break;
      if (entry.isEncrypted()) throw new ArchiveError('Encrypted archives aren’t supported.');
      const p = normalizeEntryPath(entry.fileName);
      if (p === null) continue;
      const unixMode = (entry.externalFileAttributes >>> 16) & 0o177777;
      const kind = unixMode & 0o170000;
      if (entry.fileName.endsWith('/') || kind === 0o040000) {
        await onEntry({ path: p, type: 'directory', size: 0, mode: 0o755 }, null);
        continue;
      }
      if (kind !== 0 && kind !== 0o100000 && kind !== 0o120000) throw new ArchiveError('Archives can’t contain device files.');
      budget.addFile();
      const stream = budget.count(await zip.openReadStreamPromise(entry));
      if (kind === 0o120000) {
        const target = (await streamToBuffer(stream, 4096)).toString('utf8');
        checkLink(p, target);
        await onEntry({ path: p, type: 'symlink', size: 0, mode: 0o777, linkTarget: target }, null);
        continue;
      }
      await onEntry({ path: p, type: 'file', size: entry.uncompressedSize, mode: unixMode & 0o111 ? 0o755 : 0o644 }, stream);
    }
  } finally {
    zip.close();
  }
}

async function walkTar(input: Readable, gz: boolean, budget: Budget, limits: ArchiveLimits, onEntry: EntryHandler) {
  const extract = tar.extract();
  // Bound the decompressed stream too (headers and padding included), against gzip bombs.
  let raw = 0;
  const rawLimit = limits.maxExpandedBytes + limits.maxFiles * 1024 + 10 * 1024 * 1024;
  const rawCounter = new Transform({
    transform(chunk: Buffer, _e, cb) {
      raw += chunk.length;
      if (raw > rawLimit) return cb(new ArchiveError(`The archive expands to more than ${Math.round(limits.maxExpandedBytes / 1024 / 1024)} MB.`));
      cb(null, chunk);
    },
  });
  const feeding = (gz ? pipeline(input, createGunzip(), rawCounter, extract) : pipeline(input, rawCounter, extract)).catch((e: Error) => {
    extract.destroy(e);
  });
  try {
    for await (const entry of extract) {
      const h = entry.header;
      const type = (h.type as string | null) ?? 'file';
      // pax/GNU extension records are consumed by tar-stream; skip any that still surface.
      if (type.startsWith('pax-') || type.startsWith('gnu-')) {
        entry.resume();
        continue;
      }
      const p = normalizeEntryPath(h.name);
      if (p === null) {
        entry.resume();
        continue;
      }
      if (type === 'directory') {
        entry.resume();
        await onEntry({ path: p, type: 'directory', size: 0, mode: 0o755 }, null);
      } else if (type === 'symlink') {
        entry.resume();
        checkLink(p, h.linkname ?? '');
        budget.addFile();
        await onEntry({ path: p, type: 'symlink', size: 0, mode: 0o777, linkTarget: h.linkname ?? '' }, null);
      } else if (type === 'file' || type === 'contiguous-file') {
        budget.addFile();
        await onEntry({ path: p, type: 'file', size: h.size ?? 0, mode: (h.mode ?? 0o644) & 0o111 ? 0o755 : 0o644 }, budget.count(Readable.from(entry)));
      } else if (type === 'link') {
        throw new ArchiveError('Archives can’t contain hard links.');
      } else {
        throw new ArchiveError('Archives can’t contain device files.');
      }
    }
  } catch (e) {
    if (e instanceof ArchiveError) throw e;
    throw new ArchiveError(gz ? 'A .gz upload must be a gzipped tar archive (.tar.gz).' : 'This file isn’t a valid .tar archive.');
  }
  await feeding;
}

async function streamToBuffer(s: Readable, max: number) {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of s) {
    n += (c as Buffer).length;
    if (n > max) throw new ArchiveError('An archive link target is too long.');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

const drain = (s: Readable) =>
  pipeline(
    s,
    new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  );

/** Validates an archive and reports its shape (used at upload time). */
export async function inspectArchive(src: { format: UploadFormat; filePath?: string; stream?: Readable }, limits: ArchiveLimits) {
  const tops = new Set<string>();
  let rootDirs = 0;
  let packageJsonAt: string | null = null;
  const stats = await walkArchive(src, limits, async (e, content) => {
    const [first, ...rest] = e.path.split('/');
    tops.add(first!);
    if (rest.length === 0 && e.type === 'directory') rootDirs++;
    if (!packageJsonAt && (e.path === 'package.json' || /^[^/]+\/package\.json$/.test(e.path))) packageJsonAt = e.path;
    if (content) await drain(content);
  });
  if (stats.files === 0) throw new ArchiveError('The archive is empty.');
  const only = tops.size === 1 ? [...tops][0]! : null;
  // Strip a single wrapping folder (e.g. "my-bot/"), as created when zipping a project folder.
  const rootPrefix = only && (rootDirs === 1 || packageJsonAt === `${only}/package.json`) ? only : null;
  return { fileCount: stats.files, expandedBytes: stats.bytes, rootPrefix };
}

export interface ExtraFile {
  path: string;
  content: string;
  mode?: number;
}

/**
 * Re-packs a validated archive into a sanitized tar build context, stripping `stripPrefix`,
 * normalizing modes and timestamps, and appending generated files (e.g. the Dockerfile) last.
 * `extras` receives the set of root-level file names, so it can adapt to lockfiles.
 */
export function buildContext(
  src: { format: UploadFormat; filePath?: string; stream?: Readable },
  limits: ArchiveLimits,
  opts: { stripPrefix: string | null | '*'; extras: (rootFiles: Set<string>, readText: (name: string) => string | undefined) => ExtraFile[] },
) {
  const pack = tar.pack();
  const rootFiles = new Set<string>();
  const smallText = new Map<string, string>();
  const mtime = new Date(0);
  const done = (async () => {
    await walkArchive(src, limits, async (e, content) => {
      let p = e.path;
      if (opts.stripPrefix === '*') {
        // GitHub tarballs wrap everything in one `owner-repo-sha/` folder.
        const i = p.indexOf('/');
        if (i < 0) {
          if (content) await drain(content);
          return;
        }
        p = p.slice(i + 1);
      } else if (opts.stripPrefix) {
        if (p === opts.stripPrefix) {
          if (content) await drain(content);
          return;
        }
        if (!p.startsWith(`${opts.stripPrefix}/`)) throw new ArchiveError('The archive layout changed unexpectedly.');
        p = p.slice(opts.stripPrefix.length + 1);
      }
      if (p.startsWith('Dockerfile.digitaly')) {
        if (content) await drain(content);
        return;
      }
      if (!p.includes('/') && e.type === 'file') rootFiles.add(p);
      if (e.type === 'directory') return void pack.entry({ name: `${p}/`, type: 'directory', mode: 0o755, mtime });
      if (e.type === 'symlink') return void pack.entry({ name: p, type: 'symlink', linkname: e.linkTarget!, mode: 0o777, mtime });
      const keep = !p.includes('/') && (p === 'package.json' || p === '.nvmrc') && e.size < 256 * 1024;
      if (keep) {
        const buf = await streamToBuffer(content!, 256 * 1024);
        smallText.set(p, buf.toString('utf8'));
        await new Promise<void>((resolve, reject) => pack.entry({ name: p, size: buf.length, mode: e.mode, mtime }, buf, (err) => (err ? reject(err) : resolve())));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const w = pack.entry({ name: p, size: e.size, mode: e.mode, mtime }, (err) => (err ? reject(err) : resolve()));
        content!.on('error', reject);
        content!.pipe(w);
      });
    });
    for (const f of opts.extras(rootFiles, (n) => smallText.get(n))) pack.entry({ name: f.path, mode: f.mode ?? 0o644, mtime }, f.content);
    pack.finalize();
    return { rootFiles };
  })().catch((e: unknown) => {
    pack.destroy(e as Error);
    throw e;
  });
  // tar-stream packs are streamx streams; expose a Node stream to Docker clients.
  return { stream: Readable.from(pack), done };
}
