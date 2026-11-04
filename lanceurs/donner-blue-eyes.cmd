@echo off
rem Donne a Tom la carte 6* Blue-Eyes White Dragon (pour la voir dans le jeu en ligne).
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\donner-blue-eyes.log
echo === %date% %time% === > "%LOG%"
call npx convex run admin:grantTestCards "{\"name\":\"tom\",\"perRarity\":0,\"mythics\":0,\"extra\":[{\"cardId\":\"pop-blue-eyes-white-dragon\",\"count\":1}]}" >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo CARTE DONNEE. Recharge le jeu.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
pause
exit /b 1
