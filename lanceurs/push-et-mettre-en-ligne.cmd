@echo off
rem Push des commits deja faits depuis la session Claude puis mise en ligne du site principal.
cd /d "%~dp0.."
set LOG=%~dp0..\logs\push-et-mettre-en-ligne.log
echo === %date% %time% === > "%LOG%"
echo [git] push...
git push >> "%LOG%" 2>&1 || goto :err
echo === push OK === >> "%LOG%"
type "%LOG%"
call lanceurs\mettre-en-ligne-prod.cmd
exit /b 0
:err
echo === ECHEC git (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
pause
exit /b 1
