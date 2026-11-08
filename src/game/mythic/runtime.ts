/**
 * MOTEUR des animations 6★ (chargé à la première 6★) : calque plein écran au-dessus de l'ouverture ou de la
 * visionneuse — 1) indices façon walkout, 2) scène de la famille (scenes/*.ts), 3) flash blanc et retour à la carte.
 * Un toucher (ou Échap) passe tout. Pendant l'ouverture, le rendu 3D est mis en pause sous le calque (batterie) et
 * relancé juste avant le retour, pour que la carte soit déjà là quand le calque s'efface.
 */
import gsap from 'gsap';
import type { Shell } from '../shell';
import { haptics } from '../../core/haptics';
import { popLayer, pushLayer } from '../ui';
import { soundKit } from './sounds';
import { RAINBOW, seeded, type MythicCard, type SceneCanvas, type SceneCtx, type SceneFn } from './kit';
import './mythic.css';

export interface PreludeRun {
  shell: Shell;
  card: MythicCard;
  clues: string[];
  mode: 'opening' | 'viewer';
  short: boolean;
  reduced: boolean;
  scene: () => Promise<{ default: SceneFn }>;
}

/** accélération de la version courte */
const SHORT_SPEED = 2.2;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function runPrelude(o: PreludeRun): { done: Promise<void>; abort(): void } {
  const { shell } = o;
  const mobile = shell.quality === 'mobile';
  const root = document.createElement('div');
  root.className = `myth-pre mf-${o.card.family}${o.short ? ' short' : ''}`;
  root.setAttribute('role', 'presentation');
  const stage = document.createElement('div');
  stage.className = 'mp-stage';
  const clueBox = document.createElement('div');
  clueBox.className = 'mp-clues';
  const flash = document.createElement('div');
  flash.className = 'mp-flash';
  const hint = document.createElement('div');
  hint.className = 'mp-hint';
  hint.textContent = 'Toucher pour passer';
  root.append(stage, clueBox, flash, hint);
  document.body.append(root);
  document.body.classList.add('myth-on');

  const sfx = soundKit(shell.sfx);
  const loops: Array<(t: number, dt: number) => void> = [];
  const disposers: Array<() => void> = [];
  let sceneTl: gsap.core.Timeline | null = null;
  let clueTl: gsap.core.Timeline | null = null;
  let raf = 0;
  let last = performance.now();
  let over = false;
  let leaving = false;
  let dimmed = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = sceneTl ? sceneTl.time() : 0;
    for (const f of loops) f(t, dt);
  };
  raf = requestAnimationFrame(tick);

  const dim = (on: boolean) => {
    if (o.mode !== 'opening' || dimmed === on) return;
    dimmed = on;
    shell.setDimmed(on);
  };

  function cleanup() {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    clueTl?.kill();
    sceneTl?.kill();
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* rien */
      }
    }
    window.removeEventListener('keydown', onKey, true);
    popLayer(abort);
    root.remove();
    document.body.classList.remove('myth-on');
    dim(false);
    resolve();
  }

  /** fin normale (ou toucher pour passer) : flash blanc, la 3D repart, le calque s'efface */
  async function leave() {
    if (leaving || over) return;
    leaving = true;
    clueTl?.pause();
    sceneTl?.pause();
    root.classList.add('leaving');
    gsap.killTweensOf(flash);
    gsap.to(flash, { opacity: 1, duration: 0.09, ease: 'power2.out' });
    dim(false);
    // deux images : la carte est redessinée sous le calque avant qu'il ne s'efface
    await nextFrame();
    await nextFrame();
    if (over) return;
    stage.style.visibility = 'hidden';
    clueBox.style.visibility = 'hidden';
    root.style.background = 'transparent';
    gsap.to(flash, { opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: cleanup });
  }

  function abort() {
    cleanup();
  }

  const skip = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    haptics.pulse(8);
    void leave();
  };
  root.addEventListener('pointerdown', skip);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' && e.key !== ' ' && e.key !== 'Enter') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    void leave();
  };
  window.addEventListener('keydown', onKey, true);
  pushLayer(abort);

  // ─────────────────────────────── 1. INDICES
  const sceneMod = o.reduced ? Promise.resolve(null) : o.scene().catch(() => null);
  clueTl = playClues(clueBox, o.clues, o.short, sfx, mobile);
  // le noir se pose, puis la 3D s'arrête dessous
  gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.14, ease: 'power1.out', onComplete: () => dim(true) });
  haptics.pulse([16, 40, 16]);

  void (async () => {
    await new Promise<void>((r) => clueTl!.eventCallback('onComplete', () => r()));
    if (over || leaving) return;
    // la scène n'est pas arrivée (réseau lent) : au plus 1,2 s d'attente, sinon la carte directement
    const mod = await Promise.race([sceneMod, new Promise<null>((r) => setTimeout(() => r(null), 1200))]);
    if (over || leaving) return;
    if (!mod) return void leave();
    const w = innerWidth;
    const h = innerHeight;
    const tl = (sceneTl = gsap.timeline({ paused: true }));
    stage.style.setProperty('--u', `${Math.min(w, h) / 100}px`);
    const ctx: SceneCtx = {
      root: stage,
      w,
      h,
      u: Math.min(w, h) / 100,
      card: o.card,
      short: o.short,
      mobile,
      tl,
      gsap,
      sfx,
      rand: seeded(o.card.id),
      el(tag, cls, css, parent) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (css) e.style.cssText = css;
        (parent ?? stage).append(e);
        return e;
      },
      svg(markup, cls, parent) {
        const t = document.createElement('template');
        t.innerHTML = markup.trim();
        const s = t.content.firstElementChild as SVGSVGElement;
        if (cls) s.setAttribute('class', cls);
        (parent ?? stage).append(s);
        return s;
      },
      canvas(parent) {
        const cv = document.createElement('canvas');
        cv.className = 'mp-cv';
        const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        (parent ?? stage).append(cv);
        const c = cv.getContext('2d')!;
        c.scale(dpr, dpr);
        const sc: SceneCanvas = { c, w, h, loop: (f) => loops.push(f) };
        return sc;
      },
      loop: (f) => loops.push(f),
      pin(e, xp = -50, yp = -50) {
        gsap.set(e, { xPercent: xp, yPercent: yp });
        return e;
      },
      flash(at, k = 1, dur = 0.45) {
        tl.fromTo(flash, { opacity: k }, { opacity: 0, duration: dur, ease: 'power2.out', immediateRender: false }, at);
      },
      shake(at, px = 10, dur = 0.35) {
        const n = 7;
        const sh = gsap.timeline();
        for (let i = 0; i < n; i++) {
          const k = 1 - i / n;
          sh.to(stage, { x: (Math.random() * 2 - 1) * px * k, y: (Math.random() * 2 - 1) * px * k, duration: dur / n, ease: 'none' });
        }
        sh.to(stage, { x: 0, y: 0, duration: 0.05 });
        tl.add(sh, at);
      },
      haptic(p) {
        haptics.pulse(p);
      },
      at(t, fn) {
        tl.call(fn, [], t);
      },
    };
    try {
      const r = mod.default(ctx);
      if (r && r.dispose) disposers.push(r.dispose);
    } catch (e) {
      console.error('[jeu] scène 6★ (construction)', e);
      return void leave();
    }
    if (over || leaving) return;
    tl.timeScale(o.short ? SHORT_SPEED : 1);
    tl.eventCallback('onComplete', () => void leave());
    stage.classList.add('in');
    tl.play(0);
  })();

  return { done, abort };
}

