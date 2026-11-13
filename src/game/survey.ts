import { t as tr } from '../core/i18n';
import '../core/i18n/fr/game.survey'; // (textes de ce module, version anglaise)
import type { GameBackend } from './backend';
import { SURVEY_FEATURES, SURVEY_ID, SURVEY_MAX_FEATURES, SURVEY_UNIVERSES, cleanSurvey, surveyFilled, type SurveyAnswer, type SurveyOption } from '../core/survey';
import { haptics } from '../core/haptics';
import { busyButton, errMsg, esc, layerCount, popLayer, pushLayer, toast } from './ui';

/**
 * SONDAGE « PROCHAINES MISES À JOUR » (v1.0.10, 10/11) — demande de Tom : à la prochaine connexion, un formulaire
 * « qu'aimerais-tu voir dans les prochaines mises à jour ? », attrayant et clair ; pas rempli → reproposé toutes les
 * heures.
 *
 *  - 5 écrans dans une feuille : accueil → univers (choix multiples + noms précis) → nouveautés (3 au plus) → note du
 *    jeu → un mot libre ; puis « Merci ». Toujours « Plus tard » (✕, Échap, toucher à côté).
 *  - Rempli : plus jamais (serveur : une réponse par joueur et par sondage, donc pas non plus sur ses autres appareils).
 *  - « Plus tard » : reproposé 1 h après (heure mémorisée sur l'appareil ; vérifié chaque minute et au retour sur
 *    l'onglet). Jamais au milieu d'une ouverture, de la connexion, de la visite guidée ou d'une fenêtre déjà ouverte :
 *    on attend que ce soit calme. Compte tout neuf : après la visite guidée. Pas en démo (sauf `?sondage`).
 *  - `?sondage` : l'ouvrir tout de suite (test).
 */
const LATER_KEY = `bebou.sondage.${SURVEY_ID}.plus-tard`; // i18n-ok
const DONE_KEY = `bebou.sondage.${SURVEY_ID}.fait`;
const AGAIN_MS = 60 * 60 * 1000;
/** à la connexion : on laisse le jeu se poser (annonce de patch, notifications…) avant de proposer */
const FIRST_DELAY_MS = 4000;

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* stockage indisponible : on redemandera, tant pis */
    }
  },
};

export function armSurvey(backend: GameBackend) {
  const forced = new URLSearchParams(location.search).has('sondage');
  if (!forced && store.get(DONE_KEY)) return;
  let done = false;
  let open = false;
  let timer = 0;
  /** réponse du serveur (« déjà répondu ? »), demandée une fois ; null dans la promesse = réseau en panne */
  let serverAnswered: Promise<boolean | null> | null = null;
  const armedAt = Date.now();

  const finish = () => {
    done = true;
    off();
    clearTimeout(timer);
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
    store.set(DONE_KEY, '1');
  };

  const later = (ms: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(check, ms);
  };

  async function check() {
    if (done || open) return;
    const s = backend.state;
    if (!forced && s.mode !== 'online') return;
    if (!s.user) return; // pas encore connecté : onChange nous rappellera
    // compte tout neuf : la visite guidée d'abord
    if (!forced && (!s.user.guideSeen || document.querySelector('.gd'))) return later(5000);
    // « Plus tard » il y a moins d'une heure
    const last = Number(store.get(LATER_KEY) ?? 0);
    const wait = forced ? 0 : last + AGAIN_MS - Date.now();
    if (wait > 0) return later(Math.min(wait + 500, AGAIN_MS));
    // le jeu vient de démarrer : quelques secondes de calme
    const settle = armedAt + (forced ? 600 : FIRST_DELAY_MS) - Date.now();
    if (settle > 0) return later(settle);
    // connexion, ouverture d'un booster, une fenêtre / visionneuse déjà ouverte, onglet caché : un peu plus tard
    if (document.hidden || layerCount() > 0 || document.querySelector('.lc, .lg-veil, .ow-veil, .myth-pre') || /\b(opening|wild-on|duel-on)\b/.test(document.body.className)) return later(5000);
    if (!forced) {
      serverAnswered ??= backend.surveyAnswered(SURVEY_ID).catch(() => {
        serverAnswered = null; // réseau : on redemandera au prochain passage
        return null;
      });
      const a = await serverAnswered;
      if (a === null) return later(60_000);
      if (a) return finish();
      if (done || open) return;
    }
    open = true;
    showSurvey(backend, {
      onLater() {
        open = false;
        store.set(LATER_KEY, String(Date.now()));
        later(AGAIN_MS + 500);
      },
      onDone: finish,
    });
  }

  const off = backend.onChange(() => void check());
  // toutes les minutes (l'heure peut être passée onglet ouvert) et au retour sur l'onglet
  const tick = window.setInterval(() => void check(), 60_000);
  const onVisible = () => !document.hidden && void check();
  document.addEventListener('visibilitychange', onVisible);
  void check();
}

