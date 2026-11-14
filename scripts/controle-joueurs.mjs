/**
 * CONTRÔLE DES TIRAGES PAR JOUEUR (11/11) — lecture seule, ne modifie rien en ligne.
 * Lit un export de la base (dossier extrait de `npx convex export`) et compare, pour chaque joueur, ses 6★ et 5★
 * tirées aux taux du jeu (src/core/dropRates.ts). Pour le joueur demandé : d'où viennent ses 6★ (boutique, jeux,
 * échanges, contrats), ses boosters par jour, les comptes liés (même appareil, filleuls), le journal admin.
 * Sortie : la console + logs/controle-joueurs.json. Aucun jeton ni mot de passe n'est recopié.
 * Lancé par lanceurs/controler-joueur.cmd :  node scripts/controle-joueurs.mjs <dossier de l'export> [pseudo]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, pseudoArg = ''] = process.argv.slice(2);
if (!dir || !existsSync(dir)) {
  console.error('Dossier de l’export introuvable : ' + dir);
  process.exit(1);
}
const load = (table) => {
  const p = join(dir, table, 'documents.jsonl');
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
};

// ── taux du jeu, lus dans le code en ligne (master) : rien à tenir à jour ici
const STARS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
function weights(name, fallback) {
  for (const f of ['.wt-master/src/core/dropRates.ts', 'src/core/dropRates.ts']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`export const ${name}[^{]*\\{([^}]*)\\}`));
    if (!m) continue;
    const w = {};
    for (const s of STARS) w[s] = Number(m[1].match(new RegExp(`${s}:\\s*([\\d.]+)`))?.[1] ?? NaN);
    if (STARS.every((s) => Number.isFinite(w[s]))) return w;
  }
  return fallback;
}
const SLOT = weights('SLOT_WEIGHTS', { common: 58.25, uncommon: 27, rare: 10, epic: 3.5, legendary: 1, mythic: 0.25 });
const GUAR = weights('GUARANTEED_WEIGHTS', { common: 0, uncommon: 0, rare: 71.5, epic: 21, legendary: 6, mythic: 1.5 });
const atLeast = (from) => {
  const sum = (w) => STARS.slice(from).reduce((a, s) => a + w[s], 0) / 100;
  return 1 - Math.pow(1 - sum(SLOT), 4) * (1 - sum(GUAR));
};
const P6 = atLeast(5); // un booster contient au moins une 6★
const P5 = atLeast(4); // au moins une 5★ ou mieux

// ── P(X >= k) pour une loi binomiale (n, p), calcul exact en logarithmes
function tail(n, p, k) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  const lg = [0];
  for (let i = 1; i <= n; i++) lg[i] = lg[i - 1] + Math.log(i);
  let s = 0;
  for (let i = k; i <= n; i++) s += Math.exp(lg[n] - lg[i] - lg[n - i] + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, s);
}
const TIER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const is6 = (c) => c.rarity === 'mythic';
const n6 = (cards) => (cards ?? []).reduce((a, c) => a + (is6(c) ? (c.count ?? 1) : 0), 0);
const day = (t) => new Date(t).toISOString().slice(0, 10);
const pct = (x) => (100 * x).toFixed(2) + ' %';
const sci = (x) => (x >= 0.001 ? x.toFixed(4) : x.toExponential(1));

const users = load('users');
const byId = new Map(users.map((u) => [u._id, u]));
const name = (id) => byId.get(id)?.displayName ?? '?';
const S = new Map(users.map((u) => [u._id, { id: u._id, name: u.displayName, username: u.username, createdAt: u._creationTime, banned: !!u.bannedAt, admin: !!u.isAdmin, totalPacksOpened: u.totalPacksOpened ?? 0, pity: u.pityCount ?? 0, packs: 0, sealed: 0, god: 0, packs6: 0, cards6: 0, packs5: 0, gamePacks: 0, gameCards6Drawn: 0, in6: { jeux: 0, echanges: 0, contrats: 0, roulette: 0 }, out6: { jeux: 0, echanges: 0, roulette: 0 }, inv6Distinct: 0, inv6Copies: 0, perDay: {}, pulls6: [] }]));
const st = (id) => S.get(id);

// ── boosters de la boutique
for (const p of load('packOpens')) {
  const s = st(p.userId);
  if (!s) continue;
  if (p.status !== 'revealed') { s.sealed++; continue; }
  if (p.god) { s.god++; continue; } // les god packs (1 sur 1 000) sont comptés à part : ils fausseraient le taux
  s.packs++;
  const d = day(p.revealedAt ?? p.createdAt);
  s.perDay[d] = (s.perDay[d] ?? 0) + 1;
  const c6 = n6(p.cards);
  if (c6) { s.packs6++; s.cards6 += c6; for (const c of p.cards.filter(is6)) s.pulls6.push({ quand: new Date(p.createdAt).toISOString(), carte: c.cardName, numero: c.mintNumber, booster: p.themeId ?? p.packKind ?? 'bebou' }); }
  if (p.cards.some((c) => TIER[c.rarity] >= TIER.legendary)) s.packs5++;
}

// ── jeux : Pack Battle (le gagnant prend tout), Battle Royale, roulette
for (const d of load('duels')) {
  if (d.status !== 'done' || !d.result) continue;
  d.sides.forEach((side, i) => {
    const s = st(side.userId);
    const mine = (d.result.packs[i] ?? []).flat();
    if (s) { s.gamePacks += (d.result.packs[i] ?? []).length; s.gameCards6Drawn += n6(mine); }
  });
  const w = d.result.winner;
  if (w === undefined || w === null) continue;
  const l = 1 - w;
  const win = st(d.sides[w]?.userId), lose = st(d.sides[l]?.userId);
  const fromLoser = n6((d.result.packs[l] ?? []).flat()) + n6(d.sides[l]?.stake?.cards);
  if (win) win.in6.jeux += n6((d.result.packs[w] ?? []).flat()) + fromLoser;
  if (lose) lose.out6.jeux += n6(d.sides[l]?.stake?.cards);
}
for (const r of load('royales')) {
  if (r.status !== 'done' || !r.result) continue;
  r.players.forEach((pl, i) => {
    const s = st(pl.userId);
    if (!s) return;
    s.gamePacks += 1;
    s.gameCards6Drawn += n6(r.result.packs[i]);
    s.in6.jeux += n6(r.result.awarded?.[i]);
  });
}
for (const r of load('rouletteRounds')) {
  if (r.status !== 'drawn' || !r.result) continue;
  const w = r.result.winnerId;
  for (const b of r.bets ?? []) {
    const s = st(b.userId);
    if (s && b.userId !== w) s.out6.roulette += n6(b.cards);
  }
  const s = w && st(w);
  if (s) s.in6.roulette += n6(r.carriedCards) + n6(r.houseCards) + (r.bets ?? []).filter((b) => b.userId !== w).reduce((a, b) => a + n6(b.cards), 0);
}

// ── échanges acceptés et contrats
const partners = new Map();
for (const t of load('trades')) {
  if (t.status !== 'accepted') continue;
  const a = st(t.fromUserId), b = st(t.toUserId);
  const off = n6(t.offered), req = n6(t.requested);
  if (a) { a.out6.echanges += off; a.in6.echanges += req; }
  if (b) { b.in6.echanges += off; b.out6.echanges += req; }
  for (const [me, other, got, gave] of [[t.fromUserId, t.toUserId, req, off], [t.toUserId, t.fromUserId, off, req]]) {
    const k = me + '|' + other;
    const x = partners.get(k) ?? { echanges: 0, recues6: 0, donnees6: 0 };
    x.echanges++; x.recues6 += got; x.donnees6 += gave;
    partners.set(k, x);
  }
}
for (const a of load('activityFeed')) if (a.kind === 'contract' && a.rarity === 'mythic' && st(a.userId)) st(a.userId).in6.contrats++;

for (const i of load('inventory')) {
  const s = st(i.userId);
  if (s && i.rarity === 'mythic' && i.count > 0) { s.inv6Distinct++; s.inv6Copies += i.count; }
}

// ── tableau de tous les joueurs
const rows = [...S.values()].filter((s) => s.packs > 0).map((s) => {
  const got = s.cards6 + s.in6.jeux + s.in6.echanges + s.in6.contrats + s.in6.roulette;
  const lost = s.out6.jeux + s.out6.echanges + s.out6.roulette;
  return { ...s, taux6: s.packs6 / s.packs, attendu6: +(s.packs * P6).toFixed(1), p6: tail(s.packs, P6, s.packs6), taux5: s.packs5 / s.packs, attendu5: +(s.packs * P5).toFixed(1), p5: tail(s.packs, P5, s.packs5), ecart6: s.inv6Copies - (got - lost) };
}).sort((a, b) => a.p6 - b.p6);

const tot = rows.reduce((a, r) => ({ packs: a.packs + r.packs, packs6: a.packs6 + r.packs6, packs5: a.packs5 + r.packs5 }), { packs: 0, packs6: 0, packs5: 0 });
console.log(`Taux du jeu : un booster contient une 6★ dans ${pct(P6)} des cas, une 5★ ou mieux dans ${pct(P5)}.`);
console.log(`Tous joueurs : ${tot.packs} boosters, ${tot.packs6} avec 6★ (${pct(tot.packs6 / Math.max(1, tot.packs))}), ${tot.packs5} avec 5★+ (${pct(tot.packs5 / Math.max(1, tot.packs))}).`);
console.log('');
console.log('joueur               boosters  avec6★  attendu  taux6★   chance*   avec5★+ attendu  chance*');
for (const r of rows) console.log(`${r.name.slice(0, 20).padEnd(20)} ${String(r.packs).padStart(8)} ${String(r.packs6).padStart(7)} ${String(r.attendu6).padStart(8)} ${pct(r.taux6).padStart(8)} ${sci(r.p6).padStart(9)} ${String(r.packs5).padStart(9)} ${String(r.attendu5).padStart(7)} ${sci(r.p5).padStart(8)}`);
console.log('* chance = probabilité d’en avoir autant ou plus avec les vrais taux. Avec une vingtaine de joueurs, une valeur de');
console.log('  0,05 arrive à quelqu’un par simple hasard ; en dessous de 0,001 c’est anormal.');

// ── détail du joueur demandé
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
let detail = null;
if (pseudoArg.trim()) {
  const q = norm(pseudoArg);
  const hit = rows.filter((r) => norm(r.name) === q || norm(r.username) === q);
  const near = hit.length ? hit : rows.filter((r) => norm(r.name).includes(q) || norm(r.username).includes(q));
  if (near.length !== 1) console.log(`\nJoueur « ${pseudoArg} » : ${near.length ? 'plusieurs comptes correspondent (' + near.map((r) => r.name).join(', ') + ')' : 'introuvable'}.`);
  else {
    const r = near[0];
    const u = byId.get(r.id);
    const days = Object.entries(r.perDay).sort();
    const ageMin = (Date.now() - r.createdAt) / 60000;
    const dev = new Set(u.devices ?? []);
    const sameDevice = users.filter((x) => x._id !== u._id && (x.devices ?? []).some((d) => dev.has(d))).map((x) => x.displayName);
    const filleuls = users.filter((x) => x.referredBy === u._id).map((x) => ({ nom: x.displayName, boostersOuverts: x.totalPacksOpened ?? 0, memeAppareil: !!x.referredDevice && dev.has(x.referredDevice) }));
    const mine = [...partners.entries()].filter(([k]) => k.startsWith(r.id + '|')).map(([k, v]) => ({ avec: name(k.split('|')[1]), ...v })).sort((a, b) => b.recues6 - a.recues6);
    const coin = {};
    for (const t of load('coinTx')) if (t.userId === r.id) { coin[t.reason] ??= { n: 0, total: 0 }; coin[t.reason].n++; coin[t.reason].total += t.amount; }
    const admin = load('adminLog').filter((l) => { const j = JSON.stringify(l); return j.includes(r.id) || j.includes(JSON.stringify(r.name).slice(1, -1)); }).map((l) => { const { _id, _creationTime, ...rest } = l; return { quand: new Date(_creationTime).toISOString(), ...rest }; });
    detail = {
      joueur: r.name, compteCreeLe: new Date(r.createdAt).toISOString(), banni: r.banned, admin: r.admin,
      boutique: { boosters: r.packs, avec6: r.packs6, cartes6: r.cards6, attendu6: r.attendu6, chance6: r.p6, avec5ouMieux: r.packs5, attendu5: r.attendu5, chance5: r.p5, godPacks: r.god, scellesNonOuverts: r.sealed },
      compteurPity: r.pity, boostersOuvertsAuTotal: r.totalPacksOpened, boostersEnJeux: r.gamePacks,
      rechargeMaxTheorique: Math.floor(ageMin / 5), // 1 booster / 5 min depuis la création, sans bonus ni achats
      parJour: Object.fromEntries(days), jourLePlusCharge: days.reduce((a, d) => (d[1] > a[1] ? d : a), ['', 0]),
      sixEtoiles: { tireesBoutique: r.cards6, tireesEnJeu: r.gameCards6Drawn, recues: r.in6, parties: r.out6, enCollection: { cartes: r.inv6Distinct, exemplaires: r.inv6Copies }, ecartInexplique: r.ecart6 },
      tirages6: r.pulls6, echangesPar: mine, comptesSurLeMemeAppareil: sameDevice, filleuls, pieces: coin, journalAdmin: admin,
    };
    console.log(`\n=== ${r.name} ===`);
    console.log(`Boutique : ${r.packs} boosters, ${r.packs6} avec 6★ (attendu ${r.attendu6}, chance ${sci(r.p6)}), ${r.packs5} avec 5★+ (attendu ${r.attendu5}, chance ${sci(r.p5)}), ${r.god} god pack(s).`);
    console.log(`Total ouvert (boutique + jeux) : ${r.totalPacksOpened}. Recharge maximale depuis la création du compte, sans bonus : ${detail.rechargeMaxTheorique}.`);
    console.log(`Jour le plus chargé : ${detail.jourLePlusCharge[0]} (${detail.jourLePlusCharge[1]} boosters). Une recharge normale donne 288 boosters par jour au plus.`);
    console.log(`6★ : ${r.cards6} tirées en boutique · reçues ${JSON.stringify(r.in6)} · parties ${JSON.stringify(r.out6)} · en collection ${r.inv6Copies} exemplaires (${r.inv6Distinct} cartes).`);
    console.log(`Écart inexpliqué : ${r.ecart6} (0 = tout s'explique ; positif = des 6★ venues d'ailleurs, par exemple un don admin).`);
    console.log(`Échanges : ${mine.length ? mine.map((m) => `${m.avec} (${m.echanges} échanges, ${m.recues6} 6★ reçues, ${m.donnees6} données)`).join(' · ') : 'aucun'}.`);
    console.log(`Même appareil qu'un autre compte : ${sameDevice.length ? sameDevice.join(', ') : 'non'}. Filleuls : ${filleuls.length ? filleuls.map((f) => `${f.nom} (${f.boostersOuverts} boosters${f.memeAppareil ? ', MÊME APPAREIL' : ''})`).join(', ') : 'aucun'}.`);
    console.log(`Journal admin le concernant : ${admin.length} ligne(s).`);
  }
}

mkdirSync('logs', { recursive: true });
const light = rows.map(({ id, username, perDay, pulls6, ...r }) => r);
writeFileSync('logs/controle-joueurs.json', JSON.stringify({ exporteLe: new Date().toISOString(), tauxParBooster: { sixEtoiles: P6, cinqEtoilesOuMieux: P5 }, tousJoueurs: tot, joueurs: light, detail }, null, 2));
console.log('\nDétail complet : logs/controle-joueurs.json');
