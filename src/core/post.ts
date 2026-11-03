import { MirroredRepeatWrapping, RenderPipeline, Vector2, type Camera, type Scene } from 'three/webgpu';
import { Fn, Loop, emissive, float, int, luminance, mix, mrt, output, pass, rtt, smoothstep, uv, vec2, vec4, viewportSize } from 'three/tsl';
import type { LabContext } from './Experiment';
import type { N } from './tsl';

/**
 * Petit utilitaire autour de RenderPipeline (r183+) : passe de scène avec MRT {output, emissive},
 * et suivi des nœuds à libérer (RenderPipeline.dispose ne libère pas les PassNode / BloomNode).
 */
export function createPipeline(ctx: LabContext, scene: Scene, camera: Camera, opts: { emissive?: boolean; samples?: number } = {}) {
  const pipeline = new RenderPipeline(ctx.renderer);
  const passOpts: Record<string, unknown> = {};
  if (opts.samples != null) passOpts.samples = opts.samples;
  // téléphone (GPU à tuiles) : les échantillons MSAA sont résolus sur la puce puis jetés au lieu d'être écrits en
  // mémoire (×4 de bande passante par cible, ×2 cibles avec l'émissif) — c'était le premier poste de coût
  if (ctx.quality === 'mobile') passOpts.storeMultisampledColorBuffer = false;
  const scenePass = pass(scene, camera, Object.keys(passOpts).length ? passOpts : undefined);
  if (opts.emissive) scenePass.setMRT(mrt({ output, emissive: vec4(emissive, output.a) }));
  const color = scenePass.getTextureNode('output');
  const emis = opts.emissive ? scenePass.getTextureNode('emissive') : null;
  const owned: Array<{ dispose(): void }> = [scenePass as unknown as { dispose(): void }];
  ctx.bag.fn(() => {
    owned.forEach((o) => o.dispose());
    pipeline.dispose();
  });
  /*
   * Téléphone : la profondeur MSAA (×4 échantillons) était écrite en mémoire puis résolue à chaque image alors que
   * personne ne la lit (~21 Mo écrits par image, ≈ 1,3 Go/s à 60 i/s sur iPhone 13) → jetée sur la puce (attachement
   * transitoire si le navigateur le permet). Décidé au 1er rendu / à la compilation, quand la scène est configurée :
   * si elle lit la profondeur (getViewZNode, getTextureNode('depth') — labo 013), on n'y touche pas.
   */
  let depthChecked = false;
  const checkDepth = () => {
    if (depthChecked) return;
    depthChecked = true;
    if (ctx.quality !== 'mobile') return;
    const reads = !!(scenePass as unknown as { _textureNodes?: Record<string, unknown> })._textureNodes?.depth;
    if (reads) return;
    Object.assign(scenePass.renderTarget, { storeMultisampledDepthBuffer: false, storeMultisampledStencilBuffer: false, resolveDepthBuffer: false, resolveStencilBuffer: false });
  };
  return {
    pipeline,
    scenePass,
    color,
    emissive: emis,
    /** Enregistre un nœud d'effet (bloom, dof…) pour libération automatique. */
    own<T>(node: T): T {
      owned.push(node as unknown as { dispose(): void });
      return node;
    },
    set output(n: N) {
      pipeline.outputNode = n;
      pipeline.needsUpdate = true;
    },
    render() {
      checkDepth();
      pipeline.render();
    },
    /**
     * Pré-compile les matériaux de la scène POUR LA VRAIE CIBLE de la passe (MRT émissif, MSAA, HalfFloat) —
     * `stage.compile()` les prépare pour le canvas, et la vraie variante était créée à la 1re image (à-coup de
     * 100 à 400 ms sur téléphone). À appeler une fois la scène peuplée (et après setMRT / getTextureNode).
     */
    async compile() {
      checkDepth();
      await compilePassAsync(ctx.renderer, scenePass);
    },
    /**
     * Libère les cibles plein écran de la passe de scène et des effets possédés qui en ont (bloom…), sans rien
     * détruire d'autre : tout est recréé au prochain rendu (mêmes formats → mêmes pipelines, comme après un resize).
     */
    releaseTargets() {
      (scenePass.renderTarget as unknown as { dispose(): void }).dispose();
      for (const o of owned) {
        if (o === (scenePass as unknown)) continue;
        const b = o as unknown as { _renderTargetBright?: RT; _renderTargetsHorizontal?: RT[]; _renderTargetsVertical?: RT[] };
        b._renderTargetBright?.dispose();
        b._renderTargetsHorizontal?.forEach((t) => t.dispose());
        b._renderTargetsVertical?.forEach((t) => t.dispose());
      }
    },
  };
}

type RT = { dispose(): void };

/**
 * `PassNode.compileAsync` sans fuite d'état : la version de three (r187) laisse la cible et le MRT de la passe posés
 * sur le renderer pendant toute la compilation, qui rend la main au navigateur — une autre scène rendue entre-temps
 * (la vitrine pendant que la visionneuse se monte, l'ouverture pendant que 039 se prépare) dessinerait alors dans la
 * mauvaise cible. Ici, la cible et le MRT de la passe ne sont posés que pendant les tranches de compilation
 * (`_beginPreCompile` … `_finishPreCompile` du renderer, synchrones) et l'état d'avant est remis à chaque pause.
 * Repli (API interne absente) : compilation simple pour le canvas, comme `stage.compile()`.
 */
