import type { SealedPack } from './backend';

const R: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };

/**
 * Gros booster (×5 / ×10) : les N boosters scellés, leurs cartes mises en commun et triées (moins rare → plus rare,
 * la secrète en dernier), puis redistribuées en N morceaux montrés à la suite comme un seul booster. Chaque morceau
 * garde l'id d'un vrai booster (crédit côté serveur) : les boosters sont pris du moins bon au meilleur, pour que le
 * meilleur — celui qui annonce un gros tirage dans le fil — soit crédité en dernier, une fois sa carte montrée.
 *
 * (26/11, patch v2.1.28) GOD PACK dans la série : ses cartes, triées avec les autres, finissent dans le DERNIER morceau,
 * mais le drapeau `god` restait sur le morceau qui portait l'id du vrai god pack — rangé avant le dernier dès qu'un autre
 * booster du lot avait aussi une 6★ (le god pack offert est le 1er scellé) ou une secrète : la séquence GOD PACK se
 * jouait sur un morceau ordinaire. Désormais, à meilleur tirage égal, un god pack est rangé (donc crédité) après les
 * autres, et la séquence se joue une fois, sur le dernier morceau : ses cartes valent au moins celles du god pack.
 */
export function spreadSeries(list: SealedPack[]): SealedPack[] {
  const best = (p: SealedPack) => Math.max(...p.cards.map((c) => R[c.rarity] ?? 0));
  const god = list.some((p) => p.god);
  const real = list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => best(a.p) - best(b.p) || Number(!!a.p.god) - Number(!!b.p.god) || a.i - b.i)
    .map((x) => x.p);
  const cards = list.flatMap((p) => p.cards).map((c, i) => ({ c, i })).sort((a, b) => (R[a.c.rarity] ?? 0) - (R[b.c.rarity] ?? 0) || a.i - b.i).map((x) => x.c);
  let at = 0;
  return real.map(({ god: _god, ...p }, k) => {
    const chunk = cards.slice(at, (at += p.cards.length));
    return god && k === real.length - 1 ? { ...p, cards: chunk, god: true } : { ...p, cards: chunk };
  });
}
