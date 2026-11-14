/**
 * TRANSITION DE COMBAT façon Game Boy Color (Pokémon Or / Argent / Cristal, rencontre sauvage) : l'écran clignote
 * (palette qui s'éclaircit / s'assombrit, 4 battements), puis des tuiles noires de 8×8 « pixels » (grille 20×18 de
 * l'écran 160×144 de la console, agrandie pour couvrir la fenêtre) se posent en SPIRALE, du bord vers le centre, à
 * cadence saccadée (≈ 30 i/s comme la console). Au noir complet, `covered` se résout ; `reveal()` lève le rideau
 * (fondu en 4 paliers, rétro). Calque DOM au-dessus de tout : il couvre la scène d'ouverture pendant que la scène de
 * la rencontre se prépare derrière.
 *
 * « Effets réduits » / « réduire les animations » : pas de clignotement (WCAG 2.3.1), la spirale seule.
 */
import { reducedMotion } from '../../core/motion';

export interface GbcTransition {
  /** résolu quand l'écran est entièrement noir */
  covered: Promise<void>;
  /** lève le rideau (fondu) puis retire le calque */
  reveal(): Promise<void>;
  /** retire tout de suite */
  destroy(): void;
}

export function gbcTransition(o: { flashes?: boolean } = {}): GbcTransition {
  const cv = document.createElement('canvas');
  cv.className = 'gbc-transition';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:90;pointer-events:none;image-rendering:pixelated;';
  document.body.append(cv);
  const W = window.innerWidth, H = window.innerHeight;
  // tuile = 8 px « console » ; on garde la grille 20×18 au centre et on l'étend pour couvrir la fenêtre
  const ts = Math.ceil(Math.max(W / 20, H / 18));
  const cols = Math.ceil(W / ts) + 1, rows = Math.ceil(H / ts) + 1;
  cv.width = cols;
  cv.height = rows;
  cv.style.width = `${cols * ts}px`;
  cv.style.height = `${rows * ts}px`;
  cv.style.left = `${(W - cols * ts) / 2}px`;
  cv.style.top = `${(H - rows * ts) / 2}px`;
  const g = cv.getContext('2d')!;
  // ordre en spirale (sens horaire, du bord vers le centre)
  const order: Array<[number, number]> = [];
  let x0 = 0, y0 = 0, x1 = cols - 1, y1 = rows - 1;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) order.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) order.push([x1, y]);
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) order.push([x, y1]);
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) order.push([x0, y]);
    x0++, y0++, x1--, y1--;
  }
  const flashes = (o.flashes ?? true) && !reducedMotion();
  const FLASH_MS = flashes ? 520 : 0;
  const WIPE_MS = 900;
  const FRAME = 1000 / 30;
  let raf = 0;
  let done = false;
  let resolveCovered!: () => void;
  const covered = new Promise<void>((r) => (resolveCovered = r));
  const t0 = performance.now();
  let lastFrame = -1;
  const loop = (now: number) => {
    if (done) return;
    const t = now - t0;
    const f = Math.floor(t / FRAME);
    if (f !== lastFrame) {
      lastFrame = f;
      g.clearRect(0, 0, cols, rows);
      if (t < FLASH_MS) {
        // 4 battements : clair, rien, sombre, rien (palette de la console qui « pulse »)
        const k = Math.floor((t / FLASH_MS) * 8) % 4;
        if (k === 0) (g.fillStyle = 'rgba(248,248,240,0.82)'), g.fillRect(0, 0, cols, rows);
        else if (k === 2) (g.fillStyle = 'rgba(8,8,16,0.7)'), g.fillRect(0, 0, cols, rows);
      } else {
        const p = Math.min(1, (t - FLASH_MS) / WIPE_MS);
        const n = Math.floor(p * order.length);
        g.fillStyle = '#000';
        for (let i = 0; i < n; i++) g.fillRect(order[i][0], order[i][1], 1, 1);
        if (p >= 1) {
          g.fillRect(0, 0, cols, rows);
          resolveCovered();
          return; // reste noir jusqu'à reveal()
        }
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const destroy = () => {
    done = true;
    cancelAnimationFrame(raf);
    cv.remove();
    resolveCovered();
  };
  return {
    covered,
    async reveal() {
      await covered;
      // fondu en 4 paliers (pas de dégradé lisse : c'est une console 8 bits)
      for (const a of [0.75, 0.5, 0.25, 0]) {
        cv.style.opacity = String(a);
        await new Promise((r) => setTimeout(r, 70));
      }
      destroy();
    },
    destroy,
  };
}
