@echo off
rem Ouvre le lanceur Claude (fenetre a boutons). Ne pas renommer en CLAUDE.cmd : ca masquerait la commande claude.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0outils\lanceur-claude.ps1"