type PreState = Record<string, unknown>;
type R = {
  getRenderTarget(): unknown; setRenderTarget(t: unknown): void; getMRT(): unknown; setMRT(m: unknown): void;
  getDrawingBufferSize(v: Vector2): Vector2; samples: number;
  compileAsync(s: unknown, c: unknown): Promise<void>;
  _beginPreCompile?: (st: PreState) => void; _finishPreCompile?: () => void; _precompilationState?: PreState | null;
};
type Slice = { rt: unknown; mrt: unknown; prevRT: unknown; prevMRT: unknown };
const slices = new WeakMap<object, Map<PreState, Slice>>();
let pendingSlice: Slice | null = null;

function hookRenderer(r: R): Map<PreState, Slice> | null {
  let mine = slices.get(r);
  if (mine) return mine;
  const begin = r._beginPreCompile, finish = r._finishPreCompile;
  if (typeof begin !== 'function' || typeof finish !== 'function') return null;
  const map = (mine = new Map<PreState, Slice>());
  r._beginPreCompile = function (this: R, st: PreState) {
    // 1er appel d'une compilation lancée par compilePassAsync : on l'adopte (l'état d'avant est déjà relevé)
    let sl = map.get(st);
    if (!sl && pendingSlice) {
      map.set(st, (sl = pendingSlice));
      pendingSlice = null;
    } else if (sl) {
      // reprise après une pause : l'état à remettre est celui du moment (normalement le canvas)
      sl.prevRT = this.getRenderTarget();
      sl.prevMRT = this.getMRT();
    }
    if (sl) {
      this.setRenderTarget(sl.rt);
      this.setMRT(sl.mrt);
    }
    begin.call(this, st);
  };
  r._finishPreCompile = function (this: R) {
    const st = this._precompilationState;
    finish.call(this);
    const sl = st ? map.get(st) : undefined;
    if (sl) {
      this.setRenderTarget(sl.prevRT);
      this.setMRT(sl.prevMRT);
    }
  };
  slices.set(r, map);
  return map;
}

/**
 * Désactivé (audit 03/11) : la compilation « sur la vraie cible » via `_beginPreCompile`/`_finishPreCompile` produit en
 * WebGL2 des programmes sans les sorties MRT (« Active draw buffers with missing fragment shader outputs » à chaque
 * image, constaté en Chromium/SwiftShader ; absent du code d'origine). Tant que ce n'est pas validé sur un vrai GPU
 * (WebGPU iPhone/Android et WebGL2), on garde la compilation simple pour le canvas, comme avant (`stage.compile()`).
 */
const TARGET_PRECOMPILE = false;

export async function compilePassAsync(renderer: LabContext['renderer'], passNode: unknown): Promise<void> {
  type P = { scene: unknown; camera: unknown; renderTarget: { samples: number }; options?: { samples?: number }; _mrt: unknown; setSize(w: number, h: number): void; contextNode?: unknown };
  const r = renderer as unknown as R, pn = passNode as P;
  try {
    const map = TARGET_PRECOMPILE && pn.contextNode == null ? hookRenderer(r) : null;
    if (!map) {
      await r.compileAsync(pn.scene, pn.camera);
      return;
    }
    // cible configurée comme dans PassNode.setup()/updateBefore() → mêmes pipelines qu'au rendu
    pn.renderTarget.samples = pn.options?.samples === undefined ? r.samples : pn.options.samples;
    r.getDrawingBufferSize(_size);
    pn.setSize(_size.width, _size.height);
    const prevRT = r.getRenderTarget(), prevMRT = r.getMRT();
    const slice: Slice = { rt: pn.renderTarget, mrt: pn._mrt, prevRT, prevMRT };
    // la partie synchrone de compileAsync relève la cible courante : on la pose le temps de l'appel
    r.setRenderTarget(slice.rt);
    r.setMRT(slice.mrt);
    pendingSlice = slice;
    let job: Promise<void>;
    try {
      job = r.compileAsync(pn.scene, pn.camera);
    } finally {
      pendingSlice = null;
      // (à ce stade, soit une tranche est en cours — elle remettra l'état à sa pause —, soit tout est déjà remis)
      if (!r._precompilationState || !map.has(r._precompilationState)) {
        r.setRenderTarget(prevRT);
        r.setMRT(prevMRT);
      }
    }
    await job;
    for (const [st, sl] of map) if (sl === slice) map.delete(st);
  } catch (e) {
    console.warn('[post] compilation de la passe', e);
  }
}
const _size = new Vector2();

/**
 * Flare anamorphique : un BloomNode à ¼ de résolution dont le passe-haut est remplacé par un flou horizontal
 * (même principe que l'exemple officiel `webgpu_postprocessing_anamorphic`).
 */
export function anamorphicFlare(src: N, bloomFactory: (n: N) => N, samples = 48, spread = 6): N {
  const fl = bloomFactory(src) as N;
  fl.setResolutionScale(0.25);
  fl.highPassFn = Fn(({ input, threshold, smoothWidth }: { input: N; threshold: N; smoothWidth: N }) => {
    const a = smoothstep(threshold, threshold.add(smoothWidth), luminance(input.rgb));
    const bright = rtt(mix(vec4(0), input, a), null, null, { wrapS: MirroredRepeatWrapping, wrapT: MirroredRepeatWrapping });
    const total = vec4(0).toVar();
    const half = samples / 2;
    const inv = vec2(1.0).div(viewportSize);
    Loop({ start: int(-half), end: int(half), type: 'int', condition: '<' }, ({ i }: { i: N }) => {
      const soft = float(i).abs().div(half).oneMinus().pow(2);
      total.addAssign(bright.sample(vec2(uv().x.add(inv.x.mul(float(i)).mul(spread)), uv().y)).mul(soft));
    });
    return total.div(samples / 3);
  });
  return fl;
}
