import { Spring, clamp } from './ease';

type TapHandler = (x: number, y: number, e: PointerEvent) => void;
/** glissement horizontal rapide : -1 vers la gauche, 1 vers la droite (x, y : point de départ en NDC) */
type SwipeHandler = (dir: 1 | -1, x: number, y: number) => void;

/**
 * Entrées communes : tilt souris avec inertie (ressorts), drag/rotation avec élan
 * et retour aimanté vers la face la plus proche, gyroscope mobile (recentrage lent).
 *
 * Les expériences lisent `tiltX/tiltY` (−1..1), `yaw/pitch` (radians) ou `pose()`.
 */
export class Input {
  /** Pointeur en NDC (−1..1, y vers le haut) relatif au canvas. */
  ndcX = 0;
  ndcY = 0;
  inside = false;
  down = false;
  dragging = false;
  /** Delta de drag de la frame (px CSS). */
  dragDX = 0;
  dragDY = 0;
  /** Les expériences peuvent couper la rotation au drag pour gérer leur propre geste. */
  spinEnabled = true;
  /** Si faux, le tilt ne suit plus le pointeur (ex : pendant une cinématique). */
  tiltEnabled = true;

  readonly tiltXS = new Spring(0, 90, 11);
  readonly tiltYS = new Spring(0, 90, 11);
  readonly yawS = new Spring(0, 60, 9);
  readonly pitchS = new Spring(0, 60, 11);

  gyroEnabled = false;
  private gyroBase: { b: number; g: number } | null = null;
  private gyroTarget = { x: 0, y: 0 };
  private gyroAt = 0;

  private taps = new Set<TapHandler>();
  private swipes = new Set<SwipeHandler>();
  private downNdc = { x: 0, y: 0 };
  private downAt = { x: 0, y: 0, t: 0 };
  private last = { x: 0, y: 0 };
  private yawVel = 0;
  private pitchVel = 0;
  private yawFree = 0;
  private pitchFree = 0;
  private el: HTMLElement;
  private offs: Array<() => void> = [];

  constructor(el: HTMLElement) {
    this.el = el;
    const on = <K extends keyof HTMLElementEventMap>(t: K, h: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(t, h, o);
      this.offs.push(() => el.removeEventListener(t, h, o));
    };
    on('pointermove', (e) => this.move(e));
    on('pointerdown', (e) => {
      this.move(e);
      this.down = true;
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.downNdc = { x: this.ndcX, y: this.ndcY };
      this.last = { x: e.clientX, y: e.clientY };
      this.yawVel = 0;
      this.pitchVel = 0;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.down) return;
      this.down = false;
      const dx = e.clientX - this.downAt.x;
      const dy = e.clientY - this.downAt.y;
      const wasDrag = this.dragging;
      this.dragging = false;
      if (!wasDrag && Math.hypot(dx, dy) < 8 && performance.now() - this.downAt.t < 600) {
        this.taps.forEach((h) => h(this.ndcX, this.ndcY, e));
      } else if (wasDrag && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6 && performance.now() - this.downAt.t < 650) {
        // geste « carrousel » : un coup de doigt franc, surtout horizontal
        this.swipes.forEach((h) => h(dx > 0 ? 1 : -1, this.downNdc.x, this.downNdc.y));
      }
      if (e.pointerType !== 'mouse') this.inside = false;
    };
    on('pointerup', up);
    on('pointercancel', up);
    on('pointerleave', (e) => {
      if (!this.down && e.pointerType === 'mouse') this.inside = false;
    });
    const orient = (e: DeviceOrientationEvent) => this.orient(e);
    window.addEventListener('deviceorientation', orient);
    this.offs.push(() => window.removeEventListener('deviceorientation', orient));
  }

  private move(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    this.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.ndcY = -(((e.clientY - r.top) / r.height) * 2 - 1);
    this.inside = true;
    if (this.down) {
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      if (!this.dragging && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 8) this.dragging = true;
      if (this.dragging) {
        this.dragDX += dx;
        this.dragDY += dy;
      }
    }
  }

