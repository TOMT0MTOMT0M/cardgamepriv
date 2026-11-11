import { collectionSig, type GameBackend } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import type { Deal, DealCard, ForYou } from '../../core/deals';
import { errMsg, esc, h, navigate, popLayer, pushLayer, starsHtml, thumbUrl } from '../ui';
import { askFor, invalidatePanel, offerTo } from './cardPanel';
import '../echanges.css';

/**
 * REFONTE DES ÉCHANGES (11/11), lot B — zone « POUR TOI » : des échanges PRÊTS, fabriqués par le serveur à la demande
 * (convex/deals.ts `forYou` : mes envies × les doublons proposables de tous, même étoile). Chaque échange : « tu reçois
 * [sa carte] ⇄ tu donnes [ton doublon] » (contrepartie choisie automatiquement, « changer » pour une autre) et UN bouton
 * « Demander ». Dessous, « ils cherchent tes doublons » (Proposer : le serveur choisit ce que tu reçois).
 * Coût : une requête ponctuelle (pas d'abonnement), refaite au plus toutes les 90 s ou quand envies / collection changent.
 */
export interface ForYouView {
  el: HTMLElement;
  enter(force?: boolean): void;
  /** nombre d'échanges prêts connus (pastille) */
  count(): number;
}

const STALE = 90_000;
const nameOf = (id: string) => catalogEntry(id)?.name ?? id;
const shortName = (n: string) => n.replace(/ \(robot\)$/, '');
const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 60 ? 'à l’instant' : s < 3600 ? `il y a ${Math.floor(s / 60)} min` : `il y a ${Math.floor(s / 3600)} h`;
};

/** Vignette de carte (toucher = la voir en grand : `[data-zoom]`, géré par la page Échanges). */
export function cardChip(c: DealCard, label: string, extra = '') {
  const e = catalogEntry(c.cardId);
  const rr = rarity(c.rarity);
  return `<span class="fy-card" style="--rc:${rr.hex}"><span class="fy-k">${label}</span>${e && !rr.secret ? `<img alt="" loading="lazy" decoding="async" data-zoom="${esc(`${c.cardId}|${c.rarity}`)}" src="${thumbUrl(e)}">` : '<span class="fy-q">?</span>'}<b>${esc(nameOf(c.cardId))}</b><i>${starsHtml(c.rarity)}</i>${extra}</span>`;
}

/**
 * Choisir une carte dans une petite feuille (contrepartie « changer », « Choisir autre chose » d'une demande reçue).
 * `load` peut être lent (serveur) : squelette en attendant.
 */
export function pickCardSheet(o: { title: string; sub: string; load: () => Promise<Array<DealCard & { tag?: string; on?: boolean }>>; empty: string; onPick: (c: DealCard) => Promise<boolean> | boolean }) {
  const veil = h('div', 'ow-veil fy-veil');
  veil.innerHTML = `<div class="ow fy-pick" role="dialog" aria-modal="true" aria-label="${esc(o.title)}">
    <div class="ow-h"><div class="ow-id"><span class="ow-k">${esc(o.title)}</span><span class="ow-me">${esc(o.sub)}</span></div><button class="ow-x" aria-label="Fermer">✕</button></div>
    <div class="fy-pg" aria-live="polite">${'<span class="fy-pc skel"></span>'.repeat(6)}</div></div>`;
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
  const pg = veil.querySelector<HTMLElement>('.fy-pg')!;
  o.load()
    .then((list) => {
      if (closed) return;
      if (!list.length) return void (pg.innerHTML = `<p class="ow-empty">${esc(o.empty)}</p>`);
      pg.replaceChildren();
      for (const c of list) {
        const e = catalogEntry(c.cardId);
        const rr = rarity(c.rarity);
        const b = h('button', `fy-pc${c.on ? ' on' : ''}`, `${e ? `<img alt="" loading="lazy" decoding="async" src="${thumbUrl(e)}">` : ''}<b>${esc(nameOf(c.cardId))}</b>${c.tag ? `<em>${esc(c.tag)}</em>` : ''}`);
        b.style.setProperty('--rc', rr.hex);
        b.addEventListener('click', async () => {
          if (b.dataset.busy) return;
          b.dataset.busy = '1';
          b.classList.add('busy');
          try {
            if (await o.onPick(c)) close();
          } finally {
            delete b.dataset.busy;
            b.classList.remove('busy');
          }
        });
        pg.append(b);
      }
    })
    .catch((err) => !closed && (pg.innerHTML = `<p class="ow-empty err">${esc(errMsg(err))}</p>`));
  return close;
}

