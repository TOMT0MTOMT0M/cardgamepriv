/**
 * MOTEUR des animations 6★ (chargé à la première 6★) : calque plein écran au-dessus de l'ouverture ou de la
 * visionneuse — 1) indices façon walkout, 2) scène de la famille (scenes/*.ts), 3) le calque se fond sur la carte.
 * Un toucher (ou Échap) passe tout. Pendant l'ouverture, le rendu 3D est mis en pause sous le calque (batterie) et
 * relancé juste avant le retour, pour que la carte soit déjà là quand le calque s'efface.
 *
 * (10/11) Le moteur ne dépend plus du jeu : il reçoit un « hôte » minimal (qualité, sons) — le jeu lui passe son
 * shell et sa pile de couches (retour du téléphone), le labo (045) seulement la qualité et les sons.
 */
import gsap from 'gsap';
import type { Sfx } from '../../core/audio';
import { haptics } from '../../core/haptics';
import { applyFontVars, displayCase } from '../../core/fonts';

/** (11/11) « VICTOIRE » → « Victoire » ; « League of Legends », « MCU » (sigle court) restent tels quels */
const sentenceIfCaps = (t: string) => (t.length > 3 && t === t.toLocaleUpperCase('fr') && t !== t.toLocaleLowerCase('fr') ? displayCase(t) : t);
import { DUR } from '../../core/motion';
import { ALU_BACK, paintBack } from '../../core/art/back';
import { BASE_H, BASE_W } from '../../core/art/subjects';
import { themeById } from '../../core/sets/themes';
import { soundKit } from './sounds';
import { ACCENTS, RAINBOW, actorWidth, seeded, type MythicCard, type SceneCanvas, type SceneCtx, type SceneFn } from './kit';
import './mythic.css';

/** ce que le moteur attend de celui qui l'héberge (le shell du jeu le remplit tel quel) */
export interface PreludeHost {
  quality: 'high' | 'mobile';
  sfx: Sfx;
  /** coupe le rendu 3D sous le calque (ouverture) */
  setDimmed?(on: boolean): void;
}

/** là où la vraie carte 3D attend sous le calque (pixels CSS de la page) : la doublure s'y pose avant de s'effacer */
export interface CardTarget {
  cx: number;
  cy: number;
  w: number;
}

export interface PreludeRun {
  host: PreludeHost;
  card: MythicCard;
  clues: string[];
  mode: 'opening' | 'viewer';
  short: boolean;
  reduced: boolean;
  scene: () => Promise<{ default: SceneFn }>;
  /** pile de couches du jeu (Échap / retour du téléphone ferme la scène, pas la page) */
  layers?: { push(close: () => void): void; pop(close: () => void): void };
  /** ouverture : place réelle de la carte 3D qui attend (lue à la fin de la scène) */
  target?: () => CardTarget | null;
  /** la scène démarre (labo : pilotage de la timeline, captures) */
  onScene?(tl: gsap.core.Timeline): void;
  /** labo : le calque ne couvre que cet élément (positionné) au lieu de tout l'écran */
  mount?: HTMLElement;
}

export interface PreludeHandle {
  /** résolu quand le calque a disparu (fin, toucher pour passer, ou abandon) */
  done: Promise<void>;
  /** résolu quand la carte doit être LÀ sous le calque : le fondu commence deux images plus tard */
  handoff: Promise<void>;
  abort(): void;
}

