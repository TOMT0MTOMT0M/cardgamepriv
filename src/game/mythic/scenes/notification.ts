/**
 * YOUTUBE — « Notification » : un téléphone vibre, la notification « vient de publier une vidéo » tombe, la cloche
 * sonne, le compteur de vues s'emballe ; l'écran s'allume en blanc — la carte. (Aucun logo : un simple bouton lecture rond.)
 */
import type { SceneCtx } from '../kit';

export default function notification(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 60% 45% at 50% 50%,#15161b,#040405 75%);');
  const pw = Math.min(k.w * 0.62, u * 62, k.h * 0.36);
  const ph = pw * 2.05;
  const phone = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${pw}px;height:${ph}px;border-radius:${pw * 0.14}px;background:#0b0b0d;box-shadow:0 0 0 ${u * 0.6}px #2b2b30,0 40px 80px rgba(0,0,0,.9);overflow:hidden;`));
  const scr = el('div', '', `position:absolute;inset:${u * 1.2}px;border-radius:${pw * 0.12}px;overflow:hidden;background:linear-gradient(160deg,#1d2230,#0b0d12);`, phone);
  el('div', '', `position:absolute;left:50%;top:${u * 1.4}px;width:28%;height:${u * 2.6}px;margin-left:-14%;border-radius:${u * 2}px;background:#000;`, scr);
  const time = el('div', '', `position:absolute;left:0;right:0;top:16%;text-align:center;font:300 ${pw * 0.24}px/1 var(--title);color:rgba(255,255,255,.92);`, scr);
  time.textContent = '20:48';
  el('div', 'mp-mono', `position:absolute;left:0;right:0;top:31%;text-align:center;font-size:${pw * 0.045}px;color:rgba(255,255,255,.55);`, scr).textContent = 'dimanche';
  // la notification
  const n = el('div', '', `position:absolute;left:5%;right:5%;top:44%;padding:${pw * 0.04}px;border-radius:${pw * 0.06}px;background:rgba(255,255,255,.14);backdrop-filter:blur(8px);display:flex;gap:${pw * 0.04}px;align-items:center;`, scr);
  const ic = el('div', '', `flex:0 0 ${pw * 0.14}px;height:${pw * 0.14}px;border-radius:50%;background:#fff;display:grid;place-items:center;`, n);
  ic.innerHTML = `<svg viewBox="0 0 10 10" width="45%"><path d="M3 2 L8 5 L3 8 Z" fill="#111"/></svg>`;
  const tx = el('div', '', `flex:1;min-width:0;font:600 ${pw * 0.05}px/1.25 var(--title);color:#fff;`, n);
  tx.innerHTML = `★★★★★★ <span style="opacity:.6;font-weight:400">· à l’instant</span><br><span style="font-weight:400;opacity:.85">vient de publier une vidéo</span>`;
  const bell = el('div', '', `position:absolute;right:6%;top:6%;font-size:${pw * 0.12}px;`, scr);
  bell.textContent = '🔔';
  const views = el('div', 'mp-mono', `position:absolute;left:0;right:0;top:68%;text-align:center;font-size:${pw * 0.075}px;color:#fff;letter-spacing:.05em;opacity:0;`, scr);
  const glow = el('div', '', 'position:absolute;inset:0;background:#fff;opacity:0;', scr);

  tl.fromTo(phone, { opacity: 0, y: u * 10, rotation: -4 }, { opacity: 1, y: 0, rotation: 0, duration: 0.4, ease: 'power3.out' }, 0);
  // vibreur
  tl.to(phone, { x: '+=4', duration: 0.03, repeat: 11, yoyo: true, ease: 'none' }, 0.45);
  k.at(0.45, () => {
    sfx.buzz(0.4, 0.14);
    k.haptic([60, 40, 60]);
  });
  tl.fromTo(n, { y: -ph * 0.4, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.6)' }, 0.7);
  k.at(0.72, () => sfx.notif(0.14));
  tl.fromTo(bell, { rotation: 0, transformOrigin: '50% 10%' }, { rotation: 22, duration: 0.07, repeat: 7, yoyo: true, ease: 'sine.inOut' }, 0.9);
  k.at(0.9, () => sfx.bell(2400, 0.08, 0.6));
  // compteur de vues
  tl.set(views, { opacity: 1 }, 1.25);
  const v = { n: 0 };
  const target = 800_000 + Math.floor(k.rand() * 9_000_000);
  tl.to(v, { n: target, duration: 0.8, ease: 'power3.in', onUpdate: () => (views.textContent = `${Math.round(v.n).toLocaleString('fr-FR')} vues`) }, 1.25);
  k.at(1.25, () => sfx.roll(0.8, 0.09));
  // l'écran s'allume et la caméra entre
  tl.to(glow, { opacity: 1, duration: 0.18 }, 2.05);
  k.at(2.05, () => sfx.hit(0.4, 70));
  tl.to(phone, { scale: 3.4, duration: 0.42, ease: 'power3.in' }, 2.1);
  tl.to({}, { duration: 0.01 }, 2.55);
}
