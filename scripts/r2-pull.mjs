/**
 * Récupère les illustrations du bucket R2 « cardgamepriv-art » dans public/art/ (lecture seule sur R2).
 * Sert à préparer un nouveau poste (public/art/ n'est pas dans git) ou à reprendre les images ajoutées par l'autre.
 *   node scripts/r2-pull.mjs          → télécharge les fichiers absents en local (ou de taille différente)
 *   node scripts/r2-pull.mjs --dry    → compte seulement ce qui serait téléchargé
 * Identifiants dans .env.local : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
 */
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.R2_BUCKET || 'cardgamepriv-art';
const ROOT = path.resolve('public');
const dry = process.argv.includes('--dry');

const E = { ...process.env };
for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\r\n]*?)"?\s*(#.*)?$/);
    if (m && !(m[1] in process.env)) E[m[1]] = m[2].trim();
  }
}
if (!E.R2_ACCOUNT_ID || !E.R2_ACCESS_KEY_ID || !E.R2_SECRET_ACCESS_KEY) {
  console.error('R2 non configuré : R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY absents de .env.local.');
  process.exit(1);
}
const s3 = new S3Client({
  region: 'auto',
  endpoint: E.R2_ENDPOINT || `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: !!E.R2_ENDPOINT,
  credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
});

const todo = [];
let total = 0, token;
do {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'art/', ContinuationToken: token }));
  for (const o of r.Contents ?? []) {
    if (o.Key.endsWith('/')) continue;
    total++;
    const local = path.join(ROOT, ...o.Key.split('/'));
    if (!existsSync(local) || statSync(local).size !== o.Size) todo.push(o);
  }
  token = r.IsTruncated ? r.NextContinuationToken : undefined;
} while (token);

const mo = (todo.reduce((s, o) => s + o.Size, 0) / 1048576).toFixed(1);
console.log(`R2 : ${total} fichiers · à télécharger : ${todo.length} (${mo} Mo)`);
if (dry || !todo.length) process.exit(0);

let done = 0;
const queue = [...todo];
async function worker() {
  for (let o; (o = queue.shift()); ) {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: o.Key }));
    const local = path.join(ROOT, ...o.Key.split('/'));
    mkdirSync(path.dirname(local), { recursive: true });
    writeFileSync(local, Buffer.from(await r.Body.transformToByteArray()));
    if (++done % 200 === 0) console.log(`  ${done}/${todo.length}`);
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
console.log(`OK : ${done} fichiers dans public/art/`);
