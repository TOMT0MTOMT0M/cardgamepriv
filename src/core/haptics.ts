/**
 * Retour haptique multi-plateforme.
 *  - Android / Chrome : `navigator.vibrate(pattern)`.
 *  - iPhone (Safari 17.4+ / iOS 18) : `navigator.vibrate` n'existe pas ; un interrupteur caché
 *    (`<input type="checkbox" switch>`) dont on « clique » le label déclenche le Taptic Engine. Une impulsion par clic :
 *    un motif [vibre, pause, vibre…] devient une suite de clics espacés. Contournement non officiel : s'il ne fait
 *    rien sur un appareil, c'est silencieux (aucune erreur).
 *  - Ailleurs : rien.
 */
/** réglage « Vibrations » (navigateur) : '0' = coupées ; absent = actives (audit UX2-14) */
const PREF = 'bebou.haptics';

class Haptics {
  private label: HTMLLabelElement | null = null;
  private timers: number[] = [];
  private on = (() => {
    try {
      return localStorage.getItem(PREF) !== '0';
    } catch {
      return true;
    }
  })();

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

  private iosNode(): HTMLLabelElement | null {
    if (this.label || typeof document === 'undefined') return this.label;
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
        navigator.vibrate(pattern);
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
    } catch {
      /* pas d'haptique */
    }
  }
}

export const haptics = new Haptics();
