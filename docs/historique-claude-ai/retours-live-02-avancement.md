# Retours live 02 (récap du 04/11) — avancement

Branche `fix/retours-live-02` (sur `5d29923`, le lot « retours live 02 » d'un autre agent : tableau d'offres, amis, forge dans la collection, anti-spoil…). Commits `af30d4e` (photos d'animaux) et `d893a1f` (code). `master` avancé localement au même commit.
Vérifié : typecheck front + convex, 76 tests (dont roulette, parrainage), build, captures démo (succès, roulette, connexion, amis, classement).

## Bugs
1. **Jeux** : `GAMES_OPEN = true` (src/core/games.ts) → Pack Battle, Battle Royale, Roulette visibles pour tous.
2. **Rareté collection ≠ vitrine** (Red Bull 6★ / 4★) : les lignes d'inventaire gardaient l'étoile d'avant le patch V7. Migration `convex/migrations.ts:resyncRarities` (inventaire fusionné, vitrines, classeurs réalignés sur le catalogue), idempotente, lancée par `mettre-en-ligne-prod.cmd` et `deployer.cmd` après `convex dev`.
3. **Podium** : chaque place a toujours sa case sous la carte (bouton « + Ami » ou emplacement vide) → 3 places alignées même quand on est dans le top 3.
4. **Gros booster** : le toucher lance l'ouverture ×1 (écran « glisse pour déchirer ») ; pack pas sorti / réserve vide → sa fiche. La fiche ne se referme plus sur le clic qui l'ouvre.
5. **Animaux = cartes de répartition** : les URL de l'Excel pointaient vers des figures d'articles (zenodo, pensoft). `scripts/fix-animal-photos.py` : photo Wikidata P18 puis iNaturalist, noms de fichiers « map / distribution / figure… » refusés. 616 animaux traités : 496 photos, 120 sans photo → design typographique (jamais une carte).
6. **Forge** : revenue avec l'ouverture des jeux (onglet Forge de la Collection).

## Chantiers
7. **Roulette** : 36 numéros, 1 à 3 par tirage (une mise par tirage), grille 1 n° = 10×4★ ou 300 · 2 n° = 1×5★ ou 600 · 3 n° = 2×5★, 1×6★ ou 900 ; cartes 1-3★ refusées ; tirages 10 h et 20 h (cron toutes les 5 min) ; pot conservé + 1 carte 5/6★ ajoutée à chaque tirage. L'ancienne manche (100 n°, 21 h) est clôturée au premier passage : mises remboursées, pot conservé.
8. **Succès à paliers** : une carte par mécanique (14), paliers existants gardés (ids, déjà encaissés). Récompense mixte : 50 / 150 + 1 booster / 500 + 3 boosters / 2 000 + 5 boosters ; titres, badges, cadres aux gros seuils (cosmetics.ts).
9. **Amis dans Succès** : bascule Moi / Amis → par mécanique, classement de mes amis acceptés (👑 le plus avancé) — `economy.friendsAchievements`.
10. **Onglet AMIS + parrainage** : onglet dans la nav (l'icône de l'en-tête disparaît). Lien `/jeu/?ref=CODE`, clics comptés une fois par appareil, filleul (compte < 3 jours) +10 boosters, parrain +10 boosters au 10e booster du filleul, alerte admin « Parrainage depuis le même appareil » (signalé, pas bloqué) — `convex/referrals.ts`.
11. **En-tête** : flamme = panneau « Connexion » (série 7 jours + calendrier 30 jours, retiré du portefeuille) ; pity « X/200 » affiché en permanence (plus d'icône à cliquer).
12. **Code couleur** : 1★ gris · 2★ vert · 3★ bleu · 4★ rouge · 5★ doré · 6★ arc-en-ciel — bordure + cadre des cartes 3D (l'irisé réservé aux 6★/secrètes), tuiles (bordure pleine, 6★ arc-en-ciel), tranche des cartes face cachée qui luit dans la couleur (teasing, remplace l'anti-spoil de 5d29923).
13. **Forge** : envies, classeurs, pochettes et exemplaires engagés EXCLUS (plus seulement des sélections rapides) ; valeurs 5/15/40/100/300/1 000 ; secrètes non brûlables ; dernier exemplaire gardé.

## À regarder par Tom
- Rendu 3D réel (bordures colorées, tranche arc-en-ciel 6★) : vérifié seulement en WebGL logiciel.
- Téléphone : en-tête avec le compteur pity + 8 onglets (la nav défile).
- Le teasing au dos contredit l'« anti-spoil » du lot précédent : c'est le récap du 04/11 qui fait foi ici.

## Validé par Tom (03/11, soir)
- **Teasing au dos** : validé — seule la tranche brille dans la couleur de la rareté, la face reste une surprise (remplace l'anti-spoil).
- **Onglet AMIS** à la place de l'icône de l'en-tête : validé. Vigilance mobile : la nav à 8 onglets défile horizontalement (fondu + bouton « › », onglet actif recentré) — à confirmer sur un vrai téléphone.
- **Parrainage < 3 jours** : validé comme garde-fou anti-rétroactivité. Il ne remplace pas l'alerte « même appareil » : celle-ci est calculée pour tout filleul, quel que soit l'âge du compte (convex/abuse.ts, alerte `referral`). Effet de bord assumé : les comptes créés avant la feature ne pourront jamais devenir filleuls.
