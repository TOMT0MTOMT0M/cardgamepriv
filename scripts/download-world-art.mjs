/**
 * Téléchargeur & Optimiseur d'Images pour le World Pack 🌍
 * Lit scripts/world-manifest.json et génère :
 *   public/art/<dossier>/<num>-<slug>.png
 *   public/art/<dossier>/thumbs/<num>-<slug>.webp
 * Utilise Sharp pour le redimensionnement HD (max 900px) et miniature WebP (256px).
 * Téléchargement concurrentiel avec reprise sur erreur et skip des images déjà présentes.
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 (CardGameApp/1.0; contact@cardgamepriv.local)';

const ART_DIRS = {
  merveilles: 'merveilles',
  ardeche: 'ardeche',
  lieux: 'lieux',
  animaux: 'animaux',
  nourriture: 'nourriture',
  voitures: 'voitures',
};

async function downloadBuffer(url, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2500 * attempt;
        // console.log(`⏳ 429 reçu, attente de ${waitMs}ms...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
}

async function processCard(category, item) {
  const dirName = ART_DIRS[category];
  const outDir = path.join(ROOT, 'public/art', dirName);
  const thumbsDir = path.join(outDir, 'thumbs');
  await fs.mkdir(thumbsDir, { recursive: true });

  const numStr = String(item.num).padStart(3, '0');
  const pngName = `${numStr}-${item.slug}.png`;
  const webpName = `${numStr}-${item.slug}.webp`;

  const fullPath = path.join(outDir, pngName);
  const thumbPath = path.join(thumbsDir, webpName);

  if (existsSync(fullPath) && existsSync(thumbPath)) {
    const s = await fs.stat(fullPath);
    if (s.size > 2000) return 'skip';
  }

  if (!item.url) return 'no_url';

  const buf = await downloadBuffer(item.url);

  // 1. HD Art (max 900x900) optimisé PNG
  await sharp(buf)
    .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 7 })
    .toFile(fullPath);

  // 2. Thumbnail WebP (256x256)
  await sharp(buf)
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, alphaQuality: 90, effort: 4 })
    .toFile(thumbPath);

  return 'downloaded';
}

async function main() {
  const manifestPath = path.join(ROOT, 'scripts/world-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`world-manifest.json introuvable à ${manifestPath}`);
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  const queue = [];
  for (const [category, items] of Object.entries(manifest)) {
    for (const item of items) {
      queue.push({ category, item });
    }
  }

  console.log(`🚀 Démarrage du téléchargement pour ${queue.length} cartes du World Pack…`);

  const CONCURRENCY = 4;
  let done = 0;
  let skipped = 0;
  let downloaded = 0;
  let failed = 0;

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      try {
        const res = await processCard(task.category, task.item);
        if (res === 'downloaded') {
          downloaded++;
          // Petit délai de politesse pour éviter d'affoler les serveurs Wikimedia
          await new Promise((r) => setTimeout(r, 120));
        } else if (res === 'skip') {
          skipped++;
        }
      } catch (err) {
        failed++;
        console.warn(`[fail] ${task.category}/${task.item.slug} (${task.item.url}): ${err.message}`);
      }
      done++;
      if (done % 50 === 0 || done === queue.length) {
        console.log(`[Progression] ${done} cartes traitées (téléchargées: ${downloaded}, déjà là: ${skipped}, erreurs: ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\n✨ Terminé !`);
  console.log(`   Téléchargées : ${downloaded}`);
  console.log(`   Déjà à jour  : ${skipped}`);
  console.log(`   Échecs       : ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
