@echo off
rem Espace Jeux : envoie les fonctions Convex, fait de Tom un admin (panneau anti-abus) et lui donne 5 000 pieces de test.
rem Double-clic pour lancer. Journal : logs\activer-jeux-admin.log.
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\activer-jeux-admin.log
echo === %date% %time% === > "%LOG%"
echo [1/3] envoi des fonctions Convex...
call npx convex dev --once >> "%LOG%" 2>&1 || goto :err
echo [2/3] acces admin...
call npx convex run admin:setAdmin "{\"name\":\"tom\"}" >> "%LOG%" 2>&1 || goto :err
echo [3/3] pieces de test...
call npx convex run admin:grantCoins "{\"name\":\"tom\",\"amount\":5000,\"label\":\"Pieces de test\"}" >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo TERMINE. Recharge le jeu : onglet JEUX, puis Admin.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo.
echo ECHEC : voir logs\activer-jeux-admin.log
pause
exit /b 1
