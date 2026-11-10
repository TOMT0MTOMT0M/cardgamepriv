# Chat (V2, 10/11/2026)

Chat général (tout le monde) + privés à deux, toujours en bas à droite : lanceur (onglet usiné sur ordinateur, touche
carrée au téléphone) et panneau qui se déploie depuis ce coin. Même direction que l'espace Jeux (« usinage »).

## Fichiers
| Fichier | Rôle |
|---|---|
| `src/core/chat.ts` | règles et types partagés jeu / serveur (clés de conversation, plafonds, réactions) |
| `convex/chat.ts` | serveur : `inbox`, `tail`, `page`, `send`, `react`, `remove`, `markRead`, `mute`, `generalWake` |
| `convex/chat.test.ts` | 6 tests (non-lus, fil « depuis T », privés fermés aux autres, garde-fous, pagination, notifications) |
| `src/game/chatStore.ts` | état côté jeu : cache local, envoi optimiste, un seul fil suivi, pause onglet caché |
| `src/game/chat.ts` + `chat.css` | lanceur, panneau, fil, saisie, mentions, carte montrée, privés |
| `src/game/chatLocal.ts` | chat du mode démo (les robots répondent) |

Tables (nouvelles, rien de changé à l'existant) : `chatMessages`, `chatConvs` (en-têtes), `chatReads` (une ligne par joueur).

## Pourquoi ça ne coûte presque rien
- **Pastille** (`inbox`) : ne lit que des en-têtes (1 ligne par conversation + ma ligne). Non-lus = n de la conversation −
  n lu : aucun message relu.
- **Fil ouvert** (`tail`) : ne lit que ce qui a changé depuis T (index `by_conv_touched`). Un nouveau message = 1 ligne
  relue par lecteur, pas la fenêtre entière. Réactions et suppressions passent par le même abonnement.
- **Cache local** : les 40 derniers messages par conversation restent dans le navigateur → ouverture sans requête
  d'historique. `page` (30 messages) seulement à la première ouverture et à « Messages plus anciens ».
- **Un seul fil suivi**, seulement panneau ouvert ; onglet caché 45 s → plus aucun abonnement (les push prennent le relais).
- **« Lu »** : une écriture par lecture réelle, jamais par message. **Rien n'est écrit sur `users`.**
- **Pas d'indicateur « écrit… »** (une écriture par frappe pour tout le monde : le poste le plus cher d'un chat).
- Présence, avatars, drops 6★ du fil : données déjà chargées par le jeu (`users.friends`, `feed.bigPulls`).
- Anti-rafale : 400 ms entre deux messages, 12 par 20 s ; 500 caractères.

## Notifications
- Dans le jeu : pastille sur le lanceur (bulle animée, `bubble.ts`), aperçu 6 s du message dans le lanceur, son discret.
- Push (type `chat`, case « Chat » du profil) : privé et mention → tout de suite, une seule tant que ce n'est pas lu
  (ou 3 min ; une seule pour toute la nuit) ; chat général → « se réveille » après 20 min de silence, au plus toutes
  les 45 min, jamais la nuit. Sourdine par conversation (bouton « Notifs » du panneau).
- Une notification touchée ouvre `#/chat/<conversation>` : le panneau s'ouvre sans changer de page.

## Mise en page
- Ordinateur : panneau 392 × 640, reste ouvert d'une page à l'autre ; la fiche du booster (boutique) s'arrête au-dessus
  du lanceur ; « remonter » (collection) et le badge « V2 — test » lui laissent le coin.
- Téléphone : plein écran, « retour » le ferme, la saisie suit le clavier (visualViewport), champ en 16 px (pas de zoom iOS).
- Caché pendant une ouverture, une carte en grand, les scènes 6★ / duel / rencontre.
