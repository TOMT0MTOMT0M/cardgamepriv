import { Box3, Matrix4, Quaternion, Vector3, type Object3D } from 'three/webgpu';

/**
 * Animation PROCÉDURALE d'un squelette de monstre « façon Konami » (os nommés WAIST, SPINE1-3, NECK, OPTION_00/01 (cou),
 * HEAD, MOUTH, TAIL_01…07, OPTION_00…07_L/R (ailes)) — le cas des modèles déposés dans public/fx/yugioh/models, qui
 * arrivent SANS animation. Chaque rotation est donnée autour d'un axe du MONDE (X = tangage, Y = lacet, Z = roulis),
 * converti une fois pour toutes dans l'espace du parent au repos : `bone = R(axe, angle) · repos`. Pour les tangages
 * (axe X, perpendiculaire au plan de symétrie) la composition est exacte même quand les parents bougent aussi.
 *
 * Les doublons sont gérés : un modèle extrait d'un jeu a souvent un squelette par maillage (mêmes os, mêmes noms ;
 * GLTFLoader les renomme NECK_1, NECK_2…) — le nom d'origine est lu dans `userData.rig` (posé à la conversion), et
 * tous les os d'un même nom reçoivent la même rotation.
 */
export type Pose = Record<string, [number, number, number]>;

interface Joint {
  o: Object3D;
  rest: Quaternion;
  X: Vector3;
  Y: Vector3;
  Z: Vector3;
}

export interface Rig {
  has(name: string): boolean;
  apply(p: Pose): void;
  /** position monde (au repos) d'un os, s'il existe */
  rest(name: string): Vector3 | null;
}

