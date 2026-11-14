/**
 * LEAGUE OF LEGENDS — « Splash » : plongée dans un abîme doré (le fond se creuse en anneaux de lumière qui foncent
 * vers la caméra), le nom de la ligne / gamme en grand qui se fend, et la carte REMONTE du fond, de loin, de plus en plus
 * grande, jusqu'au centre. Teinte = la gamme de skins.
 */
import { span, easeIn, type SceneCtx } from '../kit';

export default function splash(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h } = k;
  const sub = k.card.subId;
  const tint = /spirit|blossom/.test(sub) ? '#ff8fc8' : /star-guardian/.test(sub) ? '#c9a3ff' : /project/.test(sub) ? '#6bc8ff' : /coven|aube|nuit/.test(sub) ? '#9ad0b0' : /high-noon/.test(sub) ? '#ff9a4d' : '#ffd36b';
  const rgb = tint.match(/\w\w/g)!.map((x) => parseInt(x, 16)).join(',');
  el('div', '', `position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(${rgb},.18),#040404 60%);`);
  const cv = k.canvas();
  const cx = w / 2, cy = h / 2;
  const R = Math.hypot(cx, cy);
  const N = 18;
  cv.loop((t, dt) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const sp = 0.35 + easeIn(span(t, 0, 2.0)) * 3;
    const z0 = (t * sp) % 1;
    for (let i = N; i >= 0; i--) {
      const z = i + 1 - z0;
      const r = (R * 1.3) / Math.pow(z, 1.25);
      const a = Math.max(0, 0.9 - z * 0.05) * Math.min(1, t * 2);
      c.strokeStyle = `rgba(${rgb},${a})`;
      c.lineWidth = Math.max(0.6, 4 / z);
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      // graduations gravées
      if (i % 2 === 0) {
        c.setLineDash([2, 10 / z + 4]);
        c.beginPath();
        c.arc(cx, cy, r * 0.93, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }
    void dt;
  });
  const word = k.word(k.card.sub, h * 0.5, u * 14);
  // (10/11) taille calculée avec l'espacement FINAL des lettres : « Spirit Blossom » ne déborde plus de l'écran
  word.style.letterSpacing = '0.12em';
  k.fit(word, 0.88);
  word.style.letterSpacing = '0.01em';
  word.style.color = tint;
  word.style.textShadow = `0 0 ${u * 6}px rgba(${rgb},.6)`;
  tl.fromTo(word, { opacity: 0, scale: 1.3, filter: 'blur(12px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' }, 0.1);
  k.at(0.1, () => {
    sfx.riser(1.9, 0.14);
    sfx.rumble(2, 0.14);
  });
  tl.to(word, { letterSpacing: '0.12em', duration: 1.6, ease: 'none' }, 0.5);
  // le mot se fend, la carte remonte du fond
  tl.to(word, { scaleY: 0.02, opacity: 0, duration: 0.22, ease: 'power4.in' }, 1.9);
  k.at(1.9, () => sfx.slash(0.22));
  const c = actor();
  tl.set(c, { opacity: 1, scale: 0.02, rotation: -40 }, 1.6);
  tl.to(c, { scale: 1, rotation: 0, duration: 1.0, ease: 'power3.in' }, 1.6);
  k.at(2.6, () => {
    sfx.hit(0.6, 50);
    sfx.note(9, 0.12, 1.2);
    k.haptic([20, 30, 40]);
  });
  k.shake(2.6, u * 1.2, 0.3);
  tl.to({}, { duration: 0.01 }, 2.95);
}