/** accélération de la version courte */
const SHORT_SPEED = 2.2;
/** avance (s, temps réel) des sons d'une scène sur leur image : voir `at` */
const AT_LEAD = 0.06;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function runPrelude(o: PreludeRun): PreludeHandle {
  const { host } = o;
  const mobile = host.quality === 'mobile';
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
  if (o.mount) root.classList.add('in-mount');
  applyFontVars(root); // (le labo n'a pas les variables de polices du jeu)
  (o.mount ?? document.body).append(root);
  document.body.classList.add('myth-on');
  /** taille du calque (px CSS) : l'écran, ou l'élément hôte du labo */
  const W = o.mount ? o.mount.clientWidth : innerWidth;
  const H = o.mount ? o.mount.clientHeight : innerHeight;

  // (son V2) les souffles suivent la vitesse réelle de la scène (version courte : timeline accélérée)
  const sfx = soundKit(host.sfx, () => sceneTl?.timeScale() ?? 1);
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
  let handed!: () => void;
  const handoff = new Promise<void>((r) => (handed = r));
  let cardEl: HTMLElement | null = null;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = sceneTl ? sceneTl.time() : 0;
    for (const f of loops) f(t, dt);
  };
  raf = requestAnimationFrame(tick);

  const dim = (on: boolean) => {
    // (10/11) visionneuse comprise : sous le calque opaque, la 3D ne tourne pas pour rien (définition ×3 sur téléphone)
    if (dimmed === on) return;
    dimmed = on;
    host.setDimmed?.(on);
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
    o.layers?.pop(abort);
    // (audit 12/11, E3-09) toiles vidées : détachées seulement, leur mémoire (≈ 3 Mo chacune) n'était rendue qu'au
    // ramasse-miettes, et iOS les compte dans son plafond jusque-là
    root.querySelectorAll<HTMLCanvasElement>('canvas.mp-cv').forEach((cv) => (cv.width = cv.height = 0));
    root.remove();
    document.body.classList.remove('myth-on');
    dim(false);
    handed();
    resolve();
  }

  /**
   * Fin normale : la scène s'est posée sur la carte (au centre) ; la 3D repart dessous et le calque se fond en 0,4 s
   * — pas de flash blanc. Toucher pour passer : fondu plus court.
   * Raccord (10/11, ouverture) : la carte 3D qui attend est plus grande que la doublure (×1,37 sur téléphone) ; la
   * doublure grandit d'abord jusqu'à elle (`target`), puis le calque se fond — plus de carte qui « saute » de taille.
   * (Visionneuse : c'est la carte 3D qui attend à la taille de la doublure, cf. game/mythicEncounter.ts.)
   */
  async function leave(quick = false) {
    if (leaving || over) return;
    leaving = true;
    clueTl?.pause();
    root.classList.add('leaving');
    dim(false);
    handed();
    await nextFrame();
    await nextFrame();
    if (over) return;
    sceneTl?.pause();
    // durées : jetons du système de motion (core/motion.ts) — fondu = « emphatique », toucher pour passer = « standard »
    const dur = (quick ? DUR.standard() : DUR.emphatique()) / 1000;
    const tg = !quick && cardEl && +gsap.getProperty(cardEl, 'opacity') > 0.5 ? (o.target?.() ?? null) : null;
    if (tg && cardEl) {
      const box = root.getBoundingClientRect();
      const w0 = cardEl.offsetWidth || 1;
      const to = { x: tg.cx - box.left - W / 2, y: tg.cy - box.top - H / 2, scale: tg.w / w0 };
      const far = Math.abs(to.scale - 1) > 0.03 || Math.hypot(to.x - +gsap.getProperty(cardEl, 'x'), to.y - +gsap.getProperty(cardEl, 'y')) > 3;
      if (far) {
        // 1) la doublure vient d'abord à la taille et à la place de la vraie carte (calque encore opaque)…
        await new Promise<void>((r) => gsap.to(cardEl, { ...to, rotation: 0, duration: DUR.standard() / 1000, ease: 'power2.inOut', overwrite: true, onComplete: r, onInterrupt: r }));
        if (over) return;
      }
    }
    // 2) … puis le calque se fond : les deux cartes sont superposées
    gsap.to(root, { opacity: 0, duration: dur, ease: 'power2.inOut', onComplete: cleanup });
  }

  function abort() {
    cleanup();
  }

  const skip = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    haptics.pulse(8);
    void leave(true);
  };
  root.addEventListener('pointerdown', skip);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' && e.key !== ' ' && e.key !== 'Enter') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    void leave(true);
  };
  window.addEventListener('keydown', onKey, true);
  o.layers?.push(abort);

  // ─────────────────────────────── 1. INDICES
  const sceneMod = o.reduced ? Promise.resolve(null) : o.scene().catch(() => null);
  clueTl = playClues(clueBox, o.clues, o.short, sfx, mobile, W, H);
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
    const w = W;
    const h = H;
    const tl = (sceneTl = gsap.timeline({ paused: true }));
    const u = Math.min(w, h) / 100;
    stage.style.setProperty('--u', `${u}px`);
    const cw = actorWidth(w, h);
    const grain = document.createElement('div');
    grain.className = 'mp-grain';
    const vig = document.createElement('div');
    vig.className = 'mp-vignette';
    let glinted = false;
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
        // (son V2) programmé AT_LEAD plus tôt sur l'horloge audio (Sfx.ahead) : le son sort du haut-parleur PILE sur
        // l'image, latence de sortie compensée (10–100 ms selon le téléphone), version courte comprise
        const p = Math.max(0, t - AT_LEAD * tl.timeScale());
        tl.call(() => host.sfx.ahead((t - p) / Math.max(0.2, tl.timeScale()), fn), [], p);
      },
      cw,
      accent: ACCENTS[o.card.family] ?? '#fff',
      actor() {
        if (cardEl) return cardEl;
        cardEl = document.createElement('div');
        cardEl.className = 'mp-card';
        cardEl.style.width = `${cw}px`;
        cardEl.append(paintCardBack(cw, o.card.theme, mobile));
        // reflet qui balaie la carte (k.glint) : découpé à la forme de la carte
        const clip = document.createElement('span');
        clip.append(document.createElement('i'));
        cardEl.append(clip);
        stage.append(cardEl);
        gsap.set(cardEl, { xPercent: -50, yPercent: -50 });
        return cardEl;
      },
      glint(at, dur = 0.55) {
        glinted = true;
        const g = ctx.actor().querySelector('i');
        if (g) tl.fromTo(g, { xPercent: -160, opacity: 1 }, { xPercent: 160, duration: dur, ease: 'power2.inOut', immediateRender: false }, at).set(g, { opacity: 0 }, at + dur);
      },
      fit(e, max = 0.92) {
        const sw = e.scrollWidth;
        if (sw > w * max) e.style.fontSize = `${(parseFloat(e.style.fontSize) || parseFloat(getComputedStyle(e).fontSize)) * ((w * max) / sw)}px`;
        return e;
      },
      word(txt, y, size = u * 12, cls = '') {
        const e = document.createElement('div');
        e.className = `mp-word ${cls}`;
        // (11/11) Bold Frame : casse naturelle ; un texte tout en capitales passe en casse de phrase (ses R se lisent A)
        e.textContent = sentenceIfCaps(txt);
        e.style.top = `${y}px`;
        e.style.fontSize = `${size}px`;
        stage.append(e);
        ctx.fit(e);
        gsap.set(e, { xPercent: -50, yPercent: -50 });
        return e;
      },
      label(txt, x, y, cls = '') {
        const e = document.createElement('div');
        e.className = `mp-label ${cls}`;
        e.textContent = txt;
        e.style.left = x;
        e.style.top = y;
        stage.append(e);
        return e;
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
    // signature commune : quand la carte s'est posée, un reflet la balaie juste avant le fondu (sauf si la scène a
    // déjà placé le sien)
    if (cardEl && !glinted && tl.duration() > 1.2) ctx.glint(tl.duration() - 0.6, 0.5);
    stage.append(vig, grain);
    // la carte toujours au-dessus du décor, sous le grain
    if (cardEl) stage.insertBefore(cardEl, vig);
    tl.timeScale(o.short ? SHORT_SPEED : 1);
    // (10/11) la 3D repart ≈ 0,5 s AVANT la fin (fondu du canvas = --dur-emphatique, + 0,1 s), encore cachée par le
    // calque : le canvas a fini son propre fondu
    // d'apparition (et ses premières images, plus lourdes) quand le calque commence à s'effacer — avant, les deux fondus
    // se croisaient et la carte passait par un creux de luminosité
    tl.call(() => dim(false), [], Math.max(0, tl.duration() - ((DUR.emphatique() + 100) / 1000) * tl.timeScale()));
    tl.eventCallback('onComplete', () => void leave());
    stage.classList.add('in');
    tl.play(0);
    o.onScene?.(tl);
  })();

  return { done, handoff, abort };
}

