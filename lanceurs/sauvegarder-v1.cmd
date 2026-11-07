@echo off
rem ============================================================================================================
rem  SAUVEGARDE DE LA V1 - double-clic. Ne modifie rien en ligne.
rem   1. export complet de la base des joueurs (deploiement Convex de .env.local, fichiers de profil inclus)
rem        -> sauvegardes\v1\base-AAAA-MM-JJ-HHMM.zip
rem   2. archive du code au tag git v1.0        -> sauvegardes\v1\code-v1.0.zip
rem   3. copie de .env.local (adresses Convex + jeton R2) -> sauvegardes\v1\env-local-v1.txt
rem  Relancable a volonte (chaque export de base est date). Restauration : docs\V1.md. Journal : logs\sauvegarder-v1.log
rem ============================================================================================================
set TAG=v1.0
cd /d "%~dp0.."
if not exist logs mkdir logs
if not exist sauvegardes\v1 mkdir sauvegardes\v1
set LOG=%~dp0..\logs\sauvegarder-v1.log
echo === %date% %time% === > "%LOG%"
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmm"`) do set STAMP=%%d
set BASE=sauvegardes\v1\base-%STAMP%.zip
echo [1/3] export de la base des joueurs dans %BASE% ...
call npx convex export --include-file-storage --path "%BASE%" >> "%LOG%" 2>&1 || goto :err
echo [2/3] archive du code au tag %TAG% ...
git rev-parse -q --verify refs/tags/%TAG% >nul 2>&1 || (echo Le tag %TAG% n'existe pas : git fetch --tags, puis relance. & goto :err)
git archive --format=zip -o sauvegardes\v1\code-%TAG%.zip %TAG% >> "%LOG%" 2>&1 || goto :err
echo [3/3] copie de .env.local ...
copy /y .env.local sauvegardes\v1\env-local-v1.txt >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
echo.
echo SAUVEGARDE TERMINEE dans sauvegardes\v1\ :
dir /b sauvegardes\v1
echo.
echo (ce dossier est hors git : pense a le copier ailleurs de temps en temps, cle USB ou cloud)
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo.
echo ECHEC : voir logs\sauvegarder-v1.log
pause
exit /b 1
