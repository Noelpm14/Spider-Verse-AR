const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css':  'text/css; charset=UTF-8',
  '.js':   'application/javascript; charset=UTF-8',
  '.mjs':  'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt':  'text/plain; charset=UTF-8',
  '.xml':  'application/xml; charset=UTF-8',
};

const COMPRESSIBLE_EXTS = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt'
]);

// ── In-Memory Rate Limiting (Sliding Window per IP) ──────────────────────────
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 240;          // Max requests / minute
const ipBuckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of ipBuckets.entries()) {
    if (now - bucket.startTime > RATE_LIMIT_WINDOW) {
      ipBuckets.delete(ip);
    }
  }
}, 30000);

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.startTime > RATE_LIMIT_WINDOW) {
    ipBuckets.set(ip, { startTime: now, count: 1 });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_MAX;
}

// ── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // 1. Force HTTPS if behind an SSL proxy
  const proto = req.headers['x-forwarded-proto'];
  if (proto && proto === 'http') {
    const host = req.headers['host'];
    res.writeHead(301, { Location: `https://${host}${req.url}` });
    res.end();
    return;
  }

  // 2. Strict Rate Limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    res.writeHead(429, {
      'Content-Type': 'text/plain',
      'Retry-After': '60'
    });
    res.end('429 Too Many Requests: Rate limit exceeded.');
    return;
  }

  // 3. Method Filtering & CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, HEAD, OPTIONS' });
    res.end('405 Method Not Allowed');
    return;
  }

  // 4. URL Length & Malformed URI Crash Guard
  if (req.url.length > 2048) {
    res.writeHead(414, { 'Content-Type': 'text/plain' });
    res.end('414 URI Too Long');
    return;
  }

  let reqPath;
  try {
    reqPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request: Malformed URI');
    return;
  }

  reqPath = reqPath.replace(/\0/g, ''); // Null-byte sanitization
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // 5. Path Traversal Guard
  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // 6. Security Headers (applied to all responses)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://esm.sh https://*.esm.sh https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com https://storage.googleapis.com blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://esm.sh https://*.esm.sh https://cdn.jsdelivr.net https://fastly.jsdelivr.net blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://esm.sh https://*.esm.sh https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://storage.googleapis.com blob: data:; worker-src 'self' blob: https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://esm.sh https://*.esm.sh; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com data:;"
  );

  if (proto === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 7. Stat & Stream File
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const custom404 = path.join(PUBLIC_DIR, '404.html');
      fs.readFile(custom404, (err404, data404) => {
        if (!err404 && data404) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
          res.end(data404);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // 8. ETag & HTTP 304 Conditional Request Handling
    const etag = `"${stats.size.toString(16)}-${stats.mtime.getTime().toString(16)}"`;
    res.setHeader('ETag', etag);

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch) {
      const clientTag = ifNoneMatch.replace(/^W\//, '').replace(/"/g, '').trim();
      const currentTag = etag.replace(/"/g, '').trim();
      if (clientTag === currentTag || ifNoneMatch.includes(etag)) {
        res.writeHead(304);
        res.end();
        return;
      }
    }

    // 9. Cache-Control Policies
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (['.png', '.jpg', '.jpeg', '.svg', '.wasm', '.ico'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    } else if (['.css', '.js', '.mjs'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end();
      return;
    }

    // 10. Gzip / Deflate On-the-Fly Compression
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const readStream = fs.createReadStream(filePath);

    if (COMPRESSIBLE_EXTS.has(ext)) {
      if (acceptEncoding.includes('gzip')) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.writeHead(200, { 'Content-Type': contentType });
        readStream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
        return;
      } else if (acceptEncoding.includes('deflate')) {
        res.setHeader('Content-Encoding', 'deflate');
        res.setHeader('Vary', 'Accept-Encoding');
        res.writeHead(200, { 'Content-Type': contentType });
        readStream.pipe(zlib.createDeflate()).pipe(res);
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': contentType });
    readStream.pipe(res);
  });
});

// 11. Timeout & Slowloris Hardening
server.requestTimeout = 10000;
server.headersTimeout = 6000;
server.keepAliveTimeout = 5000;

server.listen(PORT, () => {
  console.log(`Spider-Verse AR Server running at http://localhost:${PORT}`);
});
