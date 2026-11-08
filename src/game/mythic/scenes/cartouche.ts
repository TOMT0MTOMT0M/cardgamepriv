/**
 * JEUX VIDÉO — « Cartouche » : LA CARTE EST LA CARTOUCHE. Elle descend dans la fente d'une console noire sans marque ;
 * l'écran s'allume en pixels (l'année, PRESS START), jingle 8 bits original ; l'écran s'éteint en une ligne blanche et la
 * carte ressort de la console, au centre, prête à être retournée.
 */
import type { SceneCtx } from '../kit';

export default function cartouche(k: SceneCtx) {
  const { tl, u, el, sfx, actor, cw, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 30%, #121214, #050506 70%);');
  const c = actor();
  // écran (pixels) au-dessus, console au-dessous
  const sw = Math.min(w * 0.86, u * 90);
  const sh = sw * 0.62;
  const scrTop = h * 0.08;
  const scr = el('div', '', `position:absolute;left:50%;top:${scrTop}px;width:${sw}px;height:${sh}px;border-radius:${u * 1.2}px;background:#000;box-shadow:0 0 0 ${u * 0.8}px #151517,0 40px 90px -30px #000;overflow:hidden;`);
  k.pin(scr, -50, 0);
  const PW = 96, PH = 60;
  const pc = document.createElement('canvas');
  pc.width = PW;
  pc.height = PH;
  pc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;opacity:0;';
  scr.append(pc);
  const g = pc.getContext('2d')!;
  const line = el('div', '', `position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#fff;box-shadow:0 0 18px #fff;transform:scaleX(0);`, scr);
  el('div', '', 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.4) 0 1px,transparent 1px 3px);pointer-events:none;', scr);
  // console : plaque noire avec fente
  const conTop = scrTop + sh + u * 7;
  const conW = sw * 0.8;
  const con = el('div', '', `position:absolute;left:50%;top:${conTop}px;width:${conW}px;height:${u * 12}px;border-radius:${u * 1.2}px;background:linear-gradient(180deg,#1d1d20,#0c0c0e);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 30px 50px -20px #000;`);
  k.pin(con, -50, 0);
  el('div', '', `position:absolute;left:50%;top:${u * 1.4}px;width:${cw * 1.08}px;height:${u * 2.2}px;margin-left:-${cw * 0.54}px;border-radius:${u}px;background:#000;box-shadow:inset 0 3px 6px #000;`, con);
  const led = el('div', '', `position:absolute;right:6%;bottom:22%;width:${u * 1.2}px;height:${u * 1.2}px;border-radius:50%;background:#2a2a2e;`, con);
  k.label('POWER', '6%', '58%').style.fontSize = `${u * 1.6}px`;
  // la carte arrive par le haut-droit et s'enfonce dans la fente (clip : la partie sous la fente disparaît)
  const slotY = conTop + u * 2.5;
  const cardTop = slotY - cw * (88 / 63); // position quand elle dépasse encore
  tl.set(c, { opacity: 1, x: w * 0.5, y: -h * 0.4, rotation: 14 }, 0);
  tl.to(c, { x: 0, y: cardTop + cw * (88 / 63) * 0.5 - h * 0.5 + cw * 0.5, rotation: 0, duration: 0.55, ease: 'power3.out' }, 0.05);
  k.at(0.05, () => sfx.whoosh(0.5, 0.2, false));
  // elle s'enfonce (clip de bas en haut)
  const clipTo = { v: 0 };
  tl.to(c, { y: `+=${cw * 0.9}`, duration: 0.35, ease: 'power2.in' }, 0.7);
  tl.to(clipTo, { v: 62, duration: 0.35, ease: 'power2.in', onUpdate: () => (c.style.clipPath = `inset(0 0 ${clipTo.v}% 0)`) }, 0.7);
  k.at(1.05, () => {
    sfx.slot();
    k.haptic(18);
  });
  k.shake(1.05, u * 0.6, 0.2);
  tl.set(led, { background: accent, boxShadow: `0 0 10px ${accent}` }, 1.15);
  // l'écran s'allume
  k.at(1.2, () => sfx.tvOn(0.12));
  tl.to(line, { scaleX: 1, duration: 0.12, ease: 'power2.out' }, 1.2);
  tl.to(line, { scaleY: 100, opacity: 0, duration: 0.25, ease: 'power2.in' }, 1.32);
  tl.set(pc, { opacity: 1 }, 1.4);
  const year = k.card.year ? String(k.card.year) : '★★★★★★';
  k.loop((t) => {
    if (t < 1.4 || t > 2.7) return;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, PW, PH);
    for (let y = 0; y < 14; y++)
      for (let x = 0; x < PW; x += 6) {
        const off = Math.floor((t * 40) % 12);
        g.fillStyle = ((x + off + y * 3) / 6) % 2 < 1 ? '#10243a' : '#0a1626';
        g.fillRect(x, PH - 14 + y, 6, 1);
      }
    g.textAlign = 'center';
    g.fillStyle = '#e8f4ff';
    g.font = 'bold 10px monospace';
    g.fillText(year, PW / 2, 22);
    if (Math.floor(t * 5) % 2 === 0) {
      g.font = '7px monospace';
      g.fillStyle = accent;
      g.fillText('PRESS START', PW / 2, 40);
    }
  });
  k.at(1.5, () => sfx.chip(0.1));
  // extinction (ligne), la carte ressort et vient au centre
  tl.set(pc, { opacity: 0 }, 2.7);
  tl.set(line, { scaleY: 1, opacity: 1 }, 2.7);
  tl.to(line, { scaleX: 0, duration: 0.18, ease: 'power3.in' }, 2.72);
  k.at(2.75, () => sfx.tick(0.4, 0.2));
  tl.to(clipTo, { v: 0, duration: 0.35, ease: 'power3.out', onUpdate: () => (c.style.clipPath = `inset(0 0 ${clipTo.v}% 0)`) }, 2.85);
  tl.to(c, { y: 0, duration: 0.55, ease: 'power3.inOut' }, 2.85);
  tl.to([scr, con], { opacity: 0, y: -u * 6, duration: 0.4, ease: 'power2.in' }, 3.0);
  k.at(2.85, () => sfx.whoosh(0.4, 0.14));
  tl.to({}, { duration: 0.01 }, 3.45);
}
