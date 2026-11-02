import type { BigPull, GameBackend, PackCard } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { rarity } from '../../core/rarity';
import { esc, h, thumbUrl } from '../ui';

/**
 * « Gros tirages » : les dernières Légendaires, Mythiques et Secrètes tirées par tout le groupe, en direct, en HAUT de
 * la page d'accueil (boutique) : un fil horizontal (carte + pseudo + « il y a X min »).
 *
 * - Une carte qui arrive pendant qu'on regarde entre en glissant, avec un éclat de sa couleur ; une Mythique (6★) et
 *   une Secrète ont leur animation à elles (liseré arc-en-ciel qui tourne, halo rose qui bat).
 * - Les Bébous secrets sont montrés tels quels (décision du groupe, 3 nov.) : plus de carte masquée.
 * - Toucher une carte l'ouvre en grand (visionneuse 3D), toucher un joueur ouvre son profil.
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
    <div class="bp-head"><span class="bp-kicker"><span class="bp-live"></span>EN DIRECT</span><h3>Gros tirages</h3><span class="bp-sub">5★ et + du groupe</span></div>
    <div class="bp-list" role="list"></div>
    <div class="bp-empty" hidden>Personne n’a encore tiré de Légendaire… à toi de jouer.</div>`;
  const list = el.querySelector<HTMLElement>('.bp-list')!;
  const empty = el.querySelector<HTMLElement>('.bp-empty')!;
  // molette verticale sur le fil = défilement horizontal (ordinateur)
  list.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || list.scrollWidth <= list.clientWidth) return;
    e.preventDefault();
    list.scrollLeft += e.deltaY;
  }, { passive: false });

  const seen = new Set<string>();
  let first = true;
  let sig = '';

  function item(p: BigPull, fresh: boolean): HTMLElement {
    const rr = rarity(p.rarity);
    const e = catalogEntry(p.cardId);
    const it = h('div', `bp-item r-${p.rarity}${fresh ? ' bp-new' : ''}`);
    it.setAttribute('role', 'listitem');
    it.style.setProperty('--rc', rr.hex);
    it.style.setProperty('--ra', rr.accentHex);
    const name = p.cardName || e?.name || p.cardId;
    const art = !e ? `<span class="bp-q">?</span>` : `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(e)}">`;
    const ava = p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<span>${esc((p.userName || '?').slice(0, 1).toUpperCase())}</span>`;
    it.innerHTML = `
      <button class="bp-card" title="${esc(`${name} · ${rr.label}${p.mintNumber ? ` · n°${p.mintNumber}` : ''}`)}">
        <span class="bp-art">${art}</span>
        <span class="bp-badge">${rr.secret ? '✷ SECRÈTE' : rr.id === 'mythic' ? '✺ 6★' : esc(rr.label)}</span>
        <span class="bp-name">${esc(name)}</span>
      </button>
      <a class="bp-who" href="#/profil/${encodeURIComponent(p.userId)}"><span class="bp-ava">${ava}</span><span class="bp-user">${esc(p.mine ? `${p.userName} (moi)` : p.userName)}</span></a>
      <div class="bp-time" data-t="${p.createdAt}">${ago(p.createdAt)}</div>`;
    it.querySelector('.bp-card')!.addEventListener('click', () => view({ cardId: p.cardId, cardName: name, rarity: p.rarity, mintNumber: p.mintNumber ?? 0, isNew: false }));
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
    // nouvelle belle carte pendant qu'on regarde : le fil revient au début (elle entre en glissant)
    if (!first && pulls.length) list.scrollTo({ left: 0, behavior: 'smooth' });
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
    },
  };
}