export function createRig(root: Object3D): Rig {
  const joints = new Map<string, Joint[]>();
  const restPos = new Map<string, Vector3>();
  root.updateMatrixWorld(true);
  const pq = new Quaternion();
  root.traverse((o) => {
    if (!(o as unknown as { isBone?: boolean }).isBone) return;
    const name = String((o.userData as { rig?: string }).rig ?? o.name);
    if (o.parent) o.parent.getWorldQuaternion(pq);
    else pq.identity();
    const inv = pq.clone().invert();
    const ax = (x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(inv).normalize();
    const j: Joint = { o, rest: o.quaternion.clone(), X: ax(1, 0, 0), Y: ax(0, 1, 0), Z: ax(0, 0, 1) };
    if (!joints.has(name)) {
      joints.set(name, []);
      restPos.set(name, o.getWorldPosition(new Vector3()));
    }
    joints.get(name)!.push(j);
  });
  const tmp = new Quaternion();
  const acc = new Quaternion();
  return {
    has: (n) => joints.has(n),
    rest: (n) => restPos.get(n)?.clone() ?? null,
    apply(p) {
      for (const [name, list] of joints) {
        const r = p[name];
        for (const j of list) {
          if (!r) {
            j.o.quaternion.copy(j.rest);
            continue;
          }
          acc.identity();
          if (r[1]) acc.multiply(tmp.setFromAxisAngle(j.Y, r[1]));
          if (r[0]) acc.multiply(tmp.setFromAxisAngle(j.X, r[0]));
          if (r[2]) acc.multiply(tmp.setFromAxisAngle(j.Z, r[2]));
          j.o.quaternion.copy(acc).multiply(j.rest);
        }
      }
    },
  };
}

/** Le squelette est-il celui d'un dragon ailé (cou, tête, ailes) ? */
export const isWingedRig = (r: Rig) => r.has('NECK') && r.has('HEAD') && r.has('OPTION_00_L') && r.has('OPTION_00_R');

/**
 * Pose d'un dragon ailé, `t` en secondes :
 *  - rear 0..1 : le cou se dresse, la tête revient vers l'avant (rugissement, garde) ;
 *  - wing −1..1 : ailes repliées vers le bas … levées ; flap : battement (rad) ajouté ;
 *  - mouth 0..1 : gueule ouverte ; life 0..1 : souffle, balancement de la tête, queue qui ondule.
 */
export function dragonPose(o: { t: number; rear: number; wing: number; flap: number; mouth: number; life: number }): Pose {
  const { t, rear, life } = o;
  const p: Pose = {};
  p.SPINE3 = [-0.18 * rear + Math.sin(t * 1.6) * 0.015 * life, 0, 0];
  p.NECK = [-0.75 * rear + Math.sin(t * 1.3) * 0.03 * life, Math.sin(t * 0.7) * 0.06 * life, 0];
  p.OPTION_00 = [-0.2 * rear, 0, 0];
  p.OPTION_01 = [0.15 * rear, 0, 0];
  p.HEAD = [0.55 * rear + Math.sin(t * 1.3 + 0.6) * 0.03 * life, Math.sin(t * 0.7 + 0.4) * 0.05 * life, 0];
  p.MOUTH = [0.45 * o.mouth, 0, 0];
  const w = o.wing * 0.5 + o.flap;
  p.OPTION_00_L = [0, 0, w];
  p.OPTION_00_R = [0, 0, -w];
  for (let k = 1; k <= 7; k++) p['TAIL_0' + k] = [Math.sin(t * 1.1 - k * 0.5) * 0.03 * life, Math.sin(t * 0.9 - k * 0.55) * 0.09 * life, 0];
  return p;
}

/**
 * Animation automatique pour les autres squelettes (modèles Cross Duel, Duel Links, Sketchfab : noms d'os variés, posés
 * en T, sans animation). Les rôles sont reconnus au NOM (suffixes d'export retirés : « Neck_087 » → « neck »), le côté au
 * préfixe (L_/left…) sinon à la position (x > 0 = gauche du modèle, qui regarde +Z).
 *
 * Méthode (voir le rapport « poses procédurales ») :
 *  - les MEMBRES (bras, avant-bras, main, cuisse, jambe, pied) sont posés en DIRECTION ABSOLUE dans le repère du modèle
 *    (+X = sa gauche, +Y = haut, +Z = devant) : le résultat ne dépend pas du repos (T-pose, A-pose, bras pendants) ;
 *  - coude et genou : le plan de flexion est IMPOSÉ (le segment supérieur est tourné pour que sa charnière de repos
 *    tombe dans le plan bras/avant-bras visé) — ils plient toujours du bon côté, jamais à l'envers ;
 *  - le côté droit est le miroir du gauche (direction (−x, y, z) ; rotation (x, −y, −z) ; roulis −r), sauf réglage `.R` ;
 *  - clavicule : suit 25 % de l'élévation du bras au-dessus de l'horizontale ;
 *  - colonne, cou, queue : rotations autour des axes du MONDE, réparties sur les os de la chaîne ;
 *  - tout autre os (doigts d'aile, jupe, capuche…) se règle par un morceau de son nom (`rot: { elbowwing: […] }`).
 * Un modèle extrait d'un jeu a souvent un squelette PAR MAILLAGE (mêmes noms) : la pose est calculée sur le premier et
 * recopiée sur les doublons.
 */
type Role = 'arm' | 'forearm' | 'hand' | 'shoulder' | 'hips' | 'upleg' | 'leg' | 'foot' | 'spine' | 'neck' | 'head' | 'jaw' | 'wing' | 'tail';
const ROLES: Array<[Role, RegExp]> = [
  ['forearm', /^(l|r|left|right)_?forearm\d*$/],
  ['arm', /^(l|r|left|right)_?(upper)?arm\d*$/],
  ['hand', /^(l|r|left|right)_?hand\d*$/],
  ['shoulder', /^(l|r|left|right)_?shoulder\d*$/],
  ['upleg', /^(l|r|left|right)_?(upleg|upreg|thigh|upperleg)\d*$/],
  ['leg', /^(l|r|left|right)_?(leg|reg|calf|lowerleg)\d*$/],
  ['foot', /^(l|r|left|right)_?foot\d*$/],
  ['hips', /^hips\d*$/],
  ['spine', /^spine\d*$/],
  ['neck', /^neck\d*$/],
  ['head', /^head\d*$/],
  ['jaw', /^(jaw|mouth|snakemouth|chin|downchin)\d*$/],
  ['wing', /^(l|r|left|right)_?wing(01)?$/],
  ['tail', /^tail\d*$/],
];
const clean = (raw: string) => raw.toLowerCase().replace(/_\d{2,4}$/, '');
export const roleOf = (raw: string): Role | null => {
  const n = clean(raw);
  for (const [r, re] of ROLES) if (re.test(n)) return r;
  return null;
};
/** nom sans côté ni suffixe : « L_ElbowRoll01 » → « elbowroll01 », « leftElbowWing_070 » → « elbowwing » */
const bare = (raw: string) => clean(raw).replace(/^(left|right|l_|r_)/, '');

type V3 = [number, number, number];
type Limb = 'arm' | 'forearm' | 'hand' | 'upleg' | 'leg' | 'foot';
type Sided<K extends string> = K | `${K}.L` | `${K}.R`;
/**
 * Pose propre à un modèle (duelMonsters.ts → `pose`), côté GAUCHE du modèle (le droit en miroir sauf clé `.R`) :
 *  - `dir`  : direction visée de chaque membre (vecteur, normalisé ici), repère du modèle (+X sa gauche, +Y haut, +Z devant) ;
 *  - `roll` : torsion du membre autour de son axe une fois orienté (radians) ;
 *  - `rot`  : rotations autour des axes du MONDE [x, y, z] (radians ; x+ = pencher en avant / baisser, y+ = tourner vers
 *    sa gauche, z+ = incliner vers sa droite… pour le côté gauche), par rôle (`spine`, `neck`, `head`, `hips`, `tail`,
 *    `wing`, `shoulder`, `jaw`) ou par morceau de nom d'os (`elbowwing`, `skirt`…). Chaînes : réparties sur leurs os.
 */
export interface PoseSpec {
  /**
   * os (morceau de nom) remis À L'HORIZONTALE après les rotations de leurs parents, en gardant leur cap (0..1 = part) :
   * le segment qui porte les pattes reste droit sous elles même quand le corps s'enroule. Les membres qui en dépendent
   * (cuisses, jambes, pieds) suivent ce cap : leur `dir` est exprimée dans son repère.
   */
  level?: Record<string, number>;
  /**
   * clés de `rot` (rôle ou nom) appliquées dans le repère COURANT du parent plutôt que celui du modèle : chaque segment
   * se plie de la même façon par rapport au précédent → vraie spirale (queue, corps de serpent qui s'enroule)
   */
  curl?: string[];
  dir?: Partial<Record<Sided<Limb>, V3>>;
  roll?: Partial<Record<Sided<Limb>, number>>;
  rot?: Record<string, V3>;
}
/** @deprecated ancien format */
export type PoseTune = PoseSpec;

export interface AutoPose {
  kind: 'humanoid' | 'dragon' | 'serpent';
  /** rise 0..1 : déploiement (invocation) ; mouth 0..1 ; life 0..1 (souffle, balancements) */
  apply(o: { t: number; rise: number; mouth: number; life: number }): void;
  /** point d'appui (milieu des pieds, sinon du bassin) dans le repère du modèle — pour centrer sur la carte */
  anchor(): Vector3 | null;
  debug?(): unknown;
}

interface B {
  o: Object3D;
  name: string;
  bare: string;
  role: Role | null;
  side: number;
  depth: number;
  rest: Quaternion;
  /** orientation de repos dans le repère du modèle */
  restM: Quaternion;
  /** direction de l'os (vers son enfant de chaîne), dans son repère local */
  axis: Vector3 | null;
  /** charnière de repos (coude / genou), repère local */
  hinge: Vector3 | null;
  /** pied : dessus de repos, repère local */
  up?: Vector3;
  order: number;
  dups: Object3D[];
}

const CHAIN_CHILD: Partial<Record<Role, Role[]>> = {
  arm: ['forearm'],
  forearm: ['hand'],
  upleg: ['leg'],
  leg: ['foot'],
};

export function createAutoPose(root: Object3D, spec: PoseSpec = {}): AutoPose | null {
  root.updateMatrixWorld(true);
  const rootInv = root.getWorldQuaternion(new Quaternion()).invert();
  const rootM = root.matrixWorld.clone().invert();
  const byName = new Map<string, B>();
  const list: B[] = [];
  const posOf = (o: Object3D) => o.getWorldPosition(new Vector3()).applyMatrix4(rootM);
  const qOf = (o: Object3D) => rootInv.clone().multiply(o.getWorldQuaternion(new Quaternion()));
  root.traverse((o) => {
    if (!(o as unknown as { isBone?: boolean }).isBone) return;
    const name = String((o.userData as { rig?: string }).rig ?? o.name);
    const had = byName.get(name);
    if (had) {
      // doublon IMBRIQUÉ sous l'os (nœud de pivot d'un export FBX, transformation nulle) : il suit déjà son parent,
      // le tourner aussi doublerait la rotation → on le laisse au repos. Doublon PARALLÈLE (squelette par maillage) : copié.
      let nested = false;
      for (let q = o.parent; q && q !== root; q = q.parent) if (q === had.o) nested = true;
      if (!nested) had.dups.push(o);
      return;
    }
    const lower = name.toLowerCase();
    const w = posOf(o);
    let depth = 0;
    for (let q = o.parent; q && q !== root; q = q.parent) depth++;
    const role = roleOf(name);
    const b: B = {
      o, name, bare: bare(name), role, depth,
      side: /^(l_|left)/.test(lower) || /^l[A-Z]/.test(name) ? 1 : /^(r_|right)/.test(lower) || /^r[A-Z]/.test(name) ? -1 : Math.sign(w.x) || 1,
      rest: o.quaternion.clone(), restM: qOf(o).normalize(), axis: null, hinge: null,
      order: Number((clean(name).match(/(\d+)$/) ?? [, '0'])[1]), dups: [],
    };
    byName.set(name, b);
    list.push(b);
  });
  if (!list.length) return null;
  // centre du modèle : le côté « à la position » se juge par rapport au milieu des hanches/colonne, pas à x = 0
  const mids = list.filter((b) => b.role === 'spine' || b.role === 'hips' || b.role === 'neck').map((b) => posOf(b.o).x);
  // taille : étendue des os (pas de Box3 « précise » ici : elle touche aux matrices de skinning avant le 1er rendu)
  const bb = new Box3();
  for (const b of list) bb.expandByPoint(posOf(b.o));
  const size = Math.max(1e-6, ...bb.getSize(new Vector3()).toArray());
  const cx = mids.length ? mids.reduce((a, v) => a + v, 0) / mids.length : 0;
  for (const b of list) {
    const lower = b.name.toLowerCase();
    if (/^(l_|left|r_|right)/.test(lower) || /^[lr][A-Z]/.test(b.name)) continue;
    // os du plan de symétrie : pas de miroir (côté +1)
    const dx = posOf(b.o).x - cx;
    b.side = Math.abs(dx) < size * 0.01 ? 1 : Math.sign(dx);
  }
  const by = (r: Role) => list.filter((b) => b.role === r);
  const has = (r: Role) => by(r).length > 0;
  const span = (r: Role, k: 'z' | 'y') => {
    const v = by(r).map((b) => posOf(b.o)[k]);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  const horizNeck = has('tail') && span('neck', 'z') > span('neck', 'y');
  const kind: AutoPose['kind'] = horizNeck && span('spine', 'z') > span('neck', 'z') * 1.5 ? 'serpent' : horizNeck ? 'dragon' : 'humanoid';

  // axes des membres : vers l'os enfant de chaîne (même côté) ; main / pied : vers le descendant le plus éloigné
  const descendants = (o: Object3D) => {
    const out: Object3D[] = [];
    o.traverse((c) => { if (c !== o && (c as unknown as { isBone?: boolean }).isBone) out.push(c); });
    return out;
  };
  for (const b of list) {
    if (!b.role || !['arm', 'forearm', 'hand', 'upleg', 'leg', 'foot'].includes(b.role)) continue;
    const p0 = posOf(b.o);
    const want = CHAIN_CHILD[b.role];
    let tip: Vector3 | null = null;
    const ds = descendants(b.o);
    if (want) {
      const c = ds.find((d) => roleOf(String((d.userData as { rig?: string }).rig ?? d.name)) === want[0]);
      if (c) tip = posOf(c);
    } else {
      // main / pied : descendant le plus loin (hors arme), limité aux 3 premiers niveaux
      let best = 0;
      for (const d of ds) {
        const n = String((d.userData as { rig?: string }).rig ?? d.name).toLowerCase();
        if (/weapon|chain|armor|armour/.test(n)) continue;
        const p = posOf(d);
        const l = p.distanceTo(p0);
        if (l > best) { best = l; tip = p; }
      }
    }
    if (!tip || tip.distanceTo(p0) < 1e-6) continue;
    const dirM = tip.clone().sub(p0).normalize();
    const q = qOf(b.o);
    const qi = q.clone().invert();
    b.axis = dirM.clone().applyQuaternion(qi);
    // charnière : coude = flexion vers l'avant, genou = vers l'arrière (repère du modèle)
    // pied : le « dessus » de repos (haut du modèle) — pour garder la plante à plat quel que soit le corps
    if (b.role === 'foot') b.up = new Vector3(0, 1, 0).applyQuaternion(qi);
    if (b.role === 'arm' || b.role === 'upleg') {
      const flex = new Vector3(0, 0, b.role === 'arm' ? 1 : -1);
      const h = dirM.clone().cross(flex);
      if (h.lengthSq() < 1e-4) h.set(b.side, 0, 0).cross(dirM); // os déjà dans l'axe avant/arrière
      b.hinge = h.normalize().applyQuaternion(qi);
    }
  }

  const sideKey = <K extends string>(b: B, k: K) => `${k}.${b.side > 0 ? 'L' : 'R'}`;
  const dirFor = (b: B): Vector3 | null => {
    const d = spec.dir as Record<string, V3> | undefined;
    if (!d || !b.role) return null;
    const own = d[sideKey(b, b.role)];
    if (own) return new Vector3(...own).normalize();
    const both = d[b.role];
    if (!both) return null;
    return new Vector3(b.side > 0 ? both[0] : -both[0], both[1], both[2]).normalize();
  };
  const rollFor = (b: B): number => {
    const r = spec.roll as Record<string, number> | undefined;
    if (!r || !b.role) return 0;
    const own = r[sideKey(b, b.role)];
    if (own !== undefined) return own;
    const both = r[b.role] ?? 0;
    return b.side > 0 ? both : -both;
  };
  // (audit 12/11, S17 / A10-02) réponses gardées par os : elles ne dépendent que de la spec et du nom de l'os, et étaient
  // recalculées à chaque image pour chaque os (une RegExp par clé de spec, un filtre, une recherche)
  const perBone = <T,>(fn: (b: B) => T) => {
    const m = new Map<B, T>();
    return (b: B): T => {
      if (m.has(b)) return m.get(b) as T;
      const v = fn(b);
      m.set(b, v);
      return v;
    };
  };
  const rotKeys = Object.keys(spec.rot ?? {});
  const rotFor = perBone((b: B): V3 | null => {
    const r = spec.rot;
    if (!r) return null;
    const pick = (k: string): V3 | null => {
      const own = r[`${k}.${b.side > 0 ? 'L' : 'R'}`];
      if (own) return own;
      const both = r[k];
      if (!both) return null;
      return b.side > 0 ? both : [both[0], -both[1], -both[2]];
    };
    if (b.role) {
      const v = pick(b.role);
      if (v) return v;
    }
    // morceau de nom (le plus long qui correspond)
    let best: string | null = null;
    for (const k0 of rotKeys) {
      const k = k0.replace(/\.(L|R)$/, '');
      if (ROLE_NAMES.has(k)) continue;
      // nom exact, chiffres de fin tolérés : « joint » → joint3…joint7, « wing03 » ≠ « fourthwing03 »
      if (new RegExp(`^${k.toLowerCase()}\\d*$`).test(b.bare) && (!best || k.length > best.length)) best = k;
    }
    return best ? pick(best) : null;
  });
  const chainLens = new Map<Role, number>();
  const chainLen = (r: Role) => {
    let n = chainLens.get(r);
    if (n === undefined) chainLens.set(r, (n = Math.max(1, by(r).length)));
    return n;
  };
  const curlKeys = spec.curl ?? [];
  const curlFor = perBone((b: B) => curlKeys.some((k) => (b.role && k === b.role) || new RegExp(`^${k.toLowerCase()}\\d*$`).test(b.bare)));
  const levelKeys = Object.keys(spec.level ?? {});
  const levelFor = perBone((b: B): number => {
    let best: string | null = null;
    for (const k of levelKeys) if (new RegExp(`^${k.toLowerCase()}\\d*$`).test(b.bare) && (!best || k.length > best.length)) best = k;
    return best ? spec.level![best] : 0;
  });
  const byObj = new Map<Object3D, B>(list.map((b) => [b.o, b]));
  /** cap (lacet) des os remis à l'horizontale, pour l'appliquer aux membres qui en dépendent */
  const heading = new Map<B, Quaternion>();
  const headingOf = (b: B): Quaternion | null => {
    for (let o = b.o.parent; o && o !== root; o = o.parent) {
      const a = byObj.get(o);
      const h = a && heading.get(a);
      if (h) return h;
    }
    return null;
  };

  // ordre de traitement : parents d'abord
  const sorted = [...list].sort((a, b) => a.depth - b.depth);
  const posed = new Map<B, Quaternion>();
  const cache = new Map<Object3D, Quaternion>();
  /** orientation courante dans le repère du modèle (à partir des quaternions locaux) */
  const rq = (o: Object3D | null): Quaternion => {
    if (!o || o === root) return new Quaternion();
    const c = cache.get(o);
    if (c) return c;
    const q = rq(o.parent).clone().multiply(o.quaternion).normalize();
    cache.set(o, q);
    return q;
  };
  const tq = new Quaternion(), tq2 = new Quaternion(), tv = new Vector3(), tv2 = new Vector3();
  const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0), AZ = new Vector3(0, 0, 1);
  const worldRot = (x: number, y: number, z: number) => {
    const q = new Quaternion();
    if (y) q.multiply(tq.setFromAxisAngle(AY, y));
    if (x) q.multiply(tq.setFromAxisAngle(AX, x));
    if (z) q.multiply(tq.setFromAxisAngle(AZ, z));
    return q;
  };
  /** applique une rotation (repère du modèle) à l'os, autour de son orientation COURANTE */
  const turn = (b: B, D: Quaternion) => {
    const pq = rq(b.o.parent);
    const cur = pq.clone().multiply(b.o.quaternion);
    const next = D.clone().normalize().multiply(cur).normalize();
    b.o.quaternion.copy(pq.clone().invert().multiply(next).normalize());
    cache.clear();
  };
  /** cadre orthonormé (a, b, a×b) → quaternion */
  const frame = (a: Vector3, h: Vector3) => {
    const x = a.clone().normalize();
    const y = h.clone().sub(x.clone().multiplyScalar(h.dot(x))).normalize();
    const z = x.clone().cross(y);
    const m = new Matrix4().makeBasis(x, y, z);
    return new Quaternion().setFromRotationMatrix(m);
  };
  // directions visées (avec souffle), pour lire le plan de flexion depuis le segment supérieur
  const lowerOf = perBone((b: B) => list.find((c) => c.role === CHAIN_CHILD[b.role!]![0] && c.side === b.side));

  const pose = (t: number, mouth: number, life: number) => {
    for (const b of list) b.o.quaternion.copy(b.rest);
    cache.clear();
    heading.clear();
    const br = Math.sin(t * 1.6) * life;
    for (const b of sorted) {
      const k = b.side;
      // 1) rotations autour des axes du monde (rôles + noms)
      let r = rotFor(b);
      const life3: V3 = [0, 0, 0];
      switch (b.role) {
        case 'spine': life3[0] = br * 0.012; break;
        case 'neck': life3[0] = Math.sin(t * 1.3) * 0.015 * life; life3[1] = Math.sin(t * 0.7) * 0.04 * life; break;
        case 'head': life3[0] = Math.sin(t * 1.3 + 0.6) * 0.025 * life; life3[1] = Math.sin(t * 0.7 + 0.4) * 0.05 * life; break;
        case 'tail': life3[1] = Math.sin(t * 0.9 - b.order * 0.55) * 0.05 * life; break;
        case 'wing': life3[2] = -k * Math.sin(t * 1.8) * 0.06 * life; break;
        case 'jaw': r = [(r?.[0] ?? 0) + 0.4 * mouth, r?.[1] ?? 0, r?.[2] ?? 0]; break;
      }
      if (r || life3[0] || life3[1] || life3[2]) {
        const n = b.role === 'spine' || b.role === 'neck' || b.role === 'tail' ? chainLen(b.role) : 1;
        const v = r ?? [0, 0, 0];
        const D = worldRot(v[0] / n + life3[0], v[1] / n + life3[1], v[2] / n + life3[2]);
        const pb = curlFor(b) && b.o.parent ? byObj.get(b.o.parent) : undefined;
        if (pb) {
          // repère du parent tel qu'il est tourné maintenant : D' = Δp · D · Δp⁻¹
          const dp = rq(pb.o).clone().multiply(pb.restM.clone().invert()).normalize();
          D.premultiply(dp).multiply(dp.clone().invert());
        }
        turn(b, D);
      }
      // 1b) remise à l'horizontale (cap conservé)
      const lv = levelFor(b);
      if (lv > 0) {
        const cur = rq(b.o.parent).clone().multiply(b.o.quaternion).normalize();
        const f = new Vector3(0, 0, 1).applyQuaternion(b.restM.clone().invert()).applyQuaternion(cur);
        f.y = 0;
        const yaw = f.lengthSq() > 1e-6 ? Math.atan2(f.x, f.z) : 0;
        const H = new Quaternion().setFromAxisAngle(AY, yaw);
        const target = H.clone().multiply(b.restM);
        const next = cur.clone().slerp(target, Math.min(1, lv));
        turn(b, next.multiply(cur.clone().invert()));
        heading.set(b, H);
      }
      // 2) clavicule : suit l'élévation du bras
      if (b.role === 'shoulder') {
        const arm = list.find((c) => c.role === 'arm' && c.side === k);
        const ad = arm && dirFor(arm);
        if (ad && ad.y > 0) turn(b, tq2.setFromAxisAngle(AZ, k * Math.asin(Math.min(1, ad.y)) * 0.25).clone());
      }
      // 3) membres en direction absolue
      const target = dirFor(b);
      const hd = target ? headingOf(b) : null;
      if (target && hd) target.applyQuaternion(hd);
      if (target && b.axis) {
        if (b.role === 'arm' || b.role === 'forearm' || b.role === 'upleg' || b.role === 'leg') {
          // petit balancement de vie sur les bras
          if (b.role === 'arm') target.add(tv2.set(0, 0, Math.sin(t * 1.1 + k) * 0.03 * life)).normalize();
        }
        const cur = rq(b.o.parent).clone().multiply(b.o.quaternion);
        const curDir = b.axis.clone().applyQuaternion(cur);
        let D: Quaternion;
        const low = (b.role === 'arm' || b.role === 'upleg') && b.hinge ? lowerOf(b) : undefined;
        const lowT = low ? dirFor(low) : null;
        if (lowT && hd) lowT.applyQuaternion(hd);
        const plane = lowT ? target.clone().cross(lowT) : null;
        if (plane && plane.lengthSq() > 0.004 && b.hinge) {
          // plan de flexion imposé : charnière courante → normale du plan (segment, segment suivant)
          const curH = b.hinge.clone().applyQuaternion(cur);
          const from = frame(curDir, curH);
          const to = frame(target, plane.normalize());
          D = to.multiply(from.invert());
        } else if (b.up) {
          // pied à plat : axe → cible, dessus → le plus près possible du haut du modèle
          const from = frame(curDir, b.up.clone().applyQuaternion(cur));
          const to = frame(target, AY.clone());
          D = to.multiply(from.invert());
        } else {
          D = new Quaternion().setFromUnitVectors(curDir, target);
        }
        const roll = rollFor(b);
        if (roll) D.premultiply(tq2.setFromAxisAngle(target, roll));
        turn(b, D);
      } else if (b.role && b.axis && rollFor(b)) {
        const cur = rq(b.o.parent).clone().multiply(b.o.quaternion);
        turn(b, new Quaternion().setFromAxisAngle(b.axis.clone().applyQuaternion(cur).normalize(), rollFor(b)));
      }
    }
    for (const b of list) posed.set(b, b.o.quaternion.clone());
  };
  void tv;
  return {
    kind,
    anchor() {
      const feet = by('foot');
      // repère PROPRE de la racine (indépendant de l'échelle / position qu'on lui donne ensuite)
      root.updateMatrixWorld(true);
      const pts = (feet.length ? feet : by('hips').length ? by('hips') : by('spine').slice(0, 1)).map((b) => root.worldToLocal(b.o.getWorldPosition(new Vector3())));
      if (!pts.length) return null;
      return pts.reduce((a, v) => a.add(v), new Vector3()).multiplyScalar(1 / pts.length);
    },
    debug() {
      cache.clear();
      return list.filter((b) => b.axis || Number.isNaN(b.o.quaternion.x)).map((b) => {
        const cur = rq(b.o.parent).clone().multiply(b.o.quaternion);
        const d = b.axis ? b.axis.clone().applyQuaternion(cur) : null;
        const tg = dirFor(b);
        return { n: b.name, side: b.side, nan: Number.isNaN(b.o.quaternion.x), act: d?.toArray().map((x) => +x.toFixed(2)), want: tg?.toArray().map((x) => +x.toFixed(2)) };
      });
    },
    apply({ t, rise, mouth, life }) {
      pose(t, mouth, life);
      for (const b of list) {
        const q = posed.get(b)!;
        if (rise < 1) q.copy(b.rest.clone().slerp(q, Math.max(0, rise)));
        b.o.quaternion.copy(q);
        for (const d of b.dups) d.quaternion.copy(q);
      }
    },
  };
}
const ROLE_NAMES = new Set(ROLES.map(([r]) => r as string));
