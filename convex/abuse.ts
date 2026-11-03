import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireUser } from './auth';
import { requireAdmin } from './econLib';
import { ABUSE, cardsValue } from '../src/core/economy';

/**
 * ANTI-ABUS (spec du 3 nov.) — aucun plafond, aucun blocage automatique : des ALERTES discrètes dans le panneau admin,
 * tranchées à la main (entre potes, un don est légitime). Les jeux étant 100 % aléatoires, la triche ne se voit pas sur
 * un duel isolé mais sur les FLUX :
 *  - flux net de valeur A → B (duels, royales, roulette, échanges) > 5 000 sur 30 jours glissants ;
 *  - échanges déséquilibrés : ratio de valeur > 3:1, 3 fois ou plus sur 30 jours ;
 *  - signaux contextuels : nouveau compte qui perd beaucoup contre un ancien, deux comptes sur le même appareil.
 */

export interface AbuseAlert {
  /** clé stable (pour marquer « vu ») */
  key: string;
  kind: 'flow' | 'trades' | 'newAccount' | 'device' | 'referral';
  title: string;
  detail: string;
  value: number;
  users: string[];
  verdict?: 'ok' | 'watch';
  note?: string;
}

export const alerts = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const me = await requireUser(ctx, sessionToken);
    await requireAdmin(me);
    const now = Date.now();
    const since = now - ABUSE.windowMs;
    const users = await ctx.db.query('users').collect();
    const name = new Map(users.map((u) => [u._id as string, u.displayName]));
    const nm = (id: Id<'users'> | string) => name.get(id as string) ?? '?';
    const out: AbuseAlert[] = [];

    // 1. flux nets par paire
    const flows = await ctx.db.query('valueFlows').withIndex('by_createdAt', (q) => q.gte('createdAt', since)).collect();
    const pair = new Map<string, { a: Id<'users'>; b: Id<'users'>; ab: number; ba: number; src: Set<string> }>();
    for (const f of flows) {
      const [a, b] = [f.fromUserId, f.toUserId].sort() as [Id<'users'>, Id<'users'>];
      const k = `${a}|${b}`;
      const p = pair.get(k) ?? { a, b, ab: 0, ba: 0, src: new Set<string>() };
      if (f.fromUserId === a) p.ab += f.value;
      else p.ba += f.value;
      p.src.add(f.source);
      pair.set(k, p);
    }
    for (const p of pair.values()) {
      const net = p.ab - p.ba;
      if (Math.abs(net) <= ABUSE.netFlow) continue;
      const [from, to] = net > 0 ? [p.a, p.b] : [p.b, p.a];
      out.push({
        key: `flow:${from}>${to}`,
        kind: 'flow',
        title: `${nm(from)} → ${nm(to)} : flux net de ${Math.abs(net)} en 30 jours`,
        detail: `Sources : ${[...p.src].join(', ')}. Seuil : ${ABUSE.netFlow}. Le Pack Battle consolide toutes les cartes sur UN compte : vérifier qu'il ne s'agit pas d'un farm multi-comptes.`,
        value: Math.abs(net),
        users: [from, to],
      });
    }

    // 2. échanges déséquilibrés répétés
    const trades = (await ctx.db.query('trades').collect()).filter((t) => t.status === 'accepted' && (t.resolvedAt ?? t.createdAt) >= since);
    const lopsided = new Map<string, { giver: Id<'users'>; taker: Id<'users'>; n: number; worst: number }>();
    for (const t of trades) {
      const give = cardsValue(t.offered);
      const get = cardsValue(t.requested);
      const [giver, taker, hi, lo] = give >= get ? [t.fromUserId, t.toUserId, give, get] : [t.toUserId, t.fromUserId, get, give];
      if (hi <= ABUSE.tradeRatio * Math.max(lo, 1)) continue;
      const k = `${giver}>${taker}`;
      const e = lopsided.get(k) ?? { giver, taker, n: 0, worst: 0 };
      e.n++;
      e.worst = Math.max(e.worst, lo ? hi / lo : hi);
      lopsided.set(k, e);
    }
    for (const e of lopsided.values()) {
      if (e.n < ABUSE.tradeRatioCount) continue;
      out.push({
        key: `trades:${e.giver}>${e.taker}`,
        kind: 'trades',
        title: `${nm(e.giver)} donne beaucoup plus qu'il ne reçoit de ${nm(e.taker)}`,
        detail: `${e.n} échanges à plus de ${ABUSE.tradeRatio}:1 en valeur sur 30 jours (pire : ${e.worst >= 1000 ? 'don pur' : `${e.worst.toFixed(1)}:1`}).`,
        value: e.n,
        users: [e.giver, e.taker],
      });
    }

    // 3. nouveau compte qui perd beaucoup contre un ancien
    const created = new Map(users.map((u) => [u._id as string, u._creationTime]));
    for (const p of pair.values()) {
      for (const [from, to, val] of [
        [p.a, p.b, p.ab - p.ba],
        [p.b, p.a, p.ba - p.ab],
      ] as Array<[Id<'users'>, Id<'users'>, number]>) {
        const young = now - (created.get(from) ?? 0) < ABUSE.newAccountMs;
        const old = now - (created.get(to) ?? 0) >= ABUSE.newAccountMs;
        if (young && old && val >= ABUSE.newAccountLoss)
          out.push({
            key: `new:${from}>${to}`,
            kind: 'newAccount',
            title: `Nouveau compte ${nm(from)} : ${val} de valeur partis vers ${nm(to)}`,
            detail: `Compte créé il y a moins de ${ABUSE.newAccountMs / 86400_000} jours.`,
            value: val,
            users: [from, to],
          });
      }
    }

    // 4. plusieurs comptes sur le même appareil
    const byDevice = new Map<string, string[]>();
    for (const u of users) for (const d of u.devices ?? []) byDevice.set(d, [...(byDevice.get(d) ?? []), u._id]);
    for (const [d, ids] of byDevice) {
      if (ids.length < 2) continue;
      out.push({
        key: `device:${[...ids].sort().join(',')}`,
        kind: 'device',
        title: `${ids.map(nm).join(' et ')} : même appareil`,
        detail: `Appareil ${d.slice(0, 8)}… (un navigateur partagé, ou un double compte).`,
        value: ids.length,
        users: ids,
      });
    }

    // 5. parrainage (retours live 02, §10) : filleul inscrit depuis un appareil de son parrain → signalé, pas bloqué
    const byId = new Map(users.map((u) => [u._id as string, u]));
    for (const u of users) {
      if (!u.referredBy) continue;
      const parent = byId.get(u.referredBy as string);
      if (!parent) continue;
      const shared = [u.referredDevice, ...(u.devices ?? [])].filter((d): d is string => !!d && (parent.devices ?? []).includes(d));
      if (!shared.length) continue;
      out.push({
        key: `referral:${parent._id}>${u._id}`,
        kind: 'referral',
        title: `Parrainage : ${nm(u._id)} filleul de ${nm(parent._id)} depuis le même appareil`,
        detail: `Appareil ${shared[0].slice(0, 8)}… — ${u.referralPaid ? `les 10 boosters du parrain ont été versés` : `parrain pas encore payé (${u.totalPacksOpened}/10 boosters ouverts)`}. Signalé seulement, rien n'est bloqué.`,
        value: 10,
        users: [parent._id, u._id],
      });
    }

    // décisions déjà prises
    const reviews = await ctx.db.query('abuseReviews').collect();
    const rev = new Map(reviews.map((r) => [r.key, r]));
    const seen = new Set<string>();
    return out
      .filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)))
      .map((a) => ({ ...a, users: a.users.map(nm), ...(rev.get(a.key) ? { verdict: rev.get(a.key)!.verdict, note: rev.get(a.key)!.note } : {}) }))
      .sort((x, y) => Number(!!x.verdict) - Number(!!y.verdict) || y.value - x.value);
  },
});

/** Trancher une alerte : « ok » (légitime, on la range) ou « à surveiller ». */
export const review = mutation({
  args: { sessionToken: v.string(), key: v.string(), verdict: v.union(v.literal('ok'), v.literal('watch')), note: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, key, verdict, note }) => {
    const me = await requireUser(ctx, sessionToken);
    await requireAdmin(me);
    const prev = await ctx.db.query('abuseReviews').withIndex('by_key', (q) => q.eq('key', key)).unique();
    const doc = { key, verdict, ...(note ? { note: note.slice(0, 300) } : {}), byUserId: me._id, at: Date.now() };
    if (prev) await ctx.db.replace(prev._id, doc);
    else await ctx.db.insert('abuseReviews', doc);
  },
});
