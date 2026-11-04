# DOSSIER D'INTÉGRATION 3D TCG : MODÈLES, ANIMATIONS & AUDIO YU-GI-OH!
**Projet :** Private TCG Game (Web 3D Three.js / Electron / Game Engine)  
**Destinataire :** Claude / Équipe de Développement  
**Objet :** Manifeste complet, liens de téléchargement, polycounts, animations, banques de sons (SFX + Voix) et pipeline Three.js (r187 / WebGPU / WebGL) pour 7 Monstres et 3 Personnages.

---

## 1. STRATÉGIE TECHNIQUE & RECOMMANDATIONS ASSETS

### Pourquoi éviter les rips "Jump Force" pour un TCG
- **Jump Force :** ~80 000 à 150 000 polygones par monstre, 4 à 8 maps 4K PBR, squelettes cinéma complexes. Inutilisable en temps réel si plusieurs cartes/monstres sont invoqués simultanément sur le terrain.

### La source idéale : "Yu-Gi-Oh! Cross Duel" (+ Duel Links)
- **Topologie Medium-Poly :** ~6 000 à 18 000 triangles par monstre. Conçu nativement par Konami pour un jeu de cartes / plateau 3D 4 joueurs en temps réel.
- **Animations pré-intégrées dans les FBX :** Chaque monstre dispose déjà des clips standards indispensables pour un jeu de cartes :
  1. `Summon` (apparition / éjection de la carte)
  2. `Idle` (respiration, flottement, ailes, posture de garde)
  3. `Attack_Normal` / `Attack_Special` (coup physique & attaque signature)
  4. `Hit` (réaction au coup / prise de dégâts)
  5. `Death` (destruction / disparition vers le cimetière)
- **Format cible pour le Web 3D :** Conversion en `.GLB` (avec compression Draco ou Meshopt) pour un chargement instantané (< 2 Mo par monstre avec textures).

---

## 2. MANIFESTE DES 7 MONSTRES

### 1. Blue-Eyes White Dragon (Dragon Blanc aux Yeux Bleus)
* **Polycount :** ~14 000 triangles (Cross Duel) / ~18 000 triangles (Duel Links DSOD)
* **Animations incluses :**
  - `Spawn_Roar` : Sort du sol/carte en déployant ses ailes avec un rugissement.
  - `Idle_Fly` : Flottement en suspension, battement d'ailes continu.
  - `Attack_Burst_Stream` : Rejet de la tête en arrière, accumulation d'énergie, projection du rayon blanc.
  - `Hit_React` : Recul de la tête avec ailes repliées.
  - `Death_Collapse` : Chute vers l'avant et désintégration en particules de lumière.
* **Sources de téléchargement :**
  - **Cross Duel FBX + Animations :** DeviantArt `ThePharaohsServant` > Galerie *Cross Duel - Duel Monsters Asset Dump*
  - **Duel Links / DSOD MMD Rigged :** DeviantArt `SAB64` — `(MMD Model) Blue-Eyes White Dragon Download`
  - **Modèle Brut :** The Models Resource — *Jump Force (Character Extras) / Duel Links PC*
* **Sons & Effets Audio :**
  - *Cri/Rugissement :* Rugissement de dragon cristallin / métallique classique de l'anime (disponible sur *The Sounds Resource > Duel Generation > Monster Sounds*).
  - *Attaque Signature :* "Burst Stream of Destruction" (laser continu haute fréquence + déflagration finale).

---

### 2. Dark Magician (Magicien Sombre)
* **Polycount :** ~8 500 triangles
* **Animations incluses :**
  - `Summon_Spin` : Rotation avec bâton magique levé, atterrissage en fente.
  - `Idle_Battle` : Posture avec bâton tenu à deux mains, cape oscillante.
  - `Attack_Dark_Magic` : Pointage du bâton magique, formation d'un orbe d'énergie sombre projeté.
  - `Hit_Stagger` : Mouvement défensif avec cape en avant.
  - `Death` : Genou à terre, bâton qui tombe, fondu au noir.
