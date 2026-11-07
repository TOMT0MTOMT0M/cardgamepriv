# Idées pour la V2

Liste des idées validées ou à discuter pour le prochain patch groupé. Tout se développe sur le circuit V2 (lien
admin, base Convex séparée) et sort en une fois vers la prod.

---

## 1. Notifications comme une vraie appli (téléphone et PC) — à faire

**Le principe.** Le jeu a déjà un manifeste d'appli (`public/manifest.webmanifest` : nom « Bébou », icônes, plein
écran). Il manque le « service worker » (le fichier qui reçoit les notifications même jeu fermé) et l'envoi côté
serveur. Notifications Web Push : gratuites, sans service tiers.

**Selon l'appareil**
- Android : directement depuis Chrome, même sans ajout à l'écran d'accueil.
- iPhone (iOS 16.4+) : seulement si le jeu est ajouté à l'écran d'accueil (Safari → Partager → « Sur l'écran
  d'accueil »). Prévoir un petit guide en 2 étapes dans le jeu.
- PC : Chrome, Edge, Firefox.

**Côté joueur**
- Bouton « Activer les notifications » (une seule demande d'autorisation), puis réglages : chaque joueur coche ce
  qu'il veut recevoir.
- Un toucher sur la notification ouvre directement la bonne page du jeu (échange, amis, boutique…).

**Ce qu'on notifie**
- Réserve de boosters pleine (15/15) : le serveur calcule l'heure exacte où la réserve sera pleine et envoie à ce
  moment-là (à reprogrammer à chaque ouverture / gain de boosters).
- Échanges : nouvelle proposition, contre-proposition, échange accepté.
- Amis : demande reçue, demande acceptée.
- Parrainage : le filleul a ouvert ses 10 boosters → +10 boosters pour le parrain.
- Jeux : tirage de la roulette (10 h / 20 h), défi Pack Battle reçu.
- Calendrier : rappel avant de perdre sa série de connexion.
- Annonces de l'équipe : nouveau patch, événement.

**Technique (pour la session de dev)**
- Service worker (`public/sw.js`) : réception, affichage, clic → ouverture de la bonne page.
- Clés VAPID (gratuites) posées sur Convex par un lanceur (`npx convex env set …`), jamais dans le code.
- Table Convex des abonnements (un par appareil, lié au joueur ; nettoyage des abonnements expirés).
- Action Convex d'envoi (runtime Node, bibliothèque web-push), branchée sur les événements ci-dessus ;
  programmation de la « réserve pleine » avec `ctx.scheduler.runAt`.
- Garde-fous : pas de notification la nuit (ex. 23 h – 8 h), regroupement si plusieurs événements d'un coup.
- Tests sur un vrai iPhone et un vrai Android (Tom et Hugo) via le lien admin V2 avant la sortie.
- Estimation : environ une demi-journée + tests.

---

## 2. Abonnement « soutien » à 2 €/mois — mis de côté (07/11), à rediscuter

Idée : aider à payer serveurs, abonnement Claude et temps passé. Avantages envisagés : réserve à 20 boosters au lieu
de 15, recharge plus rapide, badge « soutien » ; paiement PayPal (abonnement mensuel, résiliable depuis PayPal).
Points relevés :
- Frais PayPal en France ≈ 2,90 % + commission fixe (≈ 0,35 €) : environ 20 % d'un paiement de 2 €, il reste
  ≈ 1,60 € par abonné et par mois. Alternative : Stripe (Apple Pay / Google Pay, part fixe plus faible).
- Revenus à déclarer (statut freelance de Tom), petite page de conditions de vente et lien de résiliation.
- Équité entre potes : privilégier des avantages de confort et cosmétiques.
- Il faudrait : compte PayPal Professionnel, Client ID / Secret (le Secret posé par Tom sur le serveur), liste
  définitive des avantages et du prix.
