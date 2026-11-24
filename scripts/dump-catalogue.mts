/**
 * (24/11) Catalogue INSTALLÉ (après curation) → JSON, pour scripts/make-etoiles.py (comparaison avec la base de Hugo).
 *   npx esbuild scripts/dump-catalogue.mts --bundle --platform=node --format=esm --outfile=.cache/dump-catalogue.mjs && node .cache/dump-catalogue.mjs <sortie.json> [--raw]
 * --raw : sans la couche Etoiles (src/core/sets/etoiles.ts) — l'état de départ que la couche transforme.
 */
import { writeFileSync } from 'node:fs';
import { installCatalog, ALL_THEMES, SUBTHEMES } from '../src/core/sets/themesCore';
import * as big from '../src/core/sets/catalogBig';

const out = process.argv[2] ?? '.cache/catalogue.json';
installCatalog(big, process.argv.includes('--raw') ? ({ noEtoiles: true } as never) : {});
const subs = SUBTHEMES.map((s) => ({ id: s.id, label: s.label, theme: s.themeId, code: s.code, group: s.group?.id ?? null, groupLabel: s.group?.label ?? null, size: s.size ?? null }));
const cards = ALL_THEMES.flatMap((t) => t.cards.map((c) => ({ id: c.id, theme: c.themeId, sub: c.subthemeId, name: c.name, rarity: c.rarity, num: c.num, file: c.file, art: (c as { art?: string }).art ?? null, label: (c as { label?: string }).label ?? null, kind: (c as { kind?: string }).kind ?? null })));
writeFileSync(out, JSON.stringify({ subs, cards }));
console.log(`${cards.length} cartes, ${subs.length} sous-thèmes → ${out}`);
