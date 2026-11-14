@echo off
rem BILAN SORTIE V2 (14/11) - double-clic. Export frais de la base des joueurs, puis comparaison avec la sauvegarde
rem faite par publier-patch juste avant la V2. Ne modifie rien. Rapport : logs\bilan-exports-*.txt
cd /d "%~dp0.."
set AVANT=sauvegardes\v1\base-2026-11-14-1748.zip
set APRES=sauvegardes\apres-v2.0-%RANDOM%.zip
echo [1/2] export de la base des joueurs (1-2 min)...
call npx convex export --path "%APRES%" || (echo Export rate. & pause & exit /b 1)
echo [2/2] comparaison avant / apres...
call node scripts\bilan-exports.mjs "%AVANT%" "%APRES%"
pause
