// Serveur statique de mesure : sert un dist/, compresse (gzip), mêmes en-têtes de cache que Pages (_headers),
// et relaie /art/* vers le site V2 en ligne (les images ne sont pas dans git : elles vivent sur R2).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const root = path.resolve(process.argv[2]);
const port = +process.argv[3] || 4310;
const ORIGIN = 'https://v2.cardgamepriv.pages.dev';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream', '.wasm': 'application/wasm' };
const artCache = new Map();
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.startsWith('/art/')) {
    try {
      let hit = artCache.get(u.pathname + u.search);
      if (!hit) {
        const r = await fetch(ORIGIN + u.pathname + u.search);
        hit = { status: r.status, type: r.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await r.arrayBuffer()) };
        if (/text\/html/.test(hit.type)) hit = { status: 404, type: 'text/plain', body: Buffer.from('absent') };
        artCache.set(u.pathname + u.search, hit);
      }
      res.writeHead(hit.status, { 'content-type': hit.type, 'cache-control': u.search.includes('v=') ? 'public, max-age=31536000, immutable' : 'public, max-age=604800, stale-while-revalidate=2592000', 'content-length': hit.body.length });
      return res.end(hit.body);
    } catch (e) { res.writeHead(502); return res.end(String(e)); }
  }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404'); }
  const ext = path.extname(f);
  const head = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' };
  if (p === '/sw.js') head['service-worker-allowed'] = '/';
  let body = fs.readFileSync(f);
  if (/\.(js|css|html|json|svg|webmanifest)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body, { level: 6 }); head['content-encoding'] = 'gzip'; }
  head['content-length'] = body.length;
  res.writeHead(200, head); res.end(body);
}).listen(port, () => console.log('ok', port));
