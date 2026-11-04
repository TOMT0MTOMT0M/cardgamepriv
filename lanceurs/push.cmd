@echo off
rem Push des commits deja faits (sans mise en ligne).
cd /d "%~dp0.."
set LOG=%~dp0..\logs\push.log
if not exist logs mkdir logs
echo === %date% %time% === > "%LOG%"
git push >> "%LOG%" 2>&1 || goto :err
echo === push OK === >> "%LOG%"
exit /b 0
:err
echo === ECHEC git (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
pause
exit /b 1
