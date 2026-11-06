import { v, ConvexError } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { CATALOG_CARDS, type RarityId } from './cardsCatalog';
import { applyRegen } from '../src/core/packRegen';
import { addCoins } from './econLib';

/**
 * OUTILS DE TEST (admin) — fonctions INTERNES : impossibles à appeler depuis le site, seulement depuis la ligne de
 * commande Convex (`npx convex run admin:…`) ou le tableau de bord. Rien n'est publié dans le fil des amis.
 * Les cartes données reçoivent de vrais numéros d'impression (comme un tirage), pour ne jamais créer de doublon de n°.
 */

function rand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / (0xffffffff + 1);
}

/** Joueur par pseudo Discord ou nom affiché (insensible à la casse). */
async function findUser(ctx: MutationCtx, name: string) {
  const users = await ctx.db.query('users').collect();
  const q = name.trim().toLowerCase();
  const exact = users.filter((u) => u.username.toLowerCase() === q || u.displayName.toLowerCase() === q);
  const found = exact.length ? exact : users.filter((u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q));
  if (found.length !== 1) {
    throw new ConvexError(
      `${found.length ? 'Plusieurs' : 'Aucun'} joueur(s) pour « ${name} ». Joueurs : ${users.map((u) => `${u.displayName} (@${u.username})`).join(', ')}`,
    );
  }
  return found[0];
}

/** Ajoute `count` exemplaires d'une carte (numéros d'impression réels, à la suite). */
async function give(ctx: MutationCtx, userId: Id<'users'>, cardId: string, rarity: RarityId, count: number) {
  const mint = await ctx.db
    .query('cardMints')
    .withIndex('by_card_rarity', (q) => q.eq('cardId', cardId).eq('rarity', rarity))
    .unique();
  const first = (mint?.lastMintNumber ?? 0) + 1;
  const last = first + count - 1;
  if (mint) await ctx.db.patch(mint._id, { lastMintNumber: last });
  else await ctx.db.insert('cardMints', { cardId, rarity, lastMintNumber: last });

  const now = Date.now();
  const inv = await ctx.db
    .query('inventory')
    .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', cardId).eq('rarity', rarity))
    .unique();
  if (inv) await ctx.db.patch(inv._id, { count: inv.count + count, bestMintNumber: Math.min(inv.bestMintNumber, first), lastPulledAt: now });
  else
    await ctx.db.insert('inventory', {
      userId,
      cardId,
      rarity,
      count,
      bestMintNumber: first,
      foilSeed: Math.floor(rand() * 900000) + 100000,
      firstPulledAt: now,
      lastPulledAt: now,
    });
}

