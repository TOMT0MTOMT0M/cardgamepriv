@echo off
rem ============================================================================================================
rem  AGENT CLAUDE - double-clic. Utilise la cle API de Tom (AGENT_CLAUDE_KEY dans .env.local) pour des controles
rem  en lot et des audits. LECTURE SEULE : rien n'est modifie dans le jeu, Convex ou R2. Rapports : docs\rapports-agent\
rem  Doc : docs\AGENT-CLAUDE.md.   En ligne de commande : lanceurs\agent-claude.cmd images --go
rem ============================================================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
if not "%~1"=="" (
  call npm run agent -- %* > "logs\agent-claude.log" 2>&1
  type "logs\agent-claude.log"
  exit /b %errorlevel%
)
echo.
echo   1. Etat (depenses du mois, lots en cours)
echo   2. Recuperer les lots termines (suivre)
echo   3. Images : bonne photo pour la bonne carte
echo   4. Cadrage des 5/6 etoiles sans visage
echo   5. Catalogue : rarete, doublons, familles
echo   6. Traductions anglaises
echo   7. Audit Convex (quotas)
echo   8. Audit perf mobile
echo.
choice /c 12345678 /n /m "Choix : "
set T=etat
if errorlevel 2 set T=suivre
if errorlevel 3 set T=images
if errorlevel 4 set T=cadrage
if errorlevel 5 set T=catalogue
if errorlevel 6 set T=traduction
if errorlevel 7 set T=convex
if errorlevel 8 set T=perf
if "%T%"=="etat" goto run
if "%T%"=="suivre" goto run
call npm run agent -- %T%
echo.
choice /c ON /n /m "Lancer pour de vrai (depense estimee ci-dessus) ? O/N : "
if errorlevel 2 goto fin
call npm run agent -- %T% --go > "logs\agent-claude.log" 2>&1
type "logs\agent-claude.log"
goto fin
:run
call npm run agent -- %T% > "logs\agent-claude.log" 2>&1
type "logs\agent-claude.log"
:fin
pause
exit /b 0
