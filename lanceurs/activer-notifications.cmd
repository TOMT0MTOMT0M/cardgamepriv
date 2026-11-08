@echo off
rem A LANCER UNE FOIS par deploiement Convex : genere les cles VAPID (gratuites, Web Push) et les pose dans les
rem variables du deploiement. Jamais dans le code. Par defaut : le STAGING V2 (.env.v2.local) ; "prod" en argument
rem pour la prod (.env.local) — a faire au moment du patch qui sort les notifications.
rem   lanceurs\activer-notifications.cmd        -> staging V2
rem   lanceurs\activer-notifications.cmd prod   -> prod
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\activer-notifications.log
echo === %date% %time% === > "%LOG%"
set ENVF=.env.v2.local
if /i "%1"=="prod" set ENVF=.env.local
if not exist "%ENVF%" ( echo Pas de %ENVF% & pause & exit /b 1 )
for /f "tokens=1,* delims==" %%a in ('findstr /b "CONVEX_DEPLOYMENT=" "%ENVF%"') do set DEP=%%b
if "%DEP%"=="" ( echo CONVEX_DEPLOYMENT introuvable dans %ENVF% & pause & exit /b 1 )
rem (08/11) --deployment veut le NOM seul (good-gull-939), sans le prefixe "dev:" ni un commentaire en fin de ligne
for /f "tokens=1" %%x in ("%DEP%") do set DEP=%%x
set DEP=%DEP:dev:=%
echo Deploiement : %DEP%
rem (08/11) la bibliotheque web-push est une dependance ajoutee avec les notifications : installee si elle manque
if not exist node_modules\web-push\package.json (
  echo [0/2] installation des dependances ^(web-push^)...
  call npm install --no-audit --no-fund >> "%LOG%" 2>&1 || goto :err
)
if not exist .cache mkdir .cache
echo [1/2] generation des cles VAPID...
call node scripts/vapid-keys.mjs > .cache\vapid.tmp 2>> "%LOG%" || goto :err
for /f "tokens=1,* delims==" %%a in (.cache\vapid.tmp) do set %%a=%%b
del .cache\vapid.tmp
if "%VAPID_PUBLIC_KEY%"=="" goto :err
echo [2/2] variables sur le deploiement...
call npx convex env set --deployment %DEP% VAPID_PUBLIC_KEY %VAPID_PUBLIC_KEY% >> "%LOG%" 2>&1 || goto :err
call npx convex env set --deployment %DEP% VAPID_PRIVATE_KEY %VAPID_PRIVATE_KEY% >> "%LOG%" 2>&1 || goto :err
call npx convex env set --deployment %DEP% VAPID_SUBJECT mailto:gamersardechois@gmail.com >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
echo.
echo NOTIFICATIONS PRETES sur %DEP%. Ensuite : mettre-en-ligne (le code push.ts / sw.js doit etre deploye), puis
echo dans le jeu : Profil ^> Compte ^> "Activer les notifications" ^> "M'envoyer un test".
echo Annonce a tout le monde : npx convex run --deployment %DEP% push:announce "{\"title\":\"...\",\"body\":\"...\"}"
pause
exit /b 0
:err
echo === ECHEC === >> "%LOG%"
type "%LOG%"
echo ECHEC : voir logs\activer-notifications.log
pause
exit /b 1