* **Sources de téléchargement :**
  - **Cross Duel FBX + Anims :** DeviantArt `ThePharaohsServant` > *Cross Duel Duel Monsters*
  - **The Models Resource :** `models.spriters-resource.com/pc_computer/jumpforce/asset/367355/` (Dark Magician)
  - **SAB64 PMX :** DeviantArt `(MMD Model) Dark Magician (DSOD)`
* **Sons & Effets Audio :**
  - *Bruitage de lancement de sort :* Vrombissement arcanique grave suivi d'un sifflement d'énergie ("Dark Magic Attack").
  - *Impact :* Explosion magique sourde.

---

### 3. Dark Magician Girl (Magicienne des Ténèbres)
* **Polycount :** ~9 000 triangles
* **Animations incluses :**
  - `Summon_Wink` : Pirouette aérienne, clin d'œil, atterrissage léger.
  - `Idle_Hover` : Flottement avec rebond rythmique, bâton magique balancé.
  - `Attack_Dark_Burning` : Tourbillon du bâton avec projection d'étoiles roses/bleues d'énergie.
  - `Hit_Flinch` : Recul avec mains devant le visage.
  - `Death_Spin` : Tourbillon descendant et dispersion en étincelles magiques.
* **Sources de téléchargement :**
  - **DeviantArt :** `MisakiModding` — `Jump Force: Dark Magician Girl / 3D model` (URL: `deviantart.com/misakimodding/art/Jump-Force-Dark-Magician-Girl-3D-model-821044670`)
  - **Cross Duel Pack :** `ThePharaohsServant`
  - **SAB64 PMX :** DeviantArt `(MMD Model) Dark Magician Girl Download`
* **Sons & Effets Audio :**
  - *Incantation :* Chime scintillant aigu, tintement de baguette magique féerique.

---

### 4. Exodia the Forbidden One (Exodia le Maudit)
* **Polycount :** ~16 000 triangles (avec chaînes et sceaux)
* **Animations incluses :**
  - `Summon_Breakout` : Brise les chaînes dorées avec expansion du torse, tremblement de l'arène.
  - `Idle_Menacing` : Respiration lourde, bras croisés ou semi-tendus, chaînes qui pendent avec physique.
  - `Attack_Obliterate` : Réunion des deux mains au niveau de la poitrine, sphère d'énergie dorée colossale libérée en faisceau dévastateur.
  - `Hit` : Légère secousse (Exodia est un colosse imparable).
  - `Death` : Dissolution dans les sceaux magiques égyptiens.
* **Sources de téléchargement :**
  - **MMD / Fully Rigged avec physique de chaînes :** DeviantArt `SAB64` — `(MMD Model) Exodia the Forbidden One Download`
  - **Cross Duel Rip FBX :** DeviantArt `The-Casual-Mike` / `ThePharaohsServant`
* **Sons & Effets Audio :**
  - *Choc de chaînes :* Bruit de ferraille lourde qui se brise.
  - *Attaque Obliterate :* Tremblement de basse (Sub-bass drop) + décharge d'énergie colossale de type bombe thermique.

---

### 5. Obelisk the Tormentor (Obélisque le Tourmenteur)
* **Polycount :** ~15 000 triangles
* **Animations incluses :**
  - `Summon_Earthquake` : Impact lourd au sol à genoux, redressement titanesque, rugissement tonitruant.
  - `Idle_Goliath` : Posture massive, poings serrés fumants, ailes entrouvertes.
  - `Attack_Fist_of_Fate` : Poing droit rétracté qui s'embrase en aura bleue, coup de poing direct créant une onde de choc sur le terrain.
  - `Attack_Soul_Energy_Max` : Deux yeux rouges brillants, frappe bilatérale.
  - `Hit_Immovable` : Recul imperceptible, grondement de pierre.
  - `Death_Stone_Crumble` : Pétrification en roche et effondrement en gravats.
