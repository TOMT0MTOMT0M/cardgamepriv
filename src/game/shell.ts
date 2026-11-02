import { Timer, type WebGPURenderer } from 'three/webgpu';
import GUI from 'lil-gui';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../core/Experiment';
import { Bag } from '../core/bag';
import { Input } from '../core/input';
import { Sfx } from '../core/audio';
import { applyRendererDefaults, backendName, createRenderer, isTouch, preferredBackend, preferredQuality, resolveDpr } from '../core/renderer';
import type { RarityId } from '../core/rarity';

/**
 * Hôte 3D du jeu : UN renderer WebGPU plein écran derrière l'interface, et des scènes (même contrat que les expériences
 * du labo) gardées en vie : la boutique et l'ouverture partagent leur scène (le booster affiché est celui qu'on ouvre),
 * la visionneuse de la collection reste prête, la scène secrète est préparée en fond quand un pack en contient une.
 * Une seule scène est rendue par frame ; les autres ne coûtent que leur mémoire.
 */
interface Mounted {
  exp: Experiment;
  ctx: LabContext;
  overlay: HTMLDivElement;
  ready: boolean;
}

export interface Shell {
  renderer: WebGPURenderer;
  input: Input;
  sfx: Sfx;
  quality: 'high' | 'mobile';
  /** Monte une scène (setup + compilation des shaders) sans l'afficher. */
  mount<T extends Experiment>(key: string, exp: T, rarity?: RarityId): Promise<T>;
  /** Affiche une scène montée (null = rien : le canvas reste figé sur la dernière image). */
  show(key: string | null): void;
  active(): string | null;
  unmount(key: string): void;
  has(key: string): boolean;
  /**
   * Gyroscope (inclinaison des cartes en penchant le téléphone). iPhone : Safari exige que l'autorisation soit demandée
   * PENDANT un clic, avant toute attente réseau → à appeler en première ligne d'un gestionnaire de clic.
   */
  requestGyro(): void;
  /** Atténue le canvas (pages DOM pleines : collection, échanges) et coupe le rendu pour économiser la batterie. */
  setDimmed(on: boolean): void;
}

