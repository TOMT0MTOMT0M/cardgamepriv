@echo off
rem Ouvre le lanceur Claude (fenetre a boutons). Marche aussi copie sur le Bureau. Ne pas renommer en CLAUDE.cmd : ca masquerait la commande claude.
set "PS1=%~dp0outils\lanceur-claude.ps1"
if not exist "%PS1%" set "PS1=%USERPROFILE%\Desktop\cardgamepriv\outils\lanceur-claude.ps1"
if not exist "%PS1%" ( echo Lanceur introuvable : mets ce fichier dans le dossier cardgamepriv, ou fais-en un raccourci. & pause & exit /b 1 )
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PS1%"