* **Sources de téléchargement :**
  - **DeviantArt :** `MisakiModding` — `Jump Force: Obelisk the Tormentor / 3D model`
  - **DeviantArt :** `SAB64` — `(MMD Model) Obelisk the Tormentor Download`
  - **Cross Duel FBX :** DeviantArt `ThePharaohsServant`
* **Sons & Effets Audio :**
  - *Rugissement :* Grondement tellurique monstrueux avec résonance de cathédrale.
  - *Attaque Fist of Fate :* Impact d'onde de choc séismique.

---

### 6. Red-Eyes Black Dragon (Dragon Noir aux Yeux Rouges)
* **Polycount :** ~12 500 triangles
* **Animations incluses :**
  - `Summon_Roar` : Vrille aérienne, atterrissage agressif gueule béante avec lueur rouge.
  - `Idle_Predator` : Posture féline/reptilienne basse, queue battante, ailes déployées prêtes à bondir.
  - `Attack_Inferno_Fire_Blast` : Boule de feu noire/rouge crachée depuis la gueule, explosion incendiaire.
  - `Hit_Flinch` : Rétractation des ailes vers l'avant pour bloquer, tête secouée.
  - `Death` : Basculement sur le flanc, flammes mourantes qui s'éteignent.
* **Sources de téléchargement :**
  - **DeviantArt :** `SAB64` — `(MMD Model) Red-Eyes Black Dragon Download`
  - **The Models Resource :** Section *Yu-Gi-Oh! Duel Links (PC)*
  - **Cross Duel FBX :** DeviantArt `ThePharaohsServant`
* **Sons & Effets Audio :**
  - *Cri :* Rugissement rauque, plus bestial et guttural que le Blue-Eyes.
  - *Attaque :* Déflagration de napalm / boule de feu explosive.

---

### 7. Slifer the Sky Dragon (Osiris, le Dragon Céleste)
* **Polycount :** ~16 000 triangles (corps segmenté articulé)
* **Animations incluses :**
  - `Summon_Thunderstorm` : Descente spiralée depuis les nuages d'orage, éclairs qui parcourent son corps serpentin.
  - `Idle_Serpentine` : Ondulation sinueuse continue dans les airs, double mâchoire qui s'ouvre et se referme.
  - `Attack_Thunder_Force` : Les deux bouches s'ouvrent simultanément, accumulation de foudre rouge, tir d'un faisceau d'orage condensé.
  - `Hit` : Ondulation désordonnée du corps serpentin.
  - `Death` : Dissipation dans un éclair vertical montant vers le ciel.
* **Sources de téléchargement :**
  - **DeviantArt :** `MisakiModding` — `Jump Force: Slifer the Sky Dragon / 3D model` (URL: `deviantart.com/misakimodding/art/Jump-Force-Slifer-the-Sky-Dragon-3D-model-821042234`)
  - **XPS Format :** DeviantArt `SporemanJake` — `Slifer the Sky Dragon XPS`
  - **Cross Duel FBX :** DeviantArt `ThePharaohsServant`
* **Sons & Effets Audio :**
  - *Rugissement :* Tonnerre perçant combiné à un cri strident à double harmonique.
  - *Attaque :* Électrocution haute tension + claquement de tonnerre instantané.

---

## 3. MANIFESTE DES 3 PERSONNAGES (DUÉLISTES)

### 1. Yami Yugi (Atem / Pharaon)
* **Polycount :** ~10 000 triangles
* **Animations indispensables TCG :**
  - `Duel_Idle` : Posture duéliste classique, cape d'uniforme flottant au vent, main sur le Duel Disk.
  - `Draw_Card` : Geste sec et vif de pioche théâtrale ("Doro!").
  - `Summon_Gesture` : Claque la carte sur le Duel Disk avec projection du bras vers l'avant.
  - `Attack_Command` : Pointage du doigt autoritaire vers l'adversaire.
  - `Victory` : Repli des bras, sourire confiant, œil d'Horus qui s'allume sur le front.