/**
 * Les INDICES : chacun claque au centre (pleine largeur, gras), puis rejoint le fil d'Ariane au-dessus ; le dernier
 * reste en grand jusqu'à la scène. Version courte : la famille seule, 0,55 s.
 */
function playClues(box: HTMLElement, clues: string[], short: boolean, sfx: ReturnType<typeof soundKit>, mobile: boolean): gsap.core.Timeline {
  const tl = gsap.timeline();
  const list = short ? clues.slice(1, 2).concat(clues.length > 1 ? [] : clues.slice(0, 1)) : clues.slice(0, 3);
  const stars = document.createElement('div');
  stars.className = 'mp-stars';
  stars.textContent = '★★★★★★';
  const crumb = document.createElement('div');
  crumb.className = 'mp-crumb';
  box.append(stars, crumb);
  tl.fromTo(stars, { opacity: 0, letterSpacing: '1.2em' }, { opacity: 1, letterSpacing: '0.5em', duration: 0.5, ease: 'power3.out' }, 0);
  const W = innerWidth;
  const step = short ? 0.55 : 0.5;
  list.forEach((txt, i) => {
    const big = i === list.length - 1;
    const el = document.createElement('div');
    el.className = `mp-clue c${i}${big ? ' last' : ''}`;
    el.textContent = txt;
    // taille au plus juste : le texte tient sur une ligne, 92 % de la largeur au plus
    const kChar = i === 0 ? 0.78 : 0.66;
    const max = i === 0 ? Math.min(W * 0.11, 72) : Math.min(W * 0.2, mobile ? 92 : 150);
    el.style.fontSize = `${Math.max(22, Math.min(max, (W * 0.92) / Math.max(4, txt.length * kChar)))}px`;
    box.append(el);
    const at = 0.12 + i * step;
    tl.fromTo(el, { opacity: 0, scale: 1.35, filter: 'blur(10px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.22, ease: 'power4.out' }, at);
    tl.call(() => {
      sfx.hit(0.32 + i * 0.08, 70 - i * 8);
      sfx.note(4 + i * 2, 0.07, 0.4);
      haptics.pulse(10 + i * 6);
    }, [], at);
    if (!big) {
      // rejoint le fil d'Ariane
      tl.to(el, { opacity: 0, scale: 0.86, y: -innerHeight * 0.06, duration: 0.2, ease: 'power2.in' }, at + step - 0.16);
      tl.call(() => {
        const s = document.createElement('span');
        s.textContent = txt;
        crumb.append(s);
        gsap.fromTo(s, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      }, [], at + step - 0.04);
    } else {
      tl.to(el, { scale: 1.04, duration: step + 0.25, ease: 'none' }, at + 0.22);
      // le dernier indice et le fil d'Ariane s'effacent quand la scène arrive
      tl.to([el, crumb, stars], { opacity: 0, duration: 0.22, ease: 'power2.in' }, at + step + 0.2);
    }
  });
  // reflet arc-en-ciel discret sous le dernier indice
  tl.set(box, { '--mp-rb': RAINBOW[Math.floor(Math.random() * RAINBOW.length)] }, 0);
  return tl;
}
