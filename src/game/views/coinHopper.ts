import './coinHopper.css';
import { DUR, EASING } from '../../core/motion';
import { fmtCoins } from '../../core/economy';
import type { Sfx } from '../../core/audio';

/**
 * (V3, lot S6) MOMENT SIGNATURE — LE VERSEMENT DE FIN D'OUVERTURE : « barillet à goupilles » + compteur à rouleaux.
 *
 * Règle de Tom : les pièces ne sont JAMAIS versées pendant l'ouverture, seulement à la fin. La retenue elle-même reste
 * dans main.ts (`coinHeld`, `shopMode`, `schedulePay`) : ce module ne change que la MISE EN SCÈNE du versement.
 *  - pendant la révélation, chaque gain retenu arme une goupille : un cran blanc minuscule sous le compteur (`armPin`),
 *    sans son ni mouvement ;
 *  - au versement (`payOut`), le libellé du compteur devient un odomètre (une colonne de chiffres par chiffre), un court
 *    silence (`DUR.standard`), puis le barillet joue une phrase ascendante en sol pentatonique pendant que les rouleaux
 *    défilent à vitesse constante jusqu'au nouveau solde, arrêt franc sur la dernière note (`DUR.dramatique`) ;
 *  - un toucher (ou une touche du clavier) solde tout de suite : les rouleaux sautent au solde exact, les notes pas encore
 *    programmées ne partent jamais, et une seule note de la gamme (la tonique) conclut — jamais de fausse note.
 *
 * Horloge : les notes sont programmées par petites fenêtres d'avance sur `AudioContext.currentTime` (à l'échantillon
 * près, aucun setTimeout) ; les rouleaux lisent la même horloge (latence de sortie déduite), sinon `performance.now()`
 * si le son est coupé ou suspendu. Par image : quelques `transform` sur ≤ 8 colonnes, aucune lecture de mise en page.
 */

/** avance de programmation des notes (s) : ce qui est déjà parti à l'instant d'un toucher (au plus une note) */
const LOOK = 0.12;
/** degré de la gamme qui conclut la phrase (sol, deux octaves au-dessus du départ) */
const TONIC = 10;

export interface PayOutOpts {
  /** le libellé du compteur (`.coin-btn b`) — remplacé par l'odomètre le temps du versement */
  label: HTMLElement;
  from: number;
  /** solde visé, relu à chaque image (un dernier crédit peut encore arriver pendant le versement) */
  goal: () => number;
  /** format du compteur (`fmtCoinsShort`) : l'odomètre en suit la forme, le texte final est le sien */
  fmt: (n: number) => string;
  sfx: Sfx | null;
  /** solde affiché à la fin (versement complet ou soldé au toucher) */
  onDone: (shown: number) => void;
}

/** Goupille armée pendant la révélation : un cran sous le compteur, au plus 10 (un ×10 = 10 boosters). */
export function armPin(btn: HTMLElement): void {
  let row = btn.querySelector<HTMLElement>(':scope > .hop-pins');
  if (!row) {
    row = document.createElement('i');
    row.className = 'hop-pins';
    row.setAttribute('aria-hidden', 'true');
    btn.append(row);
  }
  if (row.childElementCount < 10) row.append(document.createElement('i'));
}

/** les goupilles armées (null si aucune) */
const pinsOf = (btn: HTMLElement | null) => btn?.querySelector<HTMLElement>(':scope > .hop-pins') ?? null;
/** retire les goupilles sans versement mis en scène (onglet caché, solde qui change simplement) */
export function clearPins(btn: HTMLElement | null): void {
  pinsOf(btn)?.remove();
}

