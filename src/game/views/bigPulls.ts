import type { BigPull, GameBackend, PackCard } from '../backend';
import { fxReduced } from '../../core/fxPref';
import { catalogEntry } from '../../core/sets/themes';
import { rarity } from '../../core/rarity';
import { esc, h, thumbUrl } from '../ui';

/**
 * « Gros tirages » : les Légendaires, Mythiques et Secrètes tirées par tout le groupe AUJOURD'HUI, en direct, sur la
 * page d'accueil (boutique). Ordinateur et téléphone en portrait : colonne de gauche, fil VERTICAL en éventail.
 *
 * Retours live n°1 :
 * - le fil DÉFILE TOUT SEUL, en continu et en boucle (contenu doublé, aucun à-coup), et se met en PAUSE au survol de
 *   la souris (ou quand on le fait défiler à la main / au doigt) ;
 * - toucher un tirage = la carte en grand (visionneuse, fermeture croix / clic hors de la carte / Échap) ;
 * - item revu : carte plus grande, pseudo COMPLET (il passe à la ligne au lieu d'être coupé), nom de la carte,
 *   « il y a X min » sur sa propre ligne.
 * - Une carte qui arrive pendant qu'on regarde entre avec un éclat de sa couleur ; une 6★ et une Secrète ont leur
 *   animation à elles (liseré arc-en-ciel qui tourne, halo rose qui bat). Les Bébous secrets sont montrés tels quels.
 *
 * Retours du 03/11 (soir) — téléphone en portrait : le bandeau du haut prenait trop de place → COLONNE VERTICALE à
 * gauche (sous l'en-tête, jusqu'au bouton Ouvrir), qui défile toute seule ; au doigt (haut / bas) le tirage qui passe
 * au centre sort de 30 % vers la droite, les autres s'inclinent en léger ÉVENTAIL centré (`fan()`).
 *
 * Retours live 02 : même chose sur ORDINATEUR — la colonne des gros tirages passe à GAUCHE (les packs à droite), en
 * éventail, défilement auto (pause au survol), tirages plus grands (pseudo + nom de la carte lisibles).
 */
export interface BigPullsWidget {
  el: HTMLElement;
  /** visible seulement sur la vitrine (pas pendant une ouverture) */
  setVisible(on: boolean): void;
}

const DAY = 86_400_000;
/** vitesse du défilement automatique (px / s) */
const SPEED = 24;
/**
 * Colonne verticale en éventail : téléphone en portrait (style.css, « retours 03/11 soir ») et, depuis les retours live 02,
 * ORDINATEUR aussi (colonne de gauche, tirages plus grands : style.css, bloc lot G). Téléphone en paysage : fil masqué.
 */
