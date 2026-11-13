import { t } from '../../core/i18n';
import '../../core/i18n/fr/game.views.owners'; // (textes de ce module, version anglaise)
import type { CardOwner, GameBackend } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { cardWhere } from '../../core/cardSearch';
import { rarity } from '../../core/rarity';
import { errMsg, esc, h, navigate, popLayer, pushLayer, thumbUrl } from '../ui';

/**
 * « CHERCHER UN PROPRIÉTAIRE » (v1.0.9, retours 09/11) : fiche par-dessus la page — qui possède la carte (hors moi),
 * combien d'exemplaires LIBRES, en ligne ou non — avec « Échanger » qui ouvre l'échange direct avec ce joueur, la carte
 * déjà dans « Je demande ». Ouverte depuis la collection (fiche d'une carte, carte manquante) et depuis la recherche de
 * la page Échanges. Retour du téléphone, Échap, ✕ ou un toucher à côté la referment.
 */
export function showOwners(backend: GameBackend, cardId: string, onTrade?: (o: CardOwner) => void, hint?: string) {
  const e = catalogEntry(cardId);
  if (!e) return;
  const r = rarity(e.rarity);
  const mine = backend.state.collection.find((c) => c.cardId === cardId)?.count ?? 0;
  const veil = h('div', 'ow-veil');
  veil.innerHTML = `<div class="ow" role="dialog" aria-modal="true" aria-labelledby="ow-t" style="--rc:${r.hex}">
    <div class="ow-h">
      ${e.rarity !== 'secret' ? `<img class="ow-img" alt="" src="${thumbUrl(e)}">` : '<span class="ow-img ow-sec">?</span>'}
      <div class="ow-id">
        <span class="ow-k">${t('own.title')}</span>
        <b id="ow-t">${esc(e.name)}</b>
        <span class="ow-sub">${esc(cardWhere(e))} · <i>${r.rank + 1}★</i></span>
        <span class="ow-me">${esc(hint ?? (mine ? t('own.youHave', { n: mine }) : t('own.notYet')))}</span>
      </div>
      <button class="ow-x" aria-label="${t('common.close')}">✕</button>
    </div>
    <div class="ow-list" aria-live="polite"><div class="ow-row skel"></div><div class="ow-row skel"></div><div class="ow-row skel"></div></div>
  </div>`;
  const list = veil.querySelector<HTMLElement>('.ow-list')!;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    popLayer(close);
    document.removeEventListener('keydown', onKey);
    veil.classList.remove('on');
    veil.classList.add('out');
    setTimeout(() => veil.remove(), 260);
  };
  const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
  veil.addEventListener('click', (ev) => ev.target === veil && close());
  veil.querySelector('.ow-x')!.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(veil);
  pushLayer(close);
  requestAnimationFrame(() => veil.classList.add('on'));

  const go =
    onTrade ??
    ((o: CardOwner) => {
      try {
        sessionStorage.setItem('bebou.tradeWith', o.id);
        sessionStorage.setItem('bebou.tradeGet', `${cardId}:${o.rarity}`);
      } catch {
        /* stockage bloqué : la page Échanges s'ouvre sans l'ami choisi */
      }
      navigate('#/echanges');
    });

  backend
    .cardOwners(cardId)
    .then((owners) => {
      if (closed) return;
      if (!owners.length) {
        list.innerHTML = `<p class="ow-empty">${t('own.nobody', { wish: mine ? '' : t('own.wishHint') })}</p>`;
        return;
      }
      list.innerHTML = '';
      for (const o of owners) {
        const what = o.free <= 0 ? t('own.busy') : o.free >= 2 ? `${o.free} exemplaires · doublon` : o.count > 1 ? '1 exemplaire libre' : t('own.only');
        const row = h('div', `ow-row${o.free >= 2 ? ' dup' : ''}${o.free <= 0 ? ' busy' : ''}`);
        row.innerHTML = `<span class="dot${o.online ? ' on' : ''}" title="${o.online ? 'en ligne' : 'hors ligne'}"></span><span class="ow-who"><b>${esc(o.name)}</b><small>${what}</small></span>
          <button class="btn-primary ow-go"${o.free <= 0 ? ' disabled' : ''}>${t('own.trade')}</button>`;
        row.querySelector('.ow-go')!.addEventListener('click', () => {
          close();
          go(o);
        });
        list.append(row);
      }
    })
    .catch((err) => {
      if (!closed) list.innerHTML = `<p class="ow-empty err">${esc(errMsg(err))}</p>`;
    });
}