export async function createShell(host: HTMLElement, overlayHost: HTMLElement): Promise<Shell> {
  const quality = preferredQuality();
  const mobile = quality === 'mobile';
  const renderer = await createRenderer(preferredBackend(), { mobile });
  const canvas = renderer.domElement;
  canvas.className = 'gl';
  host.append(canvas);
  const input = new Input(canvas);
  const sfx = new Sfx();
  const gui = new GUI({ autoPlace: false }); // les scènes du labo ajoutent leurs réglages : ici, jamais affichés
  gsap.ticker.lagSmoothing(0);
  const timer = new Timer();
  timer.connect(document);
  const scenes = new Map<string, Mounted>();
  let current: string | null = null;
  let dimmed = false;

  // son : activé au premier geste (le navigateur l'exige), coupé si le joueur l'a coupé
  let soundPref = true;
  try {
    soundPref = localStorage.getItem('bebou.sound') !== '0';
    const v = Number(localStorage.getItem('bebou.volume'));
    if (Number.isFinite(v) && localStorage.getItem('bebou.volume') !== null) sfx.setVolume(v);
  } catch {
    /* ignore */
  }
  const needsGyroPermission = () =>
    typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined)?.requestPermission === 'function';
  const unlock = () => {
    if (soundPref && !sfx.enabled) void sfx.enable();
    // Android & co : le gyroscope s'active sans autorisation, dès le premier toucher
    if (isTouch() && !needsGyroPermission() && !input.gyroEnabled) void input.enableGyro();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);

  const size = () => ({ w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) });
  /**
   * Résolution adaptative.
   * Ordinateur : si l'appareil peine (moins de ~40 images/s sur deux fenêtres de 3 s d'affilée), on baisse la
   * définition de la 3D par paliers de 0,25 (jamais sous 1). Rien ne remonte pendant la session : pas de yo-yo.
   * Téléphone : on part de ×2 (au lieu de ×1,5 → ×1, qui pixelisait tout sur les écrans ×3) et on ne descend jamais
   * sous ×1,25. Un téléphone en économie d'énergie (iPhone « mode économie », Android « économiseur ») bride
   * l'affichage à 30 images/s : ce n'est pas le GPU qui peine, on ne baisse donc rien dans ce cas (avant : la 3D
   * tombait à ×1 → image très pixelisée).
   */
  let dpr = mobile ? Math.min(window.devicePixelRatio || 1, 2) : resolveDpr('auto', quality);
  const minDpr = mobile ? Math.min(dpr, 1.25) : Math.min(dpr, 1);
  const WINDOW_MS = mobile ? 2500 : 3000;
  const SLOW_MS = mobile ? 22 : 25;
  let perf = { acc: 0, frames: 0, slow: 0, capped: 0, last: performance.now() };
  /**
   * Cadence de l'écran mesurée quand rien n'est rendu (chargement, pages DOM) : si le téléphone livre ~30 i/s même à
   * vide, c'est le système qui bride (économie d'énergie), pas la 3D.
   */
  const idle: number[] = [];
  let osCapped30 = false;
  const resetPerf = () => (perf = { acc: 0, frames: 0, slow: 0, capped: 0, last: performance.now() });
  function resize() {
    const { w, h } = size();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    for (const m of scenes.values()) {
      m.ctx.width = w;
      m.ctx.height = h;
      m.exp.resize?.(w, h);
    }
  }
  resize();
  window.addEventListener('resize', resize);

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 1 / 20);
    const t = timer.getElapsed();
    input.update(dt);
    const m = current ? scenes.get(current) : null;
    const now = performance.now();
    const real = now - perf.last;
    perf.last = now;
    if (!m?.ready || dimmed) {
      if (mobile && real < 250 && document.visibilityState === 'visible') {
        idle.push(real);
        if (idle.length > 30) idle.shift();
        // (régulier autour de 33 ms : un chargement qui rame donne des intervalles irréguliers, pas ce motif)
        if (idle.length >= 12) osCapped30 = idle.filter((x) => x > 30 && x < 37.5).length > idle.length * 0.7;
      }
      return;
    }
    if (real < 250 && document.visibilityState === 'visible') {
      perf.acc += real;
      perf.frames++;
      // image « bridée » à 30 i/s : intervalle régulier autour de 33 ms
      if (real > 30 && real < 37.5) perf.capped++;
      if (perf.acc > WINDOW_MS) {
        const avg = perf.acc / perf.frames;
        const throttled = mobile && osCapped30 && avg > 30 && avg < 36 && perf.capped > perf.frames * 0.8;
        perf.slow = avg > SLOW_MS && !throttled ? perf.slow + 1 : 0;
        perf.acc = perf.frames = perf.capped = 0;
        if (perf.slow >= 2 && dpr > minDpr + 0.01) {
          dpr = Math.max(minDpr, Math.round((dpr - 0.25) * 4) / 4);
          perf.slow = 0;
          resize();
          console.info(`[jeu] appareil un peu juste (${Math.round(1000 / avg)} i/s) : définition 3D ramenée à ×${dpr}`);
        }
      }
    }
    try {
      m.exp.update(dt, t);
    } catch (e) {
      console.error('[jeu] update', current, e);
      m.ready = false;
    }
  });

  const shell: Shell = {
    renderer,
    input,
    sfx,
    quality,
    async mount(key, exp, rarity = 'common') {
      if (scenes.has(key)) shell.unmount(key);
      const overlay = document.createElement('div');
      overlay.className = 'overlay scene-overlay';
      overlay.dataset.scene = key;
      overlay.hidden = true;
      overlayHost.append(overlay);
      const { w, h } = size();
      const ctx: LabContext = {
        renderer,
        canvas,
        gui: gui.addFolder(key),
        rarity,
        quality,
        input,
        bag: new Bag(),
        overlay,
        isWebGPU: backendName(renderer) === 'WebGPU',
        width: w,
        height: h,
        sfx,
      };
      const m: Mounted = { exp, ctx, overlay, ready: false };
      scenes.set(key, m);
      await exp.setup(ctx);
      m.ready = true;
      return exp;
    },
    show(key) {
      if (key === current) return;
      resetPerf(); // une nouvelle scène compile : on remesure
      if (current) scenes.get(current)!.overlay.hidden = true;
      canvas.style.cursor = ''; // chaque scène remet le sien
      current = key;
      if (key) {
        const m = scenes.get(key)!;
        m.overlay.hidden = false;
        applyRendererDefaults(renderer);
      }
    },
    active: () => current,
    unmount(key) {
      const m = scenes.get(key);
      if (!m) return;
      if (current === key) current = null;
      try {
        m.exp.dispose();
      } catch (e) {
        console.error('[jeu] dispose', key, e);
      }
      m.ctx.bag.disposeAll();
      m.ctx.gui.destroy();
      m.overlay.remove();
      scenes.delete(key);
    },
    has: (key) => scenes.has(key),
    requestGyro() {
      if (!isTouch() || input.gyroEnabled) return;
      void input.enableGyro(); // requestPermission() est appelé de façon synchrone au début : le clic compte encore
    },
    setDimmed(on) {
      dimmed = on;
      canvas.classList.toggle('dim', on);
      resetPerf();
    },
  };

  // sons : préférence mémorisée, bascule depuis l'en-tête
  (shell as Shell & { setVolume(v: number): void }).setVolume = (v: number) => {
    sfx.setVolume(v);
    try {
      localStorage.setItem('bebou.volume', String(sfx.volume));
    } catch {
      /* ignore */
    }
  };
  (shell as Shell & { setSound(on: boolean): void }).setSound = (on: boolean) => {
    soundPref = on;
    try {
      localStorage.setItem('bebou.sound', on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (on) void sfx.enable();
    else sfx.disable();
  };
  return shell;
}

/** Volume mémorisé (0..1). */
export const soundVolume = (): number => {
  try {
    const v = Number(localStorage.getItem('bebou.volume'));
    return localStorage.getItem('bebou.volume') !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  } catch {
    return 1;
  }
};

export const soundOn = (): boolean => {
  try {
    return localStorage.getItem('bebou.sound') !== '0';
  } catch {
    return true;
  }
};
