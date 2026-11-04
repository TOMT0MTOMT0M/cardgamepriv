import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

// Node.js FileReader polyfill for GLTFExporter binary chunking
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}

const MODELS_DIR = 'C:/Users/Tom/Desktop/cardgamepriv/public/fx/yugioh/models';
fs.mkdirSync(MODELS_DIR, { recursive: true });

async function exportModel(name, rootGroup, clips) {
  const exporter = new GLTFExporter();
  const filePath = path.join(MODELS_DIR, `${name}.glb`);
  const gltf = await exporter.parseAsync(rootGroup, {
    binary: true,
    animations: clips
  });
  fs.writeFileSync(filePath, Buffer.from(gltf));
  console.log(`Generated: ${filePath} (${fs.statSync(filePath).size} bytes, clips: ${clips.map(c => c.name).join(', ')})`);
}

// -------------------------------------------------------------
// 1. BLUE-EYES WHITE DRAGON
// -------------------------------------------------------------
function buildBlueEyes() {
  const group = new THREE.Group();
  group.name = 'BlueEyesRoot';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xd8e8fa,
    roughness: 0.35,
    metalness: 0.25,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xc2d8f2,
    roughness: 0.45,
    metalness: 0.15,
    side: THREE.DoubleSide
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00b4d8,
    emissiveIntensity: 0.8,
    roughness: 0.1
  });
  const clawMat = new THREE.MeshStandardMaterial({
    color: 0xaecbe8,
    roughness: 0.3,
    metalness: 0.4
  });

  // Torso
  const torso = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 8), bodyMat);
  torso.name = 'Torso';
  torso.rotation.x = Math.PI * 0.15;
  group.add(torso);

  // Chest armor plate
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.8, 0.4), bodyMat);
  chest.name = 'Chest';
  chest.position.set(0, 0.2, 0.25);
  group.add(chest);

  // Neck and Head pivot
  const neckPivot = new THREE.Group();
  neckPivot.name = 'NeckPivot';
  neckPivot.position.set(0, 0.8, 0.2);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.9, 8), bodyMat);
  neck.position.set(0, 0.4, 0.1);
  neck.rotation.x = -Math.PI * 0.15;
  neckPivot.add(neck);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 6), bodyMat);
  head.name = 'Head';
  head.position.set(0, 0.95, 0.35);
  head.rotation.x = Math.PI * 0.4;
  neckPivot.add(head);

  // Horns
  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), clawMat);
  hornL.position.set(0.2, 1.15, 0.2);
  hornL.rotation.set(-0.2, 0, 0.4);
  neckPivot.add(hornL);

  const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), clawMat);
  hornR.position.set(-0.2, 1.15, 0.2);
  hornR.rotation.set(-0.2, 0, -0.4);
  neckPivot.add(hornR);

  // Glowing Blue Eyes
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
  eyeL.position.set(0.16, 0.98, 0.45);
  neckPivot.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
  eyeR.position.set(-0.16, 0.98, 0.45);
  neckPivot.add(eyeR);

  group.add(neckPivot);

  // Left Wing Pivot
  const wingPivotL = new THREE.Group();
  wingPivotL.name = 'WingPivotL';
  wingPivotL.position.set(0.4, 0.4, -0.1);
  const wingMeshL = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4), wingMat);
  wingMeshL.scale.set(0.1, 1, 0.8);
  wingMeshL.rotation.set(0.3, 0.2, -Math.PI * 0.45);
  wingMeshL.position.set(1.1, 0.6, 0);
  wingPivotL.add(wingMeshL);
  group.add(wingPivotL);

  // Right Wing Pivot
  const wingPivotR = new THREE.Group();
  wingPivotR.name = 'WingPivotR';
  wingPivotR.position.set(-0.4, 0.4, -0.1);
  const wingMeshR = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4), wingMat);
  wingMeshR.scale.set(0.1, 1, 0.8);
  wingMeshR.rotation.set(0.3, -0.2, Math.PI * 0.45);
  wingMeshR.position.set(-1.1, 0.6, 0);
  wingPivotR.add(wingMeshR);
  group.add(wingPivotR);

  // Tail Pivot
  const tailPivot = new THREE.Group();
  tailPivot.name = 'TailPivot';
  tailPivot.position.set(0, -0.6, -0.3);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.8, 6), bodyMat);
  tail.rotation.x = -Math.PI * 0.4;
  tail.position.set(0, -0.6, -0.6);
  tailPivot.add(tail);
  group.add(tailPivot);

  // Animations: summon & idle
  // 1. Summon: Scale 0.01 -> 1.1 -> 1.0, Wings sweep forward then blast wide, Head rears back
  const scaleTrack = new THREE.VectorKeyframeTrack(
    'BlueEyesRoot.scale',
    [0, 0.8, 1.4, 2.0],
    [0.01, 0.01, 0.01, 0.8, 0.8, 0.8, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
  );
  const wingLSummon = new THREE.QuaternionKeyframeTrack(
    'WingPivotL.quaternion',
    [0, 0.8, 1.4, 2.0],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.8)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, 0.9)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.5, -0.3)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
    ]
  );
  const wingRSummon = new THREE.QuaternionKeyframeTrack(
    'WingPivotR.quaternion',
    [0, 0.8, 1.4, 2.0],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.8)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.6, -0.9)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0.3)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
    ]
  );
  const neckSummon = new THREE.QuaternionKeyframeTrack(
    'NeckPivot.quaternion',
    [0, 0.8, 1.4, 2.0],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)).toArray(), // Rears back in roar!
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
    ]
  );

  const summonClip = new THREE.AnimationClip('summon', 2.0, [
    scaleTrack,
    wingLSummon,
    wingRSummon,
    neckSummon
  ]);

  // 2. Idle: Floating hover + breathing wing flap + subtle tail sway
  const posIdle = new THREE.VectorKeyframeTrack(
    'BlueEyesRoot.position',
    [0, 1.2, 2.4],
    [0, 0, 0, 0, 0.18, 0, 0, 0, 0]
  );
  const wingLIdle = new THREE.QuaternionKeyframeTrack(
    'WingPivotL.quaternion',
    [0, 1.2, 2.4],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.18)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.22)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.18)).toArray()
    ]
  );
  const wingRIdle = new THREE.QuaternionKeyframeTrack(
    'WingPivotR.quaternion',
    [0, 1.2, 2.4],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.18)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.22)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.18)).toArray()
    ]
  );
  const tailIdle = new THREE.QuaternionKeyframeTrack(
    'TailPivot.quaternion',
    [0, 1.2, 2.4],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.15, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.15, 0)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.15, 0)).toArray()
    ]
  );

  const idleClip = new THREE.AnimationClip('idle', 2.4, [
    posIdle,
    wingLIdle,
    wingRIdle,
    tailIdle
  ]);

  return { group, clips: [summonClip, idleClip] };
}

