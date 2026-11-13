@echo off
rem ============================================================================================================
rem  VERROUILLAGE SEUL (07/11, sortie V2 le 14/11) - double-clic. Ne vide RIEN (pas de remise a zero).
rem   1. Tom et Hugo marques moderateurs (ils passent le compte a rebours)
rem   2. heure d'ouverture posee : tout le monde voit le compte a rebours sauf l'equipe,
rem      et aucun compte ne peut etre cree avant l'heure.
rem  Pour deverrouiller tout de suite : npx convex run launch:setLaunch "{\"at\":null}"
rem  Journal : logs\verrouiller.log
rem ============================================================================================================
set OUVERTURE=2026-11-14T20:00:00+01:00
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\verrouiller.log
echo === %date% %time% === > "%LOG%"
echo [1/2] Tom et Hugo moderateurs...
call npx convex run admin:setModerators >> "%LOG%" 2>&1
echo [2/2] verrouillage jusqu'a %OUVERTURE%...
call npx convex run launch:setLaunch "{\"at\":\"%OUVERTURE%\"}" >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo SITE VERROUILLE. Recharge le site dans une fenetre privee : tu dois voir le compte a rebours.
echo Le jeu se rouvre tout seul a l'heure. Surtout NE PAS lancer de remise a zero.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo.
echo ECHEC : voir logs\verrouiller.log
pause
exit /b 1
