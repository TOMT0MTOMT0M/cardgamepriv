@echo off
rem ============================================================================================================
rem  RAFRAICHIR LES DONNEES DU STAGING V2 - double-clic. Remplace TOUTES les donnees du staging par un export tout
rem  frais de la base des joueurs (sauvegardes\pour-staging-*.zip). La base des joueurs n'est que lue.
rem  A faire quand les donnees de test sont trop vieilles ou abimees par les essais.
rem ============================================================================================================
cd /d "%~dp0.."
call node scripts\staging-v2.mjs refresh
if errorlevel 1 ( echo. & echo ECHEC : lis le message ci-dessus. & pause & exit /b 1 )
pause
exit /b 0
