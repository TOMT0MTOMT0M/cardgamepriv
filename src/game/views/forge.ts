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

/**
 * Présélection venue d'ailleurs (récap d'ouverture « Forger ces doublons ») : posée avant la navigation vers la Forge,
 * lue (et vidée) au prochain rendu. Rien n'est brûlé : le joueur valide sur l'écran Forge.
 */
let pendingPreselect: StakeItem[] | null = null;
export function setForgePreselect(items: StakeItem[]) {
  pendingPreselect = items.map((i) => ({ ...i }));
}

/** Plafond de la puce « Toutes les 4★ et moins » */
const LOW_MAX_STARS = 4;

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

  /**
   * (V3, lot 08) ZÉRO RECONSTRUCTION AU TOUCHER : le panneau (en-tête, puces, grille, pied, boutons) n'est réécrit que
   * quand la LISTE des doublons change (`build`, signature `shape`). Choisir une carte, une puce « Tous les N★ »,
   * « Rien » ou « Annuler » ne fait que `update()` : compteurs, prix, libellés et classes `.on` / `.burning`, comparés à
   * la dernière valeur posée (aucune lecture du DOM). Avant : `el.innerHTML` réécrit et toutes les tuiles ré-ajoutées à
   * chaque toucher (l'animation d'entrée des tuiles rejouait, la rangée de puces revenait au début, le focus sautait).
   */
  let tiles = new Map<string, { t: HTMLElement; sig: string; badge: HTMLElement | null; label: string; on: boolean; d: ForgeDup }>();
  let dups: ForgeDup[] = [];
  let shape = '';
  let ui: {
    chips: Array<{ b: HTMLButtonElement; r: RarityId; html: string; on: boolean; dis: boolean }>;
    low: { b: HTMLButtonElement; html: string; on: boolean; dis: boolean } | null;
    none: HTMLButtonElement;
    undoBtn: HTMLButtonElement;
    full: HTMLElement;
    hint: HTMLElement;
    sum: HTMLElement;
    sumTxt: HTMLElement;
    sumCoins: HTMLElement;
    /** (v2.1.39) « (valeur X) » quand le rendement du jour a baissé, et la ligne du rendement */
    was: HTMLElement;
    yieldEl: HTMLElement;
    burn: HTMLButtonElement;
    burnHtml: string;
    grid: HTMLElement;
  } | null = null;

  // sélection rapide : comme le remplissage auto des contrats, elle laisse de côté les cartes protégées (UX4-06)
  // (lot 08) listes par étoile calculées une fois par rendu, plus à chaque toucher
  let quickBy = new Map<RarityId, ForgeDup[]>();
  let protBy = new Map<RarityId, number>();
  const quick = (r: RarityId) => quickBy.get(r) ?? [];
  const quickProt = (r: RarityId) => protBy.get(r) ?? 0;
  // (17/11, Hugo) la sélection rapide s'arrête à la limite du serveur : BURN_MAX_ITEMS cartes différentes par fournée
  // (les autres étoiles déjà choisies comptent) ; on brûle, puis on recommence pour la suite
  const room = (r: RarityId) => BURN_MAX_ITEMS - [...sel.values()].filter((v) => v.rarity !== r).length;
  const quickPick = (r: RarityId, rm = room(r)) => quick(r).slice(0, Math.max(0, rm));
  const isOn = (pick: ForgeDup[]) => pick.length > 0 && pick.every((d) => sel.get(cardKey(d))?.count === d.spare);
  const quickOn = (r: RarityId) => isOn(quickPick(r));
  // puce « Toutes les 4★ et moins » : mêmes doublons que les puces par étoile (quickBy exclut déjà les protégées / engagées)
  const lowList = () => [...quickBy].filter(([r]) => starCount(r) <= LOW_MAX_STARS).flatMap(([, l]) => l);
  const lowPick = (extraRoom = BURN_MAX_ITEMS - [...sel.values()].filter((v) => starCount(v.rarity) > LOW_MAX_STARS).length) => lowList().slice(0, Math.max(0, extraRoom));
  const lowOn = () => isOn(lowPick());
  const selCount = () => [...sel.values()].reduce((a, c) => a + c.count, 0);

  function render() {
    const st = backend.state;
    if (st.mode === 'online' && (!st.ready || !st.user)) {
      el.innerHTML = '<div class="gm-panel gm-forge"><b>' + tr('fg.login') + '</b></div>';
      tiles = new Map();
      ui = null;
      shape = '';
      return;
    }
    dups = forgeDups(st);
    quickBy = new Map();
    protBy = new Map();
    for (const d of dups) {
      if (d.protect.length) protBy.set(d.rarity, (protBy.get(d.rarity) ?? 0) + 1);
      else {
        const l = quickBy.get(d.rarity);
        if (l) l.push(d);
        else quickBy.set(d.rarity, [d]);
      }
    }
    for (const [k, v] of sel) {
      const d = dups.find((x) => cardKey(x) === k);
      if (!d) sel.delete(k);
      else v.count = Math.min(v.count, d.spare);
    }
    const lockedMap = lockedCards(st); // (audit 12/11, A4-01) une fois par rendu, plus une fois par carte de la collection
    const lockedN = st.collection.reduce((a, c) => a + (burnable(c.rarity) ? Math.min(lockedMap.get(cardKey(c)) ?? 0, Math.max(0, c.count - 1)) : 0), 0);
    if (pendingPreselect) {
      // arrivée depuis le récap d'ouverture : on pose la sélection (bornée à ce que la Forge accepte), sans rien brûler
      for (const p of pendingPreselect) {
        const d = dups.find((x) => cardKey(x) === cardKey(p));
        if (d && !d.protect.length && sel.size < BURN_MAX_ITEMS) sel.set(cardKey(d), { cardId: d.cardId, rarity: d.rarity, count: Math.max(1, Math.min(p.count, d.spare)) });
      }
      pendingPreselect = null;
      undo = null;
    }
    const now = `${lockedN}#${dups.map((d) => `${cardKey(d)}|${d.spare}|${d.locked}|${d.protect.join(',')}`).join(';')}`;
    if (now !== shape || !ui || !el.contains(ui.grid)) {
      shape = now;
      build(lockedN);
    }
    update();
  }

  /** Le panneau entier : seulement quand la liste des doublons a changé (brûlage, nouvelle carte, échange…). */
  function build(lockedN: number) {
    const rars = (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as RarityId[]).filter((r) => dups.some((d) => d.rarity === r));
    const anyMark = dups.some((d) => d.protect.length || d.locked);
    const free = dups.reduce((a, d) => a + d.spare, 0);
    el.innerHTML = `<div class="gm-panel gm-forge"><div class="gm-ph"><b>${tr('fg.title')}</b><span class="muted">${tr('fg.count', { n: free, nf: fmtN(free), locked: lockedN ? tr('fg.locked', { n: lockedN, nf: fmtN(lockedN) }) : '' })}</span></div> <!-- i18n-ok -->
      <div class="muted fg-rate">${tr('fg.values')}</div>
      <div class="muted fg-yield"></div>
      <div class="gm-quick">${rars.map((r) => `<button class="chip" data-q="${r}" style="--rc:${rarity(r).hex}"></button>`).join('')}${rars.filter((r) => starCount(r) <= LOW_MAX_STARS).length > 1 ? '<button class="chip gm-low" data-qle="1"></button>' : ''}<button class="btn-ghost sm gm-none"></button><button class="linkish gm-undo" hidden>${tr('fg.cancelQuick')}</button></div>
      ${anyMark ? `<div class="gm-legend-p muted">${esc(LEGEND)}</div>` : ''}
      <div class="gm-legend-p muted gm-full" hidden>${tr('fg.maxItems', { n: BURN_MAX_ITEMS })}</div>
      <div class="gm-fgrid"></div>
      <div class="gm-ffoot"><span><span class="muted">${tr('fg.tapHint')}</span><span class="fg-sum" hidden><span></span> → ${coinsHtml(0)} <small class="muted fg-was" hidden></small></span></span><button class="btn-primary gm-burn"></button></div></div>`;
    const grid = el.querySelector<HTMLElement>('.gm-fgrid')!;
    const none = el.querySelector<HTMLButtonElement>('.gm-none')!;
    none.textContent = tr('fg.nothing');
    const lowB = el.querySelector<HTMLButtonElement>('.gm-low');
    ui = {
      chips: [...el.querySelectorAll<HTMLButtonElement>('[data-q]')].map((b) => ({ b, r: b.dataset.q as RarityId, html: '', on: false, dis: false })),
      low: lowB ? { b: lowB, html: '', on: false, dis: false } : null,
      none,
      undoBtn: el.querySelector<HTMLButtonElement>('.gm-undo')!,
      full: el.querySelector<HTMLElement>('.gm-full')!,
      hint: el.querySelector<HTMLElement>('.gm-ffoot > span > .muted')!,
      sum: el.querySelector<HTMLElement>('.fg-sum')!,
      sumTxt: el.querySelector<HTMLElement>('.fg-sum > span')!,
      sumCoins: el.querySelector<HTMLElement>('.fg-sum .coins-v > b')!,
      was: el.querySelector<HTMLElement>('.fg-was')!,
      yieldEl: el.querySelector<HTMLElement>('.fg-yield')!,
      burn: el.querySelector<HTMLButtonElement>('.gm-burn')!,
      burnHtml: '\0',
      grid,
    };
    if (!dups.length) grid.innerHTML = `<div class="muted">${tr('fg.none', { x: lockedN ? tr('fg.othersLocked') : '' })} <a href="#/">${tr('fg.openBoosters')}</a></div>`;
    // (audit 12/11, S14 / A4-01) les tuiles sont GARDÉES d'un rendu à l'autre : un nouveau panneau ne recrée pas jusqu'à
    // 540 tuiles (et leurs images), il reprend celles qui existent déjà. Refaite si la carte a changé.
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
    const frag = document.createDocumentFragment();
    for (const [r, list] of byRarity) {
      frag.append(h('div', 'gm-fsec', `<b style="color:${rarity(r).hex}">${starsTxt(r)}</b> <span class="muted">${tr('fg.sec', { n: fmtN(list.length), c: fmtN(list.reduce((a, d) => a + d.spare, 0)) })}</span>`));
      for (const d of list.slice(0, FORGE_PER_RARITY)) {
        const k = cardKey(d);
        const why = [...d.protect, ...(d.locked ? [tr('fg.lockedN', { n: d.locked })] : [])];
        const sig = `${d.spare}|${why.join(',')}`;
        const old = kept.get(k);
        if (old && old.sig === sig && old.badge) {
          old.d = d;
          tiles.set(k, old);
          frag.append(old.t);
          continue;
        }
        // ×N = exemplaires brûlables (on en garde toujours un ; les engagés ne comptent pas)
        const label = `+${CARD_VALUE[d.rarity]}`;
        const t = cardTile(d.cardId, d.rarity, { mini: true, count: d.spare, label });
        t.dataset.k = k;
        t.title = `${cardName(d.cardId)} · ${plural(d.spare, 'exemplaire brûlable', 'exemplaires brûlables')}${why.length ? ` · ${why.join(', ')}` : ''}`; // i18n-ok
        const icons = protectIcons(d.protect) + (d.locked ? '🔒' : '');
        if (icons) t.insertAdjacentHTML('beforeend', `<span class="ct-prot gm-prot" aria-label="${esc(why.join(', '))}">${icons}</span>`);
        tiles.set(k, { t, sig, badge: t.querySelector<HTMLElement>(':scope > .badge'), label, on: false, d });
        frag.append(t);
      }
      if (list.length > FORGE_PER_RARITY) frag.append(h('div', 'muted gm-fmore', tr('fg.andMore', { n: fmtN(list.length - FORGE_PER_RARITY) })));
    }
    grid.append(frag);
  }

  /** Après un toucher : seuls les textes et classes qui ont changé sont posés (les nœuds, eux, restent). */
  function update(only?: string) {
    if (!ui) return;
    const n = selCount();
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
    if (ui.yieldEl.textContent !== yieldTxt) ui.yieldEl.textContent = yieldTxt;
    const selBy = new Map<RarityId, number>();
    for (const v of sel.values()) selBy.set(v.rarity, (selBy.get(v.rarity) ?? 0) + 1);
    for (const c of ui.chips) {
      const q = quickPick(c.r, BURN_MAX_ITEMS - (sel.size - (selBy.get(c.r) ?? 0)));
      const np = quickProt(c.r);
      const on = isOn(q);
      const html = tr('fg.allOf', { stars: starsTxt(c.r), n: q.reduce((a, d) => a + d.spare, 0), v: fmtCoins(q.reduce((a, d) => a + d.spare * CARD_VALUE[c.r], 0)), prot: np ? ` <small>${tr('fg.protLeft', { n: np })}</small>` : '' });
      if (html !== c.html) c.b.innerHTML = c.html = html;
      if (on !== c.on) {
        c.on = on;
        c.b.classList.toggle('on', on);
        c.b.setAttribute('aria-pressed', String(on));
      }
      if (!q.length !== c.dis) c.b.disabled = c.dis = !q.length;
    }
    if (ui.low) {
      const c = ui.low;
      const q = lowPick(BURN_MAX_ITEMS - [...sel.values()].filter((v) => starCount(v.rarity) > LOW_MAX_STARS).length);
      const on = isOn(q);
      const html = tr('fg.allLow', { max: LOW_MAX_STARS, n: q.reduce((a, d) => a + d.spare, 0), v: fmtCoins(q.reduce((a, d) => a + d.spare * CARD_VALUE[d.rarity], 0)) });
      if (html !== c.html) c.b.innerHTML = c.html = html;
      if (on !== c.on) {
        c.on = on;
        c.b.classList.toggle('on', on);
        c.b.setAttribute('aria-pressed', String(on));
      }
      if (!q.length !== c.dis) c.b.disabled = c.dis = !q.length;
    }
    ui.none.disabled = !n;
    ui.undoBtn.hidden = !undo;
    ui.full.hidden = sel.size < BURN_MAX_ITEMS;
    // pied : « N cartes (détail) → pièces » ; seuls les textes changent (l'icône de pièce reste)
    ui.hint.hidden = !!n;
    ui.sum.hidden = !n;
    if (n) {
      const txt = `${plural(n, 'carte')} (${cardsSummary([...sel.values()])})`;
      if (ui.sumTxt.textContent !== txt) ui.sumTxt.textContent = txt;
      const c = fmtCoins(paid);
      if (ui.sumCoins.textContent !== c) ui.sumCoins.textContent = c;
      const was = paid < total ? `(${tr('fg.valueWas', { v: fmtCoins(total) })})` : '';
      if (ui.was.textContent !== was) ui.was.textContent = was;
      ui.was.hidden = !was;
    }
    const burnHtml = tr('fg.burn', { x: n ? ` · +${fmtCoins(paid)}` : '' });
    const b = ui.burn;
    // la sélection a changé pendant un « Confirmer ? » : on désarme (on confirmerait autre chose que ce qui est affiché)
    if (b.dataset.armedAt && burnHtml !== ui.burnHtml) {
      delete b.dataset.armedAt;
      delete b.dataset.label;
      b.classList.remove('armed');
      ui.burnHtml = '\0';
    }
    if (burnHtml !== ui.burnHtml && !b.dataset.armedAt) b.innerHTML = ui.burnHtml = burnHtml;
    if (!b.dataset.busy) b.disabled = !(n && !isPending('forge'));
    // un toucher sur une carte : seule sa tuile change ; une puce, « Rien », « Annuler », un rendu : toutes
    const list = only ? [[only, tiles.get(only)] as const] : tiles;
    for (const [k, x] of list) {
      if (!x) continue;
      const inSel = sel.get(k)?.count ?? 0;
      const label = inSel ? `🔥 ${inSel}/${x.d.spare}` : `+${CARD_VALUE[x.d.rarity]}`;
      if (label !== x.label && x.badge) x.badge.textContent = x.label = label;
      if (inSel > 0 !== x.on) x.t.classList.toggle('burning', (x.on = inSel > 0));
    }
  }

  // un seul écouteur pour tout le panneau (les nœuds survivent aux touchers, les écouteurs aussi)
  el.addEventListener('click', (e) => {
    if (!ui) return;
    const target = e.target as HTMLElement;
    const tile = target.closest<HTMLElement>('.gm-fgrid .tile');
    if (tile) {
      const x = tiles.get(tile.dataset.k ?? '');
      if (!x || isPending('forge')) return;
      const d = x.d;
      const k = cardKey(d);
      const cur = sel.get(k)?.count ?? 0;
      if (!cur && sel.size >= BURN_MAX_ITEMS) return toast(tr('fg.maxItems', { n: BURN_MAX_ITEMS }), 'info');
      if (cur >= d.spare) sel.delete(k);
      else sel.set(k, { cardId: d.cardId, rarity: d.rarity, count: cur + 1 });
      undo = null;
      return update(k);
    }
    const chip = target.closest<HTMLButtonElement>('[data-q]');
    if (chip) {
      if (isPending('forge')) return;
      const r = chip.dataset.q as RarityId;
      undo = new Map([...sel].map(([k, v]) => [k, { ...v }]));
      // deuxième toucher sur la même puce : on la retire (sélection rapide annulable)
      if (quickOn(r)) for (const d of quick(r)) sel.delete(cardKey(d));
      else {
        for (const d of quick(r)) sel.delete(cardKey(d));
        for (const d of quickPick(r)) sel.set(cardKey(d), { cardId: d.cardId, rarity: d.rarity, count: d.spare });
      }
      return update();
    }
    if (target.closest('[data-qle]')) {
      if (isPending('forge')) return;
      undo = new Map([...sel].map(([k, v]) => [k, { ...v }]));
      const wasOn = lowOn();
      for (const d of lowList()) sel.delete(cardKey(d));
      if (!wasOn) for (const d of lowPick()) sel.set(cardKey(d), { cardId: d.cardId, rarity: d.rarity, count: d.spare });
      return update();
    }
    if (target.closest('.gm-none')) {
      if (isPending('forge')) return;
      undo = new Map([...sel].map(([k, v]) => [k, { ...v }]));
      sel.clear();
      return update();
    }
    if (target.closest('.gm-undo')) {
      if (!undo || isPending('forge')) return;
      sel.clear();
      for (const [k, v] of undo) sel.set(k, v);
      undo = null;
      return update();
    }
    const burnBtn = target.closest<HTMLButtonElement>('.gm-burn');
    if (!burnBtn || burnBtn.disabled) return;
    const grid = ui.grid;
    const n = selCount();
    const total = cardsValue([...sel.values()]);
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

  return { el, render };
}