// ───────────────────────────────────────────── la feuille du sondage

const STEPS = 4;
const RATING_WORDS = () => [tr('sv.r1'), tr('sv.r2'), tr('sv.r3'), tr('sv.r4'), tr('sv.r5')];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 6.06 6.65.78-4.92 4.53 1.3 6.57L12 17.3l-5.88 3.24 1.3-6.57L2.5 9.44l6.65-.78z"/></svg>';

const chips = (name: string, opts: SurveyOption[]) =>
  opts.map((o) => `<button type="button" class="sv-chip" data-g="${name}" data-v="${o.id}" aria-pressed="false"><b>${esc(o.label)}</b><small>${esc(o.hint)}</small><i aria-hidden="true"></i></button>`).join('');

function showSurvey(backend: GameBackend, cb: { onLater(): void; onDone(): void }) {
  const name = backend.state.user?.name?.trim() || '';
  const veil = document.createElement('div');
  veil.className = 'sv-veil';
  veil.innerHTML = `<div class="sv" role="dialog" aria-modal="true" aria-labelledby="sv-t0">
    <header class="sv-top">
      <span class="sv-k">Sondage · 1 min</span>
      <span class="sv-prog" aria-hidden="true">${Array.from({ length: STEPS }, () => '<i></i>').join('')}</span>
      <button type="button" class="sv-x" aria-label="${tr('sv.later')}">${tr('sv.later')} <span aria-hidden="true">✕</span></button>
    </header>
    <div class="sv-pages">
      <section class="sv-page sv-hello on" data-p="0">
        <p class="sv-eyebrow">${tr('sv.title')}</p>
        <h2 id="sv-t0">${tr('sv.youChoose', { who: name ? tr('sv.itsYouName', { name: esc(name) }) : tr('sv.itsYou') })}</h2>
        <p class="sv-lead">${tr('sv.intro')}</p>
        <ol class="sv-plan"><li><b>${tr('sv.s1')}</b> ${tr('sv.s1d')}</li><li><b>${tr('sv.s2')}</b> ${tr('sv.s2d')}</li><li><b>${tr('sv.s3')}</b> ${tr('sv.s3d')}</li><li><b>Un mot</b> ${tr('sv.s4d')}</li></ol>
      </section>
      <section class="sv-page" data-p="1">
        <p class="sv-step">1 / ${STEPS}</p>
        <h2>${tr('sv.q1')}</h2>
        <p class="sv-sub">${tr('sv.q1d')}</p>
        <div class="sv-grid">${chips('universes', SURVEY_UNIVERSES)}</div>
        <label class="sv-field"><span>${tr('sv.q1n')} <em>facultatif</em></span><input class="sv-names" maxlength="300" placeholder="${tr('sv.q1ph')}" autocomplete="off"></label>
      </section>
      <section class="sv-page" data-p="2">
        <p class="sv-step">2 / ${STEPS}</p>
        <h2>${tr('sv.q2')}</h2>
        <p class="sv-sub">${tr('sv.q2d', { n: SURVEY_MAX_FEATURES })} <span class="sv-count" aria-live="polite">0 / ${SURVEY_MAX_FEATURES}</span></p>
        <div class="sv-grid">${chips('features', SURVEY_FEATURES)}</div>
      </section>
      <section class="sv-page" data-p="3">
        <p class="sv-step">3 / ${STEPS}</p>
        <h2>${tr('sv.q3')}</h2>
        <p class="sv-sub">${tr('sv.q3d')}</p>
        <div class="sv-stars" role="radiogroup" aria-label="${tr('sv.q3a')}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" data-r="${n}" aria-label="${tr('sv.starA', { n, word: RATING_WORDS()[n - 1] })}">${STAR}</button>`).join('')}</div>
        <p class="sv-rword" aria-live="polite">&nbsp;</p>
      </section>
      <section class="sv-page" data-p="4">
        <p class="sv-step">4 / ${STEPS}</p>
        <h2>${tr('sv.q4')}</h2>
        <p class="sv-sub">${tr('sv.q4d')} <em>facultatif</em></p>
        <textarea class="sv-comment" rows="5" maxlength="1000" placeholder="${tr('sv.q4a')}"></textarea>
      </section>
      <section class="sv-page sv-thanks" data-p="5">
        <span class="sv-ok" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M13 25l7 7 15-16"/></svg></span>
        <h2>Merci${name ? ` ${esc(name)}` : ''}&nbsp;!</h2>
        <p class="sv-lead">${tr('sv.done')}</p>
      </section>
    </div>
    <footer class="sv-foot">
      <button type="button" class="btn-ghost sv-back">${tr('sv.back')}</button>
      <button type="button" class="btn-primary sv-next">${tr('sv.go')}</button>
    </footer>
  </div>`;

  const $ = <T extends HTMLElement>(s: string) => veil.querySelector<T>(s)!;
  const pages = [...veil.querySelectorAll<HTMLElement>('.sv-page')];
  const next = $<HTMLButtonElement>('.sv-next');
  const back = $<HTMLButtonElement>('.sv-back');
  const answer: SurveyAnswer = { universes: [], features: [] };
  let page = 0;
  let closed = false;
  let sent = false;

  const valid = (p: number) => (p === 1 ? answer.universes.length > 0 || !!$<HTMLInputElement>('.sv-names').value.trim() : p === 2 ? answer.features.length > 0 : p === 3 ? !!answer.rating : true);

  function sync() {
    pages.forEach((el, i) => {
      el.classList.toggle('on', i === page);
      el.classList.toggle('past', i < page);
      el.setAttribute('aria-hidden', String(i !== page));
    });
    veil.querySelectorAll('.sv-prog i').forEach((d, i) => d.classList.toggle('on', i < page || sent));
    back.hidden = page === 0 || page > STEPS;
    next.textContent = page === 0 ? tr('sv.go') : page === STEPS ? tr('sv.send') : page > STEPS ? tr('sv.backGame') : tr('sv.next');
    next.disabled = page >= 1 && page <= STEPS && !valid(page);
    $<HTMLElement>('.sv-x').hidden = page > STEPS;
    veil.querySelector<HTMLElement>('.sv')!.dataset.p = String(page);
  }
  function go(p: number) {
    page = Math.max(0, Math.min(STEPS + 1, p));
    sync();
    haptics.pulse(6);
    // champ texte de l'écran : focus sur ordinateur seulement (sur téléphone le clavier masquerait la question)
    if (matchMedia('(pointer: fine)').matches) pages[page].querySelector<HTMLElement>('textarea')?.focus();
  }

  // ── choix
  veil.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t === veil) return close();
    const chip = t.closest<HTMLButtonElement>('.sv-chip');
    if (chip) {
      const g = chip.dataset.g as 'universes' | 'features';
      const list = answer[g];
      const id = chip.dataset.v!;
      const on = list.includes(id);
      if (!on && g === 'features' && list.length >= SURVEY_MAX_FEATURES) {
        haptics.pulse([8, 30, 8]);
        chip.classList.remove('nope');
        void chip.offsetWidth;
        chip.classList.add('nope');
        return toast(tr('sv.maxPick', { n: SURVEY_MAX_FEATURES }), 'info');
      }
      answer[g] = on ? list.filter((x) => x !== id) : [...list, id];
      chip.setAttribute('aria-pressed', String(!on));
      haptics.pulse(on ? 4 : 10);
      if (g === 'features') {
        $('.sv-count').textContent = `${answer.features.length} / ${SURVEY_MAX_FEATURES}`;
        veil.classList.toggle('sv-full', answer.features.length >= SURVEY_MAX_FEATURES);
      }
      return sync();
    }
    const star = t.closest<HTMLButtonElement>('.sv-stars button');
    if (star) {
      answer.rating = Number(star.dataset.r);
      veil.querySelectorAll<HTMLElement>('.sv-stars button').forEach((b) => {
        const n = Number(b.dataset.r);
        b.classList.toggle('on', n <= answer.rating!);
        b.setAttribute('aria-checked', String(n === answer.rating));
      });
      $('.sv-rword').textContent = RATING_WORDS()[answer.rating - 1];
      haptics.pulse(8 + answer.rating * 4);
      return sync();
    }
  });
  $('.sv-names').addEventListener('input', sync);

  // ── navigation
  back.addEventListener('click', () => go(page - 1));
  next.addEventListener('click', async () => {
    if (page > STEPS) return close();
    if (page < STEPS) return go(page + 1);
    const a = cleanSurvey({ ...answer, names: $<HTMLInputElement>('.sv-names').value, comment: $<HTMLTextAreaElement>('.sv-comment').value });
    if (!surveyFilled(a)) return toast(tr('sv.tickOne'), 'err');
    try {
      await busyButton(next, backend.submitSurvey(SURVEY_ID, a));
      sent = true;
      cb.onDone();
      haptics.pulse([12, 40, 24]);
      go(STEPS + 1);
    } catch (err) {
      toast(errMsg(err), 'err');
    }
  });
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') close();
  };

  function close() {
    if (closed) return;
    closed = true;
    popLayer(close);
    document.removeEventListener('keydown', onKey);
    veil.classList.remove('on');
    veil.classList.add('out');
    setTimeout(() => veil.remove(), 320);
    if (!sent) cb.onLater();
  }
  $('.sv-x').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(veil);
  pushLayer(close);
  sync();
  requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('on')));
}
