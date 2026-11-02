/**
 * Miniatures WebP des illustrations (grilles de collection et d'échange) : public/art/<thème>/thumbs/<nom>.webp.
 *   node scripts/make-thumbs.mjs              → tous les dossiers de public/art
 *   node scripts/make-thumbs.mjs pokemon-151  → un seul dossier
 * Ne refait que les miniatures plus anciennes que leur source (relancer après avoir remplacé une image).
 * 256 px de côté max (net en DPR 2 dans une tuile de ~128 px), transparence conservée, ≈ 5–15 Ko pièce.
 */
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve('public/art');
const SIZE = 256;
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

let made = 0, kept = 0, bytes = 0;
for (const dir of dirs) {
  const src = path.join(ROOT, dir);
  const out = path.join(src, 'thumbs');
  await mkdir(out, { recursive: true });
  const files = (await readdir(src)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  for (const f of files) {
    const from = path.join(src, f);
    const to = path.join(out, f.replace(/\.(png|jpe?g|webp)$/i, '.webp'));
    const [a, b] = await Promise.all([stat(from), stat(to).catch(() => null)]);
    if (b && b.mtimeMs >= a.mtimeMs) { kept++; continue; }
    const info = await sharp(from).resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, alphaQuality: 90, effort: 5 }).toFile(to);
    bytes += info.size;
    made++;
  }
  console.log(`${dir} : ${files.length} images`);
}
console.log(`${made} miniatures créées (${(bytes / 1e6).toFixed(1)} Mo), ${kept} déjà à jour`);
