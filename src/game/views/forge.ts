import { t as tr } from '../../core/i18n';
import type { GameBackend, GameState } from '../backend';
import { cardKey, lockedCards } from '../backend';
import type { Shell } from '../shell';
import { BURN_MAX_ITEMS, CARD_VALUE, FORGE_FULL, FORGE_TIERS, burnable, cardsValue, econV2, fmtCoins, forgeDone, forgeYield, type StakeItem } from '../../core/economy';
import { missionDay } from '../../core/missions';
import { rarity, starCount, type RarityId } from '../../core/rarity';
import { catalogEntry } from '../../core/sets/themes';
import { busyButton, cardTile, errMsg, esc, fmtN, h, plural, toast } from '../ui';
import { confirmTap, guarded, isPending, protectIcons, protection } from './safety';
import { coinsHtml } from './wallet';
import '../games.css';
import '../casino.css'; // (V2) direction « usinage » : mêmes panneaux que l'espace Jeux

/**
 * LA FORGE (doublons → pièces) — retours live 02 : sortie de l'espace Jeux (ce n'est pas un jeu), elle vit dans la
 * COLLECTION, onglet « Forge » à côté de « Classeurs » (#/collection/forge ; #/jeux/forge y renvoie).
 * Même logique et mêmes garde-fous qu'avant (audit 03/11, lot D) :
 *  - on garde toujours 1 exemplaire, les secrètes ne se brûlent jamais ;
 *  - les exemplaires ENGAGÉS (🔒 : échange en attente, annonce du tableau d'offres… tout ce que `lockedCards` compte)
 *    ne sont pas brûlables ;
 *  - ♥ envie · ▤ classeur · ⌂ pochette : EXCLUES de la forge (retours live 02, §13 : mêmes protections que les
 *    contrats — on retire la carte de sa liste d'envies / de son classeur / de sa pochette pour pouvoir la brûler) ;
 *  - sélection rapide annulable, anti double-envoi (`guarded`), second toucher dès 300 pièces ou 30 cartes.
 */

const starsTxt = (r: RarityId) => (r === 'secret' ? '✷' : '★'.repeat(starCount(r)));
const cardName = (id: string) => catalogEntry(id)?.name ?? id;
const cardsSummary = (l: Array<{ rarity: RarityId; count: number }>) => {
  const m = new Map<RarityId, number>();
  for (const c of l) m.set(c.rarity, (m.get(c.rarity) ?? 0) + c.count);
  return [...m].sort((a, b) => CARD_VALUE[a[0]] - CARD_VALUE[b[0]]).map(([r, n]) => `${n}×${starsTxt(r)}`).join(' + ');
};
const LEGEND = tr('fg.protectedTitle');
/** tuiles affichées au plus par étoile (6 × 90 : la grille reste légère, cf. audit 12/11 S14) */
const FORGE_PER_RARITY = 90;

export interface ForgeDup {
  cardId: string;
  rarity: RarityId;
  count: number;
  /** exemplaires brûlables (on garde 1 exemplaire, les engagés ne comptent pas) */
  spare: number;
  /** exemplaires engagés (échange en attente, annonce du tableau d'offres) */
  locked: number;
  protect: string[];
}

/** Les doublons brûlables, du moins cher au plus cher. */
export function forgeDups(st: GameState): ForgeDup[] {
  const locked = lockedCards(st);
  return st.collection
    .filter((c) => burnable(c.rarity) && catalogEntry(c.cardId))
    .map((c) => {
      const lk = locked.get(cardKey(c)) ?? 0;
      return { cardId: c.cardId, rarity: c.rarity, count: c.count, locked: lk, spare: c.count - 1 - lk, protect: protection(st, c.cardId) };
    })
    .filter((c) => c.spare > 0 && !c.protect.length)
    .sort((a, b) => CARD_VALUE[a.rarity] - CARD_VALUE[b.rarity] || b.spare - a.spare);
}

