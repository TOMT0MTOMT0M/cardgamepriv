/**
 * (13/11, bilan avant la sortie V2) CONTRÔLE DES ILLUSTRATIONS, hors ligne et sans aucun appel au site : chaque carte du
 * catalogue qui a une image doit l'avoir dans `public/art/` (pleine définition ET miniature WebP). Ce sont ces fichiers
 * que la mise en ligne envoie sur R2 : une image absente ici sera absente en prod (silhouette d'attente).
 *
 *   npm run check:images            → résumé par famille + liste dans logs/images-manquantes.txt
 *
 * Rien n'est modifié. Les cartes sans image voulue (`file: ''`, design typographique) ne comptent pas.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_THEMES, artPath, thumbPath, type CatalogEntry } from '../src/core/sets/themes';

const root = process.cwd();
const strip = (p: string) => p.split('?')[0];
const missing: Array<{ id: string; name: string; rarity: string; what: string; path: string }> = [];
const byPrefix = new Map<string, { cards: number; miss: number }>();
let cards = 0;

for (const t of ALL_THEMES) {
  for (const c of t.cards as CatalogEntry[]) {
    if (!c.file) continue;
    cards++;
    const pre = c.id.split('-')[0];
    const row = byPrefix.get(pre) ?? { cards: 0, miss: 0 };
    row.cards++;
    let bad = false;
    for (const [what, p] of [['image', artPath(c)], ['miniature', thumbPath(c)]] as const) {
      const f = join(root, 'public', strip(p));
      if (!existsSync(f)) {
        missing.push({ id: c.id, name: c.name, rarity: c.rarity, what, path: strip(p) });
        bad = true;
      }
    }
    if (bad) row.miss++;
    byPrefix.set(pre, row);
  }
}

const cardsMissing = new Set(missing.map((m) => m.id)).size;
console.log(`${cards} cartes avec une image · ${cardsMissing} avec un fichier absent (${missing.length} fichiers)`);
for (const [pre, r] of [...byPrefix].sort((a, b) => b[1].miss - a[1].miss)) if (r.miss) console.log(`  ${pre.padEnd(8)} ${r.miss} / ${r.cards}`);
mkdirSync(join(root, 'logs'), { recursive: true });
const out = join(root, 'logs', 'images-manquantes.txt');
writeFileSync(out, ['id\tnom\tétoile\tquoi\tchemin', ...missing.map((m) => `${m.id}\t${m.name}\t${m.rarity}\t${m.what}\t${m.path}`)].join('\n') + '\n', 'utf8');
console.log(missing.length ? `Liste : ${out}` : 'Tout est là.');
process.exitCode = missing.length ? 1 : 0;