/** Versement : odomètre + barillet. Renvoie `settle()` (solder tout de suite) ; rien à nettoyer d'autre. */
export function payOut(o: PayOutOpts): { settle: () => void } {
  const { label, from, fmt } = o;
  const btn = label.closest<HTMLElement>('.coin-btn');
  const pins = pinsOf(btn);
  // unité roulée : 1 pièce sous 10 000, sinon le dernier chiffre affiché (« 12,3 k » → centaines, « 1,2 M » → 100 000)
  const unitOf = (n: number) => (n < 10_000 ? 1 : n < 1e6 ? 100 : 1e5);
  let to = Math.max(from, o.goal());
  const unit = unitOf(to);
  const short = unit > 1;
  const suffix = unit === 100 ? 'k' : 'M';
  // gabarit : la forme du solde visé (« 1 040 », « 12,3 k ») ; un chiffre = une colonne, le reste est fixe
  const tpl = short ? `${String(Math.floor(to / unit)).replace(/(\d)$/, ',$1')}\u00a0${suffix}` : fmt(to);
  const fromDigits = String(Math.floor(from / unit)).length;
  const odo = document.createElement('span');
  odo.className = 'odo';
  odo.setAttribute('aria-hidden', 'true');
  const strips: HTMLElement[] = [];
  const cols: { strip: HTMLElement; pow: number }[] = [];
  let nDigits = 0;
  for (const ch of tpl) if (ch >= '0' && ch <= '9') nDigits++;
  let k = nDigits;
  for (const ch of tpl) {
    if (ch < '0' || ch > '9') {
      const s = document.createElement('span');
      s.className = 'odo-f';
      s.textContent = ch;
      odo.append(s);
      continue;
    }
    k--;
    const c = document.createElement('span');
    c.className = 'odo-c';
    const strip = document.createElement('span');
    strip.className = 'odo-s';
    // 0..9 puis 0 (le passage 9 → 0 roule vers le bas sans retour) ; une colonne de tête vide tant qu'elle vaut 0
    const lead = k >= fromDigits;
    for (let d = 0; d <= 10; d++) {
      const cell = document.createElement('i');
      cell.textContent = d === 0 && lead ? '\u00a0' : String(d % 10);
      strip.append(cell);
    }
    c.append(strip);
    odo.append(c);
    strips.push(strip);
    cols.push({ strip, pow: Math.pow(10, k) });
  }
  label.replaceChildren(odo);
  btn?.classList.add('paying');
  // le gain, écrit sous le compteur le temps du versement (information, pas d'effet)
  let tag: HTMLElement | null = null;
  if (btn && o.goal() > from) {
    const r = btn.getBoundingClientRect();
    tag = document.createElement('div');
    tag.className = 'coin-fly hold';
    tag.textContent = `+${fmtCoins(o.goal() - from)}`;
    tag.style.left = `${r.left + r.width / 2 - 20}px`;
    tag.style.top = `${r.bottom + 4}px`;
    document.body.append(tag);
  }
  const rowH = strips[0]?.parentElement?.getBoundingClientRect().height || 16; // (une seule lecture, au montage)

  /** pose les rouleaux sur la valeur `v` (en pièces) : entraînement par ergot, une colonne n'avance que si toutes celles
   * de droite sont sur 9 (comme un vrai totalisateur) */
  let lastQ = -1;
  const show = (v: number) => {
    const q = v / unit;
    if (q === lastQ) return;
    lastQ = q;
    let carry = q - Math.floor(q);
    for (let i = cols.length - 1; i >= 0; i--) {
      const c = cols[i];
      const d = Math.floor(q / c.pow) % 10;
      c.strip.style.transform = `translate3d(0,${(-(d + carry) * rowH).toFixed(2)}px,0)`;
      carry = d === 9 ? carry : 0;
    }
  };
  show(from);

  // ── horloge : celle du son si elle tourne, sinon celle de l'image. Le contexte audio peut être en veille (réveillé
  // par `rig()`, il repart en quelques ms) : on l'attend pendant le silence ; s'il ne tourne toujours pas à la fin du
  // silence (lecture refusée, appel en cours), les rouleaux suivent l'horloge de l'image, sans musique.
  const rig = o.sfx?.rig() ?? null;
  let ac: AudioContext | null = null;
  // l'image suit ce qu'on ENTEND : l'horloge du son moins la latence de sortie (une note programmée à l'instant S de
  // l'horloge audio sort du haut-parleur quand `clock()` vaut S)
  let lat = 0;
  const perf0 = performance.now();
  const clock = () => (ac ? ac.currentTime - lat : performance.now() / 1000);
  const silence = DUR.standard() / 1000;
  const dur = DUR.dramatique / 1000;
  /** début de la phrase (horloge choisie) ; NaN tant que le silence n'a pas tranché */
  let t0 = NaN;
  const pickClock = () => {
    const waited = (performance.now() - perf0) / 1000;
    if (rig && rig.c.state === 'running') {
      ac = rig.c;
      lat = o.sfx!.latency();
      t0 = ac.currentTime + Math.max(0, silence - waited);
    } else if (waited >= silence) t0 = performance.now() / 1000;
  };
  // la phrase : sol → sol deux octaves plus haut, en 6 goupilles (un degré sur deux) pour un booster, 11 (tous les degrés)
  // pour un gros gain (×5, ×10) ; même durée
  const gain = to - from;
  const n = gain >= 100 ? 11 : 6;
  const step = TONIC / (n - 1);
  const gap = dur / (n - 1);
  let next = 0; // prochaine goupille à programmer
  let lastAt = 0; // instant (horloge audio) de la dernière note programmée
  const pinEls = pins ? Array.from(pins.children) : [];

  /** programme les goupilles dont l'instant tombe dans la fenêtre d'avance (horloge audio, aucun setTimeout) */
  const schedule = (raw: number) => {
    while (next < n && t0 + next * gap < raw + LOOK) {
      const at = t0 + next * gap;
      const deg = Math.round(next * step);
      const off = Math.max(0, at - raw);
      if (o.sfx && ac) {
        if (next < n - 1) {
          o.sfx.coin(deg % 10, 0.05 + 0.015 * (next / n), off);
          o.sfx.note(deg, 0.055, 0.28, off);
        } else o.sfx.note(TONIC, 0.085, 0.7, off); // la dernière : la tonique, tenue — l'arrêt des rouleaux
      }
      lastAt = at;
      next++;
    }
  };

  let raf = 0;
  let done = false;
  const finish = (cut: boolean) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    removeEventListener('pointerdown', onTouch, true);
    removeEventListener('keydown', onTouch, true);
    to = Math.max(to, o.goal());
    // soldé en cours de phrase : plus aucune goupille ne part ; la tonique conclut juste après la dernière déjà partie
    if (cut && next < n && o.sfx && ac) {
      o.sfx.note(TONIC, 0.07, 0.6, Math.max(0, lastAt + gap * 0.5 - ac.currentTime));
    }
    pins?.remove();
    btn?.classList.remove('paying');
    label.textContent = fmt(to);
    if (tag) {
      const t = tag;
      t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.emphatique(), delay: DUR.emphatique(), easing: EASING.sortie, fill: 'forwards' }).onfinish = () => t.remove();
    }
    o.onDone(to);
  };
  const onTouch = () => finish(true);
  addEventListener('pointerdown', onTouch, true);
  addEventListener('keydown', onTouch, true);

  const frame = () => {
    raf = 0;
    if (Number.isNaN(t0)) pickClock();
    if (Number.isNaN(t0)) return void (raf = requestAnimationFrame(frame));
    const now = clock();
    if (ac) schedule(ac.currentTime);
    // filet de sécurité : horloge audio figée (onglet en veille, sortie perdue) → on solde
    if (performance.now() - perf0 > (silence + dur) * 3000) return finish(false);
    const p = (now - t0) / dur;
    if (p >= 1) return finish(false);
    to = Math.max(to, o.goal());
    if (p > 0) {
      show(from + (to - from) * p);
      // les goupilles se « jouent » : chaque cran armé s'éteint à son tour
      for (let i = 0; i < pinEls.length; i++) if (p * pinEls.length > i) pinEls[i].classList.add('off');
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { settle: () => finish(true) };
}