// -------------------------------------------------------------
// 2. DARK MAGICIAN
// -------------------------------------------------------------
function buildDarkMagician() {
  const group = new THREE.Group();
  group.name = 'DarkMagicianRoot';

  const robeMat = new THREE.MeshStandardMaterial({ color: 0x5a188a, roughness: 0.5 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9333ea, roughness: 0.3, metalness: 0.4 });
  const staffMat = new THREE.MeshStandardMaterial({ color: 0x221730, metalness: 0.7, roughness: 0.2 });
  const jewelMat = new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x00cc88, emissiveIntensity: 0.7 });

  // Robe body
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 8), robeMat);
  body.name = 'Body';
  body.position.y = 0.9;
  group.add(body);

  // Chest / Armor
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), trimMat);
  chest.position.set(0, 1.35, 0.05);
  group.add(chest);

  // Head and Pointed Curved Wizard Hat
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), trimMat);
  head.position.set(0, 1.85, 0);
  group.add(head);

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 7), robeMat);
  hat.position.set(0, 2.3, -0.1);
  hat.rotation.x = -Math.PI * 0.18;
  group.add(hat);

  // Magic Staff Pivot
  const staffPivot = new THREE.Group();
  staffPivot.name = 'StaffPivot';
  staffPivot.position.set(0.45, 1.2, 0.2);

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), staffMat);
  rod.position.y = 0.2;
  staffPivot.add(rod);

  const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), jewelMat);
  jewel.position.y = 1.35;
  staffPivot.add(jewel);

  group.add(staffPivot);

  // Animations
  const summonScale = new THREE.VectorKeyframeTrack(
    'DarkMagicianRoot.scale',
    [0, 0.7, 1.3, 1.8],
    [0.01, 0.01, 0.01, 0.9, 0.9, 0.9, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0]
  );
  const staffSummon = new THREE.QuaternionKeyframeTrack(
    'StaffPivot.quaternion',
    [0, 0.8, 1.4, 1.8],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 1.2)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0.4)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, -0.2)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
    ]
  );
  const summonClip = new THREE.AnimationClip('summon', 1.8, [summonScale, staffSummon]);

  const idlePos = new THREE.VectorKeyframeTrack(
    'DarkMagicianRoot.position',
    [0, 1.0, 2.0],
    [0, 0, 0, 0, 0.12, 0, 0, 0, 0]
  );
  const staffIdle = new THREE.QuaternionKeyframeTrack(
    'StaffPivot.quaternion',
    [0, 1.0, 2.0],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0.05)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, -0.05)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0.05)).toArray()
    ]
  );
  const idleClip = new THREE.AnimationClip('idle', 2.0, [idlePos, staffIdle]);

  return { group, clips: [summonClip, idleClip] };
}

