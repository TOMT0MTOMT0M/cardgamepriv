import type { WebGPURenderer } from 'three/webgpu';
import type GUI from 'lil-gui';
import type { RarityId } from './rarity';
import type { Input } from './input';
import type { Bag } from './bag';
import type { Sfx } from './audio';

export type Category = 'A' | 'B' | 'C' | 'D';

export const CATEGORY_LABELS: Record<Category, string> = {
  A: 'A · Visualisation de la carte',
  B: 'B · Ouverture de pack',
  C: 'C · Rareté',
  D: 'D · Designs de cartes',
};

export interface ExperimentMeta {
  id: string;
  title: string;
  category: Category;
  tags: string[];
  /** Techniques / APIs three.js exploitées (affichées dans la sidebar). */
  tech: string[];
  /** Une ligne : l'intention. */
  blurb: string;
  /** Indication d'interaction affichée en overlay. */
  hint?: string;
}

export type Quality = 'high' | 'mobile';

export interface LabContext {
  renderer: WebGPURenderer;
  canvas: HTMLCanvasElement;
  /** Dossier lil-gui propre à l'expérience (détruit au changement). */
  gui: GUI;
  rarity: RarityId;
  quality: Quality;
  input: Input;
  /** Tout ce qui est ajouté ici est libéré automatiquement au dispose. */
  bag: Bag;
  /** Calque HTML au-dessus du canvas, vidé au dispose. */
  overlay: HTMLElement;
  isWebGPU: boolean;
  /** Taille CSS du canvas. */
  width: number;
  height: number;
  sfx: Sfx;
}

export interface Experiment {
  setup(ctx: LabContext): void | Promise<void>;
  /** Appelé chaque frame. L'expérience fait son propre rendu (render, compute, pipeline). */
  update(dt: number, t: number): void;
  dispose(): void;
  resize?(width: number, height: number): void;
  /**
   * Définition maximale du canvas pour cette scène (facteur d'écran, cf. game/shell.ts). Téléphone : 2 par défaut
   * (5 cartes + particules + bloom) ; la visionneuse demande 3 — l'écran ×3 n'étire plus l'image ×1,5 (audit 06/11).
   */
  dprCap?: number;
  replay?(): void;
  /** Changement de rareté à chaud. Si absent, le shell reconstruit l'expérience. */
  setRarity?(r: RarityId): void;
  params?: Record<string, unknown>;
}

export interface ExperimentModule {
  default: () => Experiment;
}

export interface RegistryEntry extends ExperimentMeta {
  load: () => Promise<ExperimentModule>;
}
