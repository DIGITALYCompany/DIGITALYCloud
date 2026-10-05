import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request } from 'express';
import busboy from 'busboy';
import { UPLOAD_LIMITS, type UploadDto, type UploadFormat } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { Service, Upload, type ServiceDoc, type UploadDoc } from '../../db/models';
import { AppError, notConfigured, tooLarge, validation } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { ArchiveError, inspectArchive, sniffFormat } from '../../runtime/archive';

export const uploadDto = (u: UploadDoc): UploadDto => ({
  id: u._id,
  fileName: u.fileName,
  sizeBytes: u.sizeBytes,
  format: u.format,
  createdAt: u.createdAt.getTime(),
  expiresAt: u.expiresAt?.getTime() ?? null,
});

const MB = 1024 * 1024;
const EXT: { re: RegExp; format: UploadFormat }[] = [
  { re: /\.zip$/i, format: 'zip' },
  { re: /\.(tar\.gz|tgz|gz)$/i, format: 'tar.gz' },
  { re: /\.tar$/i, format: 'tar' },
];

export const uploadLimits = () => {
  const c = ctx().config;
  return { defaultBytes: c.UPLOAD_MAX_MB * MB, largeBytes: c.UPLOAD_MAX_LARGE_MB * MB, archive: { maxExpandedBytes: c.UPLOAD_MAX_EXPANDED_MB * MB, maxFiles: c.UPLOAD_MAX_FILES } };
};

export const storageKeyFor = (teamId: string, uploadId: string, format: UploadFormat) => `uploads/${teamId}/${uploadId}.${format === 'tar.gz' ? 'tar.gz' : format}`;

/** The larger allowance is only for an existing upload service whose plan the server verified. */
async function allowanceFor(teamId: string, serviceId: string | null) {
  const limits = uploadLimits();
  if (!serviceId || !/^[a-z0-9-]{1,63}$/.test(serviceId)) return limits.defaultBytes;
  const svc = await Service.findOne({ _id: serviceId, teamId, lifecycle: 'active' }, { plan: 1, source: 1 }).lean<Pick<ServiceDoc, 'plan' | 'source'>>();
  if (!svc || svc.source !== 'upload') throw validation('That service doesn’t deploy from uploads.', 'serviceId');
  return UPLOAD_LIMITS.largePlans.includes(svc.plan) ? limits.largeBytes : limits.defaultBytes;
}

const sanitizeName = (n: string) => path.basename(n).replace(/[^\w.\- ()]/g, '_').slice(0, 200) || 'archive';

/**
 * `POST /uploads` (multipart, field `file`, optional `serviceId` sent before it). The archive is
 * streamed to a private temp file (never extracted on this host), size-capped while streaming,
 * identified by content, fully inspected, then stored in object storage.
 */