// -------------------------------------------------------------
// 3. EXODIA THE FORBIDDEN ONE
// -------------------------------------------------------------
function buildExodia() {
  const group = new THREE.Group();
  group.name = 'ExodiaRoot';

  const goldMat = new THREE.MeshStandardMaterial({ color: 0xdfa12b, metalness: 0.65, roughness: 0.3 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x936526, roughness: 0.6 });
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x3d352e, metalness: 0.8, roughness: 0.3 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff0000, emissiveIntensity: 0.8 });

  // Massive Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.8), goldMat);
  torso.name = 'Torso';
  torso.position.y = 1.3;
  group.add(torso);

  // Egyptian Broad Shoulders
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9), stoneMat);
  shoulders.position.y = 1.9;
  group.add(shoulders);

  // Pharaoh Headdress & Horns
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), goldMat);
  head.position.set(0, 2.4, 0.1);
  group.add(head);

  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 6), stoneMat);
  hornL.position.set(0.45, 2.7, 0);
  hornL.rotation.z = -0.4;
  group.add(hornL);

  const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 6), stoneMat);
  hornR.position.set(-0.45, 2.7, 0);
  hornR.rotation.z = 0.4;
  group.add(hornR);

  // Broken chains hanging from wrists
  const armL = new THREE.Group();
  armL.name = 'ArmL';
  armL.position.set(1.2, 1.7, 0.2);
  const bicepL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.9, 8), stoneMat);
  armL.add(bicepL);
  const chainL = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 12), chainMat);
  chainL.position.y = -0.45;
  armL.add(chainL);
  group.add(armL);

  const armR = new THREE.Group();
  armR.name = 'ArmR';
  armR.position.set(-1.2, 1.7, 0.2);
  const bicepR = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.9, 8), stoneMat);
  armR.add(bicepR);
  const chainR = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 12), chainMat);
  chainR.position.y = -0.45;
  armR.add(chainR);
  group.add(armR);

  // Animations
  const summonScale = new THREE.VectorKeyframeTrack(
    'ExodiaRoot.scale',
    [0, 1.0, 1.6, 2.2],
    [0.01, 0.01, 0.01, 0.7, 0.7, 0.7, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
  );
  const armLSummon = new THREE.QuaternionKeyframeTrack(
    'ArmL.quaternion',
    [0, 1.0, 1.6, 2.2],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.8)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.4)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0.6)).toArray(), // Break chains!
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
    ]
  );
  const armRSummon = new THREE.QuaternionKeyframeTrack(
    'ArmR.quaternion',
    [0, 1.0, 1.6, 2.2],
    [
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.8)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.4)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, -0.6)).toArray(),
      ...new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).toArray()
    ]
  );
  const summonClip = new THREE.AnimationClip('summon', 2.2, [summonScale, armLSummon, armRSummon]);

  const idlePos = new THREE.VectorKeyframeTrack(
    'ExodiaRoot.position',
    [0, 1.2, 2.4],
    [0, 0, 0, 0, 0.1, 0, 0, 0, 0]
  );
  const idleClip = new THREE.AnimationClip('idle', 2.4, [idlePos]);

  return { group, clips: [summonClip, idleClip] };
}