/** Compteur de l'onglet « Forge » : exemplaires brûlables (hors secrètes, hors engagés, 1 gardé par carte). */
export function forgeCount(st: GameState): number {
  const locked = lockedCards(st);
  let n = 0;
  for (const c of st.collection) if (burnable(c.rarity) && !protection(st, c.cardId).length) n += Math.max(0, c.count - 1 - (locked.get(cardKey(c)) ?? 0));
  return n;
}

// (v2.1.34) présélection venue du récap d'ouverture (« Forger ces doublons ») : consommée au prochain rendu de la Forge, jamais envoyée sans le bouton de la Forge
let preselect: { items: StakeItem[]; at: number } | null = null;
export const setForgePreselect = (items: StakeItem[]) => {
  preselect = items.length ? { items, at: Date.now() } : null;
};
/** ce qui est vraiment forgeable parmi des cartes tirées (n exemplaires par carte) : ni protégées, ni engagées, ni le dernier exemplaire */
export function forgeablePicks(st: GameState, drawn: Array<{ cardId: string; rarity: RarityId }>): StakeItem[] {
  const want = new Map<string, number>();
  for (const c of drawn) want.set(cardKey(c), (want.get(cardKey(c)) ?? 0) + 1);
  const out: StakeItem[] = [];
  for (const d of forgeDups(st)) {
    const w = want.get(cardKey(d));
    if (w) out.push({ cardId: d.cardId, rarity: d.rarity, count: Math.min(w, d.spare) });
  }
  return out.slice(0, BURN_MAX_ITEMS);
}

/** (v2.1.34) puce « Toutes les 4★ et moins » : les 1★ à 4★ d'un coup */
const LOW_RARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic'];
type QuickId = RarityId | 'low';

