@echo off
rem ============================================================================================================
rem  PARRAINAGE MANUEL (07/11) - double-clic. Rattache un filleul a son parrain quand le lien n'a pas marche
rem  (lien ouvert dans le navigateur de Discord, compte cree dans un autre navigateur...).
rem  Le filleul recoit ses boosters ; s'il a deja ouvert ses 10 premiers, le parrain est paye tout de suite.
rem  Pseudos ou noms affiches, majuscules et accents ignores. A lancer APRES mettre-en-ligne (fonction serveur).
rem ============================================================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
set /p PARRAIN=Pseudo du PARRAIN (celui qui a donne son lien) : 
set /p FILLEUL=Pseudo du FILLEUL (celui qui s'est inscrit) : 
call npx convex run referrals:linkManual "{\"referrer\":\"%PARRAIN%\",\"child\":\"%FILLEUL%\"}" > logs\parrainage-dernier.log 2>&1
type logs\parrainage-dernier.log
type logs\parrainage-dernier.log >> logs\parrainage-manuel.log
echo.
pause
