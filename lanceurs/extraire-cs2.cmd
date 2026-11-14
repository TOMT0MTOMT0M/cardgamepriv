@echo off
rem Extrait de CS2 les fichiers des skins 5-6 etoiles (Source 2 Viewer CLI). Double-clic. Resultat : imports\cs2\
rem 1er lancement = liste du contenu ; 2e lancement (apres Claude) = export.
rem (11/11) lot 5 ajoute : le sticker 6 etoiles Reason Gaming (Holo) Katowice 2014 (liste dans extraire-cs2.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0extraire-cs2.ps1"
pause
