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
