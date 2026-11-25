# V3 « L'excellence invisible » — chantier (15/11 → 17/11)

## État (17/11, soir) : 15 lots faits, sur v2
Passe 1 (Gemini) : 03 roue boutique, 04 hit-stop / haptique / récap, 01 visionneuse, 05 transitions Boutique + panneau d'en-tête, 02 vol tuile ↔ visionneuse, 06 molette Collection + filtres, 07 déchirure, 08 Forge / contrats / classeurs, 09 marché / échanges, 10 duels, 11 roulette, 12 profil / Atelier / succès, 13 chat / toasts.
Passe 2 « Carnets de Léonard » : S1 cran « bague Leica » (avec 06), S2 retournement au doigt + guillochis (avec 02), S3 fente de lumière + pli (avec 07), S4 effeuillage au pouce (visionneuse de collection), S5 balance + sceau (avec 09), S6 fin d'ouverture musicale + compteur à rouleaux.
Entrée « V3 : le jeu plus vivant sous le doigt » dans les mises à jour (FR + EN). Non faits : lots sociaux 14-16.

## Méthode
Un sous-agent par lot (Opus surtout, Sonnet pour 12 et 13), copie isolée dans le cloud, mesure avec vrai bridage processeur ÷ 4, patch relu et fusionné par Claude, tsc + check:i18n, un commit par lot.

## Décisions et écarts
- Pas de mode confort ; flottement de la visionneuse jamais arrêté (proposition de l'agent refusée).
- Cran de molette conservé (le « verrou 450 ms » était en fait une fenêtre de cumul).
- Audit Gemini faux sur plusieurs points (délai 400 ms boutique, convertToBlob, etc.).
- Pas de couleur de rareté dans la fente de déchirure ni de freinage dans la pile d'ouverture (anti-spoil).
- Pas de worker ni de virtualisation pour la Collection (sans gain mesuré).
- Forge : un toucher = un exemplaire (comme v2 actuelle, 404346a).

## À vérifier par Tom sur téléphone
Vibrations iPhone (moins nombreuses), point dur 58°, effeuillage, déchirure (avec l'enregistrement précalculé), fin d'ouverture en musique, Boutique ↔ onglets (bande noire ?), duels (Maintenir), roulette (losanges, bille), balance d'échange, chat clavier iPhone, toasts au glissement, molette Collection. Rangée du bas coupée sur téléphone en Collection : à trancher (préexistant).