/** Tire `n` cartes différentes d'un rang (hors thème secret Bébous et hors cartes secrètes). */
function pick(rarity: RarityId, n: number, exclude: Set<string>) {
  const pool = CATALOG_CARDS.filter((c) => c.baseRarity === rarity && c.themeId !== 'bebous' && !exclude.has(c.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/**
 * Pack de test : de quoi jouer toutes les animations.
 *  - contrats / recyclage : 30 cartes × 3 exemplaires dans chaque rang de 1★ à 5★ (60 doublons par rang : assez
 *    pour les contrats de 10, 20 et 50 cartes) ;
 *  - visionneuse : 15 mythiques (6★) ;
 *  - ouvertures : des boosters en plus (au-dessus du plafond de 15, comme un cadeau) ;
 *  - `extra` : cartes précises (ex. 10 × M9 Bayonet | Doppler).
 *
 *   npx convex run admin:grantTestCards '{"name":"tom","packs":40,"extra":[{"cardId":"cs-skin-ae0ce77b8db7","count":10}]}'
 */
export const grantTestCards = internalMutation({
  args: {
    name: v.string(),
    packs: v.optional(v.number()),
    perRarity: v.optional(v.number()),
    copies: v.optional(v.number()),
    mythics: v.optional(v.number()),
    extra: v.optional(v.array(v.object({ cardId: v.string(), count: v.number() }))),
  },
  handler: async (ctx, a) => {
    const user = await findUser(ctx, a.name);
    const perRarity = a.perRarity ?? 30;
    const copies = a.copies ?? 3;
    const used = new Set<string>();
    const summary: Record<string, number> = {};

    for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as RarityId[]) {
      for (const c of pick(r, perRarity, used)) {
        used.add(c.id);
        await give(ctx, user._id, c.id, r, copies);
        summary[r] = (summary[r] ?? 0) + copies;
      }
    }
    for (const c of pick('mythic', a.mythics ?? 15, used)) {
      used.add(c.id);
      await give(ctx, user._id, c.id, 'mythic', 1);
      summary.mythic = (summary.mythic ?? 0) + 1;
    }
    const extras: string[] = [];
    for (const e of a.extra ?? []) {
      const c = CATALOG_CARDS.find((x) => x.id === e.cardId);
      if (!c) throw new ConvexError(`Carte inconnue : ${e.cardId}`);
      await give(ctx, user._id, c.id, c.baseRarity, e.count);
      extras.push(`${e.count} × ${c.name} (${c.baseRarity})`);
    }

    let packBalance = user.packBalance;
    if (a.packs) {
      const now = Date.now();
      const regen = applyRegen(user.packBalance, user.packRegenAt ?? user.lastSeenAt, now);
      packBalance = regen.balance + a.packs;
      await ctx.db.patch(user._id, { packBalance, packRegenAt: now });
    }
    return { joueur: `${user.displayName} (@${user.username})`, cartes: summary, extras, boosters: packBalance };
  },
});

/**
 * Donne (ou retire) l'accès au panneau admin (alertes anti-abus de l'espace Jeux).
 *   npx convex run admin:setAdmin '{"name":"tom"}'
 *   npx convex run admin:setAdmin '{"name":"tom","on":false}'
 */
export const setAdmin = internalMutation({
  args: { name: v.string(), on: v.optional(v.boolean()) },
  handler: async (ctx, { name, on }) => {
    const user = await findUser(ctx, name);
    await ctx.db.patch(user._id, { isAdmin: on ?? true });
    return `${user.displayName} (@${user.username}) : admin ${on === false ? 'retiré' : 'activé'}`;
  },
});

/**
 * Modérateurs des suggestions (retours 06/11 : Hugo et Tom) — reçoivent la file des suggestions (onglet Suggestions,
 * pastille dans le menu) et changent leur statut.
 *   npx convex run admin:setModerator '{"name":"hugo"}'
 *   npx convex run admin:setModerators            (Tom et Hugo d'un coup ; lancé à chaque mise en ligne)
 */
export const setModerator = internalMutation({
  args: { name: v.string(), on: v.optional(v.boolean()) },
  handler: async (ctx, { name, on }) => {
    const user = await findUser(ctx, name);
    await ctx.db.patch(user._id, { isModerator: on ?? true });
    return `${user.displayName} (@${user.username}) : modérateur ${on === false ? 'retiré' : 'activé'}`;
  },
});
export const setModerators = internalMutation({
  args: { names: v.optional(v.array(v.string())) },
  handler: async (ctx, { names }) => {
    const out: string[] = [];
    for (const n of names ?? ['tom', 'hugo']) {
      try {
        const user = await findUser(ctx, n);
        if (!user.isModerator) await ctx.db.patch(user._id, { isModerator: true });
        out.push(`${user.displayName} (@${user.username}) : modérateur`);
      } catch (e) {
        out.push(`« ${n} » : ${(e as Error).message.slice(0, 160)}`);
      }
    }
    return out;
  },
});

/**
 * Ajuste les pièces d'un joueur (test, correction après une alerte). Journalisé (« admin »).
 *   npx convex run admin:grantCoins '{"name":"tom","amount":5000}'
 */
export const grantCoins = internalMutation({
  args: { name: v.string(), amount: v.number(), label: v.optional(v.string()) },
  handler: async (ctx, { name, amount, label }) => {
    const user = await findUser(ctx, name);
    const coins = await addCoins(ctx, user._id, amount, 'admin', label ?? 'Ajustement admin');
    return { joueur: user.displayName, pièces: coins };
  },
});
