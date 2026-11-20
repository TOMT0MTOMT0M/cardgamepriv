import '../core/i18n/fr/game.titres'; // (textes de ce module, version anglaise)
import './titres.css';
import { t as tr } from '../core/i18n';
import { catalogInstalled } from '../core/sets/themes';
import { UNIQUE_TITLES, claimableUniqueTitles, uniqueTitle, uniqueTitleLabel, uniqueTitleSet, type UniqueTitle, type UniqueTitleHolder } from '../core/uniqueTitles';
import { DUR, STAGGER } from '../core/motion';
import type { GameBackend } from './backend';
import { esc, h, popLayer, pushLayer } from './ui';

/**
 * TITRES UNIQUES côté joueur (20/11, règles : src/core/uniqueTitles.ts) :
 *  - `utag(userId)` : la pastille du titre, à poser à côté d'un pseudo (profil, classement, marché, amis) ;
 *  - `armUniqueTitles` : suit les détenteurs (une petite requête, qui ne repart que lorsqu'un titre est remporté),
 *    réclame tout seul un titre dès que ma collection est complète et le titre libre, et joue la cérémonie si je gagne.
 * La pastille dépend d'une liste reçue après le premier affichage : les pages qui l'affichent écoutent
 * `onUniqueTitles` et se redessinent.
 */
let holders: UniqueTitleHolder[] = [];
let byUser = new Map<string, UniqueTitle[]>();
const subs = new Set<() => void>();

const CROWN = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.7 9.5H5.2z" fill="currentColor"/></svg>';

export const uniqueHolders = (): readonly UniqueTitleHolder[] => holders;
export const holderOf = (titleId: string) => holders.find((x) => x.titleId === titleId);
export const uniqueTitlesOf = (userId?: string | null): UniqueTitle[] => (userId ? byUser.get(userId) ?? [] : []);
export function onUniqueTitles(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Pastille(s) du ou des titres uniques d'un joueur (chaîne vide s'il n'en a pas). `compact` : le premier seulement. */
export function utag(userId?: string | null, o: { compact?: boolean } = {}): string {
  const list = uniqueTitlesOf(userId);
  if (!list.length) return '';
  return (o.compact ? list.slice(0, 1) : list)
    .map((t) => `<span class="utag" style="--ut:${t.tint}" title="${esc(tr('ut.tip', { set: uniqueTitleSet(t)?.label ?? '' }))}">${CROWN}<span>${esc(uniqueTitleLabel(t))}</span></span>`)
    .join('');
}

function setHolders(list: UniqueTitleHolder[]) {
  holders = list;
  byUser = new Map();
  for (const x of list) {
    const t = uniqueTitle(x.titleId);
    if (t) byUser.set(x.userId, [...(byUser.get(x.userId) ?? []), t]);
  }
  subs.forEach((fn) => fn());
}

/**
 * Cérémonie du titre remporté : plein écran, le titre frappé en grand dans sa teinte, la collection à 100 %.
 * Un toucher (ou « Continuer ») la ferme ; rien d'autre ne se passe pendant.
 */
export function celebrateUniqueTitle(t: UniqueTitle, sound?: () => void): void {
  const set = uniqueTitleSet(t);
  const ov = h('div', 'ut-win');
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.style.setProperty('--ut', t.tint);
  ov.style.setProperty('--ut-cer', `${DUR.ceremonie}ms`);
  ov.style.setProperty('--ut-dra', `${DUR.dramatique}ms`);
  ov.style.setProperty('--ut-stg', `${STAGGER.normal}ms`);
  const label = uniqueTitleLabel(t);
  ov.innerHTML = `<i class="ut-win-rays" aria-hidden="true"></i><i class="ut-win-ring" aria-hidden="true"></i>
    <div class="ut-win-box">
      <span class="ut-win-k">${CROWN}${tr('ut.kicker')}</span>
      <b class="ut-win-t" aria-label="${esc(label)}">${[...label].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</b>
      <span class="ut-win-f">${tr('ut.wonFirst')}</span>
      <span class="ut-win-s">${set ? tr('ut.wonSet', { set: esc(set.label), n: set.cards.length }) : ''}</span>
      <span class="ut-win-e">${tr('ut.wonForever')}</span>
      <button class="btn-primary ut-win-x">${tr('ut.wonClose')}</button>
    </div>`;
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    popLayer(close);
    ov.classList.add('is-leaving');
    setTimeout(() => ov.remove(), DUR.emphatique());
  };
  // (le bouton arrive après la frappe du titre : pas de fermeture par un toucher parti trop tôt)
  setTimeout(() => ov.addEventListener('click', close), DUR.dramatique);
  document.body.append(ov);
  pushLayer(close);
  try {
    sound?.();
  } catch {
    /* son indisponible */
  }
}

/**
 * À appeler une fois au démarrage. `onWon` : un titre vient d'être remporté par moi (son, cérémonie déjà lancée).
 * La réclamation automatique ne recalcule que si ma collection ou la liste des détenteurs a changé.
 */
export function armUniqueTitles(backend: GameBackend, sound?: () => void): void {
  let lastColl: unknown = null;
  let lastHolders: unknown = null;
  let busy = false;
  const check = () => {
    const st = backend.state;
    if (busy || !st.ready || !st.user || !catalogInstalled()) return;
    if (st.collection === lastColl && holders === lastHolders) return;
    lastColl = st.collection;
    lastHolders = holders;
    if (!st.collection.length) return;
    const taken = new Set(holders.map((x) => x.titleId));
    if (taken.size >= UNIQUE_TITLES.length) return;
    const can = claimableUniqueTitles(new Set(st.collection.map((c) => c.cardId)), taken);
    if (!can.length) return;
    busy = true;
    backend.eco
      .claimTitles()
      .then((won) => won.map(uniqueTitle).filter((x): x is UniqueTitle => !!x).forEach((x, i) => setTimeout(() => celebrateUniqueTitle(x, sound), i * DUR.ceremonie)))
      .catch(() => undefined) // (pris entre-temps, hors ligne : la page Succès dit où on en est)
      .finally(() => (busy = false));
  };
  backend.eco.watchTitles((list) => {
    setHolders(list);
    check();
  });
  backend.onChange(check);
}
