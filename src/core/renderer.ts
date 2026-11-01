import { WebGPURenderer, NeutralToneMapping, SRGBColorSpace } from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl';
export type DprMode = 'auto' | '1' | '1.5' | '2' | 'native';

const LS_BACKEND = 'cardlab.backend';
const LS_DPR = 'cardlab.dpr';
const LS_QUALITY = 'cardlab.quality';

export function preferredBackend(): Backend {
  const q = new URLSearchParams(location.search).get('backend');
  if (q === 'webgl' || q === 'webgpu') return q;
  try {
    const v = localStorage.getItem(LS_BACKEND);
    if (v === 'webgl' || v === 'webgpu') return v;
  } catch {
    /* ignore */
  }
  return 'webgpu';
}

export function setPreferredBackend(b: Backend) {
  try {
    localStorage.setItem(LS_BACKEND, b);
  } catch {
    /* ignore */
  }
}

export function isTouch(): boolean {
  return matchMedia('(pointer: coarse)').matches;
}

export function preferredDpr(): DprMode {
  try {
    const v = localStorage.getItem(LS_DPR) as DprMode | null;
    if (v && ['auto', '1', '1.5', '2', 'native'].includes(v)) return v;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function savePref(key: 'dpr' | 'quality', v: string) {
  try {
    localStorage.setItem(key === 'dpr' ? LS_DPR : LS_QUALITY, v);
  } catch {
    /* ignore */
  }
}

export function preferredQuality(): 'high' | 'mobile' {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'mobile' || q === 'high') return q;
  try {
    const v = localStorage.getItem(LS_QUALITY);
    if (v === 'mobile' || v === 'high') return v;
  } catch {
    /* ignore */
  }
  return isTouch() ? 'mobile' : 'high';
}

/** DPR effectif, plafonné (2 max sur desktop, 1.5 en preset mobile). */
export function resolveDpr(mode: DprMode, quality: 'high' | 'mobile'): number {
  const d = window.devicePixelRatio || 1;
  switch (mode) {
    case '1':
      return 1;
    case '1.5':
      return Math.min(d, 1.5);
    case '2':
      return Math.min(d, 2);
    case 'native':
      return d;
    default:
      return Math.min(d, quality === 'mobile' ? 1.5 : 2);
  }
}

export async function createRenderer(backend: Backend): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    antialias: true,
    forceWebGL: backend === 'webgl',
    trackTimestamp: true,
    powerPreference: 'high-performance',
  });
  await renderer.init();
  applyRendererDefaults(renderer);
  return renderer;
}

/** État par défaut restauré avant chaque expérience. */
export function applyRendererDefaults(renderer: WebGPURenderer) {
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x121110, 1);
  renderer.autoClear = true;
  renderer.shadowMap.enabled = false;
}

export function backendName(renderer: WebGPURenderer): string {
  const b = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  return b.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
}
