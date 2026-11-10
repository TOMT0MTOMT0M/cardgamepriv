import { Timer, type WebGPURenderer } from 'three/webgpu';
import type GUI from 'lil-gui';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../core/Experiment';
import { Bag } from '../core/bag';
import { Input } from '../core/input';
import { Sfx } from '../core/audio';
import { applyRendererDefaults, backendName, createRenderer, isTouch, preferredBackend, preferredQuality, resolveDpr } from '../core/renderer';
import type { RarityId } from '../core/rarity';
import { configureArt } from '../core/art';
import { setFaceQuality } from './scenes/cardFace';
import { perfMark } from '../core/perfLog';

/**
 * Configuration du canvas WebGPU, gardée pour la RE-poser au retour d'une autre appli (shell.ts, reviveSurface) :
 * sur téléphone, le système peut reprendre la surface d'affichage pendant que l'appli est en arrière-plan sans que
 * le GPU soit « perdu » — la page reste vivante mais le canvas n'affiche plus rien tant qu'il n'est pas reconfiguré.
 */
const gpuCfg = new WeakMap<object, unknown>();
{
  const P = (globalThis as unknown as { GPUCanvasContext?: { prototype: { configure?: (c: unknown) => void; __bebouCfg?: boolean } } }).GPUCanvasContext?.prototype;
  if (P?.configure && !P.__bebouCfg) {
    const orig = P.configure;
    P.configure = function (this: object, c: unknown) {
      gpuCfg.set(this, c);
      return orig.call(this, c);
    };
    P.__bebouCfg = true;
  }
}
/**
 * ARRÊTS MÉMOIRE (iOS : la page est tuée puis rechargée par le système SANS aucun événement côté JavaScript).
 * Au démarrage, on note « page démarrée, pas encore quittée proprement » (`bebou.boot`, sessionStorage : survit au
 * rechargement automatique du même onglet) ; `pagehide` la marque « quittée proprement ». Une page retrouvée « pas
 * quittée proprement » moins de 2 min après son démarrage = un arrêt brutal (mémoire) : on le compte. Avec les
 * rechargements dus à une perte du GPU (`bebou.gpuReload`, souvent le même manque de mémoire), 2 rapprochés ou plus →
 * cette session-là démarre avec une définition 3D plus basse d'un palier (0,25) par rechargement de plus, au plus 2.
 * Un démarrage normal (aucun incident récent) ne change rien.
 */
const BOOT_KEY = 'bebou.boot';
const KILLS_KEY = 'bebou.memKills';
const CRASH_WINDOW_MS = 120_000;
export function bootPressure(store: Pick<Storage, 'getItem' | 'setItem'>, gpuReloads: number, now = Date.now()): { level: number; kills: number } {
  let kills: number[] = [];
  try {
    const prev = JSON.parse(store.getItem(BOOT_KEY) ?? 'null') as { t?: number; clean?: boolean } | null;
    const list = JSON.parse(store.getItem(KILLS_KEY) ?? '[]');
    kills = Array.isArray(list) ? list.filter((t): t is number => typeof t === 'number' && now - t < CRASH_WINDOW_MS) : [];
    if (prev && typeof prev.t === 'number' && prev.clean === false && now - prev.t < CRASH_WINDOW_MS) kills.push(now);
    store.setItem(KILLS_KEY, JSON.stringify(kills));
    store.setItem(BOOT_KEY, JSON.stringify({ t: now, clean: false }));
  } catch {
    /* stockage indisponible (navigation privée…) : démarrage normal */
  }
  return { level: Math.max(0, Math.min(2, kills.length + gpuReloads - 1)), kills: kills.length };
}
const RELOADS = 'bebou.gpuReload';
const recentReloads = (): number[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(RELOADS) ?? '[]');
    return Array.isArray(v) ? v.filter((t) => typeof t === 'number' && Date.now() - t < 120_000) : [];
  } catch {
    return [];
  }
};
/** `fn` dès que la page est visible (tout de suite si elle l'est déjà). */
function whenVisible(fn: () => void) {
  if (!document.hidden) return fn();
  const once = () => {
    if (document.hidden) return;
    document.removeEventListener('visibilitychange', once);
    fn();
  };
  document.addEventListener('visibilitychange', once);
}

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
  /** Démarrage prudent après des arrêts mémoire rapprochés : 0 = normal, 1-2 = paliers de définition 3D retirés pour cette session. */
  readonly safeLevel: number;
}

