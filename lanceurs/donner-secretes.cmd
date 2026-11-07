@echo off
rem Donne a Tom et a Hugo les 23 cartes secretes (1 exemplaire chacune) : les 14 Merveilles (dioramas), les 8 Bebous, Enzo (KCDQ).
rem A relancer = un exemplaire de plus de chaque carte.
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\donner-secretes.log
echo === %date% %time% === > "%LOG%"
echo [1/2] Tom...
call npx convex run admin:grantTestCards "{\"name\":\"tom\",\"perRarity\":0,\"mythics\":0,\"extra\":[{\"cardId\":\"mrv-grande-pyramide-de-kheops\",\"count\":1},{\"cardId\":\"mrv-jardins-suspendus-de-babylone\",\"count\":1},{\"cardId\":\"mrv-statue-de-zeus-a-olympie\",\"count\":1},{\"cardId\":\"mrv-temple-d-artemis-a-ephese\",\"count\":1},{\"cardId\":\"mrv-mausolee-d-halicarnasse\",\"count\":1},{\"cardId\":\"mrv-colosse-de-rhodes\",\"count\":1},{\"cardId\":\"mrv-phare-d-alexandrie\",\"count\":1},{\"cardId\":\"mrv-grande-muraille-de-chine\",\"count\":1},{\"cardId\":\"mrv-petra-khazneh\",\"count\":1},{\"cardId\":\"mrv-christ-redempteur-rio\",\"count\":1},{\"cardId\":\"mrv-machu-picchu\",\"count\":1},{\"cardId\":\"mrv-chichen-itza\",\"count\":1},{\"cardId\":\"mrv-colisee-de-rome\",\"count\":1},{\"cardId\":\"mrv-taj-mahal\",\"count\":1},{\"cardId\":\"bebou-1\",\"count\":1},{\"cardId\":\"bebou-2\",\"count\":1},{\"cardId\":\"bebou-3\",\"count\":1},{\"cardId\":\"bebou-4\",\"count\":1},{\"cardId\":\"bebou-5\",\"count\":1},{\"cardId\":\"bebou-6\",\"count\":1},{\"cardId\":\"bebou-7\",\"count\":1},{\"cardId\":\"bebou-8\",\"count\":1},{\"cardId\":\"kcdq-enzo\",\"count\":1}]}" >> "%LOG%" 2>&1 || goto :err
echo [2/2] Hugo...
call npx convex run admin:grantTestCards "{\"name\":\"hugo\",\"perRarity\":0,\"mythics\":0,\"extra\":[{\"cardId\":\"mrv-grande-pyramide-de-kheops\",\"count\":1},{\"cardId\":\"mrv-jardins-suspendus-de-babylone\",\"count\":1},{\"cardId\":\"mrv-statue-de-zeus-a-olympie\",\"count\":1},{\"cardId\":\"mrv-temple-d-artemis-a-ephese\",\"count\":1},{\"cardId\":\"mrv-mausolee-d-halicarnasse\",\"count\":1},{\"cardId\":\"mrv-colosse-de-rhodes\",\"count\":1},{\"cardId\":\"mrv-phare-d-alexandrie\",\"count\":1},{\"cardId\":\"mrv-grande-muraille-de-chine\",\"count\":1},{\"cardId\":\"mrv-petra-khazneh\",\"count\":1},{\"cardId\":\"mrv-christ-redempteur-rio\",\"count\":1},{\"cardId\":\"mrv-machu-picchu\",\"count\":1},{\"cardId\":\"mrv-chichen-itza\",\"count\":1},{\"cardId\":\"mrv-colisee-de-rome\",\"count\":1},{\"cardId\":\"mrv-taj-mahal\",\"count\":1},{\"cardId\":\"bebou-1\",\"count\":1},{\"cardId\":\"bebou-2\",\"count\":1},{\"cardId\":\"bebou-3\",\"count\":1},{\"cardId\":\"bebou-4\",\"count\":1},{\"cardId\":\"bebou-5\",\"count\":1},{\"cardId\":\"bebou-6\",\"count\":1},{\"cardId\":\"bebou-7\",\"count\":1},{\"cardId\":\"bebou-8\",\"count\":1},{\"cardId\":\"kcdq-enzo\",\"count\":1}]}" >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo CARTES SECRETES DONNEES A TOM ET HUGO. Rechargez le jeu.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo.
echo ECHEC : voir logs\donner-secretes.log
pause
exit /b 1
