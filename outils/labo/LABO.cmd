@echo off
rem LABO Fable : chat Claude paye UNIQUEMENT par les credits API mensuels (cle CLAUDE_LABO_API_KEY dans .env.local).
cd /d "%~dp0"
if not exist node_modules ( echo Premier lancement : installation du SDK... & call npm install --no-audit --no-fund || ( echo Echec de npm install. & pause & exit /b 1 ) )
node labo.mjs