* **Sources de téléchargement :**
  - **DeviantArt :** `SAB64` — `(MMD Model) Yami Yugi Download` (Conversion Jump Force avec morphs de visage complets et os de cape).
  - **The Models Resource :** `models.spriters-resource.com/pc_computer/jumpforce/asset/311362/` (Yugi Muto)
* **Banque Vocale (The Sounds Resource - Duel Links `sound/10052/`) :**
  - *"It's time to duel!"*
  - *"I summon the Dark Magician!"*
  - *"Dark Magic Attack!"*
  - *"Dark Magician Girl, show them your power!"*
  - *"Slifer the Sky Dragon, arise!"*
  - *"Exodia, Obliterate!"*
  - *Cris de dégâts et rires de victoire.*

---

### 2. Seto Kaiba
* **Polycount :** ~11 000 triangles
* **Animations indispensables TCG :**
  - `Duel_Idle` : Manteau blanc long ouvert, port altier, regard arrogant.
  - `Draw_Card` : Mouvement rapide de pioche avec pivotement d'épaule.
  - `Summon_Blue_Eyes` : Mouvement circulaire du bras, claque de carte dynamique.
  - `Attack_Command` : Cri avec projection de la main paume ouverte.
  - `Victory_Laugh` : Rire arrogant la tête en arrière ("Hahaha!").
* **Sources de téléchargement :**
  - **DeviantArt :** `MisakiModding` — `Jump Force: Seto Kaiba / 3D Model` (URL: `deviantart.com/misakimodding/art/Jump-Force-Seto-Kaiba-3D-Model-810171602`)
  - **DeviantArt :** `MyllaDinX` — `{XPS} JUMP FORCE - Seto Kaiba`
  - **The Models Resource :** Section *Yu-Gi-Oh! Duel Links > Seto Kaiba (Classic & DSOD)*
* **Banque Vocale (The Sounds Resource - Duel Links) :**
  - *"You're a third-rate duelist with a fourth-rate deck!"*
  - *"Come forth, my pride and joy, Blue-Eyes White Dragon!"*
  - *"Burst Stream of Destruction!"*
  - *"Behold, the god that controls the earth... Obelisk the Tormentor!"*
  - *"Fist of Fate!"*

---

### 3. Jaden Yuki (Judai Yuuki)
* **Polycount :** ~8 500 triangles
* **Animations indispensables TCG :**
  - `Duel_Idle` : Veste Slifer Red ouverte, pose détendue et souriante.
  - `Draw_Card` : Pioche décontractée mais énergique.
  - `Summon_Pose` : Index et majeur pointés en V vers l'avant.
  - `Victory_Pose` : Deux doigts sur le front ("That was a fun duel!").
* **Sources de téléchargement :**
  - **DeviantArt :** `Livbbies` — `[3D Model] Jaden Yuuki // Judai Yuuki` (FBX & XPS)
  - **Cross Duel GX Pack :** `ThePharaohsServant`
  - **MMD :** DeviantArt `TwoSidedMMD` / `handashin`
* **Banque Vocale (The Sounds Resource - Duel Links) :**
  - *"Get your game on!"*
  - *"Here goes! I summon a monster!"*
  - *"That's game!"*

---

## 4. BANQUE DE SONS SYSTÈME DUEL (SFX)

