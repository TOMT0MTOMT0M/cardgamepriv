@echo off
rem Ouvre le lanceur Claude (page pleine fenetre). Marche aussi copie sur le Bureau. Ne pas renommer en CLAUDE.cmd.
set "VBS=%~dp0outils\lanceur-claude.vbs"
if not exist "%VBS%" set "VBS=%USERPROFILE%\Desktop\cardgamepriv\outils\lanceur-claude.vbs"
if not exist "%VBS%" ( echo Lanceur introuvable : mets ce fichier dans le dossier cardgamepriv. & pause & exit /b 1 )
where node >nul 2>nul || ( echo Node.js introuvable : installe-le puis relance. & pause & exit /b 1 )
start "" wscript.exe "%VBS%"
