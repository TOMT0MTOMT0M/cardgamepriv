@echo off
rem Envoi sur GitHub de toutes les branches (master, v2...) et de tous les tags deja commites depuis la session Claude.
rem Ne met rien en ligne. Double-clic. Journal : logs\push.log
rem (08/11) un tag qui existe deja sur GitHub avec un autre contenu ne fait plus echouer le push : les branches
rem passent, le tag en double est signale (il n'est jamais ecrase ici).
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\push.log
echo === %date% %time% === > "%LOG%"
echo [git] push de toutes les branches...
git push --all origin >> "%LOG%" 2>&1 && goto :tags
echo [git] nouvel essai dans 10 s... >> "%LOG%"
timeout /t 10 /nobreak > nul
git push --all origin >> "%LOG%" 2>&1 || goto :err
:tags
echo [git] push des tags...
set TAGWARN=
git push --tags origin >> "%LOG%" 2>&1 || set TAGWARN=1
echo === push OK === >> "%LOG%"
type "%LOG%"
echo.
if defined TAGWARN (
  echo ATTENTION : un tag existe deja sur GitHub avec un autre contenu ^(ligne "already exists" plus haut^).
  echo Les branches sont bien envoyees. Le tag n'a pas ete ecrase.
  echo.
)
echo PUSH TERMINE. Tu peux fermer cette fenetre.
pause
exit /b 0
:err
echo === ECHEC git (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
pause
exit /b 1
