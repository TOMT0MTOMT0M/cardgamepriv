@echo off
rem ============================================================================================================
rem  EXPORT DES REPONSES AU SONDAGE (11/11) - double-clic. LECTURE SEULE : ne modifie rien en ligne.
rem  Lit les reponses dans la base des joueurs (deploiement de .env.local) et ecrit logs\sondage-reponses.json
rem  (comptes par univers / nouveaute, note moyenne, reponses ecrites avec le pseudo). Relancable a volonte.
rem ============================================================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
call node scripts\export-sondage.mjs > logs\exporter-sondage.log 2>&1
type logs\exporter-sondage.log
echo.
pause
