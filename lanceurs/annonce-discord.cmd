@echo off
rem Annonce d'ouverture sur Discord par le bot : vide #bebou-card puis poste l'annonce @everyone
rem dans #discussion et #bebou-card (epinglee). Simulation d'abord, puis tu tapes GO.
cd /d "%~dp0.."
call node scripts\annonce-discord.mjs || (pause & exit /b 1)
echo.
set /p OK=Tape GO puis Entree pour vider #bebou-card et poster l'annonce (autre chose = annuler) : 
if /i not "%OK%"=="GO" ( echo Annule. & pause & exit /b 0 )
call node scripts\annonce-discord.mjs --go
pause
