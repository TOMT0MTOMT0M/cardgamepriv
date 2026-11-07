@echo off
rem ============================================================================================================
rem  CREATION DU STAGING V2 - A LANCER UNE SEULE FOIS. Double-clic. Ne touche pas a la base des joueurs.
rem   1. nouveau projet Convex "cardgamepriv-v2" (equipe gamersardechois) -> .env.v2.local ; .env.local (prod) intact
rem   2. code convex/ envoye sur le staging
rem   3. variables d'environnement copiees de la prod SAUF webhook et bot Discord (aucune notif aux joueurs)
rem   4. export de la base des joueurs (sauvegardes\pour-staging-*.zip) importe dans le staging
rem   5. Tom et Hugo moderateurs sur le staging
rem  Le script peut ouvrir le navigateur pour la connexion Convex. Details : scripts\staging-v2.mjs, docs\V2.md
rem ============================================================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
call node scripts\staging-v2.mjs init %*
if errorlevel 1 ( echo. & echo ECHEC : lis le message ci-dessus. & pause & exit /b 1 )
echo.
echo Ensuite : mettre-en-ligne-v2.cmd
pause
exit /b 0
