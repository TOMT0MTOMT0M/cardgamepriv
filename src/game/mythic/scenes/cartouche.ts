/**
 * JEUX VIDÉO — « Cartouche » : LA CARTE EST LA CARTOUCHE. Elle descend dans la fente d'une console noire sans marque ;
 * l'écran s'allume en pixels (l'année, PRESS START), jingle 8 bits original ; l'écran s'éteint en une ligne blanche et la
 * console ÉJECTE la carte vers le haut — elle vient au centre, prête à être retournée.
 * (10/11) composition centrée sur l'écran (avant : tout en haut, la moitié basse du téléphone vide), éjection par le
 * haut de la fente (avant : la carte « poussait » vers le bas, sous la console), liseré arc-en-ciel rendu à la sortie.
 */
import { clamp, type SceneCtx } from '../kit';

const STAR = ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];

export default function cartouche(k: SceneCtx) {
  const { tl, u, el, sfx, actor, cw, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 40%, #131316, #050506 72%);');
  const ch = cw * (1072 / 768);
  // écran (pixels) au-dessus, console au-dessous ; l'ensemble est centré verticalement
  const sw = Math.min(w * 0.86, u * 90, h * 0.62);
  const sh = sw * 0.6;
  const gap = Math.max(u * 5, ch * 0.42);
  const conH = u * 11;
  const scrTop = Math.max(h * 0.06, (h - (sh + gap + conH)) / 2 - h * 0.04);
  const scr = el('div', '', `position:absolute;left:50%;top:${scrTop}px;width:${sw}px;height:${sh}px;border-radius:${u * 1.2}px;background:#000;box-shadow:0 0 0 ${u * 0.8}px #151517,0 0 0 ${u * 0.95}px #26262a,0 40px 90px -30px #000;overflow:hidden;`);
  k.pin(scr, -50, 0);
  const PW = 96, PH = 58;
  const pc = document.createElement('canvas');
  pc.width = PW;
  pc.height = PH;
  pc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;opacity:0;';
  scr.append(pc);
  const g = pc.getContext('2d')!;
  const glow = el('div', '', `position:absolute;left:50%;top:${scrTop + sh / 2}px;width:${sw * 1.5}px;height:${sh * 1.9}px;background:radial-gradient(ellipse,${accent}22,transparent 62%);opacity:0;pointer-events:none;`);
  k.pin(glow);
  const line = el('div', '', `position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#fff;box-shadow:0 0 18px #fff;transform:scaleX(0);`, scr);
  el('div', '', 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.4) 0 1px,transparent 1px 3px),radial-gradient(ellipse at 50% 50%,transparent 55%,rgba(0,0,0,.55));pointer-events:none;', scr);
  // console : plaque noire avec fente, voyant et étiquette
  const conTop = scrTop + sh + gap;
  const conW = Math.max(sw * 0.82, cw * 1.36);
  const con = el('div', '', `position:absolute;left:50%;top:${conTop}px;width:${conW}px;height:${conH}px;border-radius:${u * 1.2}px;background:linear-gradient(180deg,#222226,#0c0c0e);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 30px 50px -20px #000;`);
  k.pin(con, -50, 0);
  el('div', '', `position:absolute;left:50%;top:${u * 1.2}px;width:${cw * 1.08}px;height:${u * 2}px;margin-left:-${cw * 0.54}px;border-radius:${u}px;background:#000;box-shadow:inset 0 3px 6px #000,0 1px 0 rgba(255,255,255,.07);`, con);
  const led = el('div', '', `position:absolute;right:5%;bottom:20%;width:${u * 1.1}px;height:${u * 1.1}px;border-radius:50%;background:#2a2a2e;`, con);
  const pw = k.label('POWER', '0', '0');
  pw.style.cssText += `left:auto;top:auto;right:calc(5% + ${u * 2.2}px);bottom:17%;font-size:${Math.max(8, u * 1.5)}px;letter-spacing:.2em;`;
  con.append(pw);

  // la carte : au-dessus du décor ; ce qui est sous la ligne de la fente est DANS la console (découpé)
  const c = actor();
  const slotY = conTop + u * 2.2;
  const state = { y: 0, out: 0 };
  const sync = () => {
    const bottom = h / 2 + state.y + ch / 2;
    // (une fois éjectée, la carte est DEVANT la console : plus de découpe)
    const hidden = state.out ? 0 : clamp((bottom - slotY) / ch, 0, 1);
    c.style.clipPath = hidden > 0.002 ? `inset(-4px -4px ${(hidden * 100).toFixed(2)}% -4px)` : 'none';
    k.gsap.set(c, { y: state.y });
  };
  const yAbove = slotY - u * 2 - ch / 2 - h / 2; // posée juste au-dessus de la fente
  const yIn = slotY + ch * 0.12 - h / 2; // enfoncée (≈ 62 % cachée)
  tl.set(c, { opacity: 1, x: w * 0.42, rotation: 14 }, 0);
  tl.fromTo(state, { y: -h * 0.75 }, { y: yAbove, duration: 0.55, ease: 'power3.out', onUpdate: sync, immediateRender: false }, 0.05);
  tl.to(c, { x: 0, rotation: 0, duration: 0.55, ease: 'power3.out' }, 0.05);
  k.at(0.05, () => sfx.whoosh(0.5, 0.2, false));
  tl.to(state, { y: yIn, duration: 0.32, ease: 'power2.in', onUpdate: sync }, 0.72);
  k.at(1.04, () => {
    sfx.slot();
    k.haptic(18);
  });
  tl.to(con, { y: u * 0.8, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.out' }, 1.04);
  tl.set(led, { background: accent, boxShadow: `0 0 10px ${accent}` }, 1.15);
  // l'écran s'allume
  k.at(1.2, () => sfx.tvOn(0.12));
  tl.to(line, { scaleX: 1, duration: 0.12, ease: 'power2.out' }, 1.2);
  tl.to(line, { scaleY: 100, opacity: 0, duration: 0.22, ease: 'power2.in' }, 1.32);
  tl.set(pc, { opacity: 1 }, 1.4);
  tl.to(glow, { opacity: 1, duration: 0.3 }, 1.4);
  const year = k.card.year ? String(k.card.year) : '';
  k.loop((t) => {
    if (t < 1.4 || t > 2.75) return;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, PW, PH);
    // sol en damier qui défile (perspective à l'ancienne : bandes de plus en plus hautes)
    for (let y = 0; y < 16; y++) {
      const bw = 4 + y;
      const off = Math.floor(t * 30) % (bw * 2);
      for (let x = -bw * 2; x < PW + bw * 2; x += bw) {
        g.fillStyle = Math.floor((x + off) / bw + y) % 2 === 0 ? '#12304c' : '#0a1828';
        g.fillRect(x + (off % bw), PH - 16 + y, bw, 1);
      }
    }
    // étoiles fixes
    g.fillStyle = '#31506e';
    for (let i = 0; i < 14; i++) g.fillRect((i * 37 + 11) % PW, (i * 23 + 5) % (PH - 22), 1, 1);
    g.textAlign = 'center';
    g.fillStyle = '#e8f4ff';
    if (year) {
      g.font = 'bold 16px monospace';
      g.fillText(year, PW / 2, 22);
    } else {
      // six étoiles en pixels (7 × 7)
      for (let i = 0; i < 6; i++) {
        const x0 = Math.round(PW / 2 - 29 + i * 10), y0 = 12;
        STAR.forEach((row, y) => {
          for (let x = 0; x < 7; x++) if (row[x] === '#') g.fillRect(x0 + x, y0 + y, 1, 1);
        });
      }
    }
    if (Math.floor(t * 4.5) % 2 === 0) {
      g.font = '8px monospace';
      g.fillStyle = accent;
      g.fillText('PRESS START', PW / 2, 37);
    }
  });
  k.at(1.5, () => sfx.chip(0.1));
  // extinction (ligne) ; la console éjecte la carte vers le haut, puis elle vient au centre
  tl.set(pc, { opacity: 0 }, 2.75);
  tl.to(glow, { opacity: 0, duration: 0.15 }, 2.75);
  tl.set(line, { scaleY: 1, opacity: 1 }, 2.75);
  tl.to(line, { scaleX: 0, duration: 0.18, ease: 'power3.in' }, 2.77);
  k.at(2.8, () => sfx.tick(0.4, 0.2));
  tl.to(con, { y: u * 0.8, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.out' }, 2.92);
  k.at(2.94, () => {
    sfx.slot();
    k.haptic(14);
  });
  tl.to(state, { y: yAbove - u * 5, duration: 0.3, ease: 'back.out(1.6)', onUpdate: sync }, 2.94);
  tl.set(led, { background: '#2a2a2e', boxShadow: 'none' }, 2.96);
  tl.set(state, { out: 1 }, 3.24);
  tl.to(state, { y: 0, duration: 0.5, ease: 'power3.inOut', onUpdate: sync }, 3.24);
  tl.to([scr, con], { opacity: 0, scale: 0.94, duration: 0.42, ease: 'power2.in' }, 3.2);
  k.at(3.26, () => sfx.whoosh(0.4, 0.14));
  k.glint(3.6, 0.5);
  k.at(3.72, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 4.12);
}
