# Système de motion & partition d'ouverture — appliqué le 4 nov. 2026

Source : papier de recherche « Dopamine, anticipation et mouvement » (recherche approfondie du 04/11) + demande de Tom : retournement « charnière droite » au lieu d'une rotation sur l'axe médian.
Modifications dans le dossier de Tom (`C:\Users\Tom\Desktop\cardgamepriv`, branche `fix/retours-live-02`), **non commitées** (la VM n'a pas le droit de supprimer : `git commit` y laisse des `.lock`).

## Nouveau : `src/core/motion.ts` (la table unique)
- Jetons de durée : instant 50 · rapide 150/120 · standard 250/200 · emphatique 400/320 (mobile/desktop) · dramatique 900 · cérémonie 2 500 ms ; sorties ≈ 0,75 × l'entrée ; cascades 20/40/60 ms, plafond 300 ms.
- Courbes : `standard` (M3), `entree` (emphasized-decelerate), `sortie` (emphasized-accelerate), `anticipation` (ease-in-back) ; ressorts `net` / `carte` / `joyeux`.
- `TIER_BEAT` : partition par palier — pre (anticipation) 0 / 0 / 0,12 / 0,45 / 1,0 / 1,8 s ; flip 0,2 → 0,45 s ; hit-stop 0 / 0 / 0 / 60 / 90 / 120 ms ; savourage 0,1 → 1,5 s ; assombrissement 35 % (5★) / 60 % (6★) ; secousse seulement 5★+ ; motifs haptiques ; versions **condensées** (Tout révéler) des 4★ / 5★.
- `bindMotionVars()` (appelé dans main.ts) pose `--dur-*` / `--ease-*` sur `<html>` ; `style.css` a les mêmes valeurs en repli dans `:root`.

## Ouverture (`scenes/opening.ts`, `scenes/cardFace.ts`)
- **Retournement charnière droite** (`HINGE = 1`, `HINGE_PERSP = 0,55`) : le bord droit reste posé, le bord gauche se soulève vers la caméra (z = w/2·sin φ, centre = x₀ + w/2·(1 − cos φ)), la « main » ramène la carte au centre pendant la seconde moitié ; la perspective n'est plus totalement compensée (la carte grossit un peu en se soulevant). Sens de rotation inversé (`rotation.y = −flip`). `HINGE = 0` = ancien pivot.
- **1 toucher par carte** : en phase `shown`, le toucher range la carte ET révèle la suivante (`nextCard(true)` → `revealCurrent()`), sauf en mode auto. Le 4★+ attend toujours un toucher après son savourage.
- **Teasing échelonné** : les tranches démarrent éteintes ; pile : la tranche s'allume quand la carte arrive devant (avec une note selon le palier) ; éventail : allumage de gauche à droite (90 ms, la 5e avec +200 ms). 1★ / 2★ : aucune lueur.
- **Or commun 5★ / 6★ / secrète** (`buildEdge(hex, teaseHex)`, uniform `tease`) : face cachée la 6★ et la secrète sont dorées comme une 5★ ; la 6★ se **fend en arc-en-ciel** à mi-anticipation (0,9 s), battement de cœur, `onMythic` à ce moment-là, puis **silence 0,3 s** (`sfx.duck`) avant l'impact. L'ancienne « pause vide » de 2,6 s après la face devient 1,8 s d'escalade avant le retournement ; après la face, impact à +0,12 s. Le titre « MYTHIQUE » du voile n'apparaît qu'à impact + 1,2 s (classe `.hit`).
- **Impact** : hit-stop (timeline en pause 60/90/120 ms, jamais en accéléré), flash seulement 3★+, secousse seulement 5★+, haptique selon la partition.
- **« Tout révéler »** : plus de ×2 sur les 5★ — versions condensées (4★ ≈ 1 s, 5★ ≈ 2 s) ; communes → 3★ toujours ×3,5 ; admiration 6★ 1,5 s.
- Éventail (World Pack) : même partition, anticipation divisée par deux.

## Interface (`style.css`, `ui.ts`, `shop.ts`, `bigPulls.ts`)
- Toutes les `transition:` utilisent les jetons (`var(--dur-rapide|standard|emphatique)`, `var(--ease-entree)`) ; l'ancienne courbe « glide » = `--ease-entree`.
- Rebond retiré des survols / icônes (volume, pochettes, albums, cœur d'envie) — gardé pour les récompenses (NOUVELLE, badges, compteurs).
- Plus de pulsation permanente : « Ouvrir » et « Signer le contrat » ne respirent plus ; icônes missions / pity : un seul wiggle quand c'est prêt.
- Cascades plafonnées (récap ≤ 6 × 45 ms, vitrine ≤ 7 × 40 ms, multi ≤ 12 × 20 ms).
- `button:active` : transition 50 ms (retour pressé immédiat).
- Toasts : 4 à 6 s.
- Badge DOUBLON : fondu sans rebond (jamais de célébration d'un doublon).
- **Récap pic-fin** : barre de progression de la collection « avant → après » animée 600 ms + tic ; « nouvelles » en or avec pop.
- Fil « gros tirages » : statique aussi quand « Effets réduits » est coché dans le jeu (pas seulement le réglage système).

## Vérifié
- `tsc --noEmit` strict (jeu) : propre (binaire TypeScript Linux installé hors projet).
- `vite build` : 248 modules transformés sans erreur (le bundling final dépasse le temps de la VM ; à relancer sur le PC).
- Non vérifiable ici : `vitest` (cache non supprimable depuis la VM) — serveur non touché ; rendu 3D (charnière, tranche dorée → arc-en-ciel, hit-stop) → **à regarder sur PC et téléphone**.

## À regarder par Tom
1. Charnière : sens (bord gauche vers la caméra, bord droit posé), retour au centre en seconde moitié, et le `HINGE_PERSP` (0,55) — si la carte « pop » trop, baisser vers 0,3.
2. 6★ : enchaînement or → arc-en-ciel → silence → impact ; vérifier que le voile `mythic-veil` ne spoile rien avant la fente (il n'affiche que l'assombrissement jusqu'à `.hit`).
3. Hit-stop : la pause de la timeline GSAP doit se sentir comme un « gel » et non un à-coup.
4. 1 toucher par carte : rythme des communes (0,45 s), et que « Dernière carte… » reste lisible.

## Reste à faire (du papier, non codé)
- **×10 par vagues** (≈ 10–15 s) : nécessite de pré-tirer les 10 boosters côté serveur et une scène « 50 cartes » (vague 1–3★ groupée, rares une par une) — chantier à part.
- Réglage « Animations : Complètes / Réduites / Minimales » (3 niveaux ; aujourd'hui 2 via « Effets réduits »).
- Barre d'onglets en bas sur téléphone (5 entrées + « Plus ») ; joker de série / calendrier cumulatif ; plafond de réserve 30 ; 4★ en violet (daltonisme) ; préchauffage shaders des effets rares.
