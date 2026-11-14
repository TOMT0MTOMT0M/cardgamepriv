/**
 * BILAN DE DEUX EXPORTS CONVEX (sortie V2, 14/11) — hors ligne, zéro appel au serveur, zéro coût.
 *
 *   node scripts/bilan-exports.mjs <avant.zip|dossier> <après.zip|dossier>
 *
 * Compare joueur par joueur : lignes d'inventaire, exemplaires (par carte, toutes étoiles confondues), pièces, boosters
 * en réserve, classeurs, paliers de succès encaissés. Liste les cartes dont l'ÉTOILE a changé (rééquilibrage : attendu)
 * et les cartes qui ont DISPARU d'un inventaire (purge du catalogue ou perte : à lire).
 *
 * Verdict : « 0 perte » si aucun joueur n'a moins d'exemplaires d'une carte, moins de pièces, de classeurs ou de succès
 * qu'avant — les boosters en réserve peuvent bouger (recharge), ils sont seulement montrés. Code de sortie 1 sinon.
 * Rapport complet : logs/bilan-exports-<date>.txt. Rien n'est modifié.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('Usage : node scripts/bilan-exports.mjs <avant.zip|dossier> <après.zip|dossier>');
  process.exit(2);
}

/** dossier de l'export (un zip est décompressé avec `tar`, présent sur Windows 10+ comme sous Linux et macOS) */
function open(p) {
  if (!existsSync(p)) throw new Error(`Introuvable : ${p}`);
  if (statSync(p).isDirectory()) return p;
  const dir = mkdtempSync(join(tmpdir(), 'bilan-'));
  execFileSync('tar', ['-xf', p, '-C', dir]);
  return dir;
}
/** documents d'une table (`<table>/documents.jsonl`), [] si la table n'existe pas dans cet export */
function table(dir, name) {
  const f = join(dir, name, 'documents.jsonl');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function load(p) {
  const dir = open(p);
  const users = table(dir, 'users');
  if (!users.length) throw new Error(`Pas de table « users » dans ${p} : est-ce bien un export Convex ?`);
  const inv = table(dir, 'inventory');
  const binders = table(dir, 'binders');
  const byUser = new Map();
  for (const u of users)
    byUser.set(u._id, {
      name: u.displayName ?? u._id,
      coins: u.coins ?? 0,
      packs: u.packBalance ?? 0,
      ach: (u.econ?.achievements ?? []).length,
      binders: 0,
      rows: 0,
      copies: 0,
      /** cardId → { total, rarities: Set } */
      cards: new Map(),
    });
  for (const r of inv) {
    const u = byUser.get(r.userId);
    if (!u) continue;
    u.rows++;
    u.copies += r.count;
    const c = u.cards.get(r.cardId) ?? { total: 0, rarities: new Set() };
    c.total += r.count;
    if (r.count > 0) c.rarities.add(r.rarity);
    u.cards.set(r.cardId, c);
  }
  for (const x of binders) {
    const u = byUser.get(x.userId);
    if (u) u.binders++;
  }
  return { byUser, invRows: inv.length };
}

const A = load(a);
const B = load(b);
const out = [];
const say = (s = '') => out.push(s);
const losses = [];
const starChanges = new Map(); // cardId → Map("rare→epic" → n joueurs)
const gone = new Map(); // cardId → joueurs
let rowsBefore = 0, rowsAfter = 0;

say(`Bilan des exports : ${basename(a)} → ${basename(b)}`);
say(`Joueurs : ${A.byUser.size} → ${B.byUser.size} · lignes d'inventaire : ${A.invRows} → ${B.invRows}`);
say('');
say('Joueur                     lignes        exemplaires     pièces            boosters   classeurs  succès');
for (const [id, u] of A.byUser) {
  const v = B.byUser.get(id);
  if (!v) {
    losses.push(`${u.name} : joueur absent du second export`);
    continue;
  }
  rowsBefore += u.rows;
  rowsAfter += v.rows;
  const d = (x, y) => `${x}→${y}${y < x ? ' ▼' : ''}`;
  say(`${u.name.slice(0, 26).padEnd(26)} ${d(u.rows, v.rows).padEnd(13)} ${d(u.copies, v.copies).padEnd(15)} ${d(u.coins, v.coins).padEnd(17)} ${`${u.packs}→${v.packs}`.padEnd(10)} ${d(u.binders, v.binders).padEnd(10)} ${d(u.ach, v.ach)}`);
  if (v.coins < u.coins) losses.push(`${u.name} : pièces ${u.coins} → ${v.coins}`);
  if (v.binders < u.binders) losses.push(`${u.name} : classeurs ${u.binders} → ${v.binders}`);
  if (v.ach < u.ach) losses.push(`${u.name} : succès ${u.ach} → ${v.ach}`);
  for (const [cardId, c] of u.cards) {
    const n = v.cards.get(cardId);
    if (!n || n.total === 0) {
      gone.set(cardId, [...(gone.get(cardId) ?? []), u.name]);
      continue;
    }
    if (n.total < c.total) losses.push(`${u.name} : ${cardId} ×${c.total} → ×${n.total}`);
    const from = [...c.rarities].sort().join('+');
    const to = [...n.rarities].sort().join('+');
    if (from && to && from !== to) {
      const m = starChanges.get(cardId) ?? new Map();
      const k = `${from} → ${to}`;
      m.set(k, (m.get(k) ?? 0) + 1);
      starChanges.set(cardId, m);
    }
  }
}
for (const [id, v] of B.byUser) if (!A.byUser.has(id)) say(`(nouveau joueur dans le second export : ${v.name})`);

say('');
say(`Cartes dont l'étoile a changé : ${starChanges.size}`);
for (const [cardId, m] of [...starChanges].sort()) say(`  ${cardId} : ${[...m].map(([k, n]) => `${k} (${n} joueur${n > 1 ? 's' : ''})`).join(' ; ')}`);
say('');
say(`Cartes disparues d'un inventaire : ${gone.size} (purge du catalogue attendue, sinon c'est une perte)`);
for (const [cardId, who] of [...gone].sort()) say(`  ${cardId} : ${who.join(', ')}`);
say('');
say(losses.length ? `PERTES : ${losses.length}` : 'Verdict : 0 perte (exemplaires, pièces, classeurs, succès). Les boosters en réserve sont montrés, pas jugés.');
for (const l of losses) say(`  ${l}`);

const text = out.join('\n') + '\n';
mkdirSync('logs', { recursive: true });
const file = join('logs', `bilan-exports-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
writeFileSync(file, text, 'utf8');
// console : l'essentiel (le tableau complet est dans le fichier)
console.log(out.slice(0, 2).join('\n'));
console.log(`Étoiles changées : ${starChanges.size} cartes · cartes disparues : ${gone.size} · lignes ${rowsBefore} → ${rowsAfter}`);
console.log(losses.length ? `PERTES : ${losses.length} (détail dans ${file})` : '0 perte.');
console.log(`Rapport : ${file}`);
process.exitCode = losses.length || gone.size ? 1 : 0;
