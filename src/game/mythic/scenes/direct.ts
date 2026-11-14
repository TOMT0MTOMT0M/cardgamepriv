/**
 * YOUTUBE — « Le direct » : texte sans cadre ni fond (DA) : un point rouge EN DIRECT qui pulse, le compteur de
 * spectateurs qui s'emballe, des messages anonymes qui défilent en colonne (« ????? », « LÀ LÀ LÀ », « 6 ÉTOILES ?! »),
 * puis tout se fige : la carte entre par le bas, « pose » au centre — et le compteur explose.
 */
import { lang } from '../../../core/i18n';
import { locale } from '../../../core/i18n';
import type { SceneCtx } from '../kit';

const MSGS = () => lang() === 'fr' ? ['?????', 'attends attends', 'LÀ LÀ LÀ', 'c pas possible', 'non non non', 'il l’a', '6 ÉTOILES ?!', 'CLIP CLIP CLIP', 'jsuis pas prêt', 'OMG', 'le sang', 'regarde regarde'] : ['?????', 'wait wait', 'NO WAY NO WAY', 'that’s not possible', 'no no no', 'he got it', '6 STARS ?!', 'CLIP CLIP CLIP', 'i’m not ready', 'OMG', 'bro', 'look look']; // i18n-ok

export default function direct(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 40%,#111113,#040405 75%);');
  const live = el('div', 'mp-label', `left:${u * 5}px;top:${u * 6}px;font-size:${u * 3.6}px;color:#fff;display:flex;align-items:center;gap:${u * 1.5}px;opacity:0;`);
  const dot = el('i', '', `display:inline-block;width:${u * 2.2}px;height:${u * 2.2}px;border-radius:50%;background:${accent};box-shadow:0 0 ${u * 2}px ${accent};`, live);
  live.append(lang() === 'fr' ? 'EN DIRECT' : 'LIVE'); // i18n-ok
  void dot;
  const viewers = el('div', '', `position:absolute;right:${u * 5}px;top:${u * 5.4}px;font:700 ${u * 6.4}px var(--mono);color:#fff;font-variant-numeric:tabular-nums;letter-spacing:.02em;opacity:0;`);
  const col = el('div', '', `position:absolute;left:${u * 5}px;bottom:${Math.max(u * 12, 64)}px;width:88%;display:flex;flex-direction:column;gap:${u * 2}px;mask-image:linear-gradient(180deg,transparent,#000 40%);-webkit-mask-image:linear-gradient(180deg,transparent,#000 40%);`);
  const a = actor();
  tl.to(live, { opacity: 1, duration: 0.25 }, 0.1);
  tl.to(dot, { opacity: 0.25, duration: 0.5, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0.1);
  k.at(0.1, () => sfx.notif(0.1));
  tl.to(viewers, { opacity: 1, duration: 0.25 }, 0.3);
  const v = { n: 1200 + Math.floor(k.rand() * 4000) };
  const bump = (to: number, at: number, d: number) => tl.to(v, { n: to, duration: d, ease: 'power2.inOut', onUpdate: () => (viewers.textContent = `${Math.round(v.n).toLocaleString(locale())} 👁`.replace(' 👁', '')) }, at);
  viewers.textContent = v.n.toLocaleString(locale());
  bump(v.n * 1.4, 0.4, 0.8);
  bump(v.n * 3.5, 1.3, 0.7);
  // les messages tombent de plus en plus vite
  const order = [...MSGS()].sort(() => k.rand() - 0.5);
  order.forEach((m, i) => {
    const at = 0.4 + Math.pow(i / order.length, 1.6) * 1.5;
    tl.call(() => {
      const e = el('div', '', `font:${/[A-Z]{3}/.test(m) ? 800 : 500} ${u * (5.6 + (/[A-Z]{3}/.test(m) ? 2.6 : 0))}px/1.05 var(--title);white-space:nowrap;color:${/[A-Z]{3}/.test(m) ? accent : 'rgba(255,255,255,.85)'};`, col);
      e.textContent = m;
      k.gsap.fromTo(e, { opacity: 0, x: -u * 3 }, { opacity: 1, x: 0, duration: 0.2 });
      while (col.children.length > 8) col.firstElementChild?.remove();
      sfx.tick(0.8 + i * 0.05, 0.08);
    }, [], at);
  });
  k.at(1.2, () => sfx.riser(0.9, 0.1));
  // tout se fige, la carte entre par le bas
  tl.to(col, { opacity: 0.16, duration: 0.3 }, 2.0);
  tl.to(live, { opacity: 0.5, duration: 0.3 }, 2.0);
  tl.set(a, { opacity: 1, y: h * 0.75, rotation: 4, scale: 0.9 }, 2.0);
  tl.to(a, { y: 0, rotation: 0, scale: 1, duration: 0.6, ease: 'power3.out' }, 2.05);
  k.at(2.05, () => sfx.whoosh(0.5, 0.2, true, 'power3.out'));
  // le compteur explose
  bump(v.n * 40, 2.5, 0.6);
  tl.to(viewers, { color: accent, scale: 1.25, transformOrigin: '100% 50%', duration: 0.25, ease: 'back.out(2)' }, 2.5);
  k.at(2.5, () => {
    sfx.roll(0.6, 0.1);
    sfx.hit(0.4, 60);
    k.haptic([20, 40, 20]);
  });
  k.glint(2.55, 0.5);
  tl.to({}, { duration: 0.01 }, 3.1);
  void w;
}
