import { MirroredRepeatWrapping, RenderPipeline, type Camera, type Scene } from 'three/webgpu';
import { Fn, Loop, emissive, float, int, luminance, mix, mrt, output, pass, rtt, smoothstep, uv, vec2, vec4, viewportSize } from 'three/tsl';
import type { LabContext } from './Experiment';
import type { N } from './tsl';

/**
 * Petit utilitaire autour de RenderPipeline (r183+) : passe de scène avec MRT {output, emissive},
 * et suivi des nœuds à libérer (RenderPipeline.dispose ne libère pas les PassNode / BloomNode).
 */
export function createPipeline(ctx: LabContext, scene: Scene, camera: Camera, opts: { emissive?: boolean; samples?: number } = {}) {
  const pipeline = new RenderPipeline(ctx.renderer);
  const scenePass = pass(scene, camera, opts.samples != null ? { samples: opts.samples } : undefined);
  if (opts.emissive) scenePass.setMRT(mrt({ output, emissive: vec4(emissive, output.a) }));
  const color = scenePass.getTextureNode('output');
  const emis = opts.emissive ? scenePass.getTextureNode('emissive') : null;
  const owned: Array<{ dispose(): void }> = [scenePass as unknown as { dispose(): void }];
  ctx.bag.fn(() => {
    owned.forEach((o) => o.dispose());
    pipeline.dispose();
  });
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
      pipeline.render();
    },
  };
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
