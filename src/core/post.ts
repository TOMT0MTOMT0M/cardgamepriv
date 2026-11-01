import { RenderPipeline, type Camera, type Scene } from 'three/webgpu';
import { emissive, mrt, output, pass, vec4 } from 'three/tsl';
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
