/**
 * (version anglaise, lot 5) Vide le catalogue français en JSON pour scripts/make-catalogue-en.py :
 *   npx esbuild scripts/i18n/dump-catalogue.ts --bundle --platform=node --outfile=.claude-tmp/dump.cjs && node .claude-tmp/dump.cjs > .claude-tmp/catalogue-fr.json
 */
import { ALL_THEMES, SUBTHEMES } from '../../src/core/sets/themes';

const cards: Record<string, { name: string; sub: string; theme: string; label?: string }> = {};
for (const t of ALL_THEMES) for (const c of t.cards) cards[c.id] = { name: c.name, sub: c.subthemeId, theme: c.themeId, ...(c.label ? { label: c.label } : {}) };
const subs: Record<string, { label: string; theme: string; group?: string; groupLabel?: string }> = {};
for (const s of SUBTHEMES) subs[s.id] = { label: s.label, theme: s.themeId, ...(s.group ? { group: s.group.id, groupLabel: s.group.label } : {}) };
process.stdout.write(JSON.stringify({ cards, subs }));