export function createForge(backend: GameBackend, shell: Shell) {
  const el = h('div', 'forge-view');
  const sel = new Map<string, StakeItem>();
  /** dernière sélection rapide (« Tous les 4★ ») : on peut l'annuler d'un toucher */
  let undo: Map<string, StakeItem> | null = null;
  const sfx = () => {
    try {
      shell.sfx.chime(3, 0.07);
    } catch {
      /* son indisponible */
    }
  };

  let tiles = new Map<string, { t: HTMLElement; sig: string }>();
  function render() {
    const st = backend.state;
    if (st.mode === 'online' && (!st.ready || !st.user)) {
      el.innerHTML = '<div class="gm-panel gm-forge"><b>' + tr('fg.login') + '</b></div>';
      tiles = new Map();
      return;
    }
    const dups = forgeDups(st);
    if (preselect) {
      const pre = preselect;
      preselect = null;
      if (Date.now() - pre.at < 120_000) {
        sel.clear();
        undo = null;
        for (const it of pre.items) {
          const d = dups.find((x) => cardKey(x) === cardKey(it));
          if (d && sel.size < BURN_MAX_ITEMS) sel.set(cardKey(d), { cardId: d.cardId, rarity: d.rarity, count: Math.min(it.count, d.spare) });
        }
      }
    }
    for (const [k, v] of sel) {
      const d = dups.find((x) => cardKey(x) === k);
      if (!d) sel.delete(k);
      else v.count = Math.min(v.count, d.spare);
    }
    const lockedMap = lockedCards(st); // (audit 12/11, A4-01) une fois par rendu, plus une fois par carte de la collection
    const lockedN = st.collection.reduce((a, c) => a + (burnable(c.rarity) ? Math.min(lockedMap.get(cardKey(c)) ?? 0, Math.max(0, c.count - 1)) : 0), 0);
    const total = cardsValue([...sel.values()]);
    // (v2.1.39) rendement dégressif du jour à partir du 01/12 : `paid` = ce que la fournée rapporte vraiment
    const now = Date.now();
    const v2 = econV2(now);
    const eco = backend.eco.snapshot;
    const done = v2 && eco ? forgeDone(eco.econ, missionDay(now)) : 0;
    const paid = v2 ? forgeYield(done, total) : total;
    const cap = FORGE_TIERS[1][0];
    const yieldTxt = !v2
      ? tr('fg.yieldSoon', { full: fmtCoins(FORGE_FULL), cap: fmtCoins(cap) })
      : done < FORGE_FULL
        ? tr('fg.yieldFull', { n: fmtCoins(FORGE_FULL - done) })
        : done < cap
          ? tr('fg.yieldHalf', { n: fmtCoins(cap - done) })
          : tr('fg.yieldQuarter');
    const n = [...sel.values()].reduce((a, c) => a + c.count, 0);
    const rars = (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as RarityId[]).filter((r) => dups.some((d) => d.rarity === r));
    // sélection rapide : comme le remplissage auto des contrats, elle laisse de côté les cartes protégées (UX4-06)
    const inQ = (r: QuickId, x: RarityId) => (r === 'low' ? LOW_RARS.includes(x) : x === r);
    const quick = (r: QuickId) => dups.filter((d) => inQ(r, d.rarity) && !d.protect.length);
    const quickProt = (r: QuickId) => dups.filter((d) => inQ(r, d.rarity) && d.protect.length).length;
    // (17/11, Hugo) la sélection rapide s'arrête à la limite du serveur : BURN_MAX_ITEMS cartes différentes par fournée
    // (les autres étoiles déjà choisies comptent) ; on brûle, puis on recommence pour la suite
    const room = (r: QuickId) => BURN_MAX_ITEMS - [...sel.values()].filter((v) => !inQ(r, v.rarity)).length;
    const quickPick = (r: QuickId) => quick(r).slice(0, Math.max(0, room(r)));
    const quickOn = (r: QuickId) => quickPick(r).length > 0 && quickPick(r).every((d) => sel.get(cardKey(d))?.count === d.spare);
    // (v2.1.34) « Toutes les 4★ et moins » : seulement s'il y a au moins deux étoiles différentes à regrouper
    const lowChip = () => {
      if (rars.filter((r) => LOW_RARS.includes(r)).length < 2) return '';
      const q = quickPick('low');
      const np = quickProt('low');
      return `<button class="chip${quickOn('low') ? ' on' : ''}" data-q="low" style="--rc:var(--ink-2)"${q.length ? '' : ' disabled'} aria-pressed="${quickOn('low')}">${tr('fg.allLow', { n: q.reduce((a, d) => a + d.spare, 0), v: fmtCoins(q.reduce((a, d) => a + d.spare * CARD_VALUE[d.rarity], 0)), prot: np ? ` <small>${tr('fg.protLeft', { n: np })}</small>` : '' })}</button>`;
    };
    const full = sel.size >= BURN_MAX_ITEMS;
    const anyMark = dups.some((d) => d.protect.length || d.locked);
    const free = dups.reduce((a, d) => a + d.spare, 0);
    el.innerHTML = `<div class="gm-panel gm-forge"><div class="gm-ph"><b>${tr('fg.title')}</b><span class="muted">${tr('fg.count', { n: free, nf: fmtN(free), locked: lockedN ? tr('fg.locked', { n: lockedN, nf: fmtN(lockedN) }) : '' })}</span></div> <!-- i18n-ok -->
      <div class="muted fg-rate">${tr('fg.values')}</div>
      <div class="muted fg-yield">${yieldTxt}</div>
      <div class="gm-quick">${lowChip()}${rars.map((r) => {
        const q = quickPick(r);
        const np = quickProt(r);
        return `<button class="chip${quickOn(r) ? ' on' : ''}" data-q="${r}" style="--rc:${rarity(r).hex}"${q.length ? '' : ' disabled'} aria-pressed="${quickOn(r)}">${tr('fg.allOf', { stars: starsTxt(r), n: q.reduce((a, d) => a + d.spare, 0), v: fmtCoins(q.reduce((a, d) => a + d.spare * CARD_VALUE[r], 0)), prot: np ? ` <small>${tr('fg.protLeft', { n: np })}</small>` : '' })}</button>`;
      }).join('')}<button class="btn-ghost sm gm-none"${n ? '' : ' disabled'}>${tr('fg.nothing')}</button>${undo ? '<button class="linkish gm-undo">' + tr('fg.cancelQuick') + '</button>' : ''}</div>
      ${anyMark ? `<div class="gm-legend-p muted">${esc(LEGEND)}</div>` : ''}
      ${full ? `<div class="gm-legend-p muted">${tr('fg.maxItems', { n: BURN_MAX_ITEMS })}</div>` : ''}
      <div class="gm-fgrid"></div>
      <div class="gm-ffoot"><span>${n ? `${plural(n, 'carte')} (${cardsSummary([...sel.values()])}) → ${coinsHtml(paid)}${paid < total ? ` <small class="muted">(${tr('fg.valueWas', { v: fmtCoins(total) })})</small>` : ''}` : '<span class="muted">' + tr('fg.tapHint') + '</span>'}</span><button class="btn-primary gm-burn"${n && !isPending('forge') ? '' : ' disabled'}>${tr('fg.burn', { x: n ? ` · +${fmtCoins(paid)}` : '' })}</button></div></div>`;
    const grid = el.querySelector<HTMLElement>('.gm-fgrid')!;
    if (!dups.length) grid.innerHTML = `<div class="muted">${tr('fg.none', { x: lockedN ? tr('fg.othersLocked') : '' })} <a href="#/">${tr('fg.openBoosters')}</a></div>`;
    // (audit 12/11, S14 / A4-01) les tuiles sont GARDÉES d'un rendu à l'autre : un toucher ne recrée plus jusqu'à 400
    // tuiles (et leurs images), il met à jour l'étiquette de celles qui existent déjà. Refaite si la carte a changé.
    const kept = tiles;
    tiles = new Map();
    // (17/11, retour de Tom) UNE SECTION PAR ÉTOILE, FORGE_PER_RARITY tuiles au plus chacune : avant, les 400 premières
    // tuiles (triées de la moins chère à la plus chère) étaient toutes des 1★ dès qu'on en avait beaucoup, et les 2★–5★
    // n'apparaissaient plus du tout (« j'ai perdu mes doublons »). Les sélections rapides prennent toujours tout.
    const byRarity = new Map<RarityId, ForgeDup[]>();
    for (const d of dups) {
      const l = byRarity.get(d.rarity);
      if (l) l.push(d);
      else byRarity.set(d.rarity, [d]);
    }
    const shown: ForgeDup[] = [];
    const secs = new Map<ForgeDup, HTMLElement>();
    const tails = new Map<ForgeDup, HTMLElement>();
    for (const [r, list] of byRarity) {
      const head = h('div', 'gm-fsec', `<b style="color:${rarity(r).hex}">${starsTxt(r)}</b> <span class="muted">${tr('fg.sec', { n: fmtN(list.length), c: fmtN(list.reduce((a, d) => a + d.spare, 0)) })}</span>`);
      secs.set(list[0], head);
      const part = list.slice(0, FORGE_PER_RARITY);
      shown.push(...part);
      if (list.length > FORGE_PER_RARITY) tails.set(part[part.length - 1], h('div', 'muted gm-fmore', tr('fg.andMore', { n: fmtN(list.length - FORGE_PER_RARITY) })));
    }
    for (const d of shown) {
      const head = secs.get(d);
      if (head) grid.append(head);
      const k = cardKey(d);
      const inSel = sel.get(k)?.count ?? 0;
      const label = inSel ? `🔥 ${inSel}/${d.spare}` : `+${CARD_VALUE[d.rarity]}`;
      const why = [...d.protect, ...(d.locked ? [tr('fg.lockedN', { n: d.locked })] : [])];
      const sig = `${d.spare}|${why.join(',')}`;
      const old = kept.get(k);
      const badge = old?.sig === sig ? old.t.querySelector<HTMLElement>(':scope > .badge') : null;
      if (old && badge) {
        if (badge.textContent !== label) badge.textContent = label;
        old.t.classList.toggle('burning', inSel > 0);
        tiles.set(k, old);
        grid.append(old.t);
        const tail0 = tails.get(d);
        if (tail0) grid.append(tail0);
        continue;
      }
      // ×N = exemplaires brûlables (on en garde toujours un ; les engagés ne comptent pas)
      const t = cardTile(d.cardId, d.rarity, { mini: true, count: d.spare, label });
      tiles.set(k, { t, sig });
      t.title = `${cardName(d.cardId)} · ${plural(d.spare, 'exemplaire brûlable', 'exemplaires brûlables')}${why.length ? ` · ${why.join(', ')}` : ''}`; // i18n-ok
      const icons = protectIcons(d.protect) + (d.locked ? '🔒' : '');
      if (icons) t.insertAdjacentHTML('beforeend', `<span class="ct-prot gm-prot" aria-label="${esc(why.join(', '))}">${icons}</span>`);
      t.classList.toggle('burning', inSel > 0);
      t.addEventListener('click', () => {
        if (isPending('forge')) return;
        const cur = sel.get(k)?.count ?? 0;
        if (!cur && sel.size >= BURN_MAX_ITEMS) return toast(tr('fg.maxItems', { n: BURN_MAX_ITEMS }), 'info');
        if (cur >= d.spare) sel.delete(k);
        else sel.set(k, { cardId: d.cardId, rarity: d.rarity, count: cur + 1 });
        undo = null;
        render();
      });
      grid.append(t);
      const tail = tails.get(d);
      if (tail) grid.append(tail);
    }
    el.querySelectorAll<HTMLElement>('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        if (isPending('forge')) return;
        const r = b.dataset.q as QuickId;
        undo = new Map([...sel].map(([k, v]) => [k, { ...v }]));
        // deuxième toucher sur la même puce : on la retire (sélection rapide annulable)
        if (quickOn(r)) for (const d of quick(r)) sel.delete(cardKey(d));
        else {
          for (const d of quick(r)) sel.delete(cardKey(d));
          for (const d of quickPick(r)) sel.set(cardKey(d), { cardId: d.cardId, rarity: d.rarity, count: d.spare });
        }
        render();
      }),
    );
    el.querySelector('.gm-none')?.addEventListener('click', () => {
      if (isPending('forge')) return;
      undo = new Map([...sel].map(([k, v]) => [k, { ...v }]));
      sel.clear();
      render();
    });
    el.querySelector('.gm-undo')?.addEventListener('click', () => {
      if (!undo || isPending('forge')) return;
      sel.clear();
      for (const [k, v] of undo) sel.set(k, v);
      undo = null;
      render();
    });
    const burnBtn = el.querySelector<HTMLButtonElement>('.gm-burn')!;
    burnBtn.addEventListener('click', () => {
      // second toucher dès une 5★ (300) ou 30 cartes, avec le détail par étoile ; désarmé tout seul après 3 s
      if ((total >= 300 || n >= 30) && !confirmTap(burnBtn, tr('fg.confirm', { cards: plural(n, 'carte'), list: cardsSummary([...sel.values()]) }))) return;
      // la sélection est copiée puis vidée AVANT l'envoi : un 2ᵉ envoi ne pourrait plus rien brûler deux fois
      const items = [...sel.values()].map((v) => ({ ...v }));
      const before = new Map(sel);
      sel.clear();
      undo = null;
      void guarded('forge', burnBtn, async () => {
        try {
          const r = await busyButton(burnBtn, backend.eco.burn(items));
          grid.classList.add('flash');
          sfx();
          toast(tr('fg.burned', { n: r.count, dups: plural(r.count, 'doublon'), coins: fmtCoins(r.coins) }), 'ok');
          setTimeout(() => el.isConnected && !el.closest('[hidden]') && render(), 400);
        } catch (err) {
          for (const [k, v] of before) sel.set(k, v);
          toast(errMsg(err), 'err');
          render();
        }
      }, { keepOnSuccess: true });
    });
  }

  return { el, render };
}
