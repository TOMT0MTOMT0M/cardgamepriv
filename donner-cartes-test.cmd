@echo off
rem Cartes de test pour Tom : envoie les fonctions Convex (dont admin.ts) puis donne les cartes.
rem Double-clic pour lancer. Journal : donner-cartes-test.log (meme dossier).
cd /d "%~dp0"
set LOG=%~dp0donner-cartes-test.log
echo === %date% %time% === > "%LOG%"
echo [1/2] envoi des fonctions Convex...
call npx convex dev --once >> "%LOG%" 2>&1 || goto :err
echo [2/2] cartes de test...
call npx convex run admin:grantTestCards "{\"name\":\"tom\",\"packs\":40,\"extra\":[{\"cardId\":\"cs-skin-ae0ce77b8db7\",\"count\":10}]}" >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo CARTES DONNEES. Recharge le jeu.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo.
echo ECHEC : voir donner-cartes-test.log
pause
exit /b 1