export function createForYou(backend: GameBackend, o: { chime(): void; search(): void }): ForYouView {
  const el = h('section', 'fy');
  el.innerHTML = `
    <div class="fy-head"><p class="fy-intro">Tes envies chez ceux qui en ont un doublon, contre un de tes doublons de même étoile qui leur manque. Un toucher pour demander.</p><button class="btn-ghost fy-refresh" aria-label="Chercher de nouveau">Actualiser</button></div>
    <div class="fy-deals" aria-live="polite"></div>
    <div class="fy-want" hidden><h3 class="fy-h">Ils cherchent tes doublons <small class="fy-want-n"></small></h3><div class="fy-want-list"></div></div>
    <p class="fy-foot muted"></p>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const dealsEl = q('.fy-deals');
  let data: ForYou | null = null;
  let loading: Promise<void> | null = null;
  let sig = '';
  /** échanges demandés depuis cette liste (en attendant la prochaine lecture) */
  const done = new Set<string>();
  const dKey = (d: { userId: string; get: DealCard }) => `${d.userId}|${d.get.cardId}`;
  const wKey = (w: { userId: string; card: DealCard }) => `${w.userId}|w|${w.card.cardId}`;
  const stateSig = () => {
    const s = backend.state;
    return `${collectionSig(s)}|${s.wishlist.join(',')}|${s.tradeProtected.join(',')}|${s.trades.outgoing.length}`;
  };

  function load(force = false) {
    const now = stateSig();
    if (loading) return loading;
    if (!force && data && now === sig && Date.now() - data.at < STALE) return Promise.resolve();
    if (!data) dealsEl.innerHTML = '<div class="fy-deal skel"></div><div class="fy-deal skel"></div>';
    q<HTMLButtonElement>('.fy-refresh').disabled = true;
    loading = backend
      .forYou()
      .then((d) => {
        data = d;
        sig = now;
        done.clear();
      })
      .catch((e) => {
        if (!data) dealsEl.innerHTML = `<p class="fy-empty err">${esc(errMsg(e))}</p>`;
      })
      .finally(() => {
        loading = null;
        q<HTMLButtonElement>('.fy-refresh').disabled = false;
        render();
      });
    return loading;
  }
  q('.fy-refresh').addEventListener('click', () => void load(true));

  function dealEl(d: Deal) {
    const w = h('article', `fy-deal${done.has(dKey(d)) ? ' sent' : ''}`);
    w.style.setProperty('--rc', rarity(d.get.rarity).hex);
    const draw = () => {
      const sent = done.has(dKey(d));
      w.classList.toggle('sent', sent);
      w.innerHTML = `<div class="fy-who"><span class="dot${d.online ? ' on' : ''}" title="${d.online ? 'en ligne' : 'hors ligne'}"></span><b>${esc(shortName(d.name))}</b><span class="fy-dup">a un doublon de ta carte voulue</span></div>
        <div class="fy-swap">${cardChip(d.get, 'Tu reçois', '<em class="fy-wish">dans tes envies</em>')}<span class="fy-arrow" aria-hidden="true">⇄</span>${cardChip(d.give, 'Tu donnes', d.theyWish ? '<em class="fy-wish">il la cherche</em>' : '<em class="fy-lack">elle lui manque</em>')}</div>
        <div class="fy-act">${d.alts.length && !sent ? `<button class="linkish fy-change">Donner une autre carte <small>(${d.alts.length})</small></button>` : '<span></span>'}<button class="${sent ? 'btn-ghost' : 'btn-primary'} fy-ask"${sent ? ' disabled' : ''}>${sent ? 'Demandé' : 'Demander'}</button></div>`;
      w.querySelector('.fy-ask')?.addEventListener('click', async (e) => {
        const b = e.currentTarget as HTMLElement;
        if (await askFor(backend, { userId: d.userId, name: shortName(d.name) }, d.get, b, d.give)) {
          done.add(dKey(d));
          o.chime();
          draw();
        }
      });
      w.querySelector('.fy-change')?.addEventListener('click', () => {
        const all = [d.give.cardId, ...d.alts];
        pickCardSheet({
          title: 'Ce que tu donnes',
          sub: `Un de tes doublons ${starsTxt(d.give.rarity)} qui manque à ${shortName(d.name)}`,
          load: async () => all.map((id) => ({ cardId: id, rarity: d.give.rarity, on: id === d.give.cardId, tag: id === d.give.cardId ? 'choisie' : undefined })),
          empty: 'Aucune autre carte.',
          onPick: (c) => {
            const was = d.give.cardId;
            d.give = c;
            d.alts = all.filter((id) => id !== c.cardId);
            if (was !== c.cardId) d.theyWish = false;
            draw();
            return true;
          },
        });
      });
    };
    draw();
    return w;
  }

  function render() {
    if (!data) return;
    const deals = data.deals;
    dealsEl.replaceChildren(...deals.map(dealEl));
    if (!deals.length) {
      const wishes = backend.state.wishlist.length;
      dealsEl.innerHTML = `<div class="fy-empty"><p>${
        wishes
          ? 'Aucun échange prêt pour l’instant : personne n’a de doublon libre de tes envies, ou tu n’as pas de doublon de même étoile à donner en échange.'
          : 'Marque les cartes que tu veux (♥ Je la veux, dans la Collection ou sous une carte cherchée) : on trouve pour toi qui en a un doublon, et contre quoi.'
      }</p><div class="fy-empty-acts"><button class="btn-primary fy-go-search">Chercher une carte</button>${wishes ? '' : '<button class="btn-ghost fy-go-coll">Ma collection</button>'}</div></div>`;
      dealsEl.querySelector('.fy-go-search')!.addEventListener('click', () => o.search());
      dealsEl.querySelector('.fy-go-coll')?.addEventListener('click', () => navigate('#/collection'));
    }
    const want = data.theyWant;
    q('.fy-want').hidden = !want.length;
    q('.fy-want-n').textContent = want.length ? String(want.length) : '';
    q('.fy-want-list').replaceChildren(
      ...want.map((w) => {
        const sent = done.has(wKey(w));
        const r = h('div', `fy-row${sent ? ' sent' : ''}`);
        r.style.setProperty('--rc', rarity(w.card.rarity).hex);
        const e = catalogEntry(w.card.cardId);
        r.innerHTML = `${e ? `<img alt="" loading="lazy" decoding="async" data-zoom="${esc(`${w.card.cardId}|${w.card.rarity}`)}" src="${thumbUrl(e)}">` : ''}<span class="fy-rw"><b>${esc(nameOf(w.card.cardId))}</b><small><span class="dot${w.online ? ' on' : ''}"></span>${esc(shortName(w.name))} la cherche · ${starsTxt(w.card.rarity)}</small></span><button class="${sent ? 'btn-ghost' : 'btn-ghost'} fy-offer"${sent ? ' disabled' : ''}>${sent ? 'Proposé' : 'Proposer'}</button>`;
        r.querySelector('.fy-offer')!.addEventListener('click', async (ev) => {
          if (await offerTo(backend, { userId: w.userId, name: shortName(w.name) }, w.card, ev.currentTarget as HTMLElement)) {
            done.add(wKey(w));
            invalidatePanel(w.card.cardId);
            o.chime();
            render();
          }
        });
        return r;
      }),
    );
    q('.fy-foot').textContent = `${deals.length} échange${deals.length > 1 ? 's' : ''} prêt${deals.length > 1 ? 's' : ''} · mis à jour ${ago(data.at)}`;
  }

  return {
    el,
    enter(force = false) {
      void load(force);
      if (data) render();
    },
    count: () => (data ? data.deals.filter((d) => !done.has(dKey(d))).length : 0),
  };
}

const starsTxt = (r: RarityId) => (r === 'secret' ? 'Bébou' : `${rarity(r).rank + 1}★`);
