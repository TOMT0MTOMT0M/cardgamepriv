import { CanvasTexture, Color, DirectionalLight, MeshPhysicalNodeMaterial, NoColorSpace, Raycaster, RepeatWrapping, Vector2, type Mesh } from 'three/webgpu';
import {
  abs,
  color,
  float,
  fract,
  length,
  luminance,
  max,
  mix,
  normalMap,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  cos,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { createBackMaterial, createEdgeMaterial, viewDirObject, windowSDF } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { makeCanvas } from '../../core/art/canvas';
import { FONT_MONO } from '../../core/art/frame';
import { encodeNormal, rot2, thinFilm, type N } from '../../core/tsl';

/** Encres de sécurité par tier : noir, vert billet, bleu, sang-de-bœuf, or (métallique), encre optiquement variable. */
const INKS: Array<[string, string]> = [
  ['#1c1a18', '#1c1a18'],
  ['#1f4a33', '#1f4a33'],
  ['#1d3466', '#1d3466'],
  ['#5e1622', '#5e1622'],
  ['#8a6a24', '#d9b25a'],
  ['#2a6b4f', '#6b2a6b'],
];

function microTexture(): CanvasTexture {
  const { c, g } = makeCanvas(512, 32);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 32);
  g.fillStyle = '#fff';
  g.font = `500 20px ${FONT_MONO}`;
  g.textBaseline = 'middle';
  g.fillText('CARD·LAB·SÉRIE·I·LABORATOIRE·', 4, 16);
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/**
 * 022 — Taille-douce (guilloché).
 * La carte devient un billet : l'illustration est gravée en lignes dont l'épaisseur suit la valeur, avec
 * hachures croisées dans les ombres ; encre en relief, papier fibré, micro-texte — et une loupe pour l'examiner.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  const ray = new Raycaster();
  const U = { loupe: uniform(new Vector2(-5, -5)), loupeR: uniform(0.11), freq: uniform(150), ink1: uniform(new Color()), ink2: uniform(new Color()) };
  const params = { freq: 150, loupe: true };

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      U.ink1.value.set(INKS[rar.tier][0]);
      U.ink2.value.set(INKS[rar.tier][1]);
      c.input.spinEnabled = false;
      stage = createStage(c, { bg: ['#2a2622', '#0c0b0a'], env: 'gallery', envIntensity: 1, fill: 0.74 });
      const key = new DirectionalLight(0xfff2e6, 1.6);
      key.position.set(-2.5, 1, 1.6);
      stage.scene.add(key);
      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const micro = c.bag.add(microTexture());

      // ── loupe : grossissement ×4 autour du pointeur (UV de la carte)
      const d = uv().sub(U.loupe).mul(vec2(CARD.w / CARD.h, 1));
      const inLoupe = smoothstep(U.loupeR, U.loupeR.sub(0.004), length(d));
      const mag = mix(float(1), float(0.25), inLoupe);
      const luv = U.loupe.add(uv().sub(U.loupe).mul(mag));

      // ── ton de l'image (aplatie) et zones
      const flat = texture(art.flat, luv).rgb;
      const tone = luminance(flat);
      const winM = smoothstep(0.0, 0.004, windowSDF(luv).negate());
      // ── gravure : lignes ondulées (guilloché) dont l'épaisseur suit l'obscurité, hachures croisées dans les ombres
      const p = luv.mul(vec2(CARD.w, CARD.h)).mul(U.freq);
      const wob = sin(luv.y.mul(38)).mul(0.9).add(sin(luv.x.mul(23).add(luv.y.mul(9))).mul(0.6));
      const l1 = abs(fract(rot2(p, 0.52).y.add(wob)).sub(0.5)).mul(2);
      const l2 = abs(fract(rot2(p, -0.6).y.add(wob.mul(0.5))).sub(0.5)).mul(2);
      const dark = float(1).sub(tone).pow(1.1);
      const w1 = dark.mul(1.05);
      const aa = float(0.18);
      const ink1 = smoothstep(w1, w1.sub(aa), l1);
      const ink2 = smoothstep(dark.sub(0.45).mul(1.6), dark.sub(0.45).mul(1.6).sub(aa), l2).mul(smoothstep(0.45, 0.6, dark));
      const engraved = max(ink1, ink2);
      // ── hors fenêtre : impression monochrome (texte, filets) au trait
      const printed = smoothstep(0.62, 0.42, tone);
      // ── micro-texte le long du bord de la fenêtre (illisible sans loupe)
      const band = smoothstep(0.012, 0.009, abs(windowSDF(luv).add(0.011)));
      const mt = texture(micro, vec2(luv.x.mul(55), luv.y.mul(1100).add(0.5))).r.mul(band);
      const inkAmt = mix(printed, engraved, winM).max(mt).clamp(0, 1);
      // ── encre : optiquement variable (mythique) ou métallique (légendaire)
      const V = viewDirObject();
      const ink1c = U.ink1 as unknown as N, ink2c = U.ink2 as unknown as N;
      let inkCol: N = mix(ink1c, ink2c, smoothstep(0.75, 0.97, V.z));
      if (rar.tier === 5) inkCol = mix(inkCol, thinFilm(float(520), V.z, 1.5, 1).mul(0.6), 0.5);
      // ── papier de sécurité : fibres colorées
      const fib = smoothstep(0.985, 1.0, sin(luv.x.mul(1900).add(sin(luv.y.mul(310)).mul(9))).mul(0.5).add(0.5)).mul(0.25);
      const paper = mix(color('#ece5d3'), color('#d8cfb8'), fib.mul(2)).add(vec3(0.02, -0.01, -0.01).mul(fib.mul(8)));
      const col = mix(paper, inkCol, inkAmt.mul(0.95));
      // ── relief de l'encre (taille-douce = encre en relief) : normale depuis le gradient des lignes
      const gx = cos(rot2(p, 0.52).y.add(wob).mul(Math.PI * 2)).mul(ink1).mul(0.35);
      const n = vec3(gx.mul(0.6), gx, 1).normalize();
      const m = new MeshPhysicalNodeMaterial();
      // anneau de la loupe : bord sombre + reflet
      const ring = smoothstep(0.006, 0.0, abs(length(d).sub(U.loupeR))).mul(float(params.loupe ? 1 : 0));
      m.colorNode = mix(col, color('#0c0c0c'), ring.mul(0.8));
      m.metalnessNode = inkAmt.mul(rar.tier >= 4 ? 0.85 : 0);
      m.roughnessNode = mix(float(0.75), float(rar.tier >= 4 ? 0.3 : 0.55), inkAmt);
      m.normalNode = normalMap(encodeNormal(mix(vec3(0, 0, 1), n, inkAmt)));
      m.clearcoatNode = inLoupe.mul(0.9);
      m.clearcoatRoughnessNode = float(0.02);
      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial());
      stage.scene.add(card);
      await stage.compile();
      c.gui.add(params, 'freq', 60, 320, 1).name('densité de gravure').onChange((v: number) => (U.freq.value = v));
      c.gui.add(params, 'loupe').name('loupe au pointeur');
    },
    update(_dt, t) {
      const inp = ctx.input;
      card.rotation.set(-inp.tiltY * 0.25 + Math.sin(t * 0.4) * 0.04, inp.tiltX * 0.35 + Math.sin(t * 0.5) * 0.08, 0);
      U.loupe.value.set(-5, -5);
      const dbg = new URLSearchParams(location.search).get('loupe');
      if (dbg) U.loupe.value.set(...(dbg.split(',').map(Number) as [number, number]));
      else if (params.loupe && (inp.inside || inp.down)) {
        ray.setFromCamera(new Vector2(inp.ndcX, inp.ndcY), stage.camera);
        const hit = ray.intersectObject(card, false)[0];
        if (hit?.uv) U.loupe.value.copy(hit.uv);
      }
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