// -------------------------------------------------------------
// 4. OBELISK THE TORMENTOR
// -------------------------------------------------------------
function buildObelisk() {
  const group = new THREE.Group();
  group.name = 'ObeliskRoot';

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x1d3f84, roughness: 0.7, metalness: 0.2 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x142c5f, roughness: 0.8, side: THREE.DoubleSide });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 1.0), stoneMat);
  body.position.y = 1.3;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), stoneMat);
  head.position.set(0, 2.6, 0.1);
  group.add(head);

  // Wings
  const wingL = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.8, 4), wingMat);
  wingL.position.set(1.4, 1.8, -0.4);
  wingL.rotation.set(0.2, 0.2, -0.6);
  group.add(wingL);

  const wingR = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.8, 4), wingMat);
  wingR.position.set(-1.4, 1.8, -0.4);
  wingR.rotation.set(0.2, -0.2, 0.6);
  group.add(wingR);

  // Animations
  const summonScale = new THREE.VectorKeyframeTrack(
    'ObeliskRoot.scale',
    [0, 0.9, 1.5, 2.0],
    [0.01, 0.01, 0.01, 0.75, 0.75, 0.75, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0]
  );
  const summonClip = new THREE.AnimationClip('summon', 2.0, [summonScale]);

  const idlePos = new THREE.VectorKeyframeTrack(
    'ObeliskRoot.position',
    [0, 1.5, 3.0],
    [0, 0, 0, 0, 0.08, 0, 0, 0, 0]
  );
  const idleClip = new THREE.AnimationClip('idle', 3.0, [idlePos]);

  return { group, clips: [summonClip, idleClip] };
}

// -------------------------------------------------------------
// 5. SLIFER THE SKY DRAGON
// -------------------------------------------------------------
function buildSlifer() {
  const group = new THREE.Group();
  group.name = 'SliferRoot';

  const redMat = new THREE.MeshStandardMaterial({ color: 0xaa1414, roughness: 0.35, metalness: 0.2 });
  const spineMat = new THREE.MeshStandardMaterial({ color: 0xe6b800, metalness: 0.6, roughness: 0.3 });

  // Serpentine segments
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.4 - i * 0.03, 8, 8), redMat);
    seg.position.set(Math.sin(i * 0.8) * 0.4, 2.2 - i * 0.35, -i * 0.45);
    group.add(seg);

    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), spineMat);
    spine.position.set(Math.sin(i * 0.8) * 0.4, 2.5 - i * 0.35, -i * 0.45);
    group.add(spine);
  }

  // Double mouth head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 1.0), redMat);
  head.position.set(0, 2.5, 0.4);
  group.add(head);

  // Animations
  const summonScale = new THREE.VectorKeyframeTrack(
    'SliferRoot.scale',
    [0, 1.0, 1.6, 2.2],
    [0.01, 0.01, 0.01, 0.8, 0.8, 0.8, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
  );
  const summonClip = new THREE.AnimationClip('summon', 2.2, [summonScale]);

  const idlePos = new THREE.VectorKeyframeTrack(
    'SliferRoot.position',
    [0, 1.2, 2.4],
    [0, 0, 0, 0, 0.22, 0, 0, 0, 0]
  );
  const idleClip = new THREE.AnimationClip('idle', 2.4, [idlePos]);

  return { group, clips: [summonClip, idleClip] };
}

