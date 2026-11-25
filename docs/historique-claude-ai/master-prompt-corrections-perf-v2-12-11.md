# Master prompt — Corrections issues de l'audit perf V2 (12/11)

À coller dans une session Claude Code ouverte sur `cardgamepriv`.
Ou, plus court : « Lis le doc projet `claude/master-prompt-corrections-perf-v2-12-11.md` et exécute-le. »

---

## Mission

Tu appliques les corrections de l'audit de performances du 12/11 sur la branche `v2`, lot par lot, en autonomie. L'audit est fait : tu ne le refais pas. Tu corriges, tu mesures, tu rends compte.

Contexte nouveau : le club passe de 20 à 40-50 joueurs dans les prochaines semaines. Ce qui coûte comme le carré du nombre de joueurs passe devant.

## À lire d'abord (et rien d'autre de l'audit)

Dans `_hors-site/audit-12-11/` :
1. `8-decisions-tom.md` : les 10 décisions prises, fichiers et lignes. **Fait foi en cas de contradiction.**
2. `7-synthese-constats.md` : les lots (S01 à S18, V1 à V8, C1 à C3) et le tableau complet des constats.
3. `6-arbitrage.md`, section 4 : contradictions levées et non levées.

Puis `CLAUDE.md`. Ne lis une fiche, une analyse ou une expertise (`2-`, `4-`, `5-`) que pour le constat que tu es en train de corriger.

## Avant le premier lot

- L'audit porte sur le commit `06f6063`. Regarde `git log 06f6063..HEAD` : pour chaque fichier touché depuis, les numéros de ligne des constats ont pu bouger.
- **Un constat se revérifie dans le code avant d'être corrigé.** S'il est déjà corrigé ou faux, note-le et passe.
- Les constats `M-` et `T-` n'ont pas été contre-vérifiés ; ceux marqués « plausible » ou « hypothèse » demandent une mesure avant tout code.
- Premier commit : `.gitignore` (la ligne `_hors-site/` est déjà posée, non commitée).
- Décision 4 : retire de `CLAUDE.md` la ligne « Le mode Effets réduits doit continuer de fonctionner », dans le même commit que la suppression du mode.

## Ordre des lots

**A. Avant l'arrivée des nouveaux joueurs**
1. S01 — bugs (A5-01 pièces vides après connexion par mot de passe, presse). Rejoue le bug avant de corriger.
2. S04 — requêtes en identifiant seul.
3. S05 — classement par signature.
4. Décision 8 — table de présence (E1-05), avec son prérequis E1-13 d'abord.
5. S07 — collections relues en entier (dont A6-06, échec possible de Succès > Amis).
6. Décision 10 — « Pour toi » et fiche carte, les deux moitiés.
7. S12 — migrations par lots (A8-09) et tampon de version.

**B. Ressenti sur téléphone**
8. S02 — mémoire GPU rendue hors scène.
9. S03 — paillettes mortes du shader.
10. Décision 2 — lissage ×4 selon le navigateur.
11. S06 — démarrage.
12. S08 — compilations sur la mauvaise cible.
13. Décisions 1, 5, 7 — bulles, cadence, voiles.
14. Décision 4 — suppression du mode « effets réduits » (le réglage « réduire les animations » du téléphone reste respecté, sauf avis contraire de Tom).
15. Décision 3 — d'abord seulement le format des tuiles ajouté au rapport `?diag`.

**C. Le reste** : S10, S11, S13 à S18, dans cet ordre, jusqu'aux P3.

**En attente d'une mesure de Tom, ne code pas avant**
- S09 (nœuds des 5 cartes) : pose seulement les compteurs du protocole E4-03 dans `?diag`.
- Décision 9 (plafond du stockage d'images) : attend la valeur mesurée sur téléphone.
- Décision 3, passage en JPEG : attend le format rendu par l'iPhone.
- Contradictions non levées : E2-09 contre E4-21, E4-02 contre E2-11, A5-04.

**Hors mission** : la décision 6 (rien à faire) et tous les autres constats « décision de Tom » des listes V et C. Liste-les à la fin, sans y toucher.

## Règles de travail

- Branche `v2` seulement. Ne touche ni `master`, ni `.wt-master/`, ni le labo, ni `/admin/`.
- **Un lot = un plan en 5 lignes = un commit = une mesure avant et une mesure après.** Un lot qui n'améliore pas sa mesure est annulé (`git revert`), et c'est noté.
- Uniquement tes fichiers dans chaque commit : une autre session peut commiter sur `v2`.
- Avant chaque commit : `npm run typecheck`, `npm run test:server` ; `test:sound` et `test:rolls` si les fichiers concernés changent.
- Convex : champs en `v.optional`, jamais de type changé, mêmes noms et mêmes retours pour le client V1. Toute transformation de données = migration idempotente dans `convex/migrations.ts`, ajoutée à `mettre-en-ligne-v2.cmd` et `mettre-en-ligne-prod.cmd`. Un test `convex-test` par fonction modifiée.
- Jamais `convex deploy`, `convex dev`, `cf:deploy` à la main. Jamais la prod.
- Identique à l'œil hors des 10 décisions : DA, reflets de rareté, animations 6★, durées (jetons de `src/core/motion.ts`).
- Aucun coût serveur en plus hors décisions 8 et 10.

## Mesurer sans carte graphique

Ta machine n'a sans doute pas de vraie carte graphique : aucune image par seconde ne vaut.
- 3D et mémoire : compteurs du moteur (nombre et taille des cibles de rendu, pipelines créés, mémoire déclarée), capture identique au pixel avant et après. Ajoute au rapport `?diag` ce qui manque pour que Tom mesure sur son téléphone.
- DOM : banc `scripts/mesure/`, avec une fenêtre chronométrée (constat M-02).
- Convex : tests `convex-test` qui comptent les documents lus, puis journaux du staging après mise en ligne.

## Points d'arrêt pour Tom

Tu ne prends pas le contrôle du PC. Aux moments suivants, arrête-toi et dis quel lanceur lancer, dans quel ordre :
- fin du bloc A : `lanceurs\mettre-en-ligne-v2.cmd`, puis `lanceurs\push.cmd` ; Tom relit l'onglet Usage du staging après 24 h ;
- fin du bloc B : les mêmes, puis le protocole téléphone de `7-synthese.md` avec `?diag`.

Arrête-toi aussi pour toute décision irréversible ou qui change ce que voient les joueurs hors des 10 décisions. Sinon, continue sans attendre d'accord.

## Sous-agents

Un seul agent écrit à la fois. `sonnet` pour un lot mécanique, `opus` pour un lot Convex ou à plusieurs fichiers, `fable` pour la 3D. Chaque diff est relu par un agent `sonnet` à contexte neuf avant le commit. Retour de 10 lignes au plus.

## Suivi et compte rendu

- État tenu à jour dans `_hors-site/audit-12-11/9-etat-corrections.md` (lot en cours, commits, mesures, lots annulés) pour reprendre après une coupure.
- Un seul doc projet, une page, mis à jour à chaque bloc : `claude/corrections-perf-v2-12-11.md`. Par lot : commit, mesure avant, mesure après, ou « annulé, parce que … ».
- Réponse finale à Tom, en français, résultat d'abord, court : ce qui a changé, ce qui est annulé, ce qu'il doit vérifier sur son téléphone, quel lanceur lancer et dans quel ordre. Une seule question, seulement si elle bloque.
