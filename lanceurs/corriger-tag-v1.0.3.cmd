@echo off
rem A LANCER UNE FOIS (08/11). Le tag v1.0.3 sur GitHub pointe sur a2ed867 (carte Teto) alors que la vraie v1.0.3
rem mise en ligne contient aussi 6bd32fe (« Image a revoir » dans toutes les visionneuses). Ce lanceur remplace le
rem tag v1.0.3 de GitHub par celui du PC (6bd32fe). Rien d'autre n'est touche (ni branches, ni autres tags, ni site).
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\corriger-tag-v1.0.3.log
echo === %date% %time% === > "%LOG%"
for /f "usebackq delims=" %%c in (`git rev-list -n 1 v1.0.3`) do set C=%%c
echo Tag v1.0.3 du PC : %C%
echo %C% | findstr /b "6bd32fe" > nul || ( echo Le tag v1.0.3 du PC ne pointe pas sur 6bd32fe : rien n'est fait. & pause & exit /b 1 )
git push --force origin refs/tags/v1.0.3 >> "%LOG%" 2>&1 || goto :err
type "%LOG%"
echo.
echo TAG v1.0.3 CORRIGE sur GitHub. push.cmd ne signalera plus rien.
pause
exit /b 0
:err
type "%LOG%"
echo ECHEC : voir logs\corriger-tag-v1.0.3.log
pause
exit /b 1
