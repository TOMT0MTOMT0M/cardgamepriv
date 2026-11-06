import { MirroredRepeatWrapping, RenderPipeline, RenderTarget, type Camera, type Scene } from 'three/webgpu';
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
  // (audit 06/11) téléphone : MSAA ×2 au lieu de ×4 — à la définition native de l'écran (×3) les marches d'escalier
  // font ⅓ de pixel CSS, ×4 n'apporte plus rien ; et en WebGL2 (repli) le ×4 est payé plein (cibles multi-échantillons
  // écrites en mémoire : 4× la bande passante). Une scène peut imposer la sienne (`opts.samples`).
  if (ctx.quality === 'mobile' && opts.samples == null) passOpts.samples = 2;
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

/**
 * Compile les matériaux de la scène (variante « canvas », comme `stage.compile()`). Les VRAIS pipelines de la passe
 * (MRT émissif + MSAA + HalfFloat) ne se créent qu'au premier rendu dans sa cible : c'est le rôle de `warm()`.
 * (audit 06/11 : l'ancienne tentative de compiler « sur la vraie cible » via `_beginPreCompile` produisait en WebGL2 des
 * programmes sans sorties MRT ; elle est remplacée par l'image à blanc, déjà éprouvée dans duelSummon.)
 */
export async function compilePassAsync(renderer: LabContext['renderer'], passNode: unknown): Promise<void> {
  const pn = passNode as { scene: unknown; camera: unknown };
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