Tous disponibles au format brut `.wav` sur [The Sounds Resource](https://www.sounds-resource.com/) :

| Type de Son | Nom du Fichier Typique | Rôle dans le Jeu TCG |
| :--- | :--- | :--- |
| **Summon Hologram** | `sfx_summon_portal.wav` | Son de montée fréquentielle d'apparition du monstre sur la carte |
| **Card Flip / Set** | `sfx_card_place.wav` | Claquement mat lorsqu'une carte est posée sur la zone |
| **Charge d'Énergie** | `sfx_energy_buildup.wav` | Boucle montant les basses avant le tir du laser |
| **Laser Beam Fire** | `sfx_burst_stream.wav` | Faisceau soutenu (Blue-Eyes / Slifer / Dark Magician) |
| **Monster Destroyed** | `sfx_monster_explosion.wav` | Déflagration avec réverbération et sifflement de fumée |
| **LP Damage Tick** | `sfx_lp_counter.wav` | Défilement rapide des points de vie (8000 -> 0) |
| **Phase Change** | `sfx_battle_phase.wav` | Son métallique de transition de tour |

---

## 5. PIPELINE TECHNIQUE BLENDER : DU RIP AU `.GLB` OPTIMISÉ

Pour convertir les rips téléchargés en assets WebGPU / Three.js légers :

1. **Importation :**
   - Si `.fbx` : `File > Import > FBX`.
   - Si `.pmx` (MMD) : Installer le plugin Blender **`mmd_tools`** ou **`cats-blender-plugin`** > `File > Import > MMD (.pmx)` > Cliquer sur **"Fix Model"** (renomme automatiquement les os japonais en noms standards anglais : `Spine`, `Arm_L`, `Head`, etc.).
2. **Nettoyage & Décimation :**
   - Vérifier le triangle count. Si > 20k, appliquer un modifier `Decimate` (ratio 0.7 à 0.8) sur les zones non déformables.
   - Supprimer les textures dupliquées et fusionner les matériaux en une seule texture atlasée si possible.
3. **Animations :**
   - Assurez-vous que les animations sont poussées dans le **NLA (Nonlinear Animation Editor)** sous des noms clairs : `idle`, `summon`, `attack`, `hit`, `death`.
4. **Exportation `.GLB` :**
   - `File > Export > glTF 2.0 (.glb)`.
   - Options : Cocher `Include > Selected Objects`, `Geometry > Apply Modifiers`, `Animation > Group by NLA Track`.
   - Optionnel : Exécuter `npx gltf-pipeline -i model.glb -o model_draco.glb -d` pour compresser la géométrie par 4.

---

## 6. CODE D'INTÉGRATION THREE.JS (TSL / r187 / WEBGPU / TYPESCRIPT)

Voici le gestionnaire TypeScript prêt à être intégré dans votre projet Three.js :

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface MonsterConfig {
  id: string;
  name: string;
  modelUrl: string;
  soundUrls: {
    summon: string;
    attack: string;
    roar: string;
    death: string;
  };
  scale: number;
}

export class TCGMonster3D {
  public scene: THREE.Scene;
  public group: THREE.Group;
  public mixer!: THREE.AnimationMixer;
  public actions: Map<string, THREE.AnimationAction> = new Map();
  public currentAction: THREE.AnimationAction | null = null;
  public audioListener: THREE.AudioListener;
  public positionalAudio: THREE.PositionalAudio;
  public audioBuffers: Map<string, AudioBuffer> = new Map();

  constructor(scene: THREE.Scene, listener: THREE.AudioListener) {
    this.scene = scene;
    this.audioListener = listener;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.positionalAudio = new THREE.PositionalAudio(this.audioListener);
    this.group.add(this.positionalAudio);
  }

  public async loadMonster(config: MonsterConfig): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(config.modelUrl);

    const model = gltf.scene;
    model.scale.setScalar(config.scale);

    // Toon / Cel-Shader setup pour rendu anime propre
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.roughness = 0.6;
          mesh.material.metalness = 0.1;
        }
      }
    });

    this.group.add(model);

    // Initialisation des animations
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const name = clip.name.toLowerCase();
      const action = this.mixer.clipAction(clip);
      this.actions.set(name, action);
    }

    // Préchargement des sons
    const audioLoader = new THREE.AudioLoader();
    for (const [key, url] of Object.entries(config.soundUrls)) {
      const buffer = await audioLoader.loadAsync(url);
      this.audioBuffers.set(key, buffer);
    }
  }

  public playAnimation(name: string, loop: boolean = true, transitionDuration: number = 0.25): void {
    const targetAction = this.actions.get(name.toLowerCase());
    if (!targetAction) return;

    targetAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    targetAction.clampWhenFinished = !loop;

    if (this.currentAction && this.currentAction !== targetAction) {
      this.currentAction.fadeOut(transitionDuration);
    }

    targetAction.reset().fadeIn(transitionDuration).play();
    this.currentAction = targetAction;
  }

  public playSound(soundKey: string, volume: number = 0.8): void {
    const buffer = this.audioBuffers.get(soundKey);
    if (!buffer) return;

    if (this.positionalAudio.isPlaying) {
      this.positionalAudio.stop();
    }
    this.positionalAudio.setBuffer(buffer);
    this.positionalAudio.setRefDistance(10);
    this.positionalAudio.setVolume(volume);
    this.positionalAudio.play();
  }

  // Séquence d'invocation complète (Carte -> Hologramme 3D)
  public triggerSummon(): void {
    this.group.position.y = 0;
    this.group.scale.set(0.01, 0.01, 0.01);

    // Animation d'apparition
    this.playAnimation('summon', false);
    this.playSound('summon');

    // Scale up dynamique
    const startTime = performance.now();
    const duration = 1200; // 1.2s

    const animateScale = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      // Ease out elastic
      const scaleVal = Math.sin((progress * Math.PI) / 2);
      this.group.scale.setScalar(scaleVal);

      if (progress < 1.0) {
        requestAnimationFrame(animateScale);
      } else {
        // Enchaînement automatique sur l'Idle
        this.playAnimation('idle', true, 0.4);
        this.playSound('roar', 0.6);
      }
    };
    requestAnimationFrame(animateScale);
  }

  // Déclaration d'attaque synchronisée avec SFX
  public triggerAttack(): void {
    this.playAnimation('attack', false, 0.15);
    this.playSound('attack');

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.get('attack')) {
        this.playAnimation('idle', true, 0.3);
      }
    });
  }

  // Destruction de la carte / Monstre
  public triggerDeath(onComplete?: () => void): void {
    this.playAnimation('death', false, 0.1);
    this.playSound('death');

    setTimeout(() => {
      if (onComplete) onComplete();
      this.scene.remove(this.group);
    }, 1500);
  }

  public update(delta: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }
}
```

---

## 7. RÉCAPITULATIF DES LIENS DE TÉLÉCHARGEMENT DIRECTS

| Ressource | Type | Lien / Emplacement |
| :--- | :--- | :--- |
| **Packs Cross Duel FBX + Animations** | Modèles + Anims | DeviantArt : [ThePharaohsServant Gallery](https://www.deviantart.com/thepharaohsservant/gallery) |
| **Jump Force / Duel Links Rips** | Modèles Rigged | [The Models Resource - PC / Jump Force](https://www.models-resource.com/pc_computer/jumpforce/) |
| **Rips Jump Force Dédiés (Kaiba, Obelisk, Slifer, DMG)** | Modèles FBX/XPS | DeviantArt : [MisakiModding Gallery](https://www.deviantart.com/misakimodding) |
| **Conversions MMD Rigged (SAB64)** | Modèles PMX/Physics | DeviantArt : [SAB64 Yu-Gi-Oh Collection](https://www.deviantart.com/sab64/gallery/33333/yu-gi-oh) |
| **Banque de Sons (Duel Generation - Monster Sounds)** | Audio SFX (.wav) | [The Sounds Resource](https://www.sounds-resource.com/) (Recherche : *Yu-Gi-Oh! Duel Generation*) |
| **Voix Off Yami Yugi, Kaiba, Jaden (Duel Links)** | Voix (.wav) | [The Sounds Resource - Duel Links](https://www.sounds-resource.com/mobile/yugiohduellinks/) |
