/**
 * Envoie public/art/ dans le bucket R2 « cardgamepriv-art » (les images du jeu ne sont plus dans le site Pages).
 *   node scripts/r2-sync.mjs           → n'envoie que les fichiers nouveaux ou modifiés (comparés à R2)
 *   node scripts/r2-sync.mjs --dist    → idem, puis retire dist/art du build si tout est bien dans R2
 *   --nouvelles-seulement             → (V2) n'envoie que les images que R2 n'a pas encore ; une image MODIFIÉE attend le
 *                                       patch prod (publier-patch.cmd) — le bucket est partagé avec le site des joueurs
 * Identifiants (jamais publiés) dans .env.local : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * (Cloudflare → R2 → « Gérer les jetons d'API R2 » → jeton « Lecture et écriture d'objets » limité au bucket).
 * Sans identifiants : avertissement, rien n'est envoyé et dist/art est gardé (le site marche comme avant).
 */
import { readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { S3Client, ListObjectsV2Command, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.R2_BUCKET || 'cardgamepriv-art';
const ROOT = path.resolve('public');
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', json: 'application/json', svg: 'image/svg+xml' };

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
    else if (TYPES[e.name.split('.').pop().toLowerCase()]) list.push(p);
  }
  return list;
}

const E = env();
const dist = process.argv.includes('--dist');
const onlyNew = process.argv.includes('--nouvelles-seulement');
if (!E.R2_ACCOUNT_ID || !E.R2_ACCESS_KEY_ID || !E.R2_SECRET_ACCESS_KEY) {
  console.log('R2 non configuré (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY absents de .env.local) : images gardées dans le site.');
  process.exit(0);
}
const s3 = new S3Client({
  region: 'auto',
  endpoint: E.R2_ENDPOINT || `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: !!E.R2_ENDPOINT,
  credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
});

try {
  await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
} catch (e) {
  console.error(`Bucket « ${BUCKET} » inaccessible (${e.name}). Crée-le : npx wrangler r2 bucket create ${BUCKET}`);
  process.exit(1);
}

// ce qui est déjà dans R2 (taille + empreinte MD5 = ETag des envois simples)
const remote = new Map();
let token;
do {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'art/', ContinuationToken: token }));
  for (const o of r.Contents ?? []) remote.set(o.Key, { size: o.Size, etag: (o.ETag ?? '').replace(/"/g, '') });
  token = r.IsTruncated ? r.NextContinuationToken : undefined;
} while (token);

const files = walk(path.join(ROOT, 'art'));
const todo = [];
let deferred = 0;
for (const f of files) {
  const key = path.relative(ROOT, f).split(path.sep).join('/');
  const r = remote.get(key);
  const size = statSync(f).size;
  if (r && r.size === size) {
    const md5 = createHash('md5').update(readFileSync(f)).digest('hex');
    if (md5 === r.etag) continue;
  }
  if (r && onlyNew) {
    deferred++;
    continue;
  }
  todo.push({ f, key });
}
console.log(`${files.length} images locales · ${remote.size} déjà dans R2 · ${todo.length} à envoyer${deferred ? ` · ${deferred} modifiée(s) gardée(s) pour le patch prod` : ''}`);

let done = 0, failed = 0;
const started = Date.now();
async function worker() {
  while (todo.length) {
    const { f, key } = todo.pop();
    const ext = key.split('.').pop().toLowerCase();
    for (let i = 0; i < 4; i++) {
      try {
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: readFileSync(f), ContentType: TYPES[ext], CacheControl: 'public, max-age=604800' }));
        break;
      } catch (e) {
        if (i === 3) {
          failed++;
          console.error(`échec ${key} : ${e.name}`);
        } else await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    if (++done % 500 === 0) console.log(`  ${done} envoyées (${Math.round((Date.now() - started) / 1000)} s)`);
  }
}
await Promise.all(Array.from({ length: 24 }, worker));
console.log(`${done - failed} envoyées${failed ? `, ${failed} échecs` : ''}`);
if (failed) process.exit(1);

// on ne retire les images du site que si le bucket est branché dessus (sinon /art/* serait vide en ligne)
const bound = existsSync('wrangler.jsonc') && readFileSync('wrangler.jsonc', 'utf8').includes('"r2_buckets"');
if (dist && !bound) console.log('Bucket pas encore branché sur le site (lance lanceurs\\activer-r2.cmd) : images gardées dans le site.');
if (dist && bound && existsSync('dist/art')) {
  rmSync('dist/art', { recursive: true, force: true });
  console.log('dist/art retiré du site : les images sont servies depuis R2 (functions/art).');
}
