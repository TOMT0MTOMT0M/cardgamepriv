@echo off
rem Envoi sur GitHub de toutes les branches (master, v2...) et de tous les tags deja commites depuis la session Claude.
rem Ne met rien en ligne. Double-clic. Journal : logs\push.log
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\push.log
echo === %date% %time% === > "%LOG%"
echo [git] push de toutes les branches et des tags...
git push --all origin >> "%LOG%" 2>&1 && git push --tags origin >> "%LOG%" 2>&1 && goto :ok
echo [git] nouvel essai dans 10 s... >> "%LOG%"
timeout /t 10 /nobreak > nul
git push --all origin >> "%LOG%" 2>&1 || goto :err
git push --tags origin >> "%LOG%" 2>&1 || goto :err
:ok
echo === push OK === >> "%LOG%"
type "%LOG%"
echo.
echo PUSH TERMINE. Tu peux fermer cette fenetre.
pause
exit /b 0
:err
echo === ECHEC git (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
pause
exit /b 1
