@echo off
rem ============================================================================================================
rem  MISE EN LIGNE V2 (lien admin) - double-clic. NE TOUCHE JAMAIS LA PROD (ni le site des joueurs, ni leur base).
rem   1. npm install
rem   2. code Convex -> deploiement de STAGING (.env.v2.local), migrations idempotentes dessus
rem   3. build en mode v2 (bandeau "V2 - test", jeu reserve a l'equipe)
rem   4. images NOUVELLES -> R2 (bucket partage : une image remplacee attend le patch prod)
rem   5. Cloudflare Pages, branche v2 -> https://v2.cardgamepriv.pages.dev
rem  Prerequis (une fois) : creer-staging-v2.cmd. Journal : logs\mettre-en-ligne-v2.log
rem ============================================================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\mettre-en-ligne-v2.log
echo === %date% %time% === > "%LOG%"
if not exist ".env.v2.local" ( echo Pas de .env.v2.local : lance d'abord creer-staging-v2.cmd & pause & exit /b 1 )
for /f "usebackq delims=" %%b in (`git rev-parse --abbrev-ref HEAD`) do set BRANCHE=%%b
echo [branche %BRANCHE%] >> "%LOG%"
if "%BRANCHE%"=="v2" goto :go
echo.
echo NOTE : tu es sur la branche "%BRANCHE%" (le lien V2 montre normalement la branche v2).
set /p OK=Tape OUI puis Entree pour publier quand meme "%BRANCHE%" sur le lien V2 (autre chose = annuler) : 
if /i not "%OK%"=="OUI" ( echo Annule. & pause & exit /b 0 )
:go
for /f "usebackq delims=" %%n in (`node scripts\staging-v2.mjs name`) do set V2=%%n
if "%V2%"=="" ( echo Deploiement de staging introuvable (.env.v2.local) & goto :err )
echo [staging %V2%] >> "%LOG%"
echo [1/5] npm install...
call npm install --no-audit --no-fund >> "%LOG%" 2>&1 || goto :err
echo [2/5] serveur Convex de staging (%V2%)...
call node scripts\staging-v2.mjs deploy >> "%LOG%" 2>&1 || goto :err
call npx convex run --deployment %V2% migrations:resyncRarities >> "%LOG%" 2>&1 || goto :err
call npx convex run --deployment %V2% migrations:purgeCards >> "%LOG%" 2>&1 || goto :err
rem (V2 fluidite, lot 4) gros tirages marques pour l'index by_big (idempotent)
call npx convex run --deployment %V2% migrations:markBigPulls >> "%LOG%" 2>&1 || goto :err
call npx convex run --deployment %V2% admin:setModerators >> "%LOG%" 2>&1
echo [3/5] build (mode v2)...
for /f "usebackq delims=" %%s in (`git rev-parse --short HEAD`) do set BEBOU_SHA=%%s
call npx tsc --noEmit >> "%LOG%" 2>&1 || goto :err
call npx vite build --mode v2 >> "%LOG%" 2>&1 || goto :err
echo [4/5] images nouvelles vers R2...
call node scripts/r2-sync.mjs --dist --nouvelles-seulement >> "%LOG%" 2>&1 || goto :err
echo [5/5] Cloudflare Pages (branche v2)...
call npx --yes wrangler pages deploy dist --project-name=cardgamepriv --branch=v2 --commit-dirty=true >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
echo.
echo LIEN V2 MIS A JOUR : https://v2.cardgamepriv.pages.dev/jeu/  (labo : https://v2.cardgamepriv.pages.dev/)
echo Connexion avec un compte equipe (Tom, Hugo). Le site des joueurs n'a pas bouge.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
echo.
echo ECHEC : voir logs\mettre-en-ligne-v2.log
pause
exit /b 1