  private orient(e: DeviceOrientationEvent) {
    if (!this.gyroEnabled || e.beta == null || e.gamma == null) return;
    let b = e.beta;
    let g = e.gamma;
    const angle = (screen.orientation?.angle ?? 0) as number;
    if (angle === 90) [b, g] = [-g, b];
    else if (angle === 270 || angle === -90) [b, g] = [g, -b];
    if (!this.gyroBase) this.gyroBase = { b, g };
    // recentrage lent : la carte revient au neutre quand on tient le téléphone naturellement
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.gyroAt || now)) / 1000);
    this.gyroAt = now;
    const k = 1 - Math.exp(-0.35 * dt);
    this.gyroBase.b += (b - this.gyroBase.b) * k;
    this.gyroBase.g += (g - this.gyroBase.g) * k;
    this.gyroTarget.x = clamp((g - this.gyroBase.g) / 22, -1, 1);
    this.gyroTarget.y = clamp(-(b - this.gyroBase.b) / 22, -1, 1);
  }

  async enableGyro(): Promise<boolean> {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    try {
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return false;
      }
      this.gyroEnabled = true;
      this.gyroBase = null;
      return true;
    } catch {
      return false;
    }
  }

  onTap(h: TapHandler): () => void {
    this.taps.add(h);
    return () => this.taps.delete(h);
  }

  onSwipe(h: SwipeHandler): () => void {
    this.swipes.add(h);
    return () => this.swipes.delete(h);
  }

  /** À appeler une fois par frame par le shell. */
  update(dt: number) {
    // tilt
    let tx = 0;
    let ty = 0;
    if (this.tiltEnabled) {
      if (this.gyroEnabled && this.gyroBase) {
        tx = this.gyroTarget.x;
        ty = this.gyroTarget.y;
      } else if (this.inside && !this.dragging) {
        tx = clamp(this.ndcX * 1.15, -1, 1);
        ty = clamp(this.ndcY * 1.15, -1, 1);
      }
    }
    this.tiltXS.target = tx;
    this.tiltYS.target = ty;
    this.tiltXS.update(dt);
    this.tiltYS.update(dt);

    // drag spin avec élan, puis aimantation vers la face la plus proche
    if (this.spinEnabled) {
      if (this.dragging) {
        const w = this.el.clientWidth || 1;
        const dyaw = (this.dragDX / w) * Math.PI * 1.6;
        const dpitch = (this.dragDY / w) * Math.PI * 0.9;
        this.yawFree += dyaw;
        this.pitchFree = clamp(this.pitchFree + dpitch, -0.9, 0.9);
        const inv = 1 / Math.max(dt, 1 / 240);
        this.yawVel = this.yawVel * 0.6 + dyaw * inv * 0.4;
        this.pitchVel = this.pitchVel * 0.6 + dpitch * inv * 0.4;
        this.yawS.set(this.yawFree);
        this.pitchS.set(this.pitchFree);
      } else {
        // inertie libre puis ressort vers la face la plus proche
        this.yawFree += this.yawVel * dt;
        this.yawVel *= Math.exp(-3.2 * dt);
        this.pitchVel *= Math.exp(-6 * dt);
        if (Math.abs(this.yawVel) < 2.2) {
          const snap = Math.round(this.yawFree / Math.PI) * Math.PI;
          this.yawS.target = snap;
          this.yawS.value = this.yawFree;
          this.yawS.velocity = this.yawVel;
          this.yawS.update(dt);
          this.yawFree = this.yawS.value;
          this.yawVel = this.yawS.velocity;
        }
        this.pitchS.target = 0;
        this.pitchS.value = this.pitchFree;
        this.pitchS.velocity = this.pitchVel;
        this.pitchS.update(dt);
        this.pitchFree = this.pitchS.value;
        this.pitchVel = this.pitchS.velocity;
      }
    }
    this.dragDX = 0;
    this.dragDY = 0;
  }

  get tiltX() {
    return this.tiltXS.value;
  }
  get tiltY() {
    return this.tiltYS.value;
  }
  get yaw() {
    return this.yawFree;
  }
  get pitch() {
    return this.pitchFree;
  }

  /** Pose suggérée d'une carte : rotation X/Y (radians) combinant tilt et drag. */
  pose(maxTilt = 0.32): { x: number; y: number } {
    return {
      x: -this.tiltY * maxTilt + this.pitch,
      y: this.tiltX * maxTilt + this.yaw,
    };
  }

  /** Remise à zéro (changement d'expérience). */
  reset() {
    this.yawFree = this.pitchFree = this.yawVel = this.pitchVel = 0;
    this.yawS.set(0);
    this.pitchS.set(0);
    this.tiltXS.set(0);
    this.tiltYS.set(0);
    this.spinEnabled = true;
    this.tiltEnabled = true;
    this.taps.clear();
  }

  dispose() {
    this.offs.forEach((f) => f());
    this.taps.clear();
  }
}
