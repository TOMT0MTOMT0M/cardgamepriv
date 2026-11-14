@echo off
rem ============================================================================================================
rem  CONTROLE DES TIRAGES D UN JOUEUR (11/11) - double-clic. LECTURE SEULE : ne modifie rien en ligne.
rem   1. export de la base des joueurs (deploiement de .env.local) dans un dossier provisoire
rem   2. analyse : 6 etoiles et 5 etoiles tirees par chaque joueur, comparees aux taux du jeu ; pour le joueur
rem      demande : origine de ses 6 etoiles, boosters par jour, comptes lies, journal admin
rem   3. le dossier provisoire est supprime (il contient toute la base)
rem  Resultat : a l ecran, dans logs\controler-joueur.log et logs\controle-joueurs.json. Relancable a volonte.
rem ============================================================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=logs\controler-joueur.log
set TMPD=logs\controle-tmp
set /p PSEUDO=Pseudo du joueur a controler (Entree = tableau de tous les joueurs seulement) : 
if exist "%TMPD%" rmdir /s /q "%TMPD%"
mkdir "%TMPD%"
echo === %date% %time% === > "%LOG%"
echo [1/3] export de la base (lecture seule, 1 a 2 minutes) ...
call npx convex export --path "%TMPD%\base.zip" >> "%LOG%" 2>&1 || goto :err
echo [2/3] extraction ...
powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '%TMPD%\base.zip' -DestinationPath '%TMPD%\base'" >> "%LOG%" 2>&1 || goto :err
echo [3/3] analyse ...
echo. >> "%LOG%"
call node scripts\controle-joueurs.mjs "%TMPD%\base" "%PSEUDO%" >> "%LOG%" 2>&1 || goto :err
rmdir /s /q "%TMPD%"
type "%LOG%"
echo.
pause
exit /b 0
:err
if exist "%TMPD%" rmdir /s /q "%TMPD%"
type "%LOG%"
echo.
echo ECHEC : voir logs\controler-joueur.log
pause
exit /b 1
