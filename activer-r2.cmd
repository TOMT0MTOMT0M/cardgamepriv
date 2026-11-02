@echo off
rem A LANCER UNE FOIS (apres avoir active R2 et mis le jeton dans .env.local) : cree le bucket, y envoie toutes les
rem images (public/art), puis branche le bucket sur le site (wrangler.jsonc). Ensuite deployer.cmd s'occupe de tout.
cd /d "%~dp0"
set LOG=%~dp0activer-r2.log
echo === %date% %time% === > "%LOG%"
echo [1/3] bucket R2 cardgamepriv-art...
call npm install --no-audit --no-fund >> "%LOG%" 2>&1 || goto :err
call npx --yes wrangler r2 bucket create cardgamepriv-art >> "%LOG%" 2>&1
echo [2/3] envoi des images (la premiere fois : quelques minutes)...
call node scripts/r2-sync.mjs >> "%LOG%" 2>&1 || goto :err
echo [3/3] branchement du bucket sur le site...
call node scripts/r2-bind.mjs >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo R2 PRET. Lance deployer.cmd pour mettre le site en ligne sans les images.
pause
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo.
echo ECHEC : voir activer-r2.log
pause
exit /b 1
