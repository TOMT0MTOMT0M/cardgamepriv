import { DUR, EASING } from '../../core/motion';
import { reducedMotion } from '../../core/motion';

/**
 * (14/11) EFFETS PENDANT LES JEUX (Pack Battle, Battle Royale, Roulette) — Web Animations seulement, jetons de motion.ts.
 * La cérémonie grandit avec la rareté (règle du référentiel motion) ; mouvement réduit : rien ne bouge, les couleurs
 * et les chiffres restent.
 */

/** Cérémonie d'une carte selon ses étoiles (1–6) : anticipation (dos qui palpite), durée du retournement, savourage. */
export function cardBeat(stars: number): { pre: number; flip: number; hold: number } {
  if (reducedMotion()) return { pre: 0, flip: 0, hold: stars >= 5 ? 300 : 0 };
  if (stars >= 6) return { pre: 650, flip: 1150, hold: 900 };
  if (stars >= 5) return { pre: 380, flip: 950, hold: 520 };
  if (stars >= 4) return { pre: 140, flip: 820, hold: 180 };
  return { pre: 0, flip: 720, hold: 0 };
}

/** « +5★ » qui part de `from` et file vers `to` (le compteur), puis disparaît. */
export function flyGain(from: Element, to: Element, text: string, hex: string, host: HTMLElement = document.body): Promise<void> {
  if (reducedMotion() || !from.isConnected || !to.isConnected) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve();
  const chip = document.createElement('span');
  chip.className = 'gm-gain';
  chip.textContent = text;
  chip.style.setProperty('--rc', hex);
  chip.style.left = `${a.left + a.width / 2}px`;
  chip.style.top = `${a.top + a.height * 0.3}px`;
  host.append(chip);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height * 0.3);
  const anim = chip.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -110%) scale(1.08)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%, -110%) scale(1)', opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`, opacity: 0.2 },
    ],
    { duration: DUR.dramatique, easing: EASING.standard, fill: 'forwards' },
  );
  return anim.finished.then(
    () => chip.remove(),
    () => chip.remove(),
  );
}

/** Secousse sèche (6★), jamais en mouvement réduit. */
export function shake(el: Element, amp = 5): void {
  if (reducedMotion()) return;
  el.animate(
    [{ translate: '0 0' }, { translate: `${amp}px ${-amp * 0.6}px` }, { translate: `${-amp * 0.8}px ${amp * 0.4}px` }, { translate: `${amp * 0.4}px 0` }, { translate: '0 0' }],
    { duration: 280, easing: EASING.standard },
  );
}

/** Éclair blanc plein écran très court (6★), sous la barre d'état ; en mouvement réduit : un fondu plus doux. */
export function flash(hex = '#fff'): void {
  const f = document.createElement('div');
  f.className = 'gm-flash';
  f.style.setProperty('--rc', hex);
  document.body.append(f);
  f.animate([{ opacity: reducedMotion() ? 0.12 : 0.28 }, { opacity: 0 }], { duration: reducedMotion() ? 300 : 420, easing: EASING.sortie }).finished.then(
    () => f.remove(),
    () => f.remove(),
  );
}

/** Étiquette qui « frappe » (tampon) : entre grande, se pose net. */
export function stamp(el: HTMLElement): void {
  if (reducedMotion()) return;
  el.animate([{ scale: 1.9, opacity: 0, filter: 'blur(3px)' }, { scale: 0.96, opacity: 1, filter: 'blur(0)', offset: 0.7 }, { scale: 1, opacity: 1 }], {
    duration: DUR.emphatique(),
    easing: EASING.entree,
  });
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * (v2.0.6, retour de Tom) JAUGE « RÈGLE » : la même règle graduée que le rapport de force du Pack Battle — un trait
 * blanc plein qui avance sur une règle, un curseur net au bout, le total en grand à droite. Remplace la jauge de fluide
 * bleu dans le Pack Battle et le Battle Royale (même interface que `liquidGauge`). Aucun halo, aucun effet de fin.
 */
export function ruleGauge(count: HTMLElement, max: number): { el: HTMLElement; set(total: number): void; end(win: boolean): void } {
  const el = document.createElement('div');
  el.className = 'gm-rule';
  el.innerHTML = '<div class="gm-rule-bar"><i></i></div>';
  el.append(count);
  const set = (total: number) => el.style.setProperty('--lvl', Math.max(0, Math.min(1, total / Math.max(1, max))).toFixed(3));
  set(0);
  return { el, set, end: (win) => el.classList.add(win ? 'win' : 'lose') };
}

/**
 * (14/11) JAUGE D'ÉTOILES — un fluide bleu clair bioluminescent qui monte avec le total : deux surfaces de vague à des
 * périodes qui ne tombent jamais juste (mouvement organique), une lueur dont l'intensité respire, quelques bulles. Le
 * total s'écrit en grand dans la jauge. `set(total)` : le niveau monte avec un léger ballottement (ressort CSS).
 */
export function liquidGauge(count: HTMLElement, max: number): { el: HTMLElement; set(total: number): void; end(win: boolean): void } {
  const el = document.createElement('div');
  el.className = 'gm-gauge';
  el.innerHTML = `<div class="gm-liq"></div>`;
  el.append(count);
  // (chaque jauge a sa propre phase : deux jauges côte à côte ne respirent jamais ensemble)
  el.style.setProperty('--ph', `${-Math.random() * 6}s`);
  // version shader (three.js TSL, gaugeGL.ts) : chargée à la demande, branchée quand la jauge est à l'écran ; sans
  // elle (mouvement réduit, moteur indisponible) la jauge CSS ci-dessus reste
  let gl: { set(level: number): void; end(win: boolean): void } | null = null;
  let lvl = 0;
  let ended: boolean | null = null;
  if (!reducedMotion())
    requestAnimationFrame(() =>
      void import('./gaugeGL').then((m) => m.attachGauge(el)).then(
        (g) => {
          gl = g;
          gl?.set(lvl);
          if (ended !== null) gl?.end(ended);
        },
        () => undefined,
      ),
    );
  const set = (total: number) => {
    lvl = Math.max(0, Math.min(1, total / Math.max(1, max)));
    el.style.setProperty('--lvl', lvl.toFixed(3));
    el.classList.toggle('full', lvl >= 1);
    gl?.set(lvl);
  };
  set(0);
  return { el, set, end: (win) => ((ended = win), el.classList.add(win ? 'win' : 'lose'), gl?.end(win)) };
}
