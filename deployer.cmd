@echo off
rem Mise en ligne complete : dependances, serveur Convex (deploiement de dev, celui du site), build, images R2, Cloudflare Pages.
rem Double-clic pour lancer. Journal : deployer.log (meme dossier).
cd /d "%~dp0"
set LOG=%~dp0deployer.log
echo === %date% %time% === > "%LOG%"
echo [1/5] npm install...
echo [1/5] npm install >> "%LOG%"
call npm install --no-audit --no-fund >> "%LOG%" 2>&1 || goto :err
echo [2/5] serveur Convex...
echo [2/5] npx convex dev --once >> "%LOG%"
call npx convex dev --once >> "%LOG%" 2>&1 || goto :err
rem raretes : inventaire, vitrines et classeurs realignes sur le catalogue (idempotent)
call npx convex run migrations:resyncRarities >> "%LOG%" 2>&1 || goto :err
rem cle de lecture des retours du labo (fichier local .feedback-key, jamais publie) -> environnement Convex
if exist ".feedback-key" (
  for /f "usebackq delims=" %%k in (".feedback-key") do call npx convex env set FEEDBACK_READ_KEY %%k >> "%LOG%" 2>&1 || goto :err
)
echo [3/5] build...
echo [3/5] npm run build >> "%LOG%"
call npm run build >> "%LOG%" 2>&1 || goto :err
echo [4/5] images R2...
echo [4/5] r2-sync >> "%LOG%"
rem envoie les images nouvelles/modifiees dans le bucket R2 puis les retire du site (limite de 20 000 fichiers) ;
rem sans jeton R2 dans .env.local, ne fait rien : les images restent dans le site comme avant
call node scripts/r2-sync.mjs --dist >> "%LOG%" 2>&1 || goto :err
echo [5/5] Cloudflare Pages...
echo [5/5] wrangler pages deploy >> "%LOG%"
call npx --yes wrangler pages deploy dist --project-name=cardgamepriv --commit-dirty=true >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
echo.
echo MISE EN LIGNE TERMINEE. Tu peux fermer cette fenetre.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
echo.
echo ECHEC : voir deployer.log
pause
exit /b 1
