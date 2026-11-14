import { t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.login'; // (textes de ce module, version anglaise)
import { net } from '../../core/net/client';
import { errMsg, esc, h, popLayer, pushLayer, toast } from '../ui';

/**
 * FENÊTRE DE CONNEXION (ouverture 07/11) — Discord OU pseudo + mot de passe (comptes sans Discord, convex/pwAuth.ts).
 * Ouverte par `backend.login()` (tous les boutons « Se connecter » du jeu, l'écran d'ouverture).
 * Pas d'e-mail : un mot de passe oublié se remet à zéro par l'équipe (`npx convex run pwAuth:setPassword …`).
 */
let open: HTMLElement | null = null;

export function openLogin(o: { mode?: 'signup' | 'login'; title?: string } = {}) {
  if (open) return;
  let mode: 'signup' | 'login' = o.mode ?? 'signup';
  const needCode = !!net.state.launch?.clubCode;
  const veil = h('div', 'lg-veil');
  veil.innerHTML = `<div class="lg" role="dialog" aria-modal="true" aria-labelledby="lg-t">
    <button class="icon lg-x" aria-label="${tr('common.close')}">✕</button>
    <p class="lg-k">${esc(o.title ?? tr('lg.join'))}</p>
    <h2 class="lg-t" id="lg-t">Bébou</h2> <!-- i18n-ok -->
    <button class="lg-discord" type="button">${tr('lg.discord')}</button>
    <div class="lg-or" aria-hidden="true"><span>${tr('lg.orName')}</span></div>
    <div class="lg-tabs" role="tablist" aria-label="Compte pseudo">
      <button role="tab" type="button" data-m="signup">${tr('lg.create')}</button>
      <button role="tab" type="button" data-m="login">${tr('lg.have')}</button>
    </div>
    <form class="lg-form" novalidate>
      <label class="lg-f"><span>${tr('lg.name')}</span><input name="name" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" required></label>
      <label class="lg-f"><span>Mot de passe</span><span class="lg-pw"><input name="password" type="password" minlength="6" maxlength="100" required><button type="button" class="lg-eye" aria-label="${tr('lg.showPw')}" aria-pressed="false">${tr('lg.see')}</button></span></label>
      ${needCode ? '<label class="lg-f lg-code"><span>' + tr('lg.clubCode') + '</span><input name="code" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40"></label>' : ''}
      <p class="lg-err" role="alert" hidden></p>
      <button class="btn-primary lg-go" type="submit"></button>
      <p class="lg-note"></p>
    </form>
  </div>`;
  const $ = <T extends HTMLElement>(s: string) => veil.querySelector<T>(s)!;
  const form = $<HTMLFormElement>('.lg-form');
  const name = form.elements.namedItem('name') as HTMLInputElement;
  const pw = form.elements.namedItem('password') as HTMLInputElement;
  const code = form.elements.namedItem('code') as HTMLInputElement | null;
  const err = $('.lg-err');
  const go = $<HTMLButtonElement>('.lg-go');

  const sync = () => {
    veil.querySelectorAll<HTMLElement>('[data-m]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === mode)));
    pw.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    pw.placeholder = mode === 'signup' ? tr('lg.min6') : '';
    if (code) $('.lg-code').hidden = mode !== 'signup';
    go.textContent = mode === 'signup' ? tr('lg.createMine') : 'Me connecter';
    $('.lg-note').textContent =
      mode === 'signup' ? tr('lg.noEmail') : tr('lg.forgot');
    err.hidden = true;
  };

  const close = () => {
    if (!open) return;
    open = null;
    veil.classList.add('out');
    setTimeout(() => veil.remove(), 260);
    popLayer(close);
  };
  veil.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === veil || t.closest('.lg-x')) return close();
    const tab = t.closest<HTMLElement>('[data-m]');
    if (tab) {
      mode = tab.dataset.m as typeof mode;
      sync();
      name.focus();
    }
    if (t.closest('.lg-discord')) net.loginWithDiscord();
    const eye = t.closest<HTMLElement>('.lg-eye');
    if (eye) {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      eye.textContent = show ? 'cacher' : 'voir';
      eye.setAttribute('aria-pressed', String(show));
    }
  });
  veil.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const n = name.value.trim();
    if (n.length < 3) return fail(tr('lg.nameMin'));
    if (pw.value.length < 6) return fail(tr('lg.pwMin'));
    go.disabled = true;
    go.classList.add('busy');
    try {
      if (mode === 'signup') await net.signupWithPassword(n, pw.value, code?.value.trim() || undefined);
      else await net.loginWithPassword(n, pw.value);
      toast(mode === 'signup' ? tr('lg.welcome', { n }) : `Re-bonjour ${n} !`, 'ok');
      close();
    } catch (x) {
      fail(errMsg(x));
    } finally {
      go.disabled = false;
      go.classList.remove('busy');
    }
  });
  function fail(m: string) {
    err.textContent = m;
    err.hidden = false;
  }

  sync();
  document.body.append(veil);
  open = veil;
  pushLayer(close);
  requestAnimationFrame(() => {
    veil.classList.add('on');
    $<HTMLElement>('.lg-discord').focus({ preventScroll: true });
  });
}