const FAN_MQ = '(max-width: 860px) and (orientation: portrait), (min-width: 861px)';
/** sortie du tirage centré (fraction de sa largeur), inclinaison max (degrés) et réduction aux bords */
const FAN_POP = 0.3;
const FAN_TILT = 7;
const FAN_SHRINK = 0.12;

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
  el.setAttribute('aria-label', 'Gros tirages');
  el.innerHTML = `
    <div class="bp-head"><h3>Gros tirages</h3><span class="bp-sub">5★ et + du groupe · aujourd’hui</span></div>
    <div class="bp-list" role="list"></div>
    <div class="bp-empty" hidden>Personne n’a encore tiré de Légendaire… à toi de jouer.</div>`;
  const list = el.querySelector<HTMLElement>('.bp-list')!;
  const empty = el.querySelector<HTMLElement>('.bp-empty')!;
  const sub = el.querySelector<HTMLElement>('.bp-sub')!;
  // mouvement réduit : réglage de l'appareil OU « Effets réduits » du jeu → fil statique (WCAG 2.2.2)
  const reduced = fxReduced();

  const seen = new Set<string>();
  let first = true;
  let sig = '';

  function item(p: BigPull, fresh: boolean, clone = false): HTMLElement {
    const rr = rarity(p.rarity);
    const e = catalogEntry(p.cardId);
    const it = h('div', `bp-item r-${p.rarity}${fresh ? ' bp-new' : ''}`);
    it.setAttribute('role', 'listitem');
    if (clone) it.setAttribute('aria-hidden', 'true');
    it.style.setProperty('--rc', rr.hex);
    it.style.setProperty('--ra', rr.accentHex);
    const name = p.cardName || e?.name || p.cardId;
    const art = !e ? `<span class="bp-q">?</span>` : `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(e)}">`;
    const ava = p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : `<span>${esc((p.userName || '?').slice(0, 1).toUpperCase())}</span>`;
    it.innerHTML = `
      <button class="bp-card"${clone ? ' tabindex="-1"' : ''} title="${esc(`${name} · ${rr.label}${p.mintNumber ? ` · n°${p.mintNumber}` : ''}`)}" aria-label="${esc(`Voir ${name} en grand`)}">
        <span class="bp-art">${art}</span>
        <span class="bp-badge">${rr.secret ? '✷ SECRÈTE' : rr.id === 'mythic' ? '✺ 6★' : esc(rr.label)}</span>
      </button>
      <div class="bp-info">
        <a class="bp-who" href="#/profil/${encodeURIComponent(p.userId)}"${clone ? ' tabindex="-1"' : ''}><span class="bp-ava">${ava}</span><span class="bp-user">${esc(p.userName || '?')}${p.mine ? ' <em>(moi)</em>' : ''}</span></a>
        <span class="bp-name">${esc(name)}</span>
        <span class="bp-time" data-t="${p.createdAt}">${ago(p.createdAt)}</span>
      </div>`;
    // tout le tirage est cliquable (sauf le pseudo, qui mène au profil) : la carte en grand
    it.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('a')) return;
      if (dragged) return;
      view({ cardId: p.cardId, cardName: name, rarity: p.rarity, mintNumber: p.mintNumber ?? 0, isNew: false });
    });
    return it;
  }

  /** les gros tirages du jour ; s'il n'y en a encore aucun aujourd'hui, les derniers en date */
  function shown(): BigPull[] {
    const all = backend.state.bigPulls;
    const today = all.filter((p) => Date.now() - p.createdAt < DAY);
    sub.textContent = today.length || !all.length ? '5★ et + du groupe · aujourd’hui' : '5★ et + du groupe · les derniers';
    return today.length ? today : all;
  }

  function render() {
    const pulls = shown();
    const s = pulls.map((p) => p.id).join(',');
    if (s === sig) return;
    sig = s;
    const items = pulls.map((p) => {
      const fresh = !first && !seen.has(p.id);
      seen.add(p.id);
      return item(p, fresh);
    });
    list.replaceChildren(...items);
    fanLast = NaN;
    empty.hidden = pulls.length > 0;
    first = false;
    pos = 0;
    setScroll(0);
    // la boucle : le fil est doublé dès qu'il déborde (la copie prend le relais sans à-coup)
    requestAnimationFrame(() => {
      clones = false;
      if (!reduced && pulls.length > 1 && overflow() > 4) {
        list.append(...pulls.map((p) => item(p, false, true)));
        clones = true;
      }
      // (audit UX2-19) défilement automatique : l'aimantation (scroll-snap) le ramenait en arrière par à-coups → coupée
      // tant que le fil défile tout seul, rendue au doigt (hold)
      list.style.scrollSnapType = clones ? 'none' : '';
      measure();
      wake();
    });
  }

  // ── défilement automatique, continu, en boucle
  let pos = 0;
  let period = 0;
  let clones = false;
  let vertical = false;
  let hover = false;
  let holdUntil = 0;
  let dragged = false;
  let last = 0;
  const overflow = () => (vertical ? list.scrollHeight - list.clientHeight : list.scrollWidth - list.clientWidth);
  const getScroll = () => (vertical ? list.scrollTop : list.scrollLeft);
  const setScroll = (v: number) => (vertical ? (list.scrollTop = v) : (list.scrollLeft = v));
  function measure() {
    vertical = getComputedStyle(list).flexDirection === 'column';
    const kids = list.children as HTMLCollectionOf<HTMLElement>;
    const n = kids.length / 2;
    period = clones && n >= 1 ? (vertical ? kids[n].offsetTop - kids[0].offsetTop : kids[n].offsetLeft - kids[0].offsetLeft) : 0;
    // éventail : positions mesurées une fois (offsetTop ignore les transformations), relues seulement au rendu
    fanOn = vertical && fanMq.matches;
    el.classList.toggle('bp-fan', fanOn);
    fanMid = [];
    fanLast = NaN;
    for (const k of kids) {
      if (!fanOn) k.style.transform = k.style.opacity = '';
      else fanMid.push(k.offsetTop + k.offsetHeight / 2);
    }
    fan();
  }

  // ── éventail (téléphone) : chaque image, selon la distance au centre de la colonne
  const fanMq = matchMedia(FAN_MQ);
  let fanOn = false;
  let fanMid: number[] = [];
  let fanLast = NaN;
  function fan() {
    if (!fanOn) return;
    const top = list.scrollTop;
    if (top === fanLast) return;
    fanLast = top;
    const half = Math.max(1, list.clientHeight / 2);
    const kids = list.children as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < kids.length && i < fanMid.length; i++) {
      const d = Math.max(-1.6, Math.min(1.6, (fanMid[i] - top - half) / half));
      const a = Math.min(1, Math.abs(d));
      const k = Math.max(0, 1 - a * 1.25);
      const pop = k * k * (3 - 2 * k);
      kids[i].style.transform = `translate3d(${(pop * FAN_POP * 100).toFixed(1)}%,0,0) rotate(${(d * FAN_TILT).toFixed(2)}deg) scale(${(1 - a * FAN_SHRINK).toFixed(3)})`;
      kids[i].style.opacity = (1 - a * 0.45).toFixed(2);
    }
  }
  fanMq.addEventListener?.('change', () => {
    sig = '';
    render();
  });
  // au doigt : l'éventail suit le défilement (une mise à jour par image)
  let fanRaf = 0;
  list.addEventListener('scroll', () => {
    if (!fanOn || fanRaf) return;
    fanRaf = requestAnimationFrame(() => ((fanRaf = 0), fan()));
  }, { passive: true });
  // taille du fil changée (affichage, rotation, colonne ↔ bandeau) : on le reconstruit (doublé ou non)
  let box = '';
  new ResizeObserver(() => {
    const b = `${list.clientWidth}x${list.clientHeight}`;
    if (b === box || !list.clientWidth) return;
    box = b;
    sig = '';
    render();
  }).observe(list);
  list.addEventListener('mouseenter', () => (hover = true));
  list.addEventListener('mouseleave', () => (hover = false));
  // à la main (molette, doigt) : le défilement automatique laisse la main quelques secondes
  const hold = () => {
    holdUntil = performance.now() + 2500;
    list.style.scrollSnapType = '';
    clearTimeout(snapT);
    snapT = window.setTimeout(() => clones && (list.style.scrollSnapType = 'none'), 2600);
  };
  let snapT = 0;
  list.addEventListener('wheel', (e) => {
    hold();
    // ordinateur, fil horizontal : la molette verticale le fait défiler
    if (vertical || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || list.scrollWidth <= list.clientWidth) return;
    e.preventDefault();
    list.scrollLeft += e.deltaY;
  }, { passive: false });
  list.addEventListener('touchstart', hold, { passive: true });
  list.addEventListener('touchmove', () => ((dragged = true), hold()), { passive: true });
  list.addEventListener('touchend', () => setTimeout(() => (dragged = false), 60), { passive: true });

  /**
   * (audit PERF2-16) la boucle d'images ne tourne que si le fil est visible et défile : elle s'arrête d'elle-même
   * (vue cachée, ouverture en cours, onglet caché, fil trop court) et `wake()` la relance.
   */
  let raf = 0;
  const idle = () => reduced || !clones || period <= 0 || el.hidden || !el.isConnected || document.hidden;
  function wake() {
    if (raf || idle()) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function tick(t: number) {
    raf = 0;
    if (idle()) return;
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    const cur = getScroll();
    // l'utilisateur a bougé le fil : on repart de là où il l'a laissé
    if (Math.abs(cur - pos) > 2) pos = cur;
    if (hover || t < holdUntil) return;
    pos += SPEED * dt;
    if (pos >= period) pos -= period;
    else if (pos < 0) pos += period;
    setScroll(pos);
    fan();
  }
  document.addEventListener('visibilitychange', wake);
  // au bout de la copie à la main : on reboucle aussi
  list.addEventListener('scroll', () => {
    if (!clones || period <= 0) return;
    const cur = getScroll();
    if (cur >= period + 1) setScroll((pos = cur - period));
  }, { passive: true });

  backend.onChange(render);
  // « il y a 3 min » : remis à jour toutes les 30 s (et les tirages de plus d'un jour quittent le fil)
  // (audit PERF2-16) rien si le fil n'est pas affiché ou l'onglet caché ; la liste n'est refaite que si un tirage a
  // passé les 24 h (sinon seules les heures changent)
  setInterval(() => {
    if (!el.isConnected || el.hidden || document.hidden) return;
    for (const t of el.querySelectorAll<HTMLElement>('.bp-time')) t.textContent = ago(Number(t.dataset.t));
    const now = Date.now();
    if (backend.state.bigPulls.some((p) => now - p.createdAt >= DAY && sig.includes(p.id))) render();
  }, 30_000);

  return {
    el,
    setVisible(on) {
      const was = el.hidden;
      el.hidden = !on;
      // de retour sur la vitrine : la mise en page a pu changer (rotation, redimensionnement)
      if (on && was) {
        sig = '';
        requestAnimationFrame(render);
      }
      if (on) requestAnimationFrame(wake);
    },
  };
}
