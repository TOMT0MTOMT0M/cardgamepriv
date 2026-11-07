@echo off
rem ============================================================================================================
rem  OUVERTURE OFFICIELLE (07/11) - a lancer AVANT mettre-en-ligne-prod.cmd. Double-clic.
rem   1. sauvegarde complete de la base (sauvegardes\avant-ouverture-XXXX.zip) : on peut tout revenir en arriere
rem   2. envoi des fonctions Convex (compte a rebours, comptes pseudo, bot Discord, remise a zero)
rem   3. Tom et Hugo marques moderateurs (ce sont les comptes gardes)
rem   4. heure d'ouverture (OUVERTURE ci-dessous, heure de Paris : +01:00 en hiver)
rem   5. remise a zero : d'abord une SIMULATION affichee, puis tu tapes RESET pour lancer pour de vrai
rem  Journal : logs\ouverture.log
rem ============================================================================================================
set OUVERTURE=2026-11-07T21:00:00+01:00
cd /d "%~dp0.."
if not exist logs mkdir logs
if not exist sauvegardes mkdir sauvegardes
set LOG=%~dp0..\logs\ouverture.log
set SAVE=sauvegardes\avant-ouverture-%RANDOM%.zip
echo === %date% %time% === > "%LOG%"
echo [1/5] sauvegarde de la base dans %SAVE%...
call npx convex export --path "%SAVE%" >> "%LOG%" 2>&1 || goto :err
echo [2/5] envoi des fonctions Convex...
call npx convex dev --once >> "%LOG%" 2>&1 || goto :err
echo [3/5] Tom et Hugo moderateurs...
call npx convex run admin:setModerators >> "%LOG%" 2>&1
echo [4/5] ouverture fixee a %OUVERTURE%...
call npx convex run launch:setLaunch "{\"at\":\"%OUVERTURE%\"}" >> "%LOG%" 2>&1 || goto :err
echo [5/5] simulation de la remise a zero :
call npx convex run launch:resetAll > logs\ouverture-simulation.log 2>&1 || (type logs\ouverture-simulation.log & goto :err)
type logs\ouverture-simulation.log
type logs\ouverture-simulation.log >> "%LOG%"
echo.
echo Verifie ci-dessus : "gardes" = Tom et Hugo, "supprimes" = tous les autres joueurs.
set /p OK=Tape RESET puis Entree pour tout vider (autre chose = annuler) : 
if /i not "%OK%"=="RESET" (
  echo Remise a zero ANNULEE. L'heure d'ouverture est quand meme posee.
  echo === remise a zero annulee === >> "%LOG%"
  pause
  exit /b 0
)
call npx convex run launch:resetAll "{\"confirm\":\"RESET\"}" >> "%LOG%" 2>&1 || goto :err
echo Remise a zero lancee (par lots, quelques secondes)...
timeout /t 20 /nobreak > nul
call npx convex run launch:resetReport >> "%LOG%" 2>&1
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo OUVERTURE PREPAREE. Bilan ci-dessus ("done": true = termine ; sinon relance : npx convex run launch:resetReport).
echo Ensuite : mettre-en-ligne-prod.cmd pour publier le site avec l'ecran compte a rebours.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo.
echo ECHEC : voir logs\ouverture.log (rien n'a ete vide si l'erreur est avant l'etape 5)
pause
exit /b 1
