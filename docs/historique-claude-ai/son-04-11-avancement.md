# Charte sonore appliquée + vibrations mobiles — 4 nov. 2026

Source : papier « Le son de Bebou Card » (recherche approfondie du 04/11), compagnon du papier motion. Modifications dans le dossier de Tom, branche `fix/retours-live-02`, non commitées (avec celles du motion). Typecheck strict propre.

## Moteur audio (`src/core/audio.ts`, même API qu'avant + nouveautés)
- **Gamme unique** : sol majeur pentatonique (`scaleHz(deg)`, `quantize(hz)`). `chime(base)` est calé sur la gamme (392 Hz reste sol4), `shimmer` / `riser` / `choir` aussi. `sfx.transpose` (demi-tons) : +2 pendant une 6★ montrée (modulation en la majeur), remis à 0 quand la carte part / au récap / au reset.
- **Bus** ui · feedback · reward · event · ambience → master → compresseur doux → **limiteur** (−3 dBFS, 20:1, attaque 1 ms). `event(dur)` = ducking planifié (ambiance −10 dB, ui/feedback −6 dB, attaque 50 ms, relâche 600 ms). `duck(dur)` = **vrai silence** (master ET retour de réverbe coupés en 25 ms) — réservé 6★ / secrète.
- **Anti-habituation** : tick / whoosh / tear ±4 % de hauteur, ±10 % de filtre, ±1,5 dB ; sons tonals jamais désaccordés, vélocité ±2 dB, micro-décalages 5–15 ms dans `arp`. Tics limités à 1 / 35 ms, plafond 24 voix.
- **Téléphone** : `thump`, `heartbeat`, `rumble` ont une couche saturée 150–500 Hz (fondamentale manquante) + un transitoire 2–5 kHz ; réverbe plus courte (1,4 s / 1,2 s mobile) ; premier son de la session à −6 dB qui remonte en ~30 s ; `latency()` expose baseLatency + outputLatency (compensation visuelle : à faire si > 40 ms).
- **Nouvelles primitives** : `note(deg, vol, dur, at)` (cristal doux), `arp(n, …)`, `prismatic()` (12 notes sur 2 octaves en la majeur, 55 ms), `bebou(vol, short)` (motif 5 notes do# lydien, boîte à musique — réservé à la secrète et à la notif « un pote a drop une secrète » en version 3 notes), `coin(deg)` (tic de pièce, hauteur qui monte), `decline()` (deux notes descendantes, jamais de buzzer).

## Branchements
- **Ouverture** : tranches qui s'allument = une note par palier (3★ si5 · 4★ ré6 · or mi6 + glint) ; étoiles = carillons ascendants dans la gamme (1–2★ : glint seul) ; 6★ à l'impact : `transpose = 2`, `event(4.5)`, `prismatic()` puis chœur en la ; 5★ : `event(2)` ; silence de 0,3 s avant l'impact 6★ via `duck`.
- **Secrète** (`experiments/039`) : plus d'impact brutal, motif « Bébou » + chœur en do#.
- **Pièces** (`main.ts`) : à chaque gain, 3 à 8 tics `coin` dont la hauteur monte (55 ms) puis un « ting ».
- **Toasts** (`ui.ts` `setToastSound`) : info = une note douce, ok = note, erreur = `decline`.

## Vibrations : pourquoi « ça ne marche pas » et ce qui a été fait (`src/core/haptics.ts`)
- **iPhone** : `navigator.vibrate` n'existe pas dans Safari. Le seul détour (interrupteur caché `<input switch>`, iOS 17.4+) ne fait battre le Taptic Engine **que pendant le gestionnaire d'un toucher** : toutes nos impulsions d'impact (fin d'animation, callbacks GSAP, setTimeout) étaient donc muettes. Maintenant : `bindHapticGestures()` marque chaque toucher (capture) ; un `pulse()` hors geste est gardé 400 ms et rejoué au toucher suivant ; la scène d'ouverture vibre **au toucher** qui révèle (12 ms). Impossible d'aller plus loin dans un navigateur iOS (il faudrait une app).
- **Android** : `navigator.vibrate` est ignoré en silence tant que la page n'a reçu aucun toucher, si l'onglet est caché, et dans les navigateurs intégrés (Discord, Instagram…) → ouvrir le site dans Chrome. Les segments < 12 ms sont relevés à 12 ms (beaucoup de vibreurs ne font rien en dessous ; nos `pulse(3…8)` étaient inaudibles).
- Réglage « Vibrations » : affiche « iPhone : au toucher seulement » / « indisponibles ici », le toucher joue un motif test et un toast explique le refus éventuel (`haptics.why`).

## À regarder par Tom (pas de GPU / haut-parleur ici)
1. Mix sur haut-parleur d'iPhone et d'Android à 50 % du volume : la couche harmonique des impacts est-elle juste (pas « boîte en carton ») ?
2. 6★ : silence → impact → glissando prismatique en la, puis les étoiles et le chœur en la ; retour en sol à la carte suivante.
3. Volume des pièces (`coin` 0,07) et des toasts (0,04–0,07) : discrets ?
4. Vibrations sur Android dans Chrome (hors Discord) : impacts 4★+ ressentis ; sur iPhone : le toucher de révélation.

## Reste à faire (du papier, non codé)
Échantillons Opus (papier, feu, pièces, chœur, boîte à musique, ~300–500 Ko en différé) ; couleur sonore par pack ; nappe de menu optionnelle (curseur Musique) ; compensation de latence visuelle si > 40 ms ; mesure LUFS (cible −18) ; métriques (taux de coupure, volume moyen, test à l'aveugle des raretés) ; option « jouer même en silencieux » (iOS `audioSession`).
