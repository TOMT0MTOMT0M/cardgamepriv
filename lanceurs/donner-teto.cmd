@echo off
rem Donne la carte KCDQ "Teto" (double face) a Tom et a Hugo, 1 exemplaire chacun. A relancer = un exemplaire de plus.
rem A lancer APRES mettre-en-ligne-prod.cmd (la carte doit exister cote serveur). Journal : logs\donner-teto.log
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\donner-teto.log
echo === %date% %time% === > "%LOG%"
for %%n in (tom hugo) do (
  echo %%n...
  call npx convex run admin:grantTestCards "{\"name\":\"%%n\",\"perRarity\":0,\"mythics\":0,\"extra\":[{\"cardId\":\"kcdq-teto\",\"count\":1}]}" >> "%LOG%" 2>&1 || goto :err
)
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo TETO DONNEE A TOM ET HUGO. Recharge le jeu : Collection, album KCDQ.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
pause
exit /b 1