export async function createShell(host: HTMLElement, overlayHost: HTMLElement): Promise<Shell> {
  const quality = preferredQuality();
  const mobile = quality === 'mobile';
  /*
   * Mémoire des calques (iOS plafonne la mémoire TOTALE des canvas : au-delà, plus aucune carte ne se peint) :
   * aucune illustration préchargée au démarrage (chaque scène charge celles de SES cartes — plus de ~40 PNG ni de
   * photo de Bébou d'office), cache des illustrations borné en octets, sources plafonnées à la taille affichée.
   */
  configureArt({ preloadImages: false, imageBytes: mobile ? 40e6 : 160e6, maxImageSide: mobile ? 1024 : 1600, keepSilhouettes: !mobile });
  setFaceQuality(quality);
  // appli relancée en arrière-plan (rechargement après une veille, appli changée entre-temps) : on attend d'être
  // visible pour demander le GPU — un GPU obtenu en arrière-plan est souvent retiré aussitôt par le système
  if (document.hidden) await new Promise<void>((r) => whenVisible(r));
  // (avant la création du GPU : un arrêt pendant l'initialisation compte aussi)
  const safe = (() => {
    try {
      return bootPressure(sessionStorage, recentReloads().length);
    } catch {
      return { level: 0, kills: 0 };
    }
  })();
  const renderer = await createRenderer(preferredBackend(), { mobile });
  const canvas = renderer.domElement;
  canvas.className = 'gl';
  host.append(canvas);
  const input = new Input(canvas);
  const sfx = new Sfx();
  // les scènes du labo ajoutent leurs réglages (lil-gui) : dans le jeu, jamais affichés → un bouchon qui accepte tout
  // (chaînage .add().name().onChange()…) au lieu d'embarquer lil-gui et un panneau DOM caché par scène
  const gui = guiStub();
  gsap.ticker.lagSmoothing(0);
  const timer = new Timer();
  timer.connect(document);
  const scenes = new Map<string, Mounted>();
  let current: string | null = null;
  let dimmed = false;

  // son : actif par défaut, démarré au premier geste (le navigateur l'exige) ; coupé si le joueur l'a coupé (bouton 🔈,
  // mémorisé `bebou.sound` = '0'). Coupé ou onglet caché, le contexte audio est en veille (audio.ts) : 0 CPU audio.
  let soundPref = true;
  try {
    soundPref = soundOn();
    const v = Number(localStorage.getItem('bebou.volume'));
    if (Number.isFinite(v) && localStorage.getItem('bebou.volume') !== null) sfx.setVolume(v);
  } catch {
    /* ignore */
  }
  const needsGyroPermission = () =>
    typeof (window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined)?.requestPermission === 'function';
  /*
   * (Firefox Android, 4 nov. : aucun son) un toucher ne compte comme « activation » qu'à sa FIN (pointerup / touchend),
   * pas au pointerdown — Chrome est plus tolérant. On écoute donc tous les gestes, et on ne se retire qu'une fois le
   * contexte audio réellement démarré.
   */
  const UNLOCK = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
  const unlock = () => {
    if (soundPref) {
      if (!sfx.enabled) void sfx.enable();
      else sfx.unblock();
    }
    // Android & co : le gyroscope s'active sans autorisation, dès le premier toucher
    if (isTouch() && !needsGyroPermission() && !input.gyroEnabled) void input.enableGyro();
    if (!soundPref || (sfx.enabled && !sfx.blocked)) UNLOCK.forEach((ev) => window.removeEventListener(ev, unlock, true));
  };
  UNLOCK.forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  // son réactivé plus tard, contexte bloqué entre-temps (veille du navigateur…) : chaque geste le relance
  for (const ev of ['pointerup', 'touchend', 'click'] as const) window.addEventListener(ev, () => sfx.blocked && sfx.unblock(), { capture: true, passive: true });

  const size = () => ({ w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) });
  /**
   * Résolution adaptative.
   * Ordinateur : si l'appareil peine (moins de ~40 images/s sur deux fenêtres de 3 s d'affilée), on baisse la
   * définition de la 3D par paliers de 0,25 (jamais sous 1). Rien ne remonte pendant la session : pas de yo-yo.
   * Téléphone : on part de ×2 (au lieu de ×1,5 → ×1, qui pixelisait tout sur les écrans ×3) et on ne descend jamais
   * sous ×1,25. Un téléphone en économie d'énergie (iPhone « mode économie », Android « économiseur ») bride
   * l'affichage à 30 images/s : ce n'est pas le GPU qui peine, on ne baisse donc rien dans ce cas (avant : la 3D
   * tombait à ×1 → image très pixelisée).
   * (audit 06/11) Le plafond dépend de la SCÈNE (`Experiment.dprCap`) : la visionneuse (une carte, scène légère)
   * demande la définition native de l'écran (×3 sur iPhone — le canvas rendu à ×2 était étiré ×1,5 par le navigateur :
   * bords, texte et foil lissés) ; l'ouverture reste à ×2. Les paliers perdus quand l'appareil peine (`slowSteps`)
   * suivent d'une scène à l'autre.
   * (V2 fluidité 2) Un changement de palier n'est plus appliqué sur-le-champ : `resize()` réalloue toutes les cibles de
   * rendu (à-coup + saut de netteté) — il attend un moment calme de la scène (`Experiment.pacing()` = 'rest' : vitrine,
   * fin d'ouverture, visionneuse au repos), au plus 60 s ; les fenêtres de mesure ne comptent pas pendant la
   * préparation d'un booster (peinture CPU des calques : ce n'est pas le GPU qui rame).
   */
  const nativeDpr = mobile ? Math.min(window.devicePixelRatio || 1, 3) : resolveDpr('auto', quality);
  const capFor = (key: string | null) => {
    const cap = key ? (scenes.get(key)?.exp as Experiment | undefined)?.dprCap : undefined;
    return Math.min(nativeDpr, cap ?? (mobile ? 2 : nativeDpr));
  };
  let maxDpr = Math.min(nativeDpr, mobile ? 2 : nativeDpr);
  /**
   * Arrêts mémoire rapprochés (voir bootPressure) : cette session démarre `safe.level` paliers plus bas, et la
   * définition ne remonte pas au-dessus — ce qui a tué la page ne doit pas revenir tout de suite.
   */
  /** paliers de 0,25 retirés par l'adaptatif (0 = plein) */
  let slowSteps = safe.level;
  const minDpr = mobile ? Math.min(nativeDpr, 1.25) : Math.min(nativeDpr, 1);
  const applyDpr = () => Math.max(minDpr, Math.round((maxDpr - slowSteps * 0.25) * 4) / 4);
  let dpr = applyDpr();
  if (safe.level > 0) {
    console.warn(`[jeu] démarrage prudent (niveau ${safe.level}) : ${safe.kills} arrêt(s) brutal(aux) + ${recentReloads().length} perte(s) du GPU récents → définition 3D ×${dpr} pour cette session`);
    perfMark(`démarrage-prudent-${safe.level}-k${safe.kills}-g${recentReloads().length}`);
  }
  // quittée proprement (rechargement, fermeture) : le prochain démarrage n'y verra pas un arrêt brutal ; page revenue du
  // cache de navigation : de nouveau « en cours »
  const bootMark = (clean: boolean) => {
    try {
      sessionStorage.setItem('bebou.boot', JSON.stringify({ t: Date.now(), clean }));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('pagehide', () => bootMark(true));
  window.addEventListener('pageshow', (e) => e.persisted && bootMark(false));
  /** fenêtres consécutives bien en dessous du budget : la définition REMONTE (avant : une seule baisse — pendant
   *  une ouverture chargée, par exemple — laissait tout le reste de la session flou) */
  let fast = 0;
  const WINDOW_MS = mobile ? 2500 : 3000;
  const SLOW_MS = mobile ? 22 : 25;
  let perf = { acc: 0, frames: 0, slow: 0, capped: 0, over: 0, last: performance.now() };
  // (V2 fluidité, lot 3) « ça respire » = la scène tient la cadence de l'écran. L'ancien seuil (15 ms) était sous
  // l'intervalle d'un écran 60 Hz (16,7 ms) : la définition ne remontait jamais. Maintenant : moyenne à la cadence
  // (≤ 17,6 ms) ET moins de 5 % d'images en retard, sur 3 fenêtres ; et si une remontée est suivie d'une rechute
  // dans les 5 min, on ne retente plus pendant 10 min (pas de yo-yo, chaque changement réalloue les cibles de rendu).
  // Les fenêtres d'une scène ne comptent pas pour la suivante (resetPerf).
  const FAST_MS = 17.6;
  let raisedAt = -1e9;
  let noRaiseUntil = 0;
  /**
   * Cadence de l'écran mesurée quand rien n'est rendu (chargement, pages DOM) : si le téléphone livre ~30 i/s même à
   * vide, c'est le système qui bride (économie d'énergie), pas la 3D.
   */
  const idle: number[] = [];
  let osCapped30 = false;
  const resetPerf = () => ((fast = 0), (perf = { acc: 0, frames: 0, slow: 0, capped: 0, over: 0, last: performance.now() }));
  /** instant où un changement de palier est en attente d'un moment calme */
  let pendingSince = 0;
  /** applique le palier voulu (`applyDpr`) s'il diffère de la définition courante */
  const flushDpr = (now: number) => {
    const want = applyDpr();
    if (Math.abs(want - dpr) < 0.01) return;
    const up = want > dpr;
    if (up) raisedAt = now;
    dpr = want;
    resize();
    resetPerf(); // la nouvelle définition se mesure à neuf
    console.info(`[jeu] définition 3D ${up ? 'remontée' : 'ramenée'} à ×${dpr} (moment calme)`);
  };
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

  /**
   * RETOUR DE VEILLE / CHANGEMENT D'APPLI (retours de Tom, 4 nov.) — l'appli est installée sur l'écran d'accueil : pas
   * de bouton « recharger », tout doit revenir tout seul. Trois cas :
   * 1. le GPU est perdu (WebGPU « device lost », WebGL « context lost ») : three.js ne sait pas tout reconstruire → on
   *    recharge la page, mais SEULEMENT une fois l'appli de nouveau au premier plan (avant : le rechargement pouvait
   *    partir pendant la mise en arrière-plan, la nouvelle page perdait son GPU à son tour → message « recharge la page »
   *    impossible à suivre dans une appli installée) ;
   * 2. le GPU est là mais la surface d'affichage a été reprise : on reconfigure le canvas au retour, puis on vérifie la
   *    première image (erreurs GPU) et que le GPU répond — sinon, rechargement ;
   * 3. les images ne repartent pas (navigateur qui oublie de relancer la boucle) : on la relance, puis on recharge.
   * Garde-fou : au plus 2 rechargements automatiques en 2 min ; au-delà, un bouton « Relancer » (pas de boucle).
   */
  const isWebGPU = backendName(renderer) === 'WebGPU';
  const gpu = renderer.backend as unknown as { device?: GPUDevice; gl?: WebGL2RenderingContext };
  let gpuLost = false;
  const showRelaunch = () => {
    if (document.querySelector('.gpu-lost-box')) return;
    document.body.classList.add('gpu-lost');
    const box = document.createElement('div');
    box.className = 'gpu-lost-box';
    box.setAttribute('role', 'alertdialog');
    box.innerHTML = '<p>La 3D s’est arrêtée pendant que l’appli était en arrière-plan.</p><button class="btn-primary">Relancer</button>';
    box.querySelector('button')!.addEventListener('click', () => {
      try {
        sessionStorage.removeItem(RELOADS);
      } catch {
        /* ignore */
      }
      location.reload();
    });
    document.body.append(box);
  };
  const recoverGpu = (why: string) => {
    if (gpuLost) return;
    gpuLost = true;
    console.warn(`[jeu] 3D perdue (${why}) : rechargement au retour au premier plan`);
    const go = () =>
      // (un court délai : au déverrouillage, la page repasse « visible » un instant avant d'avoir vraiment l'écran)
      setTimeout(() => {
        if (document.hidden) return whenVisible(go);
        const hist = recentReloads();
        if (hist.length >= 2) return showRelaunch();
        try {
          sessionStorage.setItem(RELOADS, JSON.stringify([...hist, Date.now()]));
        } catch {
          /* ignore */
        }
        location.reload();
      }, 350);
    whenVisible(go);
  };
  (renderer as unknown as { onDeviceLost: (info: { message?: string }) => void }).onDeviceLost = (info) => recoverGpu(info?.message || 'device lost');
  gpu.device?.lost.then((info) => info.reason !== 'destroyed' && recoverGpu(info.message || 'device lost'));
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    recoverGpu('webgl context lost');
  });

  /** une image rendue depuis le retour ? (cas 3) */
  let lastFrame = 0;
  /** la prochaine image rendue est surveillée (erreurs GPU) */
  let probe = false;
  let wakeT = 0;
  const reviveSurface = () => {
    if (gpuLost) return;
    if (isWebGPU) {
      const ctx = canvas.getContext('webgpu') as (GPUCanvasContext & object) | null;
      const cfg = ctx && gpuCfg.get(ctx);
      if (ctx && cfg) {
        try {
          ctx.configure(cfg as GPUCanvasConfiguration);
        } catch (e) {
          return recoverGpu(`canvas : ${(e as Error)?.message ?? e}`);
        }
      }
      probe = true;
      // le GPU doit répondre (une file bloquée ne rend plus rien, sans erreur)
      const q = gpu.device?.queue;
      if (q) {
        let answered = false;
        q.onSubmittedWorkDone().then(() => (answered = true), () => {});
        setTimeout(() => !answered && !document.hidden && recoverGpu('le GPU ne répond plus'), 4000);
      }
    } else if (gpu.gl?.isContextLost()) recoverGpu('webgl perdu');
    // la boucle d'images doit repartir
    const since = performance.now();
    clearTimeout(wakeT);
    wakeT = window.setTimeout(() => {
      // (boucle à la demande : sans scène affichée, ne pas avoir d'images est normal)
      if (document.hidden || gpuLost || lastFrame >= since || !needFrames()) return;
      console.warn('[jeu] plus d’images depuis le retour : boucle relancée');
      stopLoop();
      startLoop();
      wakeT = window.setTimeout(() => !document.hidden && lastFrame < since && recoverGpu('plus aucune image'), 2500);
    }, 1500);
  };
  // retour sur l'appli : surface reconfigurée, tailles et mesures de cadence repartent de zéro (une veille fausse la
  // mesure des images/s) ; les dimensions de l'écran se stabilisent un peu après le retour (appli installée) → 2 rappels
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      clearTimeout(wakeT);
      stopLoop();
      return;
    }
    resetPerf();
    resize();
    reconcileLoop();
    if (hiddenAt && performance.now() - hiddenAt > 400) reviveSurface();
    hiddenAt = 0;
    setTimeout(resize, 150);
    setTimeout(resize, 700);
  });
  // retour depuis le cache de navigation (page figée puis restaurée telle quelle)
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    resize();
    reconcileLoop();
    reviveSurface();
  });

  /**
   * BOUCLE À LA DEMANDE (V2 fluidité 2) : elle ne tourne que si une scène est affichée et le canvas non atténué. Sur
   * une page DOM (collection, échanges…), onglet caché ou avant la première scène, elle s'arrête vraiment (plus de
   * rappel d'animation, plus de timer/input à vide). Téléphone : elle tourne d'abord ~30 images à vide pour mesurer la
   * cadence de l'écran (`osCapped30`, mode économie d'énergie), puis s'arrête ; chaque retour sur une page DOM refait
   * ce court sondage. Le flottement du booster / de la carte n'est PAS touché : tant qu'une scène est affichée, la
   * boucle tourne comme avant.
   */
  let running = false;
  let loopSince = 0;
  let idleN = 0;
  /** scènes en cours de montage : leurs images d'échauffement ne dépendent pas de la boucle, on ne la coupe pas */
  let mounting = 0;
  const animation = () => (renderer as unknown as { _animation?: { stop?: () => void } })._animation;
  /** three r187 : `setAnimationLoop(null)` laisse tourner le requestAnimationFrame interne (rappel à vide, 60/s), et tout
   *  `renderer.render()` le relance → on l'arrête explicitement (détection : absent = on garde l'ancien comportement) */
  const parkRaf = () => {
    try {
      animation()?.stop?.();
    } catch {
      /* ignore */
    }
  };
  const startLoop = () => {
    if (running) return;
    running = true;
    loopSince = performance.now();
    idleN = 0;
    perf.last = loopSince; // (le premier intervalle après un arrêt n'est pas une mesure)
    void renderer.setAnimationLoop(loop);
  };
  const stopLoop = () => {
    running = false;
    void renderer.setAnimationLoop(null);
    parkRaf();
  };
  /** une scène doit-elle produire des images ? */
  const needFrames = () => !!current && !dimmed;
  const reconcileLoop = () => {
    if (document.hidden) return;
    if (needFrames() || mobile) startLoop(); // téléphone sans scène : sondage de cadence, puis la boucle s'arrête seule
    else if (!mounting) stopLoop();
    else if (!running) parkRaf();
  };
  let updErrors = 0;
  const loop = () => {
    if (document.hidden) return stopLoop(); // onglet caché : rien (certains navigateurs servent encore quelques images)
    lastFrame = performance.now();
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
        idleN++;
        if (idle.length >= 12) osCapped30 = idle.filter((x) => x > 30 && x < 37.5).length > idle.length * 0.7;
      }
      // rien à rendre (page DOM / aucune scène) : cadence mesurée (téléphone) ou tout de suite (ordinateur) → la boucle s'arrête
      if ((!m || dimmed) && !mounting && (!mobile || idleN >= 30 || now - loopSince > 4000)) stopLoop();
      return;
    }
    const pace = m.exp.pacing?.() ?? 'rest';
    // un changement de définition en attente part dès que la scène est au calme (au plus 60 s d'attente)
    if (Math.abs(applyDpr() - dpr) > 0.01 && (pace === 'rest' || now - pendingSince > 60_000)) flushDpr(now);
    // préparation d'un booster (peinture CPU des calques) : images lentes qui ne disent rien du GPU → fenêtre non comptée
    if (pace === 'prepare') perf.acc = perf.frames = perf.capped = perf.over = 0;
    else if (real < 250 && document.visibilityState === 'visible') {
      perf.acc += real;
      perf.frames++;
      // image « bridée » à 30 i/s : intervalle régulier autour de 33 ms
      if (real > 30 && real < 37.5) perf.capped++;
      if (real > SLOW_MS) perf.over++;
      if (perf.acc > WINDOW_MS) {
        const avg = perf.acc / perf.frames;
        const throttled = mobile && osCapped30 && avg > 30 && avg < 36 && perf.capped > perf.frames * 0.8;
        perf.slow = avg > SLOW_MS && !throttled ? perf.slow + 1 : 0;
        const late = perf.over / perf.frames;
        perf.acc = perf.frames = perf.capped = perf.over = 0;
        fast = avg < FAST_MS && late < 0.05 && !throttled ? fast + 1 : 0;
        if (Math.abs(applyDpr() - dpr) > 0.01) {
          // un changement attend déjà son moment calme : pas de décision de plus tant qu'il n'est pas appliqué
          perf.slow = 0;
          fast = 0;
        } else if (perf.slow >= 2 && dpr > minDpr + 0.01) {
          slowSteps++;
          perf.slow = 0;
          fast = 0;
          pendingSince = now;
          if (now - raisedAt < 300_000) noRaiseUntil = now + 600_000;
          console.info(`[jeu] appareil un peu juste (${Math.round(1000 / avg)} i/s) : définition 3D à ×${applyDpr()} au prochain moment calme`);
        } else if (fast >= 3 && slowSteps > safe.level && now > noRaiseUntil) {
          slowSteps--;
          fast = 0;
          pendingSince = now;
          console.info(`[jeu] ça respire (${Math.round(1000 / avg)} i/s) : définition 3D à ×${applyDpr()} au prochain moment calme`);
        }
      }
    }
    // première image après un retour : on écoute les erreurs du GPU (surface perdue, mémoire, erreur interne)
    const dev = probe && isWebGPU ? gpu.device : undefined;
    if (dev) {
      probe = false;
      dev.pushErrorScope('validation');
      dev.pushErrorScope('out-of-memory');
      dev.pushErrorScope('internal');
    }
    try {
      m.exp.update(dt, t);
      updErrors = 0;
    } catch (e) {
      console.error('[jeu] update', current, e);
      // (avant : la scène s'arrêtait pour de bon à la 1re erreur — après une veille, le booster ne revenait jamais)
      if (++updErrors >= 3) {
        m.ready = false;
        recoverGpu('erreurs de rendu répétées');
      }
    }
    if (dev)
      void Promise.all([dev.popErrorScope(), dev.popErrorScope(), dev.popErrorScope()]).then(
        (errs) => {
          const err = errs.find(Boolean);
          if (err) recoverGpu(`après le retour : ${err.message}`);
        },
        () => {},
      );
  };
  startLoop();

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
      mounting++;
      try {
        await exp.setup(ctx);
      } finally {
        mounting--;
        // (l'échauffement des shaders appelle renderer.render(), qui relance le rappel interne de three)
        if (!running) parkRaf();
      }
      m.ready = true;
      return exp;
    },
    show(key) {
      if (key === current) return;
      resetPerf(); // une nouvelle scène compile : on remesure
      if (current) {
        const prev = scenes.get(current)!;
        prev.overlay.hidden = true;
        // téléphone : la scène quittée rend ses cibles plein écran (recréées à son prochain affichage, mêmes formats
        // → mêmes pipelines) — sinon chaque scène déjà vue garde ~100 Mo de GPU
        if (mobile) {
          try {
            (prev.exp as Experiment & { suspend?(): void }).suspend?.();
          } catch (e) {
            console.warn('[jeu] suspend', current, e);
          }
        }
      }
      canvas.style.cursor = ''; // chaque scène remet le sien
      current = key;
      if (key) {
        const m = scenes.get(key)!;
        m.overlay.hidden = false;
        applyRendererDefaults(renderer);
      }
      // définition propre à la scène (visionneuse : native ; ouverture : ×2) — appliquée avant sa première image
      maxDpr = capFor(key);
      const want = applyDpr();
      if (Math.abs(want - dpr) > 0.01) {
        dpr = want;
        resize();
      }
      reconcileLoop();
    },
    active: () => current,
    unmount(key) {
      const m = scenes.get(key);
      if (!m) return;
      if (current === key) {
        current = null;
        reconcileLoop();
      }
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
      reconcileLoop();
    },
    safeLevel: safe.level,
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

/** Son activé ? Oui, sauf si le joueur l'a coupé lui-même (`bebou.sound` = '0'). */
export const soundOn = (): boolean => {
  try {
    return localStorage.getItem('bebou.sound') !== '0';
  } catch {
    return true;
  }
};

/** Remplaçant de lil-gui : toute propriété est une fonction qui renvoie le bouchon (chaînage illimité). */
function guiStub(): GUI {
  const stub: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub),
    apply: () => stub,
    set: () => true,
  });
  return stub as GUI;
}