// -------------------------------------------------------------
// 6. RED-EYES BLACK DRAGON
// -------------------------------------------------------------
function buildRedEyes() {
  const group = new THREE.Group();
  group.name = 'RedEyesRoot';

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x242028, roughness: 0.4, metalness: 0.3 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: 0.5, side: THREE.DoubleSide });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff002b, emissive: 0xff002b, emissiveIntensity: 1.0 });

  const torso = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), bodyMat);
  torso.rotation.x = Math.PI * 0.2;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 6), bodyMat);
  head.position.set(0, 1.2, 0.5);
  head.rotation.x = Math.PI * 0.4;
  group.add(head);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
  eyeL.position.set(0.14, 1.25, 0.6);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
  eyeR.position.set(-0.14, 1.25, 0.6);
  group.add(eyeR);

  // Wings
  const wingL = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), wingMat);
  wingL.position.set(1.1, 0.8, -0.2);
  wingL.rotation.set(0.2, 0.2, -0.8);
  group.add(wingL);

  const wingR = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), wingMat);
  wingR.position.set(-1.1, 0.8, -0.2);
  wingR.rotation.set(0.2, -0.2, 0.8);
  group.add(wingR);

  // Animations
  const summonScale = new THREE.VectorKeyframeTrack(
    'RedEyesRoot.scale',
    [0, 0.8, 1.4, 2.0],
    [0.01, 0.01, 0.01, 0.8, 0.8, 0.8, 1.15, 1.15, 1.15, 1.0, 1.0, 1.0]
  );
  const summonClip = new THREE.AnimationClip('summon', 2.0, [summonScale]);

  const idlePos = new THREE.VectorKeyframeTrack(
    'RedEyesRoot.position',
    [0, 1.1, 2.2],
    [0, 0, 0, 0, 0.16, 0, 0, 0, 0]
  );
  const idleClip = new THREE.AnimationClip('idle', 2.2, [idlePos]);

  return { group, clips: [summonClip, idleClip] };
}

// -------------------------------------------------------------
// 7. DARK MAGICIAN GIRL
// -------------------------------------------------------------
function buildDarkMagicianGirl() {
  const group = new THREE.Group();
  group.name = 'DarkMagicianGirlRoot';

  const pinkMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.4 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 });
  const blondMat = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.5 });
  const wandMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.7, roughness: 0.2 });

  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.4, 8), pinkMat);
  dress.position.y = 0.7;
  group.add(dress);

  const cape = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 8), blueMat);
  cape.position.y = 1.1;
  group.add(cape);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), blondMat);
  hair.position.y = 1.55;
  group.add(hair);

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 7), pinkMat);
  hat.position.set(0, 1.95, -0.05);
  hat.rotation.x = -Math.PI * 0.12;
  group.add(hat);

  // Wand
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), wandMat);
  wand.position.set(0.4, 1.1, 0.2);
  wand.rotation.z = -0.3;
  group.add(wand);

  // Animations
  const summonScale = new THREE.VectorKeyframeTrack(
    'DarkMagicianGirlRoot.scale',
    [0, 0.7, 1.3, 1.8],
    [0.01, 0.01, 0.01, 0.85, 0.85, 0.85, 1.1, 1.1, 1.1, 1.0, 1.0, 1.0]
  );
  const summonClip = new THREE.AnimationClip('summon', 1.8, [summonScale]);

  const idlePos = new THREE.VectorKeyframeTrack(
    'DarkMagicianGirlRoot.position',
    [0, 0.9, 1.8],
    [0, 0, 0, 0, 0.14, 0, 0, 0, 0]
  );
  const idleClip = new THREE.AnimationClip('idle', 1.8, [idlePos]);

  return { group, clips: [summonClip, idleClip] };
}

// -------------------------------------------------------------
// MAIN EXECUTION
// -------------------------------------------------------------
async function main() {
  console.log('Generating 7 Yu-Gi-Oh 3D GLB models into:', MODELS_DIR);

  const be = buildBlueEyes();
  await exportModel('blue-eyes-white-dragon', be.group, be.clips);

  const dm = buildDarkMagician();
  await exportModel('dark-magician', dm.group, dm.clips);

  const dmg = buildDarkMagicianGirl();
  await exportModel('dark-magician-girl', dmg.group, dmg.clips);

  const ex = buildExodia();
  await exportModel('exodia-the-forbidden-one', ex.group, ex.clips);

  const ob = buildObelisk();
  await exportModel('obelisk-the-tormentor', ob.group, ob.clips);

  const re = buildRedEyes();
  await exportModel('red-eyes-black-dragon', re.group, re.clips);

  const sl = buildSlifer();
  await exportModel('slifer-the-sky-dragon', sl.group, sl.clips);

  console.log('All 7 GLB models generated successfully!');
}

main().catch(err => {
  console.error('Fatal generator error:', err);
  process.exit(1);
});
