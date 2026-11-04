/**
 * Retour haptique multi-plateforme — et POURQUOI « ça ne vibre pas » (diagnostic du 4 nov.) :
 *  - Android / Chrome : `navigator.vibrate(pattern)`. Conditions : la page a reçu AU MOINS UN toucher (activation
 *    utilisateur « collante », sinon l'appel est ignoré en silence), l'onglet est visible, et on n'est pas dans un
 *    navigateur intégré (Discord, Instagram…) qui bloque l'API. Les vibrateurs ignorent souvent les impulsions < ~10 ms :
 *    chaque segment « vibre » est ramené à 12 ms minimum.
 *  - iPhone : `navigator.vibrate` n'existe pas. Le seul détour (Safari 17.4+) : un interrupteur caché
 *    (`<input type="checkbox" switch>`) dont le label, cliqué, fait battre le Taptic Engine — mais UNIQUEMENT pendant un
 *    geste de l'utilisateur. Un `pulse()` appelé plus tard (fin d'une animation, impact d'une carte) ne fait donc RIEN
 *    sur iPhone : seules les vibrations déclenchées dans le gestionnaire du toucher lui-même passent. D'où `gesture()`
 *    (le shell marque chaque toucher) et le repli : un `pulse()` hors geste est gardé 400 ms et joué au prochain toucher
 *    s'il en arrive un (sinon oublié). Les motifs deviennent une suite de clics espacés.
 *  - Ailleurs (ordinateur, Firefox iOS…) : rien.
 * `support` dit ce que l'appareil peut faire, pour l'afficher dans le réglage « Vibrations ».
 */
/** réglage « Vibrations » (navigateur) : '0' = coupées ; absent = actives (audit UX2-14) */
const PREF = 'bebou.haptics';

export type HapticSupport = 'vibrate' | 'ios' | 'none';

class Haptics {
  private label: HTMLLabelElement | null = null;
  private timers: number[] = [];
  /** iPhone : vrai pendant le gestionnaire d'un geste (le shell appelle `gesture()`) */
  private inGesture = false;
  /** iPhone : impulsion demandée hors geste, à rejouer si un toucher arrive dans les 400 ms */
  private pending: { pattern: number | number[]; at: number } | null = null;
  /** dernier appel ignoré, pour le diagnostic (`why`) */
  why = '';
  private on = (() => {
    try {
      return localStorage.getItem(PREF) !== '0';
    } catch {
      return true;
    }
  })();

  /** ce que l'appareil sait faire */
  get support(): HapticSupport {
    if (typeof navigator === 'undefined') return 'none';
    if (typeof navigator.vibrate === 'function') return 'vibrate';
    const ua = navigator.userAgent;
    const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && typeof document !== 'undefined' && 'ontouchstart' in document.documentElement ? 'ios' : 'none';
  }

  /** vibrations actives ? (indépendant du son : on peut jouer en silence complet) */
  get enabled(): boolean {
    return this.on;
  }
  set enabled(v: boolean) {
    this.on = v;
    if (!v) {
      this.timers.forEach((id) => clearTimeout(id));
      this.timers = [];
    }
    try {
      localStorage.setItem(PREF, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /**
   * À appeler de façon SYNCHRONE dans le gestionnaire d'un toucher (pointerdown / pointerup / click) : ouvre la fenêtre
   * pendant laquelle l'iPhone accepte une vibration, et rejoue une impulsion demandée juste avant hors geste.
   */
  gesture() {
    this.inGesture = true;
    const p = this.pending;
    this.pending = null;
    if (p && performance.now() - p.at < 400) this.pulse(p.pattern);
    queueMicrotask(() => (this.inGesture = false));
  }

  private iosNode(): HTMLLabelElement | null {
    if (this.label || typeof document === 'undefined' || !document.body) return this.label;
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;top:-99px;left:-99px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.id = 'bebou-haptic-switch';
    inp.tabIndex = -1;
    inp.setAttribute('switch', '');
    const lbl = document.createElement('label');
    lbl.htmlFor = inp.id;
    wrap.append(inp, lbl);
    document.body.append(wrap);
    this.label = lbl;
    return lbl;
  }

  /** `pattern` : durée (ms) ou motif [vibre, pause, vibre, …] comme navigator.vibrate. */
  pulse(pattern: number | number[] = 25) {
    if (!this.on) return;
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          this.why = 'onglet caché';
          return;
        }
        // segments « vibre » ≥ 12 ms (sous ~10 ms, beaucoup de vibrateurs ne font rien)
        const steps = (typeof pattern === 'number' ? [pattern] : pattern).map((v, i) => (i % 2 === 0 ? Math.max(12, v) : v));
        // (Firefox Android exige un geste EN COURS) refusée hors geste : rejouée au prochain toucher s'il arrive vite,
        // comme sur iPhone — jamais en boucle (gesture() appelle pulse() avec inGesture vrai)
        const okv = navigator.vibrate(steps);
        if (!okv && !this.inGesture) this.pending = { pattern, at: performance.now() };
        this.why = okv ? '' : 'refusée (geste requis par le navigateur, ou navigateur intégré)';
        return;
      }
      if (this.support !== 'ios') {
        this.why = 'appareil sans vibreur accessible';
        return;
      }
      if (!this.inGesture) {
        // iPhone hors geste : on retient l'impulsion ; un toucher dans les 400 ms la jouera
        this.pending = { pattern, at: performance.now() };
        this.why = 'iPhone : seulement pendant un toucher';
        return;
      }
      const lbl = this.iosNode();
      if (!lbl) return;
      const steps = typeof pattern === 'number' ? [pattern] : pattern;
      let t = 0;
      for (let i = 0; i < steps.length; i += 2) {
        const at = t;
        if (at === 0) lbl.click();
        else this.timers.push(window.setTimeout(() => lbl.click(), at));
        t += steps[i] + (steps[i + 1] ?? 0);
      }
      this.why = '';
    } catch {
      this.why = 'erreur';
    }
  }
}

export const haptics = new Haptics();

/** Le jeu l'appelle une fois : chaque toucher ouvre la fenêtre iPhone (`gesture()`), au plus tôt (phase de capture). */
export function bindHapticGestures(): void {
  if (typeof document === 'undefined') return;
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click'] as const) document.addEventListener(ev, () => haptics.gesture(), { capture: true, passive: true });
}
