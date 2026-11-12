@echo off
rem Mise en ligne complete : dependances, serveur Convex (deploiement de dev, celui du site), build, images R2, Cloudflare Pages.
rem Version SITE PRINCIPAL : publie sur la branche de production (master) quelle que soit la branche git ouverte.
rem Depuis la V1 (07/11) : ne plus lancer a la main - passer par publier-patch.cmd (sauvegarde de la base, fusion v2,
rem tag). Lance a la main hors de master, il demande confirmation. Journal : logs\deployer-prod.log.
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\deployer-prod.log
echo === %date% %time% === > "%LOG%"
for /f "usebackq delims=" %%b in (`git rev-parse --abbrev-ref HEAD`) do set BRANCHE=%%b
if "%SANS_PAUSE%"=="1" goto :go
if "%BRANCHE%"=="master" goto :go
echo.
echo ATTENTION : tu es sur la branche "%BRANCHE%", pas sur master. La prod = master (docs\V1.md).
echo Pour publier un patch, utilise publier-patch.cmd.
set /p OK=Tape OUI puis Entree pour publier quand meme "%BRANCHE%" chez les joueurs (autre chose = annuler) : 
if /i not "%OK%"=="OUI" ( echo Annule. & pause & exit /b 0 )
:go
echo [branche %BRANCHE%] >> "%LOG%"
echo [1/5] npm install...
echo [1/5] npm install >> "%LOG%"
call npm install --no-audit --no-fund >> "%LOG%" 2>&1 || goto :err
echo [2/5] serveur Convex...
echo [2/5] npx convex dev --once >> "%LOG%"
call npx convex dev --once >> "%LOG%" 2>&1 || goto :err
rem raretes : inventaire, vitrines et classeurs realignes sur le catalogue (idempotent)
call npx convex run migrations:resyncRarities >> "%LOG%" 2>&1 || goto :err
call npx convex run migrations:resyncRaritiesOpen >> "%LOG%" 2>&1 || goto :err
rem purge du 04/11 : cartes 1-3 etoiles sans illustration retirees des collections (idempotent)
call npx convex run migrations:purgeCards >> "%LOG%" 2>&1 || goto :err
rem (V2 fluidite, lot 4) gros tirages marques pour l'index by_big (idempotent)
call npx convex run migrations:markBigPulls >> "%LOG%" 2>&1 || goto :err
rem (audit perf 12/11) presence : une carte publique par joueur (idempotent)
call npx convex run migrations:backfillPresence >> "%LOG%" 2>&1 || goto :err
rem (audit perf 12/11) envies par carte : index inverse des listes d'envies (idempotent, par lots)
call npx convex run migrations:backfillWishes >> "%LOG%" 2>&1 || goto :err
call npx convex run admin:setModerators >> "%LOG%" 2>&1
rem cle de lecture des retours du labo (fichier local .feedback-key, jamais publie) -> environnement Convex
if exist ".feedback-key" (
  for /f "usebackq delims=" %%k in (".feedback-key") do call npx convex env set FEEDBACK_READ_KEY %%k >> "%LOG%" 2>&1 || goto :err
)
rem (retours live 6, B2) images remplacees : nouvelle adresse (?v=) pour qu'aucun cache ne garde l'ancienne
call node scripts/art-rev.mjs >> "%LOG%" 2>&1 || goto :err
echo [3/5] build...
rem (V2) identifiant de build = canal + date + commit : ecrit dans le code et dans version.json (pastille mise a jour)
for /f "usebackq delims=" %%s in (`git rev-parse --short HEAD`) do set BEBOU_SHA=%%s
echo [3/5] npm run build >> "%LOG%"
call npm run build >> "%LOG%" 2>&1 || goto :err
echo [4/5] images R2...
echo [4/5] r2-sync >> "%LOG%"
rem envoie les images nouvelles/modifiees dans le bucket R2 puis les retire du site (limite de 20 000 fichiers) ;
rem sans jeton R2 dans .env.local, ne fait rien : les images restent dans le site comme avant
call node scripts/r2-sync.mjs --dist >> "%LOG%" 2>&1 || goto :err
echo [5/5] Cloudflare Pages...
echo [5/5] wrangler pages deploy >> "%LOG%"
call npx --yes wrangler pages deploy dist --project-name=cardgamepriv --branch=master --commit-dirty=true >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
echo.
echo MISE EN LIGNE TERMINEE. Tu peux fermer cette fenetre.
if "%SANS_PAUSE%"=="1" exit /b 0
pause
exit /b 0
:err
set CODE=%errorlevel%
echo === ECHEC (code %CODE%) === >> "%LOG%"
echo.
echo ECHEC : voir logs\deployer-prod.log
if "%SANS_PAUSE%"=="1" exit /b 1
pause
exit /b 1
