import { MirroredRepeatWrapping, RenderPipeline, RenderTarget, type Camera, type Scene } from 'three/webgpu';
import { Fn, Loop, emissive, float, int, luminance, mix, mrt, output, pass, rtt, smoothstep, uv, vec2, vec4, viewportSize } from 'three/tsl';
import type { LabContext } from './Experiment';
import type { N } from './tsl';

/**
 * Petit utilitaire autour de RenderPipeline (r183+) : passe de scène avec MRT {output, emissive},
 * et suivi des nœuds à libérer (RenderPipeline.dispose ne libère pas les PassNode / BloomNode).
 */
/** Le navigateur expose-t-il les attachements transitoires de WebGPU (échantillons MSAA jamais écrits en mémoire) ? */
export function hasTransientAttachment(): boolean {
  const usage = (globalThis as { GPUTextureUsage?: object }).GPUTextureUsage;
  return !!usage && 'TRANSIENT_ATTACHMENT' in usage;
}

export function createPipeline(ctx: LabContext, scene: Scene, camera: Camera, opts: { emissive?: boolean; samples?: number; lean?: boolean } = {}) {
  const pipeline = new RenderPipeline(ctx.renderer);
  const passOpts: Record<string, unknown> = {};
  if (opts.samples != null) passOpts.samples = opts.samples;
  // téléphone (GPU à tuiles) : les échantillons MSAA sont résolus sur la puce puis jetés au lieu d'être écrits en
  // mémoire (×4 de bande passante par cible, ×2 cibles avec l'émissif) — c'était le premier poste de coût
  // (audit 06/11) téléphone : MSAA ×2 au lieu de ×4 — à la définition native de l'écran (×3) les marches d'escalier
  // font ⅓ de pixel CSS, ×4 n'apporte plus rien ; et en WebGL2 (repli) le ×4 est payé plein (cibles multi-échantillons
  // écrites en mémoire : 4× la bande passante). Une scène peut imposer la sienne (`opts.samples`).
  // (perf 06/11, décision de Tom) WebGPU ne connaît pas ×2 (1 ou 4) : ×4 en WebGPU — le rendu lissé validé avant l'audit,
  // échantillons résolus sur la puce puis jetés (storeOp discard, valide avec de vrais échantillons) ; WebGL2 garde ×2
  // (audit 12/11, décision 2 de Tom / E3-02) ×4 seulement si le navigateur sait garder les échantillons sur la puce
  // (attachement transitoire) : sans lui, « échantillons jetés » n'économise que de la bande passante et les textures
  // ×4 restent en mémoire (+237 Mo à la visionneuse d'un iPhone ×3). Dans ce cas : ×1 à la définition native.
  if (ctx.quality === 'mobile' && opts.samples == null) passOpts.samples = ctx.isWebGPU ? (hasTransientAttachment() ? 4 : 1) : 2;
  /*
   * (perf 06/11, correctif) WebGPU ne connaît que 1 ou 4 échantillons : three ramène ×2 à ×1 (WebGPUUtils.getSampleCount)
   * mais gardait « jeter les échantillons » → la cible de la passe (sans MSAA, donc la VRAIE image) était jetée en fin de
   * passe : vitrine, ouverture et visionneuse noires au preset téléphone en WebGPU. On ne jette que s'il y a vraiment
   * des échantillons à résoudre (WebGL2 : ×2 réel, inchangé).
   */
  const requested = (passOpts.samples as number | undefined) ?? ctx.renderer.samples;
  const msaa = (ctx.isWebGPU ? (requested >= 4 ? 4 : 1) : requested) > 1;
  // (audit 12/11, S17 / E4-10) aussi sur ordinateur : une fois résolus, les échantillons ne sont relus par personne —
  // aucun pixel ne change ; sur un GPU à tuiles classé « ordinateur » (Mac Apple Silicon) c'est le même gain que sur iPhone
  // `lean` : demandé par les scènes du jeu (le labo garde son réglage : téléphone seulement).
  const lean = ctx.quality === 'mobile' || opts.lean === true;
  if (lean && msaa) passOpts.storeMultisampledColorBuffer = false;
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
    // (E4-10) aussi sur ordinateur : profondeur ni gardée ni résolue quand la scène ne la lit pas
    if (!lean || !msaa) return;
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
     * Pré-compile les matériaux de la scène. Par défaut : variante « canvas » (comme `stage.compile()`). Avec
     * `real: true` (WebGPU seulement, repli automatique sinon) : dans la configuration RÉELLE de la passe — cible
     * HalfFloat, MRT {output, emissive}, MSAA ×4, profondeur — via `PassNode.compileAsync` (three r187) : les pipelines
     * que la 1re image utiliserait sont créés en asynchrone et en parallèle, à la place de la variante « canvas » qui ne
     * servait à rien et de la création synchrone dans l'image de préchauffage. À appeler une fois la scène peuplée
     * (et après setMRT / getTextureNode).
     */
    async compile(opts: { real?: boolean } = {}) {
      checkDepth();
      await compilePassAsync(ctx.renderer, scenePass, opts.real === true && ctx.isWebGPU);
    },
    /**
     * (audit 06/11) Une image rendue hors écran (cible 4×4) : crée les VRAIS pipelines de la passe (MRT émissif, MSAA,
     * HalfFloat), que `compile()` ne prépare pas — ils naissaient sinon dans la première image affichée (à-coup de 100 à
     * 400 ms sur téléphone au premier zoom de carte). À appeler une fois la scène peuplée, avant de l'afficher.
     */
    warm() {
      checkDepth();
      const r = ctx.renderer;
      const target = new RenderTarget(4, 4);
      const prevRT = r.getRenderTarget();
      try {
        scene.updateMatrixWorld();
        r.setRenderTarget(target);
        pipeline.render();
      } catch (e) {
        console.warn('[post] image de préchauffage', e);
      } finally {
        r.setRenderTarget(prevRT);
        target.dispose();
      }
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

type RendererPriv = {
  _beginPreCompile?: (st: PreState) => unknown;
  _finishPreCompile?: () => unknown;
  _precompilationState?: PreState | null;
  getRenderTarget(): unknown;
  getMRT(): unknown;
  setRenderTarget(rt: unknown): void;
  setMRT(m: unknown): void;
};
type PreState = { renderTarget?: unknown };

/** cibles de passe en cours de précompilation réelle → état du moteur à leur rendre à chaque pause */
const guarded = new WeakMap<object, { rt: unknown; mrt: unknown; n: number }>();
const guardInstalled = new WeakSet<object>();

/**
 * `PassNode.compileAsync` (three r187) laisse la cible et le MRT de la passe actifs sur le moteur pendant que la
 * compilation rend la main au navigateur (toutes les ~8 ms) : `_finishPreCompile` restaure « l'état de sortie » copié
 * au départ, qui EST la cible de la passe. Une image rendue pendant l'attente (vitrine, autre scène) partait alors dans
 * la cible de la passe (pipelines invalides, écran noir : constaté sur le banc). On enveloppe donc les deux crochets que
 * three appelle à chaque pause / reprise (états de la passe ET de chaque pipeline en file), UNIQUEMENT pour les
 * précompilations dont la cible est une passe gardée : à la pause on rend au moteur son état d'avant, à la reprise on
 * remet celui de la passe. Détection de fonctionnalité :
 * si ces crochets privés n'existent pas (autre version de three), renvoie false → l'appelant garde l'ancien chemin.
 */
function installPreCompileGuard(renderer: RendererPriv): boolean {
  if (guardInstalled.has(renderer)) return true;
  const begin = renderer._beginPreCompile;
  const finish = renderer._finishPreCompile;
  if (typeof begin !== 'function' || typeof finish !== 'function' || !('_precompilationState' in renderer)) return false;
  renderer._beginPreCompile = function (this: RendererPriv, st: PreState) {
    const out = begin.call(this, st);
    if (st && st.renderTarget && guarded.has(st.renderTarget as object)) this.setRenderTarget(st.renderTarget);
    return out;
  };
  renderer._finishPreCompile = function (this: RendererPriv) {
    const st = this._precompilationState;
    const out = finish.call(this);
    const g = st && st.renderTarget ? guarded.get(st.renderTarget as object) : undefined;
    if (g) {
      this.setRenderTarget(g.rt);
      this.setMRT(g.mrt);
    }
    return out;
  };
  guardInstalled.add(renderer);
  return true;
}

/**
 * Compile les matériaux de la scène. `real` (WebGPU) : dans la configuration réelle de la passe, en asynchrone et en
 * parallèle (`PassNode.compileAsync`, voir `compile()`), sans laisser l'état de la passe sur le moteur pendant les pauses.
 * Sinon (WebGL2, ou `real` absent) : variante « canvas » comme `stage.compile()`.
 * (audit 06/11 : l'ancienne tentative de compiler « sur la vraie cible » via `_beginPreCompile` produisait en WebGL2 des
 * programmes sans sorties MRT — d'où le repli WebGL2 inchangé ; en WebGPU, la 1re image de `warm()` crée ce qui reste :
 * chaîne de post-traitement.)
 */
/** Le moteur tourne-t-il sur WebGPU (et pas sur le repli WebGL2) ? */
export function isWebGPURenderer(renderer: unknown): boolean {
  return !!(renderer as { backend?: { isWebGPUBackend?: boolean } } | null)?.backend?.isWebGPUBackend;
}

export async function compilePassAsync(renderer: LabContext['renderer'], passNode: unknown, real = false): Promise<void> {
  const pn = passNode as { scene: unknown; camera: unknown; renderTarget?: object; compileAsync?: (r: unknown) => Promise<void> };
  const r = renderer as unknown as RendererPriv;
  if (real && typeof pn.compileAsync === 'function' && pn.renderTarget && installPreCompileGuard(r)) {
    const key = pn.renderTarget;
    const g = guarded.get(key) ?? { rt: r.getRenderTarget(), mrt: r.getMRT(), n: 0 };
    g.n++;
    guarded.set(key, g);
    try {
      await pn.compileAsync(renderer);
      return;
    } catch (e) {
      console.warn('[post] compilation réelle de la passe', e);
    } finally {
      r.setRenderTarget(g.rt);
      r.setMRT(g.mrt);
      if (--g.n <= 0) guarded.delete(key);
    }
  }
  try {
    await (renderer as unknown as { compileAsync(s: unknown, c: unknown): Promise<void> }).compileAsync(pn.scene, pn.camera);
  } catch (e) {
    console.warn('[post] compilation de la passe', e);
  }
}

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
