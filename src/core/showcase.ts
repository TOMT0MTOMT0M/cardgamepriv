import { DirectionalLight, Group } from 'three/webgpu';
import { clamp, color, float, floor, step, uniform } from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from './Experiment';
import { createStage } from './stage';
import { ensureCardImages, ensureFonts, generateBackArt, generateCardArt, starColor, type CardArt } from './art';
import { CARDS, CARD_SETS, activeSet, cardForRarity, setActiveSet, type CardSetId } from './cardData';
import { rarity } from './rarity';
import { createHoloMaterial } from './holo';
import { createCardMesh } from './cardModel';
import { createBackMaterial, createEdgeMaterial } from './cardMaterial';
import { EASE, springCurve } from './ease';
import type { N } from './tsl';

const LAYERS = ['bg', 'subject', 'fg', 'frame', 'masks', 'fx', 'flat'] as const;

/**
 * Vitrine d'un design de carte : la carte en grand, inclinable, foil selon la rareté.
 * À chaque carte, les étoiles de rareté s'allument une par une (canal B des masques = index d'étoile),
 * puis éclat + foil qui balaie selon le tier. Tap = carte suivante (tour complet, l'illustration change au dos).
 */
export function designShowcase(designId: string): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let art: CardArt;
  let holo: ReturnType<typeof createHoloMaterial>;
  const rig = new Group();
  const U = { lit: uniform(0), flash: uniform(0) };
  const st = { spin: Math.PI, z: -0.5, sc: 0.9, rise: -0.12 };
  const params = { auto: false, set: activeSet().id as CardSetId };
  let tier = 0;
  let index = 0;
  let busy = false;
  let tl: gsap.core.Timeline | null = null;
  let autoCall: gsap.core.Tween | null = null;

  /** Allumage des étoiles puis récompense (éclat, balayage de foil, son). */
  function ignite(at: number) {
    const n = tier + 1;
    const gap = 0.12 + tier * 0.018;
    for (let k = 0; k < n; k++) {
      tl!.to(U.lit, { value: k + 1, duration: 0.14, ease: 'power2.out', onStart: () => ctx.sfx.tick(1 + k * 0.14, 0.07 + tier * 0.015) }, at + k * gap);
    }
    const end = at + n * gap + 0.05;
    tl!.call(() => (ctx.sfx.chime(Math.max(1, tier), 0.08 + tier * 0.03), tier >= 4 && ctx.sfx.shimmer(tier, 2, 0.06)), [], end)
      .to(U.flash, { value: 1, duration: 0.08 }, end)
      .to(U.flash, { value: 0, duration: 1.1, ease: EASE.glide }, end + 0.08);
    if (tier >= 2) {
      const H = holo.uniforms;
      tl!.fromTo(H.lightDir.value, { x: -1.2 }, { x: 1.2, duration: 0.9 + tier * 0.1, ease: EASE.breathe }, end - 0.1)
        .to(H.extraEmissive, { value: 0.12 + tier * 0.08, duration: 0.25 }, end)
        .to(H.extraEmissive, { value: 0, duration: 1.4, ease: EASE.glide }, end + 0.25);
    }
    tl!.call(() => {
      busy = false;
      if (params.auto) autoCall = gsap.delayedCall(2.2, next);
    }, [], end + 0.4);
  }

  function intro() {
    tl?.kill();
    autoCall?.kill();
    busy = true;
    U.lit.value = 0;
    Object.assign(st, { spin: Math.PI, z: -0.5, sc: 0.9, rise: -0.12 });
    tl = gsap.timeline();
    tl.to(st, { z: 0, rise: 0, sc: 1, duration: 0.9, ease: EASE.glide }, 0.1)
      .to(st, { spin: Math.PI * 2, duration: 1.0, ease: springCurve(0.55, 11), onStart: () => ctx.sfx.whoosh(0.35, 0.08) }, 0.45)
      .call(() => (st.spin = 0), [], 1.45);
    ignite(1.3);
  }

  /** Remplace le contenu des canvas de la carte : mêmes textures, mêmes pipelines → aucune recompilation. */
  function swapTo(i: number) {
    const cd = CARDS[i % CARDS.length];
    const fresh = generateCardArt(cd, ctx.rarity, { design: designId, scale: ctx.quality === 'mobile' ? 0.7 : 1 });
    for (const k of LAYERS) {
      const dst = art.canvases[k];
      const g = dst.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, dst.width, dst.height);
      g.drawImage(fresh.canvases[k], 0, 0);
      art[k].needsUpdate = true;
    }
    fresh.dispose();
  }

  function next() {
    if (busy) return;
    busy = true;
    autoCall?.kill();
    index = (index + 1) % CARDS.length;
    const nextCard = CARDS[index];
    void ensureCardImages([nextCard]).then(() => {
      U.lit.value = 0;
      tl = gsap.timeline();
      tl.to(st, { spin: Math.PI, sc: 0.96, duration: 0.34, ease: EASE.heave, onStart: () => ctx.sfx.whoosh(0.3, 0.07) })
        .call(() => swapTo(index))
        .to(st, { spin: Math.PI * 2, sc: 1, duration: 0.85, ease: springCurve(0.55, 12) })
        .call(() => (st.spin = 0));
      ignite(0.75);
    });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      tier = rarity(c.rarity).tier;
      stage = createStage(c, { bg: ['#2a2622', '#0b0a09'], env: 'studio', fill: 0.76, fillPortrait: 0.82 });
      const key = new DirectionalLight(0xfff0e0, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key);
      await ensureFonts();
      const first = cardForRarity(c.rarity);
      index = Math.max(0, CARDS.indexOf(first));
      art = c.bag.add(generateCardArt(first, c.rarity, { design: designId, scale: c.quality === 'mobile' ? 0.7 : 1 }));
      const back = c.bag.add(generateBackArt(undefined, 0.6));
      holo = createHoloMaterial(art, tier, { aoFromFrame: true });
      holo.uniforms.strength.value = 0.58; // l'illustration reste lisible sous le foil
      // étoiles : B = (k+1)·32/255 → index k ; elles s'allument quand U.lit dépasse k
      const b = holo.layers.masks.b;
      const idx = floor(b.mul(255 / 32).add(0.5)).sub(1);
      const lit = clamp(U.lit.sub(idx), 0, 1).mul(step(0.06, b));
      const sc = color(starColor(tier));
      const glow = lit.mul(float(0.25 + tier * 0.2).add(U.flash.mul(0.8 + tier * 0.3)));
      holo.material.emissiveNode = (holo.material.emissiveNode as N).add(sc.mul(glow));
      const mesh = createCardMesh(holo.material, createBackMaterial(back), createEdgeMaterial());
      rig.add(mesh);
      stage.scene.add(rig);
      await stage.compile();
      c.bag.fn(() => (tl?.kill(), autoCall?.kill()));
      c.bag.fn(c.input.onTap(() => next()));
      c.gui.add({ next }, 'next').name('carte suivante (tap)');
      c.gui.add(params, 'auto').name('diaporama').onChange((v: boolean) => (v ? !busy && next() : autoCall?.kill()));
      const sets = Object.fromEntries(Object.values(CARD_SETS).map((s) => [s.label, s.id]));
      c.gui
        .add(params, 'set', sets)
        .name('set (toutes les expériences)')
        .onChange(async (id: CardSetId) => {
          setActiveSet(id, true);
          await ensureFonts();
          tl?.kill();
          autoCall?.kill();
          index = -1;
          busy = false;
          next();
        });
      intro();
    },
    replay() {
      intro();
    },
    update(_dt, t) {
      const p = ctx.input.pose(0.34);
      const idle = ctx.input.inside || ctx.input.gyroEnabled ? 0 : 1;
      rig.position.set(0, st.rise + Math.sin(t * 0.9) * 0.004, st.z);
      rig.rotation.set(p.x + Math.sin(t * 0.5) * 0.05 * idle, st.spin + p.y + Math.sin(t * 0.37) * 0.22 * idle, 0);
      rig.scale.setScalar(st.sc);
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
