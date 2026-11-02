import type { BigPull, GameBackend, PackCard } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { rarity } from '../../core/rarity';
import { esc, h, thumbUrl } from '../ui';

/**
 * « Gros tirages » : les dernières Légendaires, Mythiques et Secrètes tirées par tout le groupe, en direct, sur la
 * page d'accueil (boutique).
 *
 * - Grand écran : colonne à droite du booster, qui défile.
 * - Écran plus étroit / téléphone : un bouton « Gros tirages » (avec la dernière carte et un point « en direct ») ouvre
 *   un bandeau qui défile horizontalement.
 * - Une carte qui arrive pendant qu'on regarde entre en glissant, avec un éclat de sa couleur ; toucher une carte
 *   l'ouvre en grand (visionneuse 3D), toucher un joueur ouvre son profil.
 */
export interface BigPullsWidget {
  el: HTMLElement;
  /** visible seulement sur la vitrine (pas pendant une ouverture) */
  setVisible(on: boolean): void;
}

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : `il y a ${d} j`;
};

export function createBigPulls(backend: GameBackend, view: (card: PackCard) => void): BigPullsWidget {
  const el = h('aside', 'bigpulls');
  el.setAttribute('aria-label', 'Gros tirages en direct');
  el.innerHTML = `
    <button class="bp-toggle" aria-expanded="false"><span class="bp-live"></span><span class="bp-tl">Gros tirages</span><span class="bp-last"></span></button>
    <div class="bp-panel">
      <div class="bp-head"><span class="bp-kicker"><span class="bp-live"></span>EN DIRECT · LÉGENDAIRES ET +</span><h3>Gros tirages</h3><button class="bp-close" aria-label="Fermer">✕</button></div>
      <div class="bp-list" role="list"></div>
      <div class="bp-empty" hidden>Personne n’a encore tiré de Légendaire… à toi de jouer.</div>
    </div>`;
  const list = el.querySelector<HTMLElement>('.bp-list')!;
  const empty = el.querySelector<HTMLElement>('.bp-empty')!;
  const toggle = el.querySelector<HTMLButtonElement>('.bp-toggle')!;
  const last = el.querySelector<HTMLElement>('.bp-last')!;
  const setOpen = (on: boolean) => {
    el.classList.toggle('open', on);
    toggle.setAttribute('aria-expanded', String(on));
  };
  toggle.addEventListener('click', () => setOpen(!el.classList.contains('open')));
  el.querySelector('.bp-close')!.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));

  const seen = new Set<string>();
  let first = true;
  let sig = '';

  function item(p: BigPull, fresh: boolean): HTMLElement {
    const rr = rarity(p.rarity);
    const e = catalogEntry(p.cardId);
    // une secrète (Bébou) qu'on n'a pas soi-même reste cachée : on sait qu'elle est tombée, pas laquelle
    const owned = backend.state.collection.some((c) => c.cardId === p.cardId && c.rarity === p.rarity);
    const hide = rr.secret && !p.mine && !owned;
    const it = h('div', `bp-item r-${p.rarity}${fresh ? ' bp-new' : ''}`);
    it.setAttribute('role', 'listitem');
    it.style.setProperty('--rc', rr.hex);
    it.style.setProperty('--ra', rr.accentHex);
    const name = hide ? 'Carte secrète' : p.cardName || e?.name || p.cardId;
    const art = hide || !e ? `<span class="bp-q">${rr.secret ? '✷' : '?'}</span>` : `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(e)}">`;
    const ava = p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<span>${esc((p.userName || '?').slice(0, 1).toUpperCase())}</span>`;
    it.innerHTML = `
      <button class="bp-card" ${hide ? 'disabled' : ''} title="${esc(`${name} · ${rr.label}${p.mintNumber ? ` · n°${p.mintNumber}` : ''}`)}">
        <span class="bp-art">${art}</span>
        <span class="bp-badge">${esc(rr.label)}</span>
        <span class="bp-name">${esc(name)}</span>
      </button>
      <a class="bp-who" href="#/profil/${encodeURIComponent(p.userId)}"><span class="bp-ava">${ava}</span><span class="bp-user">${esc(p.mine ? `${p.userName} (moi)` : p.userName)}</span></a>
      <div class="bp-time" data-t="${p.createdAt}">${ago(p.createdAt)}</div>`;
    if (!hide)
      it.querySelector('.bp-card')!.addEventListener('click', () => {
        setOpen(false);
        view({ cardId: p.cardId, cardName: name, rarity: p.rarity, mintNumber: p.mintNumber ?? 0, isNew: false });
      });
    it.querySelector('.bp-who')!.addEventListener('click', () => setOpen(false));
    return it;
  }

  function render() {
    const pulls = backend.state.bigPulls;
    const s = pulls.map((p) => p.id).join(',');
    if (s === sig) return;
    sig = s;
    list.replaceChildren(
      ...pulls.map((p) => {
        const fresh = !first && !seen.has(p.id);
        seen.add(p.id);
        return item(p, fresh);
      }),
    );
    empty.hidden = pulls.length > 0;
    const top = pulls[0];
    if (top) {
      const e = catalogEntry(top.cardId);
      const rr = rarity(top.rarity);
      last.style.setProperty('--rc', rr.hex);
      last.innerHTML = e && !rr.secret ? `<img alt="" src="${thumbUrl(e)}">` : `<span>${rr.secret ? '✷' : '★'}</span>`;
      // nouvelle belle carte pendant qu'on regarde : le bouton s'allume un instant
      if (!first) {
        toggle.classList.remove('ping');
        void toggle.offsetWidth;
        toggle.classList.add('ping');
      }
    }
    first = false;
  }
  backend.onChange(render);
  // « il y a 3 min » : remis à jour toutes les 30 s
  setInterval(() => {
    if (!el.isConnected) return;
    for (const t of el.querySelectorAll<HTMLElement>('.bp-time')) t.textContent = ago(Number(t.dataset.t));
  }, 30_000);

  return {
    el,
    setVisible(on) {
      el.hidden = !on;
      if (!on) setOpen(false);
    },
  };
}