export async function receiveUpload(req: Request, teamId: string, userId: string): Promise<UploadDoc> {
  const storage = ctx().integrations.storage;
  if (!storage) throw notConfigured('Uploads', 'STORAGE_NOT_CONFIGURED');
  if (!req.is('multipart/form-data')) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the archive as multipart/form-data.');

  const dir = await mkdtemp(path.join(ctx().config.UPLOAD_TMP_DIR || tmpdir(), 'dgc-upload-'));
  const tmpFile = path.join(dir, 'archive');
  try {
    const received = await new Promise<{ fileName: string; size: number; sha256: string; limit: number }>((resolve, reject) => {
      let serviceId: string | null = null;
      let fileSeen = false;
      let settled = false;
      const fail = (e: unknown) => {
        if (settled) return;
        settled = true;
        req.unpipe(bb);
        req.resume();
        reject(e);
      };
      const bb = busboy({ headers: req.headers, limits: { files: 1, fields: 4, fieldSize: 256, parts: 6, fileSize: uploadLimits().largeBytes + 1 } });
      bb.on('field', (name, value) => {
        if (name === 'serviceId' && !fileSeen) serviceId = value.trim();
      });
      bb.on('file', (name, file, info) => {
        if (name !== 'file' || fileSeen) {
          file.resume();
          return;
        }
        fileSeen = true;
        const fileName = sanitizeName(info.filename ?? 'archive');
        allowanceFor(teamId, serviceId)
          .then((limit) => {
            if (!EXT.some((e) => e.re.test(fileName))) throw validation('Upload a .zip, .tar or .tar.gz archive.', 'file');
            let size = 0;
            const hash = createHash('sha256');
            const counter = new Transform({
              transform(chunk: Buffer, _e, cb) {
                size += chunk.length;
                if (size > limit) return cb(tooLarge(`Archives can be at most ${Math.round(limit / MB)} MB.${limit < uploadLimits().largeBytes ? ' Pro and Business upload services can replace their source with archives up to ' + Math.round(uploadLimits().largeBytes / MB) + ' MB.' : ''}`));
                hash.update(chunk);
                cb(null, chunk);
              },
            });
            return pipeline(file, counter, createWriteStream(tmpFile, { mode: 0o600 })).then(() => ({ fileName, size, sha256: hash.digest('hex'), limit }));
          })
          .then((r) => {
            if (!settled) {
              settled = true;
              resolve(r);
            }
          })
          .catch(fail);
      });
      bb.on('error', () => fail(validation('The upload could not be read. Please try again.')));
      // Client aborted mid-upload: settle instead of waiting forever on a stream that never ends.
      req.once('error', () => fail(validation('The upload was interrupted. Please try again.')));
      bb.on('close', () => {
        if (!fileSeen) fail(validation('Choose an archive to upload.', 'file'));
      });
      req.pipe(bb);
    });

    if (received.size === 0) throw validation('The archive is empty.', 'file');
    const head = Buffer.alloc(512);
    const fh = await open(tmpFile, 'r');
    await fh.read(head, 0, 512, 0);
    await fh.close();
    const sniffed = sniffFormat(head);
    const declared = EXT.find((e) => e.re.test(received.fileName))!.format;
    if (!sniffed) throw validation('This file isn’t a .zip, .tar or .tar.gz archive.', 'file');
    if (sniffed !== declared) throw validation('The file’s content doesn’t match its extension.', 'file');

    let info;
    try {
      info = await inspectArchive(sniffed === 'zip' ? { format: 'zip', filePath: tmpFile } : { format: sniffed, stream: createReadStream(tmpFile) }, uploadLimits().archive);
    } catch (e) {
      if (e instanceof ArchiveError) throw validation(e.message, 'file');
      throw e;
    }

    const id = newId('upload');
    const key = storageKeyFor(teamId, id, sniffed);
    await storage.put(key, createReadStream(tmpFile), { contentType: sniffed === 'zip' ? 'application/zip' : sniffed === 'tar' ? 'application/x-tar' : 'application/gzip', contentLength: (await stat(tmpFile)).size });
    const now = new Date();
    const doc: UploadDoc = {
      _id: id,
      teamId,
      createdBy: userId,
      fileName: received.fileName,
      sizeBytes: received.size,
      format: sniffed,
      sha256: received.sha256,
      storageKey: key,
      status: 'ready',
      serviceId: null,
      expandedBytes: info.expandedBytes,
      fileCount: info.fileCount,
      rootPrefix: info.rootPrefix,
      createdAt: now,
      expiresAt: new Date(now.getTime() + UPLOAD_LIMITS.unusedTtlHours * 3600_000),
    };
    try {
      await Upload.create(doc);
    } catch (e) {
      await storage.delete(key).catch(() => {});
      throw e;
    }
    return doc;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Deletes unattached uploads past their expiry: the object first, then the record. */
export async function cleanupExpiredUploads(limit = 200) {
  const storage = ctx().integrations.storage;
  const expired = await Upload.find({ status: 'ready', expiresAt: { $lt: new Date() } }).limit(limit).lean<UploadDoc[]>();
  for (const u of expired) {
    if (storage) await storage.delete(u.storageKey);
    await Upload.deleteOne({ _id: u._id, status: 'ready' });
  }
  return expired.length;
}
