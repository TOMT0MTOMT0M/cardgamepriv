import type { PlayerCard } from '../backend';
import type { Shell } from '../shell';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { haptics } from '../../core/haptics';
import { cardTile, fmtN, fold, h, toast } from '../ui';

/**
 * (V2) ÉDITEUR DE VITRINE — choisir, retirer et ranger ses cartes au doigt ou à la souris.
 *
 *  - La vitrine éditée est une liste COMPACTE (pas de trou) : l'ordre affiché = l'ordre enregistré.
 *  - Collection (sous la vitrine, qui reste collée en haut pendant qu'on fait défiler) : un toucher AJOUTE la carte à la
 *    suite, un second la RETIRE (pastille avec sa place dans la vitrine). Case sélectionnée → la carte touchée la remplace.
 *  - Glisser-déposer : d'une carte de la collection vers une case (insérée là, ou remplace la carte visée si la vitrine
 *    est pleine) ; d'une case à l'autre (les autres se décalent, animées) ; hors de la vitrine = retirée.
 *    Souris : le glissé part après 5 px. Doigt : direct dans la vitrine (touch-action: none), APPUI LONG (260 ms) dans la
 *    collection pour laisser défiler la liste.
 *  - Clavier : Tab jusqu'à une carte de la vitrine, ← / → pour la déplacer, Suppr pour la retirer.
 */
export type ShowcaseCard = { cardId: string; rarity: RarityId };
export const showcaseKey = (c: ShowcaseCard) => `${c.cardId}:${c.rarity}`;

export interface ShowcaseEditor {
  readonly active: boolean;
  start(list: ShowcaseCard[]): void;
  stop(): void;
  value(): ShowcaseCard[];
  dirty(): boolean;
  /** complète les cases vides avec les meilleures cartes pas encore en vitrine */
  fill(): void;
  clear(): void;
}

interface Opts {
  slots: number;
  caseEl: HTMLElement;
  pickerEl: HTMLElement;
  owned(): PlayerCard[];
  /** ordre « meilleures d'abord » (rareté, puis numéro) */
  sort(a: PlayerCard, b: PlayerCard): number;
  sfx: Shell['sfx'];
  /** compteur, bouton Enregistrer… */
  onChange(): void;
}

type Item = ShowcaseCard | 'ph' | null;
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
const PICK_CAP = 240;
const LONG_PRESS = 260;
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

