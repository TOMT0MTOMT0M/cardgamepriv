import { Quaternion, Vector3, type Object3D } from 'three/webgpu';

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
 * Animation automatique pour les autres squelettes (modèles Cross Duel, Duel Links… : noms d'os variés, posés en T,
 * sans animation). Les rôles sont reconnus au NOM (suffixes numériques d'export retirés : « Neck_087 » → « neck ») :
 * bras, avant-bras, colonne, cou, tête, mâchoire, ailes, queue — et le côté à la POSITION (x > 0 = gauche du modèle,
 * qui regarde +Z). Trois gabarits :
 *  - humanoïde (magiciens, Exodia, Obelisk) : bras baissés, souffle, tête qui vit ;
 *  - dragon (cou à l'horizontale, queue) : cou dressé, tête vers l'avant, ailes qui battent, queue qui ondule ;
 *  - serpent (colonne longue à l'horizontale, comme Slifer) : le corps se dresse en S, cou et tête vers l'avant.
 */
type Role = 'arm' | 'forearm' | 'hand' | 'shoulder' | 'hips' | 'upleg' | 'spine' | 'neck' | 'head' | 'jaw' | 'wing' | 'tail';
const ROLES: Array<[Role, RegExp]> = [
  ['forearm', /^(l|r|left|right)_?forearm\d*$/],
  ['arm', /^(l|r|left|right)_?(upper)?arm\d*$/],
  ['hand', /^(l|r|left|right)_?hand\d*$/],
  ['shoulder', /^(l|r|left|right)_?shoulder\d*$/],
  ['upleg', /^(l|r|left|right)_?(upleg|upreg|thigh|upperleg)\d*$/],
  ['hips', /^hips\d*$/],
  ['spine', /^spine\d*$/],
  ['neck', /^neck\d*$/],
  ['head', /^head\d*$/],
  ['jaw', /^(jaw|mouth|snakemouth)\d*$/],
  ['wing', /^(l|r|left|right)_?wing0?1?$/],
  ['tail', /^tail\d*$/],
];
const roleOf = (raw: string): Role | null => {
  const n = raw.toLowerCase().replace(/_\d{2,4}$/, '');
  for (const [r, re] of ROLES) if (re.test(n)) return r;
  return null;
};

/**
 * Pose propre à un modèle (duelMonsters.ts → `pose`) : rotations autour des axes du MONDE (radians, [x, y, z]), par rôle
 * et par côté — `arm.L` / `arm.R` (L = gauche DU MODÈLE, x > 0), ou `arm` pour les deux en miroir (y et z inversés à
 * droite). Elles REMPLACENT la pose par défaut du gabarit ; le souffle et les balancements s'y ajoutent. Les chaînes
 * (colonne, cou, queue) répartissent la rotation sur leurs os.
 */
export type PoseTune = Partial<Record<`${Role}` | `${Role}.L` | `${Role}.R`, [number, number, number]>>;

export interface AutoPose {
  kind: 'humanoid' | 'dragon' | 'serpent';
  /** rise 0..1 : déploiement (invocation) ; mouth 0..1 ; life 0..1 (souffle, balancements) */
  apply(o: { t: number; rise: number; mouth: number; life: number }): void;
}

export function createAutoPose(root: Object3D, tune: PoseTune = {}): AutoPose | null {
  root.updateMatrixWorld(true);
  const pq = new Quaternion();
  interface J extends Joint { role: Role; side: number; order: number; z: number; y: number }
  const joints: J[] = [];
  const byRole = new Map<Role, J[]>();
  root.traverse((o) => {
    if (!(o as unknown as { isBone?: boolean }).isBone) return;
    const name = String((o.userData as { rig?: string }).rig ?? o.name);
    const role = roleOf(name);
    if (!role) return;
    if (o.parent) o.parent.getWorldQuaternion(pq);
    else pq.identity();
    const inv = pq.clone().invert();
    const ax = (x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(inv).normalize();
    const w = o.getWorldPosition(new Vector3());
    const num = Number((name.toLowerCase().replace(/_\d{2,4}$/, '').match(/(\d+)$/) ?? [, '0'])[1]);
    const lower = name.toLowerCase();
    const side = /^(l|left)[_a-z]/.test(lower) ? 1 : /^(r|right)[_a-z]/.test(lower) ? -1 : Math.sign(w.x) || 1;
    const j: J = { o, rest: o.quaternion.clone(), X: ax(1, 0, 0), Y: ax(0, 1, 0), Z: ax(0, 0, 1), role, side, order: num, z: w.z, y: w.y };
    joints.push(j);
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(j);
  });
  const has = (r: Role) => (byRole.get(r)?.length ?? 0) > 0;
  if (!joints.length) return null;
  const span = (r: Role, k: 'z' | 'y') => {
    const v = byRole.get(r)?.map((j) => j[k]) ?? [];
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  // (mesures relatives : l'échelle des modèles va de 0,05 à 20 unités) cou qui s'étire vers l'avant plutôt que vers le
  // haut + une queue : bête à l'horizontale ; colonne bien plus longue que le cou : serpent
  const horizNeck = has('tail') && span('neck', 'z') > span('neck', 'y');
  const kind: AutoPose['kind'] = horizNeck && span('spine', 'z') > span('neck', 'z') * 1.5 ? 'serpent' : horizNeck ? 'dragon' : 'humanoid';
  for (const r of ['spine', 'neck', 'tail'] as Role[]) byRole.get(r)?.sort((a, b) => a.order - b.order);
  const tmp = new Quaternion(), acc = new Quaternion();
  const set = (j: J, x: number, y: number, z: number) => {
    acc.identity();
    if (y) acc.multiply(tmp.setFromAxisAngle(j.Y, y));
    if (x) acc.multiply(tmp.setFromAxisAngle(j.X, x));
    if (z) acc.multiply(tmp.setFromAxisAngle(j.Z, z));
    j.o.quaternion.copy(acc).multiply(j.rest);
  };
  /** pose réglée pour ce rôle / ce côté, sinon `def` (déjà orientée côté gauche : miroir appliqué ici) */
  const base = (j: J, def: [number, number, number]): [number, number, number] => {
    const sideKey = `${j.role}.${j.side > 0 ? 'L' : 'R'}` as keyof PoseTune;
    const own = tune[sideKey];
    if (own) return own;
    const both = tune[j.role as keyof PoseTune] ?? def;
    return j.side > 0 ? both : [both[0], -both[1], -both[2]];
  };
  const chainN = (r: Role) => byRole.get(r)?.length ?? 1;
  return {
    kind,
    apply({ t, rise, mouth, life }) {
      const br = Math.sin(t * 1.6) * life;
      for (const j of joints) {
        const k = j.side;
        let b: [number, number, number];
        switch (j.role) {
          case 'arm':
            b = base(j, [0, 0, -(kind === 'humanoid' ? 1.15 : 0.9)]);
            set(j, b[0] + Math.sin(t * 1.1 + k) * 0.04 * life, b[1], b[2] - k * Math.sin(t * 1.3 + k) * 0.03 * life);
            break;
          case 'forearm':
            b = base(j, [0, -0.25, -0.1]);
            set(j, b[0], b[1], b[2]);
            break;
          case 'hand':
          case 'shoulder':
          case 'hips':
          case 'upleg':
            b = base(j, [0, 0, 0]);
            if (b[0] || b[1] || b[2]) set(j, b[0] * rise, b[1] * rise, b[2] * rise);
            break;
          case 'spine': {
            const list = byRole.get('spine')!;
            const i = list.indexOf(j);
            const n = list.length;
            if (kind === 'serpent' && !tune.spine) {
              const f = (i + 1) / n;
              set(j, -0.24 * f * rise + Math.sin(t * 1.2 - i * 0.6) * 0.025 * life, Math.sin(t * 0.8 - i * 0.5) * 0.05 * life, 0);
            } else {
              b = base(j, [kind === 'dragon' && i === n - 1 ? -0.12 : 0, 0, 0]);
              const f = tune.spine ? 1 / n : 1;
              set(j, b[0] * f * rise + br * 0.015, b[1] * f * rise, b[2] * f * rise);
            }
            break;
          }
          case 'neck': {
            const n = chainN('neck');
            b = base(j, [kind === 'dragon' ? -0.85 : kind === 'serpent' ? 0.12 : 0, 0, 0]);
            set(j, (b[0] * rise) / n + Math.sin(t * 1.3) * 0.02 * life, (b[1] * rise) / n + (Math.sin(t * 0.7) * 0.06 * life) / n, (b[2] * rise) / n);
            break;
          }
          case 'head':
            b = base(j, [kind === 'dragon' ? 0.55 : kind === 'serpent' ? 0.35 : 0, 0, 0]);
            set(j, b[0] * rise + Math.sin(t * 1.3 + 0.6) * 0.03 * life, b[1] * rise + Math.sin(t * 0.7 + 0.4) * 0.06 * life, b[2] * rise);
            break;
          case 'jaw':
            set(j, 0.4 * mouth, 0, 0);
            break;
          case 'wing':
            // ailes : repliées au départ, s'ouvrent à l'invocation, puis battent doucement
            b = base(j, [0, 0, 0.18]);
            set(j, b[0] * rise, b[1] * rise, k * (b[2] * k * rise + (rise - 1) * 0.5 + Math.sin(t * 1.8) * 0.08 * life));
            break;
          case 'tail': {
            const list = byRole.get('tail')!;
            const i = list.indexOf(j);
            b = base(j, [0, 0, 0]);
            const n = list.length;
            set(j, (b[0] * rise) / n + Math.sin(t * 1.1 - i * 0.5) * 0.03 * life, (b[1] * rise) / n + Math.sin(t * 0.9 - i * 0.55) * 0.08 * life, 0);
            break;
          }
        }
      }
    },
  };
}
