#!/usr/bin/env node
/**
 * Nouvelle expérience du labo, prête à lancer :
 *   npm run labo:new -- <slug> "<Titre>" [A|B|C|D]
 *   ex. npm run labo:new -- ouverture-neige "Ouverture — neige" B
 *
 * Crée src/experiments/<NNN>-<slug>/index.ts (numéro suivant, scène minimale : carte qui tourne, tap = replay)
 * et ajoute l'entrée à la fin de src/core/registry.ts. Ne touche à rien d'autre.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [rawSlug, title, cat = 'B'] = process.argv.slice(2);
const die = (m) => {
  console.error(`✗ ${m}\n  usage : npm run labo:new -- <slug> "<Titre>" [A|B|C|D]`);
  process.exit(1);
};
if (!rawSlug || !title) die('slug et titre obligatoires');
if (!/^[ABCD]$/.test(cat)) die(`catégorie « ${cat} » inconnue (A carte · B ouverture · C rareté · D design)`);
const slug = rawSlug
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
if (!slug) die('slug vide');

const expDir = join(root, 'src/experiments');
const regPath = join(root, 'src/core/registry.ts');
const reg = readFileSync(regPath, 'utf8');
const nums = [...readdirSync(expDir), ...[...reg.matchAll(/id: '(\d{3})-/g)].map((m) => m[1])].map((s) => parseInt(s, 10)).filter((n) => n > 0);
const id = `${String(Math.max(0, ...nums) + 1).padStart(3, '0')}-${slug}`;
const dir = join(expDir, id);
if (existsSync(dir)) die(`${id} existe déjà`);

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, '’');
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, 'index.ts'),
  `import gsap from 'gsap';
import { Color, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, AmbientLight, DirectionalLight } from 'three/webgpu';
import type { Experiment, LabContext } from '../../core/Experiment';
import { RARITIES } from '../../core/rarity';
import { DUR } from '../../core/motion';

/**
 * ${id.slice(0, 3)} — ${esc(title)}
 * Point de départ généré par \`npm run labo:new\` : une carte qui tourne, tap = rejouer, rareté = couleur.
 * Tout ce qui est créé passe par ctx.bag (libéré au changement d'expérience).
 */
export default function create(): Experiment {
  let ctx!: LabContext;
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  let card!: Mesh;
  let mat!: MeshStandardNodeMaterial;
  const params = { vitesse: 0.4 };

  const tint = (r: string) => mat.color.set(RARITIES.find((x) => x.id === r)?.hex ?? '#ffffff');
  const replay = () => {
    gsap.killTweensOf(card.rotation);
    card.rotation.set(0, Math.PI, 0);
    gsap.to(card.rotation, { y: 0, duration: DUR.dramatique / 1000, ease: 'expo.out' });
  };
  const resize = (w: number, h: number) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return {
    setup(c) {
      ctx = c;
      scene.background = new Color('#121110');
      camera.position.set(0, 0, 4.2);
      scene.add(new AmbientLight('#ffffff', 0.6));
      const sun = new DirectionalLight('#ffffff', 2.2);
      sun.position.set(2, 3, 4);
      scene.add(sun);
      mat = c.bag.add(new MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.2 }));
      card = new Mesh(c.bag.add(new PlaneGeometry(1.26, 1.76)), mat);
      scene.add(card);
      c.bag.scene(scene);
      tint(c.rarity);
      c.gui.add(params, 'vitesse', 0, 2, 0.01);
      c.bag.fn(c.input.onTap(() => replay()));
      resize(c.width, c.height);
      replay();
    },
    update(dt) {
      card.rotation.x = Math.sin(performance.now() / 1400) * 0.12;
      card.rotation.y += dt * params.vitesse * 0.2;
      ctx.renderer.render(scene, camera);
    },
    resize,
    replay,
    setRarity: (r) => tint(r),
    dispose() {
      gsap.killTweensOf(card.rotation);
    },
  };
}
`,
);

const entry = `  {
    id: '${id}',
    title: '${esc(title)}',
    category: '${cat}',
    tags: ['nouveau'],
    tech: ['à compléter'],
    blurb: 'À compléter : l’intention en une ligne.',
    hint: 'Tap = rejouer',
    load: () => import('../experiments/${id}/index.ts'),
  },
];`;
const i = reg.indexOf('\n];');
if (i < 0) die('fin du registre introuvable (\\n];)');
writeFileSync(regPath, reg.slice(0, i + 1) + entry + reg.slice(i + 3));
console.log(`✓ ${id} créée\n  src/experiments/${id}/index.ts\n  entrée ajoutée à src/core/registry.ts\n  → npm run dev puis #/exp/${id}`);
