import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

/** Object storage for source archives and build artifacts. Keys are generated server-side only. */
export interface ObjectStorage {
  readonly driver: 's3' | 'filesystem';
  put(key: string, body: Readable | Buffer, opts: { contentType: string; contentLength?: number }): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,500}$/;
function assertKey(key: string) {
  if (!KEY_RE.test(key) || key.includes('..') || key.includes('//')) throw new Error(`Invalid storage key ${key}`);
}

export class S3Storage implements ObjectStorage {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  constructor(
    private readonly bucket: string,
    opts: { endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean },
  ) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: opts.forcePathStyle,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async put(key: string, body: Readable | Buffer, opts: { contentType: string; contentLength?: number }) {
    assertKey(key);
    await new Upload({ client: this.client, params: { Bucket: this.bucket, Key: key, Body: body, ContentType: opts.contentType, ContentLength: opts.contentLength } }).done();
  }

  async get(key: string) {
    assertKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }

  async delete(key: string) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string) {
    assertKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
  }
}

/** Development/test storage on the local disk. Refused in production by configuration validation. */
export class FilesystemStorage implements ObjectStorage {
  readonly driver = 'filesystem' as const;
  private readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private file(key: string) {
    assertKey(key);
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('Storage key escapes the storage root');
    return p;
  }

  async put(key: string, body: Readable | Buffer) {
    const p = this.file(key);
    await mkdir(path.dirname(p), { recursive: true });
    await pipeline(Buffer.isBuffer(body) ? Readable.from([body]) : body, createWriteStream(p, { mode: 0o600 }));
  }

  async get(key: string) {
    const p = this.file(key);
    await stat(p);
    return createReadStream(p);
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }

  async exists(key: string) {
    try {
      await stat(this.file(key));
      return true;
    } catch {
      return false;
    }
  }
}
