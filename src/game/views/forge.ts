import type { GameBackend, GameState } from '../backend';
import { cardKey, lockedCards } from '../backend';
import type { Shell } from '../shell';
import { CARD_VALUE, burnable, cardsValue, fmtCoins, type StakeItem } from '../../core/economy';
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
const LEGEND = 'Protégées, jamais brûlées : le dernier exemplaire de chaque carte, les secrètes, ♥ envies, ▤ classeurs, ⌂ pochettes et 🔒 exemplaires engagés (échange en attente, annonce)';

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
      el.innerHTML = '<div class="gm-panel gm-forge"><b>Connecte-toi pour brûler tes doublons.</b></div>';
      tiles = new Map();
      return;
    }
    const dups = forgeDups(st);
    for (const [k, v] of sel) {
      const d = dups.find((x) => cardKey(x) === k);
      if (!d) sel.delete(k);
      else v.count = Math.min(v.count, d.spare);
    }
    const lockedMap = lockedCards(st); // (audit 12/11, A4-01) une fois par rendu, plus une fois par carte de la collection
    const lockedN = st.collection.reduce((a, c) => a + (burnable(c.rarity) ? Math.min(lockedMap.get(cardKey(c)) ?? 0, Math.max(0, c.count - 1)) : 0), 0);
    const total = cardsValue([...sel.values()]);
    const n = [...sel.values()].reduce((a, c) => a + c.count, 0);
    const rars = (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as RarityId[]).filter((r) => dups.some((d) => d.rarity === r));
    // sélection rapide : comme le remplissage auto des contrats, elle laisse de côté les cartes protégées (UX4-06)
    const quick = (r: RarityId) => dups.filter((d) => d.rarity === r && !d.protect.length);
    const quickProt = (r: RarityId) => dups.filter((d) => d.rarity === r && d.protect.length).length;
    const quickOn = (r: RarityId) => quick(r).length > 0 && quick(r).every((d) => sel.get(cardKey(d))?.count === d.spare);
    const anyMark = dups.some((d) => d.protect.length || d.locked);
    const free = dups.reduce((a, d) => a + d.spare, 0);
    el.innerHTML = `<div class="gm-panel gm-forge"><div class="gm-ph"><b>La forge</b><span class="muted">${fmtN(free)} ${free > 1 ? 'doublons brûlables' : 'doublon brûlable'}${lockedN ? ` · ${fmtN(lockedN)} engagé${lockedN > 1 ? 's' : ''} 🔒` : ''} · on garde toujours 1 exemplaire · les secrètes ne se brûlent jamais</span></div>
      <div class="muted fg-rate">1★ = 5 · 2★ = 15 · 3★ = 40 · 4★ = 100 · 5★ = 300 · 6★ = 1 000 pièces</div>
      <div class="gm-quick">${rars.map((r) => {
        const q = quick(r);
        const np = quickProt(r);
        return `<button class="chip${quickOn(r) ? ' on' : ''}" data-q="${r}" style="--rc:${rarity(r).hex}"${q.length ? '' : ' disabled'} aria-pressed="${quickOn(r)}">Tous les ${starsTxt(r)} (${q.reduce((a, d) => a + d.spare, 0)} · ${fmtCoins(q.reduce((a, d) => a + d.spare * CARD_VALUE[r], 0))})${np ? ` <small>· ${np} protégée${np > 1 ? 's' : ''} laissée${np > 1 ? 's' : ''}</small>` : ''}</button>`;
      }).join('')}<button class="btn-ghost sm gm-none"${n ? '' : ' disabled'}>Rien</button>${undo ? '<button class="linkish gm-undo">Annuler la sélection rapide</button>' : ''}</div>
      ${anyMark ? `<div class="gm-legend-p muted">${esc(LEGEND)}</div>` : ''}
      <div class="gm-fgrid"></div>
      <div class="gm-ffoot"><span>${n ? `${plural(n, 'carte')} (${cardsSummary([...sel.values()])}) → ${coinsHtml(total)}` : '<span class="muted">Touche des doublons pour les mettre au feu (touche encore pour en ajouter un exemplaire).</span>'}</span><button class="btn-primary gm-burn"${n && !isPending('forge') ? '' : ' disabled'}>Brûler${n ? ` · +${fmtCoins(total)}` : ''}</button></div></div>`;
    const grid = el.querySelector<HTMLElement>('.gm-fgrid')!;
    if (!dups.length) grid.innerHTML = `<div class="muted">Aucun doublon à brûler pour l’instant${lockedN ? ' (tes autres doublons sont engagés 🔒)' : ''}. <a href="#/">Ouvre des boosters →</a></div>`;
    // (audit 12/11, S14 / A4-01) les tuiles sont GARDÉES d'un rendu à l'autre : un toucher ne recrée plus jusqu'à 400
    // tuiles (et leurs images), il met à jour l'étiquette de celles qui existent déjà. Refaite si la carte a changé.
    const kept = tiles;
    tiles = new Map();
    for (const d of dups.slice(0, 400)) {
      const k = cardKey(d);
      const inSel = sel.get(k)?.count ?? 0;
      const label = inSel ? `🔥 ${inSel}/${d.spare}` : `+${CARD_VALUE[d.rarity]}`;
      const why = [...d.protect, ...(d.locked ? [`${d.locked} engagé${d.locked > 1 ? 's' : ''}`] : [])];
      const sig = `${d.spare}|${why.join(',')}`;
      const old = kept.get(k);
      const badge = old?.sig === sig ? old.t.querySelector<HTMLElement>(':scope > .badge') : null;
      if (old && badge) {
        if (badge.textContent !== label) badge.textContent = label;
        old.t.classList.toggle('burning', inSel > 0);
        tiles.set(k, old);
        grid.append(old.t);
        continue;
      }
      // ×N = exemplaires brûlables (on en garde toujours un ; les engagés ne comptent pas)
      const t = cardTile(d.cardId, d.rarity, { mini: true, count: d.spare, label });
      tiles.set(k, { t, sig });
      t.title = `${cardName(d.cardId)} · ${plural(d.spare, 'exemplaire brûlable', 'exemplaires brûlables')}${why.length ? ` · ${why.join(', ')}` : ''}`;
      const icons = protectIcons(d.protect) + (d.locked ? '🔒' : '');
      if (icons) t.insertAdjacentHTML('beforeend', `<span class="ct-prot gm-prot" aria-label="${esc(why.join(', '))}">${icons}</span>`);
      t.classList.toggle('burning', inSel > 0);
      t.addEventListener('click', () => {
        if (isPending('forge')) return;
        const cur = sel.get(k)?.count ?? 0;
        if (cur >= d.spare) sel.delete(k);
        else sel.set(k, { cardId: d.cardId, rarity: d.rarity, count: cur + 1 });
        undo = null;
        render();
      });
      grid.append(t);
    }
    if (dups.length > 400) grid.insertAdjacentHTML('beforeend', `<div class="muted">… et ${fmtN(dups.length - 400)} autres (les sélections rapides les prennent aussi).</div>`);
    el.querySelectorAll<HTMLElement>('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        if (isPending('forge')) return;
        const r = b.dataset.q as RarityId;
        undo = new Map([...sel].map(([k, v]) => [k, { ...v }]));
        // deuxième toucher sur la même puce : on la retire (sélection rapide annulable)
        if (quickOn(r)) for (const d of quick(r)) sel.delete(cardKey(d));
        else for (const d of quick(r)) sel.set(cardKey(d), { cardId: d.cardId, rarity: d.rarity, count: d.spare });
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
      if ((total >= 300 || n >= 30) && !confirmTap(burnBtn, `Brûler ${plural(n, 'carte')} (${cardsSummary([...sel.values()])}) ?`)) return;
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
          toast(`${plural(r.count, 'doublon')} brûlé${r.count > 1 ? 's' : ''} : +${fmtCoins(r.coins)} pièces !`, 'ok');
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
