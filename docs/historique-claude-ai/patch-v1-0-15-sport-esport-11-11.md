# Patch v1.0.15 (11/11) — Sport & Esport, relecture du travail de Gemini

Master : 2da763b (Gemini) + df2e5f9 (corrections, réécrit par l'autre session à partir de 59c692f) · tag v1.0.15 sur df2e5f9 · fusionné dans v2 (7480c39). Mise en ligne : `.wt-master\METTRE-EN-LIGNE-v1.0.15.cmd`.

## Vérifié, conforme
- 278 cartes ajoutées (N° 7709 → 7986), ids existants inchangés (sport-ids.json : 0 id modifié, 278 ajoutés).
- Seules 4 notes changent : Dupont 3→6★, Inoue 2→6★, Pogačar 1→6★, Nakamura 2→6★. LoL : aucune note existante touchée.
- Apex : en 5★/6★, seulement ImperialHal (déjà en jeu), Zer0, Reps, Yulariman et Blinkzr.
- Pierre Ménès retiré (catalogue + purge serveur via PURGE_BRUEL).
- Aucun doublon dans Sport. Quelques noms identiques à des cartes Pop sans rapport (Snoopy, Kenny, Boo…), ce qui est normal.
- Type-check (jeu et Convex), 122 tests et build : OK.

## Corrigé
- Les photos Liquipedia sont en paysage, donc les 5★ partaient en design Suisse : 29 cartes 5★/6★ recadrées en portrait 0,72 centré sur le visage.
- Photos remplacées par Wikimedia Commons (meilleure définition, bonne personne) : The Rock, Félix et Alexis Lebrun (photo de double), Shohei Ohtani, Efren Reyes.
- 2e passe (autre session, vérifiée) : WeiXiao, EpikWhale et Kami ont de nouvelles photos portrait en full art. Cold, Th0masHD, Khanada, Reet, JannisZ, Vadeal et Muz passent en 800 px.
- faceFocus.json : 678 visages en tout. Images identiques entre `.wt-master` et le dossier principal.
- Lanceur : fins de ligne Windows (CRLF) et attribution du commit.
- Originaux gardés dans `.wt-master\.claude-x\orig\`.

## Points ouverts
- Shai Gilgeous-Alexander : 6★ ou 5★ ?
- Identité des joueurs esport 1–4★ non vérifiable une par une (photos Liquipedia).
- JannisZ (3★) : photo de podium, petite silhouette (design Suisse).
