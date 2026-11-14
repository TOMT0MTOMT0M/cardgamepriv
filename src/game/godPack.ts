import { t } from '../core/i18n';
import type { Shell } from './shell';
import { haptics } from '../core/haptics';

/**
 * GOD PACK (08/11) — 1 booster sur 1 000 : que des 4★ et plus, dont au moins une 5★ et une 6★ (core/packRoll.ts).
 * Avant l'emballage, une séquence plein écran de ~2,6 s : noir, ligne de balayage, « GOD PACK » qui se forme lettre par
 * lettre (flou → net), reflet arc-en-ciel (le code couleur des 6★), sous-titre, éclair blanc ; puis l'ouverture
 * reprend avec une aura arc-en-ciel autour du booster (classe `god` sur le corps de page, retirée au retour boutique).
 * Mouvement réduit : la même chose en simple fondu.
 */
export function playGodIntro(shell: Shell): Promise<void> {
  const reduced = matchMedia('not all').matches;
  const el = document.createElement('div');
  el.className = `god-intro${reduced ? ' reduced' : ''}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'assertive');
  const word = 'GOD PACK';
  el.innerHTML = `<i class="gi-scan" aria-hidden="true"></i><div class="gi-in"><p class="gi-k">${t('god.odds')}</p><h2 class="gi-t" aria-label="${word}">${[...word]
    .map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`)
    .join('')}</h2><p class="gi-s">${t('god.sub')}</p></div><i class="gi-flash" aria-hidden="true"></i>`;
  document.body.append(el);
  document.body.classList.add('god');
  requestAnimationFrame(() => el.classList.add('on'));
  // montée sonore : riser puis carillons ascendants
  shell.sfx.riser(1.6, 5, 0.22);
  for (let k = 0; k < 6; k++) shell.sfx.chime(4, 0.12, 392 * 2 ** (k / 4), 0.9 + k * 0.12);
  haptics.pulse(30);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      el.classList.add('flash');
      haptics.pulse(60);
    }, reduced ? 1200 : 2150);
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 500);
      resolve();
    }, reduced ? 1500 : 2600);
  });
}

/** fin de l'ouverture / retour boutique : plus d'aura */
export function clearGod() {
  document.body.classList.remove('god');
}
