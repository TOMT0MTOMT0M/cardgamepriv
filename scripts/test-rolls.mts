/**
 * Vérifie le tirage des boosters (logique partagée client/serveur) sur un grand nombre de packs.
 *   npm run test:rolls          (bundle esbuild puis node ; nbPacks par défaut 400 000)
 */
import { rollPack } from '../src/core/packRoll';
import { packOdds, STAR_RARITIES } from '../src/core/dropRates';
import { BEBOU_SECRET_CHANCE, GAME_CARD_COUNT, THEMES, WORLD_SECRET_CHANCE } from '../src/core/sets/themes';
import { PITY_LIMIT, pityAfter, pityForces, pityLeft } from '../src/core/pity';

const N = Number(process.argv[2] ?? 400_000);
const order = [...STAR_RARITIES, 'secret'];
const rank = (r: string) => order.indexOf(r);
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

for (const req of [...THEMES.filter((t) => t.cards.length).map((t) => ({ kind: 'theme' as const, themeId: t.id })), { kind: 'bebou' as const }]) {
  const atLeast = Object.fromEntries(order.map((r) => [r, 0]));
  let secret = 0, rareGuarantee = 0, wrongTheme = 0;
  for (let i = 0; i < N; i++) {
    const p = rollPack(req);
    const best = Math.max(...p.map((s) => rank(s.rarity)));
    for (let k = 0; k <= best; k++) atLeast[order[k]]++;
    if (p.some((s) => s.rarity === 'secret')) secret++;
    if (best >= rank('rare')) rareGuarantee++;
    if (req.kind === 'theme' && p.some((s) => s.card.themeId !== req.themeId)) wrongTheme++;
    if (p.length !== 5) fails++;
  }
  console.log(`\n── ${req.kind === 'bebou' ? 'BÉBOU PACK' : 'booster ' + req.themeId} · ${N.toLocaleString('fr')} packs`);
  const th = packOdds();
  for (const r of STAR_RARITIES.slice(2)) console.log(`  ${r.padEnd(9)} ou mieux : ${(atLeast[r] / N * 100).toFixed(2)} %  (théorie ${(th[r] * 100).toFixed(2)} %, 1 booster sur ${(1 / th[r]).toFixed(1)})`);
  console.log(`  secrète (Bébou) : ${(secret / N * 100).toFixed(3)} %`);
  check(rareGuarantee === N, 'au moins une rare (ou un Bébou) dans chaque booster');
  if (req.kind === 'theme') {
    if (req.themeId === 'monde') {
      const worldSecretChance = WORLD_SECRET_CHANCE;
      const sd = Math.sqrt(worldSecretChance / N);
      check(Math.abs(secret / N - worldSecretChance) < 4 * sd, `Merveilles secrètes ≈ 1 sur ${Math.round(1 / WORLD_SECRET_CHANCE)} par pack Monde`);
    } else {
      check(secret === 0, `aucune secrète dans un booster de thème sans secrètes (${req.themeId})`);
    }
    check(wrongTheme === 0, 'que des cartes du thème');
    for (const r of STAR_RARITIES.slice(2)) check(Math.abs(atLeast[r] / N - th[r]) < 0.006, `${r}+ conforme à la théorie`);
  } else {
    const sd = Math.sqrt(BEBOU_SECRET_CHANCE / N);
    check(Math.abs(secret / N - BEBOU_SECRET_CHANCE) < 4 * sd, `Bébou ≈ 1 sur ${GAME_CARD_COUNT} par pack (1 / nb total de cartes)`);
  }
}
// ── pity 6★ (src/core/pity.ts) : 200 boosters secs → le suivant contient une Mythique
{
  console.log(`\n── pity 6★ · ${PITY_LIMIT} boosters`);
  let ok = true;
  for (let i = 0; i < 2000; i++) {
    const p = rollPack({ kind: 'bebou', forceMythic: true });
    if (!p.some((s) => s.rarity === 'mythic' || s.rarity === 'secret')) ok = false;
  }
  check(ok, 'forceMythic : une Mythique (ou une Secrète) dans chaque booster');
  check(!pityForces(0) && !pityForces(PITY_LIMIT - 2) && pityForces(PITY_LIMIT - 1), `pityForces : seulement à partir de ${PITY_LIMIT - 1} boosters secs`);
  check(pityLeft(0) === PITY_LIMIT - 1 && pityLeft(PITY_LIMIT - 1) === 0, 'pityLeft : compte à rebours');
  check(pityAfter(5, ['common', 'rare']) === 6 && pityAfter(150, ['common', 'mythic']) === 0 && pityAfter(150, ['secret']) === 0, 'pityAfter : +1 ou retour à zéro');
  // simulation : jamais plus de 200 boosters sans 6★
  let count = 0, worst = 0;
  for (let i = 0; i < 100_000; i++) {
    const p = rollPack({ kind: 'bebou', forceMythic: pityForces(count) });
    count = pityAfter(count, p.map((s) => s.rarity));
    worst = Math.max(worst, count);
  }
  check(worst <= PITY_LIMIT - 1, `pire série sèche sur 100 000 boosters : ${worst} (≤ ${PITY_LIMIT - 1})`);
}
console.log(fails ? `\n${fails} échec(s)` : '\ntout est conforme');
process.exit(fails ? 1 : 0);