export function createShowcaseEditor(o: Opts): ShowcaseEditor {
  const { slots, caseEl, pickerEl } = o;
  const pq = <T extends HTMLElement>(s: string) => pickerEl.querySelector<T>(s)!;
  const pickGrid = pq('.pf-pick-grid');
  const pickSearch = pq<HTMLInputElement>('.pf-search');
  const pickStarsEl = pq('.pf-pick-stars');
  const pickMore = pq('.pf-pick-more');
  const pickHint = pq('.pf-pick-hint');

  let active = false;
  let draft: ShowcaseCard[] = [];
  let initial = '';
  /** case sélectionnée (remplacement par un toucher dans la collection, déplacement au clavier) */
  let sel = -1;
  let pickStar: RarityId | null = null;
  const cells: HTMLElement[] = [];
  const cardEls = new Map<string, HTMLElement>();
  const pickTiles = new Map<string, HTMLElement>();
  const ph = h('div', 'pf-hole');
  const keys = () => draft.map(showcaseKey);
  const indexOf = (k: string) => draft.findIndex((c) => showcaseKey(c) === k);

  // ── filtres de la collection (étoiles)
  for (const r of STARS) {
    const b = h('button', 'chip', r === 'secret' ? '✷' : `${rarity(r).rank + 1}★`);
    b.type = 'button';
    b.dataset.r = r;
    b.title = rarity(r).label;
    b.style.setProperty('--rc', rarity(r).hex);
    // texte lisible pour Rare / Épique (UX5-09), la teinte de la carte ne change pas
    b.style.setProperty('--rt', r === 'epic' ? '#e0607a' : r === 'rare' ? '#6f9be0' : rarity(r).hex);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => ((pickStar = pickStar === r ? null : r), renderPicker()));
    pickStarsEl.append(b);
  }
  let searchT = 0;
  pickSearch.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = window.setTimeout(renderPicker, 150);
  });

  // ── la vitrine (12 cases fixes ; les cartes se déplacent d'une case à l'autre, animées)
  function buildCells() {
    caseEl.replaceChildren();
    cells.length = 0;
    for (let i = 0; i < slots; i++) {
      const c = h('div', 'pf-slot');
      c.dataset.i = String(i);
      cells.push(c);
      caseEl.append(c);
    }
  }
  function cardEl(c: ShowcaseCard): HTMLElement {
    const k = showcaseKey(c);
    let w = cardEls.get(k);
    if (!w) {
      w = h('div', 'pf-card');
      w.dataset.k = k;
      const t = cardTile(c.cardId, c.rarity);
      t.setAttribute('aria-roledescription', 'carte de la vitrine, déplaçable');
      w.append(t);
      w.insertAdjacentHTML('beforeend', '<button class="pf-x" type="button" tabindex="-1" aria-label="Retirer de la vitrine">✕</button>');
      cardEls.set(k, w);
    }
    return w;
  }
  const emptyEl = () => h('div', 'pf-empty', '+');

  /** Pose les cartes dans les cases ; FLIP : chaque carte part de là où elle était (ou de `from`) et glisse à sa place. */
  function layout(items: Item[], opts: { from?: { k: string; r: DOMRect }; swap?: number } = {}) {
    const anim = !lessMotion.matches && !document.body.classList.contains('fx-reduced');
    const first = new Map<string, DOMRect>();
    if (anim) for (const [k, w] of cardEls) if (w.isConnected) first.set(k, w.getBoundingClientRect());
    if (opts.from) first.set(opts.from.k, opts.from.r);
    for (const w of cardEls.values()) w.getAnimations().forEach((a) => a.cancel());
    const shown = new Set<string>();
    cells.forEach((cell, i) => {
      const it = items[i] ?? null;
      const k = it && it !== 'ph' ? showcaseKey(it) : '';
      cell.className = `pf-slot${it ? (it === 'ph' ? ' ph' : ' filled') : ' free'}${i === sel ? ' sel' : ''}${opts.swap === i ? ' swap' : ''}`;
      const want = it === 'ph' ? ph : it ? cardEl(it) : null;
      if (want) {
        if (k) shown.add(k);
        if (cell.firstChild !== want || cell.childNodes.length !== 1) cell.replaceChildren(want);
      } else if (!cell.firstElementChild?.classList.contains('pf-empty')) cell.replaceChildren(emptyEl());
    });
    // cartes qui ne sont plus dans la vitrine : on les oublie (pas de fuite de tuiles)
    for (const [k, w] of cardEls) if (!shown.has(k) && !(drag && drag.k === k)) (w.remove(), cardEls.delete(k));
    if (!anim) return;
    for (const [k, r0] of first) {
      const w = cardEls.get(k);
      if (!w?.isConnected) continue;
      const r1 = w.getBoundingClientRect();
      if (!r1.width) continue;
      const dx = r0.left - r1.left;
      const dy = r0.top - r1.top;
      const s = r0.width / r1.width;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.01) continue;
      w.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], { duration: opts.from?.k === k ? 320 : 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    }
  }
  const settle = (from?: { k: string; r: DOMRect }) => {
    layout(draft, { from });
    syncPicker();
    o.onChange();
  };

  // ── actions
  function add(c: ShowcaseCard, at = draft.length) {
    draft.splice(Math.min(at, draft.length), 0, c);
  }
  function removeAt(i: number) {
    if (i < 0 || i >= draft.length) return;
    draft.splice(i, 1);
    if (sel === i) sel = -1;
    else if (sel > i) sel--;
    o.sfx.tick(0.8, 0.05);
  }
  function move(from: number, to: number) {
    const [c] = draft.splice(from, 1);
    draft.splice(Math.min(to, draft.length), 0, c);
  }
  /** un toucher sur une carte de la collection : ajoute / retire / remplace la case sélectionnée */
  function togglePick(c: ShowcaseCard) {
    const i = indexOf(showcaseKey(c));
    if (i >= 0) {
      removeAt(i);
      return settle();
    }
    if (sel >= 0 && sel < draft.length) {
      draft[sel] = c;
      sel = -1;
    } else if (draft.length >= slots) {
      bump();
      return void toast('Vitrine pleine : touche la carte à remplacer dans la vitrine, ou glisse celle-ci dessus.', 'info');
    } else add(c);
    o.sfx.tick(1.3, 0.05);
    haptics.pulse(6);
    settle();
  }
  /** compteur qui « refuse » (vitrine pleine) */
  function bump() {
    const n = caseEl.closest('.pf-case-sec')?.querySelector<HTMLElement>('.pf-count');
    n?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 260 });
    haptics.pulse([6, 40, 6]);
  }

  // clics dans la vitrine : ✕ = retirer, carte = sélectionner (re-toucher = désélectionner), case vide = désélectionner
  caseEl.addEventListener('click', (e) => {
    if (!active || swallowClick()) return;
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>('.pf-card');
    const i = card ? indexOf(card.dataset.k!) : -1;
    if (t.closest('.pf-x')) {
      e.stopPropagation();
      removeAt(i);
      return settle();
    }
    sel = card && sel !== i ? i : -1;
    if (sel >= 0) o.sfx.tick(1.2, 0.04);
    layout(draft);
    syncPicker();
    o.onChange();
  });
  caseEl.addEventListener('keydown', (e) => {
    if (!active) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('.pf-card');
    if (!card) return;
    const k = card.dataset.k!;
    const i = indexOf(k);
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (d && i + d >= 0 && i + d < draft.length) {
      e.preventDefault();
      move(i, i + d);
      sel = i + d;
      settle();
      cardEls.get(k)?.querySelector<HTMLElement>('.tile')?.focus({ preventScroll: true });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeAt(i);
      settle();
      cells[Math.min(i, draft.length - 1)]?.querySelector<HTMLElement>('.tile')?.focus({ preventScroll: true });
    }
  });

  // ── la collection
  function renderPicker() {
    const qq = fold(pickSearch.value.trim());
    pickStarsEl.querySelectorAll<HTMLElement>('.chip').forEach((b) => (b.classList.toggle('on', b.dataset.r === pickStar), b.setAttribute('aria-pressed', String(b.dataset.r === pickStar))));
    const all = [...o.owned()].sort(o.sort).filter((c) => (!pickStar || c.rarity === pickStar) && (!qq || fold(catalogEntry(c.cardId)?.name ?? '').includes(qq)));
    const list = all.slice(0, PICK_CAP);
    // liste tronquée : on le dit (audit UX3-20)
    pickMore.hidden = all.length <= PICK_CAP;
    pickMore.textContent = `${fmtN(PICK_CAP)} sur ${fmtN(all.length)} · affine ta recherche ou filtre par étoiles`;
    pickTiles.clear();
    pickGrid.replaceChildren(
      ...list.map((c) => {
        const t = cardTile(c.cardId, c.rarity, { mini: true, count: c.count });
        const k = showcaseKey(c);
        t.dataset.k = k;
        t.insertAdjacentHTML('beforeend', '<span class="pf-pos" aria-hidden="true"></span>');
        pickTiles.set(k, t);
        return t;
      }),
    );
    if (!list.length) pickGrid.innerHTML = `<div class="muted">${qq || pickStar ? 'Aucune carte avec ce filtre.' : 'Aucune carte.'}</div>`;
    syncPicker();
  }
  /** état « en vitrine » (pastille avec sa place) sans reconstruire la grille */
  function syncPicker() {
    const pos = new Map(keys().map((k, i) => [k, i + 1]));
    for (const [k, t] of pickTiles) {
      const p = pos.get(k);
      t.classList.toggle('picked', !!p);
      t.setAttribute('aria-pressed', String(!!p));
      t.querySelector('.pf-pos')!.textContent = p ? String(p) : '';
    }
    pickHint.innerHTML = sel >= 0 && sel < draft.length ? `Choisis une carte pour <b>remplacer la case ${sel + 1}</b> · retouche la case pour annuler` : coarse.matches ? 'Touche pour ajouter ou retirer · <b>maintiens</b> puis glisse sur une case' : 'Clique pour ajouter ou retirer · <b>glisse</b> sur une case pour la placer';
  }
  pickGrid.addEventListener('click', (e) => {
    if (!active || swallowClick()) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tile[data-k]');
    if (!t) return;
    const [cardId, r] = t.dataset.k!.split(/:(?=[^:]+$)/);
    togglePick({ cardId, rarity: r as RarityId });
  });

  // ── GLISSER-DÉPOSER (Pointer Events : souris, stylet et doigt)
  interface Pending { pid: number; x0: number; y0: number; el: HTMLElement; k: string; card: ShowcaseCard; src: 'tray' | 'pick'; touch: boolean; timer: number }
  interface Drag { pid: number; k: string; card: ShowcaseCard; from: number; ghost: HTMLElement; ox: number; oy: number; w: number; target: number | null; fresh: boolean }
  let pending: Pending | null = null;
  let drag: Drag | null = null;
  let lastDragEnd = 0;
  const swallowClick = () => performance.now() - lastDragEnd < 80;

  function down(e: PointerEvent, src: 'tray' | 'pick') {
    if (!active || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target as HTMLElement;
    if (t.closest('.pf-x')) return;
    const el = src === 'tray' ? t.closest<HTMLElement>('.pf-card') : t.closest<HTMLElement>('.tile[data-k]');
    if (!el) return;
    const k = el.dataset.k!;
    const [cardId, r] = k.split(/:(?=[^:]+$)/);
    const touch = e.pointerType === 'touch';
    pending = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, el, k, card: { cardId, rarity: r as RarityId }, src, touch, timer: 0 };
    // collection au doigt : appui long (sinon c'est un défilement)
    if (touch && src === 'pick') {
      el.classList.add('pressing');
      pending.timer = window.setTimeout(() => pending && begin(pending.x0, pending.y0), LONG_PRESS);
    }
    window.addEventListener('pointermove', moveEv, { passive: false });
    window.addEventListener('pointerup', upEv);
    window.addEventListener('pointercancel', cancelEv);
  }
  caseEl.addEventListener('pointerdown', (e) => down(e, 'tray'));
  pickGrid.addEventListener('pointerdown', (e) => down(e, 'pick'));
  // pas de glisser natif des images, pas de menu « enregistrer l'image » à l'appui long
  for (const n of [caseEl, pickGrid]) {
    n.addEventListener('dragstart', (e) => active && e.preventDefault());
    n.addEventListener('contextmenu', (e) => active && (pending || drag) && e.preventDefault());
    // écouteur NON passif posé d'avance : sans lui, le navigateur défile en tâche de fond et le glissé au doigt ne peut
    // plus empêcher le défilement de la page
    n.addEventListener('touchmove', (e) => drag && e.cancelable && e.preventDefault(), { passive: false });
  }

  function clearPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.el.classList.remove('pressing');
    pending = null;
  }
  function unlisten() {
    window.removeEventListener('pointermove', moveEv);
    window.removeEventListener('pointerup', upEv);
    window.removeEventListener('pointercancel', cancelEv);
  }
  function moveEv(e: PointerEvent) {
    if (drag) {
      if (e.pointerId !== drag.pid) return;
      e.preventDefault();
      return moveTo(e.clientX, e.clientY);
    }
    if (!pending || e.pointerId !== pending.pid) return;
    const d = Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0);
    if (pending.touch && pending.src === 'pick') {
      if (d > 10) (clearPending(), unlisten()); // le doigt défile la liste
      return;
    }
    if (d > (pending.touch ? 6 : 5)) begin(e.clientX, e.clientY);
  }
  function begin(x: number, y: number) {
    const p = pending!;
    clearPending();
    const tile = p.src === 'tray' ? p.el.querySelector<HTMLElement>('.tile')! : p.el;
    const r = tile.getBoundingClientRect();
    const ghost = tile.cloneNode(true) as HTMLElement;
    ghost.classList.remove('pressing', 'picked', 'mini');
    ghost.classList.add('pf-ghost');
    ghost.querySelector('.pf-pos')?.remove();
    // la carte fantôme garde la taille d'une case de la vitrine (pour voir où elle tombe)
    const cellW = cells[0]?.getBoundingClientRect().width || r.width;
    const w = p.src === 'pick' ? Math.max(cellW, 56) : r.width;
    const sc = w / r.width;
    ghost.style.width = `${w}px`;
    document.body.append(ghost);
    const from = indexOf(p.k);
    drag = { pid: p.pid, k: p.k, card: p.card, from, ghost, ox: (x - r.left) * sc, oy: (y - r.top) * sc, w, target: from >= 0 ? from : null, fresh: from < 0 };
    if (from >= 0) cardEls.get(p.k)?.classList.add('lifted');
    caseEl.classList.add('dragging');
    document.body.classList.add('pf-dragging');
    window.getSelection()?.removeAllRanges();
    haptics.pulse(8);
    o.sfx.tick(1.5, 0.05);
    moveTo(x, y);
  }
  /** case visée : la plus proche du doigt tant qu'on est sur (ou juste autour de) la vitrine ; null = en dehors */
  function hit(x: number, y: number): number | null {
    const b = caseEl.getBoundingClientRect();
    const m = 14;
    if (x < b.left - m || x > b.right + m || y < b.top - m || y > b.bottom + m) return null;
    let best = 0;
    let bd = Infinity;
    cells.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bd) ((bd = d), (best = i));
    });
    return best;
  }
  function moveTo(x: number, y: number) {
    const d = drag!;
    const t = hit(x, y);
    d.ghost.style.transform = `translate3d(${x - d.ox}px, ${y - d.oy}px, 0) rotate(${t === null ? -4 : -2}deg) scale(1.06)`;
    // hors de la vitrine : une carte de la vitrine sera retirée (le fantôme le dit)
    d.ghost.classList.toggle('out', t === null && !d.fresh);
    if (t === d.target) return;
    d.target = t;
    preview();
  }
  function preview() {
    const d = drag!;
    const t = d.target;
    if (!d.fresh) {
      // déplacement d'une carte déjà en vitrine
      const rest = draft.filter((_, i) => i !== d.from);
      const at = t === null ? d.from : Math.min(t, rest.length);
      const items: Item[] = [...rest];
      items.splice(at, 0, d.card);
      return layout(items);
    }
    if (t === null) return layout(draft);
    if (draft.length < slots) {
      const items: Item[] = [...draft];
      items.splice(Math.min(t, draft.length), 0, 'ph');
      return layout(items);
    }
    // vitrine pleine : la carte visée sera remplacée
    layout(draft, { swap: t });
  }
  function upEv(e: PointerEvent) {
    if (drag && e.pointerId === drag.pid) return drop();
    if (pending && e.pointerId === pending.pid) (clearPending(), unlisten());
  }
  function cancelEv(e: PointerEvent) {
    if (drag && e.pointerId === drag.pid) return end(true);
    if (pending && e.pointerId === pending.pid) (clearPending(), unlisten());
  }
  function drop() {
    const d = drag!;
    const t = d.target;
    const r = d.ghost.getBoundingClientRect();
    let from: { k: string; r: DOMRect } | undefined = { k: d.k, r };
    if (!d.fresh) {
      if (t === null) {
        removeAt(d.from);
        from = undefined;
      } else move(d.from, t);
    } else if (t !== null) {
      if (draft.length < slots) add(d.card, t);
      else {
        // la carte remplacée retourne dans la collection
        cardEls.get(showcaseKey(draft[t]))?.remove();
        draft[t] = d.card;
      }
      o.sfx.tick(1.3, 0.05);
    } else from = undefined;
    sel = -1;
    end(false, from);
  }
  function end(cancelled: boolean, from?: { k: string; r: DOMRect }) {
    const d = drag;
    drag = null;
    unlisten();
    lastDragEnd = performance.now();
    caseEl.classList.remove('dragging');
    document.body.classList.remove('pf-dragging');
    if (!d) return;
    cardEls.get(d.k)?.classList.remove('lifted');
    // le fantôme s'efface pendant que la carte vient se poser à sa place
    d.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: from ? 90 : 160, fill: 'forwards' }).finished.finally(() => d.ghost.remove());
    if (!cancelled) haptics.pulse(6);
    settle(cancelled ? undefined : from);
  }
  // Échap pendant un glissé : on annule le glissé seulement (pas toute l'édition)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !drag) return;
    e.stopImmediatePropagation();
    end(true);
  });

  // ── API
  return {
    get active() {
      return active;
    },
    start(list) {
      active = true;
      draft = list.slice(0, slots).map((c) => ({ cardId: c.cardId, rarity: c.rarity }));
      initial = keys().join('|');
      sel = -1;
      cardEls.clear();
      buildCells();
      layout(draft);
      pickerEl.hidden = false;
      renderPicker();
      o.onChange();
    },
    stop() {
      if (drag) end(true);
      clearPending();
      unlisten();
      active = false;
      sel = -1;
      cardEls.clear();
      pickTiles.clear();
      pickerEl.hidden = true;
      pickSearch.value = '';
      pickStar = null;
      pickGrid.replaceChildren();
    },
    value: () => draft.map((c) => ({ ...c })),
    dirty: () => keys().join('|') !== initial,
    fill() {
      const have = new Set(keys());
      const more = [...o.owned()].sort(o.sort).filter((c) => !have.has(showcaseKey(c))).slice(0, slots - draft.length);
      if (!more.length) return void toast(draft.length >= slots ? 'La vitrine est déjà pleine.' : 'Plus aucune carte à ajouter.', 'info');
      for (const c of more) add({ cardId: c.cardId, rarity: c.rarity });
      o.sfx.tick(1.4, 0.05);
      settle();
    },
    clear() {
      if (!draft.length) return;
      draft = [];
      sel = -1;
      o.sfx.tick(0.8, 0.05);
      settle();
    },
  };
}
