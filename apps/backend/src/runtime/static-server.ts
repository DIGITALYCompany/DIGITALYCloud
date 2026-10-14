/**
 * The file server baked into every static site image (`/opt/digitaly/serve.mjs`, started by
 * STATIC_START_COMMAND). Dependency-free so it runs on the plain Node base image. It serves
 * `/srv/site` with clean URLs (`/about` → `about.html` or `about/`), the site's `404.html`, or
 * `index.html` for extensionless paths of single-page apps; gzip for text, ETags, byte ranges
 * (video seeking), and never serves dotfiles (except `.well-known`) or `node_modules`.
 *
 * Kept free of backticks and `${` so it can live in this template literal unescaped.
 */
export const STATIC_SERVER_SCRIPT = `// Added by DIGITALYCloud: serves the published folder of this static site.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createGzip } from 'node:zlib';

const ROOT = '/srv/site';
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.wasm': 'application/wasm', '.zip': 'application/zip', '.csv': 'text/csv; charset=utf-8',
};
const COMPRESSIBLE = /^(text\\/|application\\/(json|xml|manifest\\+json)|image\\/svg\\+xml)/;
const HASHED = /(^|\\/)(assets|_next\\/static|_astro)\\/|[.-][0-9a-zA-Z_-]{8,}\\.(js|css|woff2?|png|jpe?g|svg|webp|avif)$/;

async function fileAt(p) {
  try {
    const s = await stat(p);
    return s.isFile() ? s : s.isDirectory() ? 'dir' : null;
  } catch {
    return null;
  }
}

function safePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (p.includes('\\0') || p.includes('\\\\')) return null;
  const segs = p.split('/').filter(Boolean);
  if (segs.some((s) => s === '..' || s === 'node_modules' || (s.startsWith('.') && s !== '.well-known'))) return null;
  return join(ROOT, ...segs);
}

/** { path, stat } to serve, { redirect } for a directory without its slash, or null. */
async function resolve(urlPath) {
  const base = safePath(urlPath);
  if (!base) return null;
  if (urlPath.endsWith('/')) {
    const s = await fileAt(join(base, 'index.html'));
    return s && s !== 'dir' ? { path: join(base, 'index.html'), stat: s } : null;
  }
  const direct = await fileAt(base);
  if (direct && direct !== 'dir') return { path: base, stat: direct };
  const html = await fileAt(base + '.html');
  if (html && html !== 'dir') return { path: base + '.html', stat: html };
  if (direct === 'dir') {
    const idx = await fileAt(join(base, 'index.html'));
    if (idx && idx !== 'dir') return { redirect: urlPath + '/' };
  }
  return null;
}

function send(req, res, status, found) {
  const type = TYPES[extname(found.path).toLowerCase()] || 'application/octet-stream';
  const etag = 'W/"' + found.stat.size.toString(16) + '-' + Math.floor(found.stat.mtimeMs).toString(16) + '"';
  const html = type.startsWith('text/html');
  res.setHeader('Content-Type', type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', html ? 'no-cache' : HASHED.test(found.path) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
  res.setHeader('Last-Modified', found.stat.mtime.toUTCString());
  res.setHeader('ETag', etag);
  res.setHeader('Accept-Ranges', 'bytes');
  if (status === 200 && req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    return res.end();
  }
  const size = found.stat.size;
  const range = status === 200 && req.headers.range ? /^bytes=(\\d*)-(\\d*)$/.exec(req.headers.range) : null;
  if (range) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (!(start >= 0) || start > end || start >= size) {
      res.statusCode = 416;
      res.setHeader('Content-Range', 'bytes */' + size);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
    res.setHeader('Content-Length', end - start + 1);
    if (req.method === 'HEAD') return res.end();
    return pipe(createReadStream(found.path, { start, end }), res);
  }
  res.statusCode = status;
  const gzip = size > 1024 && COMPRESSIBLE.test(type) && /\\bgzip\\b/.test(req.headers['accept-encoding'] || '');
  res.setHeader('Vary', 'Accept-Encoding');
  if (gzip) res.setHeader('Content-Encoding', 'gzip');
  else res.setHeader('Content-Length', size);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(found.path);
  pipe(gzip ? stream.pipe(createGzip()) : stream, res);
}

function pipe(stream, res) {
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed');
    }
    const url = new URL(req.url || '/', 'http://site');
    const found = await resolve(url.pathname);
    if (found && found.redirect) {
      res.writeHead(301, { Location: found.redirect + url.search });
      return res.end();
    }
    if (found) return send(req, res, 200, found);
    const notFound = await resolve('/404.html');
    if (notFound && notFound.path) return send(req, res, 404, notFound);
    // Single-page apps: routes without a file extension get index.html.
    if (!extname(url.pathname)) {
      const index = await resolve('/index.html');
      if (index && index.path) return send(req, res, 200, index);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error('Request failed:', err && err.message);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end();
  }
});

server.on('clientError', (_err, socket) => socket.destroy());
server.listen(PORT, () => console.log('Serving the site on port ' + PORT));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
`;
