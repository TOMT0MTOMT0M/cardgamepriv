/**
 * (retours live 6, B2) Révisions des illustrations REMPLACÉES : src/core/artRev.json.
 *
 * Lancé par la mise en ligne AVANT le build : compare public/art/ au bucket R2 (taille + MD5 = ETag) ; chaque image
 * déjà dans R2 dont le contenu a changé reçoit une révision de plus → son adresse change (`?v=2.1`, src/core/artRev.ts)
 * et aucun navigateur ni le cache de Cloudflare ne peut plus servir l'ancienne. Les images NOUVELLES n'en ont pas besoin
 * (personne n'a pu garder l'ancienne). Ensuite r2-sync envoie les fichiers, comme avant.
 *   node scripts/art-rev.mjs
 * Sans identifiants R2 (.env.local) : rien n'est fait.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const BUCKET = process.env.R2_BUCKET || 'cardgamepriv-art';
const ROOT = path.resolve('public');
const OUT = path.resolve('src/core/artRev.json');
const IMG = /\.(png|jpe?g|webp)$/i;

function env() {
  const out = { ...process.env };
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\r\n]*?)"?\s*(#.*)?$/);
      if (m && !(m[1] in process.env)) out[m[1]] = m[2].trim();
    }
  }
  return out;
}
function walk(dir, list = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, list);
    else if (IMG.test(e.name)) list.push(p);
  }
  return list;
}

const E = env();
if (!E.R2_ACCOUNT_ID || !E.R2_ACCESS_KEY_ID || !E.R2_SECRET_ACCESS_KEY) {
  console.log('art-rev : R2 non configuré, révisions inchangées.');
  process.exit(0);
}
const s3 = new S3Client({
  region: 'auto',
  endpoint: E.R2_ENDPOINT || `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: !!E.R2_ENDPOINT,
  credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
});
const remote = new Map();
let token;
do {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'art/', ContinuationToken: token }));
  for (const o of r.Contents ?? []) remote.set(o.Key, { size: o.Size, etag: (o.ETag ?? '').replace(/"/g, '') });
  token = r.IsTruncated ? r.NextContinuationToken : undefined;
} while (token);

const rev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
let changed = 0;
for (const f of walk(path.join(ROOT, 'art'))) {
  const key = path.relative(ROOT, f).split(path.sep).join('/');
  const r = remote.get(key);
  if (!r) continue; // nouvelle image : pas de version à casser
  if (r.size === statSync(f).size && createHash('md5').update(readFileSync(f)).digest('hex') === r.etag) continue;
  const k = key.replace(/^art\//, '');
  rev[k] = (rev[k] ?? 0) + 1;
  changed++;
}
if (changed) {
  const sorted = Object.fromEntries(Object.keys(rev).sort().map((k) => [k, rev[k]]));
  writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n');
}
console.log(`art-rev : ${changed} image(s) remplacée(s) → nouvelle adresse (${Object.keys(rev).length} au total)`);
