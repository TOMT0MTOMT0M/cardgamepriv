@echo off
rem LABO Fable : chat Claude paye UNIQUEMENT par les credits API mensuels (cle CLAUDE_LABO_API_KEY dans .env.local).
title LABO Fable
cd /d "%~dp0"
echo %date% %time% LABO.cmd demarre dans %cd% >> "..\..\logs\labo-demarrage.log"
echo LABO Fable : demarrage...
if not exist node_modules ( echo Premier lancement : installation du SDK... & call npm install --no-audit --no-fund || ( echo Echec de npm install. & pause & exit /b 1 ) )
node labo.mjs
echo %date% %time% labo.mjs termine, code %errorlevel% >> "..\..\logs\labo-demarrage.log"
echo.
echo Labo ferme. Tu peux fermer cette fenetre.