/**
 * Les INDICES : chacun claque au centre (pleine largeur, gras), puis rejoint le fil d'Ariane au-dessus ; le dernier
 * reste en grand jusqu'à la scène. Version courte : la famille seule, 0,55 s.
 */
function playClues(box: HTMLElement, clues: string[], short: boolean, sfx: ReturnType<typeof soundKit>, mobile: boolean, W: number, H: number): gsap.core.Timeline {
  const tl = gsap.timeline();
  const list = short ? clues.slice(1, 2).concat(clues.length > 1 ? [] : clues.slice(0, 1)) : clues.slice(0, 3);
  const stars = document.createElement('div');
  stars.className = 'mp-stars';
  stars.textContent = '★★★★★★';
  const crumb = document.createElement('div');
  crumb.className = 'mp-crumb';
  box.append(stars, crumb);
  tl.fromTo(stars, { opacity: 0, letterSpacing: '1.2em' }, { opacity: 1, letterSpacing: '0.5em', duration: 0.5, ease: 'power3.out' }, 0);
  const step = short ? 0.55 : 0.5;
  list.forEach((txt, i) => {
    const big = i === list.length - 1;
    const el = document.createElement('div');
    // un seul indice (version courte, visionneuse) = la famille : même traitement que le 2e indice
    const ci = list.length === 1 ? 1 : i;
    el.className = `mp-clue c${ci}${big ? ' last' : ''}`;
    // chaque police dans SA casse : thème en capitales espacées (Inter) ; famille (11/11 : Bold Frame grasse, plus
    // d'Atsuka Montreal) et détail en Bold Frame casse naturelle — ses capitales R / X se lisent A / H (« SPOAT »)
    el.textContent = ci === 0 ? txt.toUpperCase() : sentenceIfCaps(txt);
    // taille au plus juste : le texte tient sur une ligne, 92 % de la largeur au plus
    const kChar = ci === 0 ? 0.95 : 0.6;
    const max = ci === 0 ? Math.min(W * 0.085, 56) : Math.min(W * 0.2, mobile ? 92 : 150);
    const fs = Math.max(22, Math.min(max, (W * 0.92) / Math.max(4, txt.length * kChar)));
    el.style.fontSize = `${fs < 30 && txt.length > 16 ? Math.min(max, (W * 0.92) / 11) : fs}px`;
    if (fs < 30 && txt.length > 16) el.style.whiteSpace = 'normal';
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
      tl.to(el, { opacity: 0, scale: 0.86, y: -H * 0.06, duration: 0.2, ease: 'power2.in' }, at + step - 0.16);
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

/** alu neutre + 9 % de la teinte du thème (même calcul que les dos 3D, scenes/cardFace.ts) */
function tintAlu(hex: string): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p('#c6c9cf'), B = p(hex);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * 0.09).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * LE DOS DE LA DOUBLURE (10/11) : la vraie peinture du dos des cartes (core/art/back.ts — alu brossé vertical, deux
 * filets gravés, « B » usiné), à la taille affichée, puis assombrie comme l'éclairage de studio l'assombrit en 3D
 * (mesuré sur la visionneuse : ≈ ×0,78 en haut, ×0,63 en bas, teinte chaude). Avant, la doublure était un dégradé
 * anthracite : au raccord, la carte « changeait de matière ».
 */
function paintCardBack(cw: number, themeId: string, mobile: boolean): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, mobile ? 2 : 2.5);
  const s = Math.min(1, Math.max(0.25, (cw * dpr) / BASE_W));
  cv.width = Math.round(BASE_W * s);
  cv.height = Math.round(BASE_H * s);
  const mk = document.createElement('canvas');
  mk.width = cv.width;
  mk.height = cv.height;
  const g = cv.getContext('2d')!;
  const m = mk.getContext('2d')!;
  g.setTransform(s, 0, 0, s, 0, 0);
  m.setTransform(s, 0, 0, s, 0, 0);
  try {
    const accent = themeById(themeId)?.style.accent;
    paintBack(g, m, accent && /^#[0-9a-f]{6}$/i.test(accent) ? { ...ALU_BACK, ground: tintAlu(accent) } : ALU_BACK);
  } catch {
    g.fillStyle = ALU_BACK.ground;
    g.fillRect(0, 0, BASE_W, BASE_H);
  }
  mk.width = mk.height = 0;
  g.setTransform(s, 0, 0, s, 0, 0);
  g.globalCompositeOperation = 'multiply';
  const light = g.createLinearGradient(0, 0, 0, BASE_H);
  light.addColorStop(0, 'rgb(198,190,180)');
  light.addColorStop(0.5, 'rgb(186,176,167)');
  light.addColorStop(1, 'rgb(161,151,142)');
  g.fillStyle = light;
  g.fillRect(0, 0, BASE_W, BASE_H);
  g.globalCompositeOperation = 'source-over';
  return cv;
}
