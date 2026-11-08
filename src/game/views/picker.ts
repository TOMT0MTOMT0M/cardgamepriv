import type { GameBackend } from '../backend';
import { cardKey, lockedCards } from '../backend';
import { CARD_VALUE, cardsValue, fmtCoins, type StakeItem } from '../../core/economy';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, starCount, type RarityId } from '../../core/rarity';
import { cardTile, esc, fold, h, popLayer, pushLayer } from '../ui';
import { COIN_ICON } from './wallet';
import { leave } from '../../core/morph';

const RARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];

/**
 * Choisir des cartes à miser (side pot d'un Pack Battle, roulette). Seules les cartes libres (pas engagées dans un
 * échange en attente) ; une mise peut inclure le dernier exemplaire (c'est un pari : elle peut revenir).
 * `onlyDups` : ne proposer que les doublons (la forge).
 */
export function pickCards(backend: GameBackend, current: StakeItem[], o: { title: string; hint?: string; onlyDups?: boolean; onlyRarity?: RarityId } = { title: 'Choisis tes cartes' }): Promise<StakeItem[] | null> {
  return new Promise((resolve) => {
    const picked = new Map<string, StakeItem>(current.map((c) => [cardKey(c), { ...c }]));
    const locked = lockedCards(backend.state);
    const free = (c: { cardId: string; rarity: RarityId; count: number }) => c.count - (locked.get(cardKey(c)) ?? 0) - (o.onlyDups ? 1 : 0);
    const rows = backend.state.collection.filter((c) => catalogEntry(c.cardId) && free(c) > 0 && (!o.onlyRarity || c.rarity === o.onlyRarity));
    let q = '';
    let rf: RarityId | '' = '';
    const veil = h('div', 'gm-modal-veil');
    const box = h('div', 'gm-modal picker');
    // vraie fenêtre de dialogue : annoncée comme telle, Échap la ferme, le focus y entre et revient au bouton d'origine
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', o.title);
    const opener = document.activeElement as HTMLElement | null;
    box.innerHTML = `<div class="pk-head"><b>${esc(o.title)}</b><button class="icon pk-x" aria-label="Fermer">✕</button></div>
      ${o.hint ? `<div class="muted">${esc(o.hint)}</div>` : ''}
      <div class="pk-tools"><input type="search" class="pk-q" placeholder="Chercher une carte…"><div class="pk-r"></div></div>
      <div class="pk-grid"></div>
      <div class="pk-sel"></div>
      <div class="pk-foot"><span class="pk-v"></span><button class="btn-ghost pk-clear">Vider</button><button class="btn-primary pk-ok">Valider</button></div>`;
    veil.append(box);
    document.body.append(veil);
    const grid = box.querySelector<HTMLElement>('.pk-grid')!;
    const sel = box.querySelector<HTMLElement>('.pk-sel')!;
    const rbar = box.querySelector<HTMLElement>('.pk-r')!;
    rbar.innerHTML = `<button class="chip on" data-r="">Toutes</button>${RARS.filter((r) => rows.some((c) => c.rarity === r)).map((r) => `<button class="chip" data-r="${r}" style="--rc:${rarity(r).hex}">${r === 'secret' ? '✷' : `${starCount(r)}★`}</button>`).join('')}`;
    rbar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      if (!b) return;
      rf = b.dataset.r as RarityId | '';
      rbar.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      drawGrid();
    });
    box.querySelector<HTMLInputElement>('.pk-q')!.addEventListener('input', (e) => {
      q = fold((e.target as HTMLInputElement).value.trim());
      drawGrid();
    });

    function drawGrid() {
      grid.replaceChildren();
      const list = rows
        .filter((c) => (!rf || c.rarity === rf) && (!q || fold(catalogEntry(c.cardId)!.name).includes(q)))
        .sort((a, b) => CARD_VALUE[b.rarity] - CARD_VALUE[a.rarity] || catalogEntry(a.cardId)!.name.localeCompare(catalogEntry(b.cardId)!.name))
        .slice(0, 180);
      for (const c of list) {
        const left = free(c) - (picked.get(cardKey(c))?.count ?? 0);
        const t = cardTile(c.cardId, c.rarity, { mini: true, count: left, label: left <= 0 ? 'misée' : `${CARD_VALUE[c.rarity]}` });
        t.classList.toggle('gone', left <= 0);
        t.addEventListener('click', () => {
          if (left <= 0) return;
          const k = cardKey(c);
          const p = picked.get(k) ?? { cardId: c.cardId, rarity: c.rarity, count: 0 };
          p.count++;
          picked.set(k, p);
          drawGrid();
          drawSel();
        });
        grid.append(t);
      }
      if (!list.length) grid.innerHTML = `<div class="muted">${rows.length ? 'Aucune carte ne correspond.' : o.onlyDups ? 'Aucun doublon libre.' : 'Aucune carte disponible.'}</div>`;
    }
    function drawSel() {
      const items = [...picked.values()].filter((p) => p.count > 0);
      sel.innerHTML = items.length ? '' : '<span class="muted">Touche une carte pour l’ajouter ; touche-la ici pour la retirer.</span>';
      for (const p of items) {
        const t = cardTile(p.cardId, p.rarity, { mini: true, count: p.count });
        t.title = 'Retirer un exemplaire';
        t.addEventListener('click', () => {
          p.count--;
          if (p.count <= 0) picked.delete(cardKey(p));
          drawGrid();
          drawSel();
        });
        sel.append(t);
      }
      box.querySelector('.pk-v')!.innerHTML = `${COIN_ICON}<b>${fmtCoins(cardsValue(items))}</b> de valeur`;
    }
    let done = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(null);
    };
    const layer = () => close(null);
    const close = (v: StakeItem[] | null) => {
      if (done) return;
      done = true;
      popLayer(layer);
      window.removeEventListener('keydown', onKey, true);
      void leave(veil).then(() => veil.remove());
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      resolve(v);
    };
    pushLayer(layer);
    window.addEventListener('keydown', onKey, true);
    box.querySelector('.pk-x')!.addEventListener('click', () => close(null));
    veil.addEventListener('click', (e) => e.target === veil && close(null));
    box.querySelector('.pk-clear')!.addEventListener('click', () => {
      picked.clear();
      drawGrid();
      drawSel();
    });
    box.querySelector('.pk-ok')!.addEventListener('click', () => close([...picked.values()].filter((p) => p.count > 0)));
    drawGrid();
    drawSel();
    // au doigt, pas de clavier qui surgit : le focus va sur ✕ ; à la souris / au clavier, sur la recherche
    const first = matchMedia('(pointer: coarse)').matches ? box.querySelector<HTMLElement>('.pk-x') : box.querySelector<HTMLElement>('.pk-q');
    requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    // Tab reste dans la fenêtre
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...box.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')].filter((x) => !(x as HTMLButtonElement).disabled && x.offsetParent !== null);
      if (!f.length) return;
      const [a, z] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === a) (e.preventDefault(), z.focus());
      else if (!e.shiftKey && document.activeElement === z) (e.preventDefault(), a.focus());
    });
  });
}
