/**
 * BERSERK 6★ — « Éclipse » (11/11, Tom : la case de manga est remplacée, mais la visionneuse garde un prélude comme
 * toutes les 6★). Même univers que l'ambiance de l'ouverture (scenes/opening.ts, game/eclipse.ts) : ciel cramoisi,
 * crête noire sur l'horizon, lac-miroir ; le SOLEIL NOIR se lève, sa couronne s'embrase… et LA CARTE en descend, jusqu'au
 * centre. À l'ouverture, l'Éclipse du booster suffit : pas de prélude (mythic/index.ts).
 * (11/11) Les apôtres sur la crête (game/apostles.ts, les mêmes que dans l'ouverture : créatures génériques inventées).
 * Pas de signe ajouté : le soleil noir porte déjà la scène (décision notée dans claude/berserk-eclipse-v2-10-11.md).
 */
import { easeInOut, easeOut, span, type SceneCtx } from '../kit';
import { APOSTLES, drawApostle } from '../../apostles';

export default function eclipse(k: SceneCtx) {
  const { tl, u, w, h, sfx, actor } = k;
  k.el('div', '', 'position:absolute;inset:0;background:#030104;');
  const cv = k.canvas();
  const c = cv.c;
  const HY = h * 0.64; // horizon
  const R = Math.min(w, h) * 0.13; // rayon du soleil noir
  const sunX = w / 2;
  const sunY = (t: number) => HY + R * 1.4 - easeOut(span(t, 0.25, 1.55)) * (HY - h * 0.3 + R * 1.4);
  // crête de l'horizon (même pour une carte donnée)
  const ridge = Array.from({ length: 34 }, (_, i) => ({ x: (i / 33) * w, y: HY - (0.2 + k.rand() * 0.8) * u * (i % 7 === 3 ? 7 : 3.2) }));
  const rays = Array.from({ length: k.mobile ? 26 : 44 }, () => ({ a: k.rand() * Math.PI * 2, l: 0.5 + k.rand() * 1.1, s: (k.rand() - 0.5) * 0.25 }));

  k.loop((t) => {
    const sky = easeInOut(span(t, 0, 0.9));
    const flare = span(t, 1.55, 1.7) * (1 - span(t, 1.7, 2.6) * 0.6);
    const sy = sunY(t);
    c.clearRect(0, 0, w, h);
    // ciel : nuit → cramoisi au ras de l'horizon
    const g = c.createLinearGradient(0, 0, 0, HY);
    g.addColorStop(0, `rgba(10,2,6,${sky})`);
    g.addColorStop(0.55, `rgba(70,6,12,${sky})`);
    g.addColorStop(1, `rgba(${170 + 60 * flare | 0},${22 + 30 * flare | 0},20,${sky})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, HY);
    // couronne : halo + rayons qui tournent lentement (au-dessus de l'horizon seulement)
    c.save();
    c.beginPath();
    c.rect(0, 0, w, HY);
    c.clip();
    const corona = 0.35 + 0.65 * span(t, 0.9, 1.6) + flare * 0.8;
    const halo = c.createRadialGradient(sunX, sy, R * 0.95, sunX, sy, R * (2.6 + flare));
    halo.addColorStop(0, `rgba(255,236,200,${0.95 * corona})`);
    halo.addColorStop(0.12, `rgba(255,120,60,${0.75 * corona})`);
    halo.addColorStop(0.45, `rgba(200,20,24,${0.35 * corona})`);
    halo.addColorStop(1, 'rgba(120,0,10,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, w, HY);
    c.globalCompositeOperation = 'lighter';
    for (const r of rays) {
      const a = r.a + t * r.s;
      const len = R * (1.2 + r.l * (1 + flare * 1.5)) * corona;
      c.strokeStyle = `rgba(255,150,90,${0.22 * corona})`;
      c.lineWidth = u * 0.25;
      c.beginPath();
      c.moveTo(sunX + Math.cos(a) * R, sy + Math.sin(a) * R);
      c.lineTo(sunX + Math.cos(a) * (R + len), sy + Math.sin(a) * (R + len));
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    // le soleil noir
    c.fillStyle = '#000';
    c.beginPath();
    c.arc(sunX, sy, R, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // crête
    c.fillStyle = '#050102';
    c.beginPath();
    c.moveTo(0, HY + 1);
    for (const p of ridge) c.lineTo(p.x, p.y);
    c.lineTo(w, HY + 1);
    c.fill();
    // les apôtres, debout sur la crête (pieds sur la ligne brisée)
    for (const a of APOSTLES) {
      const x = sunX + a.x * h;
      if (x < -h * 0.1 || x > w + h * 0.1) continue;
      const i = Math.min(ridge.length - 2, Math.max(0, Math.floor((x / w) * 33)));
      const f = Math.min(1, Math.max(0, (x - ridge[i].x) / (ridge[i + 1].x - ridge[i].x)));
      drawApostle(c, a.k, x, ridge[i].y + (ridge[i + 1].y - ridge[i].y) * f + a.h * h * 0.06, a.h * h, a.f);
    }
    // lac-miroir : reflet du ciel, assombri, coupé de lignes de houle
    const lg = c.createLinearGradient(0, HY, 0, h);
    lg.addColorStop(0, `rgba(${120 + 50 * flare | 0},14,16,${sky * 0.85})`);
    lg.addColorStop(1, `rgba(6,1,3,${sky})`);
    c.fillStyle = lg;
    c.fillRect(0, HY, w, h - HY);
    const streak = Math.max(0, corona) * (sy < HY ? 1 : 0);
    for (let i = 0; i < 26; i++) {
      const y = HY + Math.pow(i / 26, 1.6) * (h - HY);
      const half = R * (0.6 + 0.5 * Math.sin(t * 1.3 + i)) * (1 - i / 34);
      c.fillStyle = `rgba(255,140,80,${0.28 * streak * (1 - i / 26)})`;
      c.fillRect(sunX - half, y, half * 2, u * 0.22);
      c.fillStyle = `rgba(0,0,0,${0.35 * sky})`;
      c.fillRect(0, y + u * 0.3, w, u * 0.12);
    }
  });

  k.at(0.0, () => sfx.rumble(2.0, 0.22));
  k.at(0.35, () => sfx.riser(1.2, 0.14));
  k.shake(1.6, u * 1.2, 0.45);
  k.at(1.6, () => {
    sfx.gong(0.22);
    k.haptic([40, 30, 60]);
  });
  // la carte descend du soleil noir jusqu'au centre
  const a = actor();
  const sy = sunY(1.8) - h / 2;
  tl.set(a, { opacity: 0, scale: 0.18, x: 0, y: sy, rotation: 0 }, 1.75);
  tl.to(a, { opacity: 1, duration: 0.25 }, 1.8);
  tl.to(a, { scale: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 1.85);
  k.at(1.85, () => sfx.whoosh(0.5, 0.22, false));
  k.glint(2.5);
  k.at(2.55, () => sfx.hit(0.4, 52));
  tl.to({}, { duration: 0.01 }, 2.9);
}
