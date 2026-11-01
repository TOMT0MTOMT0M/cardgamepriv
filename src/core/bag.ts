import type { Object3D, Material, BufferGeometry, Texture } from 'three/webgpu';

type Disposable = { dispose(): void };

/**
 * Sac de ressources : tout ce qu'une expérience crée passe par ici,
 * et le shell vide le sac au changement d'expérience (ordre inverse).
 */
export class Bag {
  private items: Array<() => void> = [];

  add<T extends Disposable>(o: T): T {
    this.items.push(() => o.dispose());
    return o;
  }

  fn(f: () => void): void {
    this.items.push(f);
  }

  on<K extends keyof WindowEventMap>(target: Window, type: K, h: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, h: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  on(target: EventTarget, type: string, h: (e: never) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, h as EventListener, opts);
    this.items.push(() => target.removeEventListener(type, h as EventListener, opts));
  }

  /** Libère géométries + matériaux de tout un graphe (textures : à ajouter explicitement). */
  scene(root: Object3D): void {
    this.items.push(() => disposeObject(root));
  }

  disposeAll(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i]();
      } catch (e) {
        console.warn('[bag] dispose error', e);
      }
    }
    this.items.length = 0;
  }
}

export function disposeObject(root: Object3D): void {
  const geos = new Set<BufferGeometry>();
  const mats = new Set<Material>();
  root.traverse((o) => {
    const m = o as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (m.geometry) geos.add(m.geometry);
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  root.removeFromParent();
}

export function disposeTextures(list: Texture[]): void {
  list.forEach((t) => t.dispose());
}
