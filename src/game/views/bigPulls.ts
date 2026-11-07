import type { BigPull, GameBackend, PackCard } from '../backend';
import { fxReduced } from '../../core/fxPref';
import { catalogEntry } from '../../core/sets/themes';
import { rarity } from '../../core/rarity';
import { esc, h, thumbUrl } from '../ui';
import { observeRealCard } from '../cardImages';

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
/**
 * sortie du tirage centré (fraction de sa largeur), inclinaison max (degrés) et réduction aux bords.
 * (audit 06/11) sur téléphone : ni rotation ni échelle — un texte de 10 px tourné de 11° et réduit ×0,88 est
 * ré-échantillonné (flou) ; la sortie du tirage centré suffit à lire l'éventail. PC : inclinaison discrète.
 */
const COARSE = matchMedia('(pointer: coarse)').matches;
const FAN_POP = 0.3;
const FAN_TILT = COARSE ? 0 : 3;
const FAN_SHRINK = COARSE ? 0 : 0.06;

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
    // (retours live 6, B1) aperçu le temps que la VRAIE carte (cadre, bordure de rareté, nom : la même que la collection)
    // soit peinte ; plus jamais l'image brute seule (logo sur fond blanc, photo qui flotte dans le cadre)
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
    if (e) {
      const card = it.querySelector<HTMLElement>('.bp-card')!;
      card.dataset.real = `${p.cardId}|${p.rarity}`;
      observeRealCard(card);
    }
    // tout le tirage est cliquable (sauf le pseudo, qui mène au profil) : la carte en grand
    it.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('a')) return;
      if (dragged || swallowed()) return;
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
    pos = written = 0;
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
  /** dernière position écrite par la boucle : un `scroll` qui s'en écarte vient de l'utilisateur */
  let written = 0;
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
  /**
   * (perf 07/11) `top` : position de défilement déjà connue (lue juste après l'avoir écrite, ou dans l'événement
   * `scroll`) — plus aucune lecture de `scrollTop` au début d'une image, qui forçait une mise en page synchrone après
   * les écritures des autres rappels d'animation (vitrine téléphone : la plus grosse dépense restante au repos).
   */
  function fan(top = list.scrollTop) {
    if (!fanOn) return;
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
  list.addEventListener('touchmove', () => ((dragged = true), hold(), recessed.matches && wakeUp(true)), { passive: true });

  /**
   * TÉLÉPHONE EN PORTRAIT (retours de Tom, 4 nov.) : la colonne est « enfoncée » dans le bord gauche, en transparence
   * (le booster 3D est au centre parfait). Le doigt posé dessus — pour toucher ou pour faire défiler — la fait avancer :
   * elle grandit vers la droite et redevient nette ; elle se renfonce 3,5 s après le dernier contact. Le premier toucher
   * d'une colonne enfoncée ne fait que la réveiller (pas de carte ouverte par erreur sur une colonne à peine visible).
   * (07/11) elle reste sortie tant que le doigt est posé, se renfonce d'elle-même 1 s après qu'il s'est levé, et
   * AUSSITÔT si l'on touche ailleurs sur l'écran.
   */
  const recessed = matchMedia('(max-width: 860px) and (orientation: portrait)');
  let awakeT = 0;
  let swallow = false;
  const RETRACT_MS = 1000;
  const retract = () => {
    clearTimeout(awakeT);
    el.classList.remove('bp-awake');
  };
  /** `held` : doigt encore posé → pas de minuterie (elle part au lever du doigt) */
  const wakeUp = (held = false) => {
    el.classList.add('bp-awake');
    clearTimeout(awakeT);
    if (!held) awakeT = window.setTimeout(retract, RETRACT_MS);
  };
  // toucher ailleurs : la colonne rentre tout de suite
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!recessed.matches || !el.classList.contains('bp-awake')) return;
      if (el.contains(e.target as Node)) return;
      retract();
    },
    { capture: true, passive: true },
  );
  function swallowed() {
    const v = swallow;
    swallow = false;
    return v;
  }
  el.addEventListener(
    'pointerdown',
    () => {
      if (!recessed.matches) return;
      swallow = !el.classList.contains('bp-awake');
      wakeUp(true);
    },
    { capture: true, passive: true },
  );
  // doigt levé (ou repris par le défilement natif : pointercancel, puis touchend) → 1 s, puis elle rentre
  const release = () => recessed.matches && el.classList.contains('bp-awake') && wakeUp();
  el.addEventListener('pointerup', release, { capture: true, passive: true });
  el.addEventListener('pointercancel', release, { capture: true, passive: true });
  el.addEventListener('touchend', release, { capture: true, passive: true });
  // (le pseudo mène au profil : lui aussi attend que la colonne soit réveillée)
  el.addEventListener(
    'click',
    (e) => {
      if (!swallow || !(e.target as HTMLElement).closest('a')) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
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
    if (hover || t < holdUntil) return;
    pos += SPEED * dt;
    if (pos >= period) pos -= period;
    else if (pos < 0) pos += period;
    setScroll(pos);
    // (lue tout de suite après l'écriture : la mise en page vient d'être faite pour l'écriture, la lecture ne coûte rien)
    written = getScroll();
    fan(written);
  }
  document.addEventListener('visibilitychange', wake);
  // au bout de la copie à la main : on reboucle aussi
  list.addEventListener('scroll', () => {
    const cur = getScroll();
    // l'utilisateur a bougé le fil : on repart de là où il l'a laissé
    if (Math.abs(cur - written) > 2) written = pos = cur;
    if (!clones || period <= 0) return;
    if (cur >= period + 1) setScroll((written = pos = cur - period));
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
