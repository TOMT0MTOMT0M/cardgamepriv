@echo off
rem ============================================================================================================
rem  PUBLIER UN PATCH (v2 -> prod) - double-clic. LE SEUL CHEMIN VERS LA PROD depuis la V1 (07/11).
rem   1. controles : arbre git propre, v2 contient master, numero de version libre
rem   2. SIMULATION : liste des commits et des fichiers qui partent, schema / migrations touches
rem   3. sauvegarde complete de la base des joueurs -> sauvegardes\avant-patch-vX.Y-*.zip
rem   4. tu tapes PUBLIER : mise en ligne prod depuis v2, puis fusion v2 -> master dans .wt-master (mettre-en-ligne-prod.cmd : code Convex sur la
rem      base des joueurs + migrations idempotentes, build, images R2, Pages master), tag vX.Y, v2 realignee, push.
rem  Les joueurs qui ont le jeu ouvert voient "Mise a jour disponible - Recharger" dans les 3 min.
rem  Retour arriere : docs\V1.md. Journal : logs\publier-patch.log
rem ============================================================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
if not exist sauvegardes mkdir sauvegardes
set LOG=%~dp0..\logs\publier-patch.log
echo === %date% %time% === > "%LOG%"
echo [1/4] controles...
git status --porcelain --untracked-files=no > logs\publier-patch-status.txt
for %%A in (logs\publier-patch-status.txt) do if %%~zA gtr 0 (
  echo Des fichiers modifies ne sont pas commites :
  type logs\publier-patch-status.txt
  echo Commite ^(ou range^) d'abord, puis relance.
  goto :err
)
rem (13/11) master est ouvert dans le worktree .wt-master : la fusion v2 -> master se fait LA-BAS
if not exist ".wt-master\.git" ( echo Dossier .wt-master introuvable ^(worktree de master^). & goto :err )
for /f "usebackq delims=" %%b in (`git -C .wt-master rev-parse --abbrev-ref HEAD`) do set BMW=%%b
if not "%BMW%"=="master" ( echo .wt-master n'est pas sur master ^(%BMW%^). & goto :err )
git -C .wt-master status --porcelain --untracked-files=no > logs\publier-patch-status-master.txt
for %%A in (logs\publier-patch-status-master.txt) do if %%~zA gtr 0 (
  echo Des fichiers modifies ne sont pas commites dans .wt-master :
  type logs\publier-patch-status-master.txt
  goto :err
)
git fetch origin >> "%LOG%" 2>&1
git merge-base --is-ancestor master v2 || (
  echo La branche master a des commits que v2 n'a pas : fais d'abord "git checkout v2" puis "git merge master".
  goto :err
)
git merge-base --is-ancestor origin/master master 2>nul || (
  echo ATTENTION : origin/master est en avance sur ton master local ^(git pull sur master d'abord^).
  goto :err
)
for /f "usebackq delims=" %%t in (`git describe --tags --abbrev=0 master 2^>nul`) do set DERNIER=%%t
echo Dernier patch publie : %DERNIER%
set /p VERSION=Numero du nouveau patch (ex. 1.1 pour v1.1) : 
if "%VERSION%"=="" ( echo Pas de numero : annule. & goto :err )
set TAG=v%VERSION%
git rev-parse -q --verify refs/tags/%TAG% >nul 2>&1 && ( echo Le tag %TAG% existe deja. & goto :err )
echo [patch %TAG%] >> "%LOG%"
echo.
echo [2/4] SIMULATION - ce qui part chez les joueurs (master..v2) :
echo ---------------------------------------------------------------- commits
git log --oneline --no-decorate master..v2
echo ---------------------------------------------------------------- fichiers
git diff --stat --stat-count=30 master..v2
echo ---------------------------------------------------------------- schema / migrations / lanceur prod
git diff --name-only master..v2 -- convex/schema.ts convex/migrations.ts lanceurs/mettre-en-ligne-prod.cmd
echo (si convex/schema.ts est dans la liste : champs OPTIONNELS seulement + migration idempotente, testee sur le staging)
echo ----------------------------------------------------------------
git log --oneline --no-decorate master..v2 >> "%LOG%"
echo.
echo [3/4] sauvegarde de la base des joueurs...
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HHmm"`) do set STAMP=%%d
set SAVE=sauvegardes\avant-patch-%TAG%-%STAMP%.zip
call npx convex export --include-file-storage --path "%SAVE%" >> "%LOG%" 2>&1 || goto :err
echo      -> %SAVE%
echo.
set /p OK=Tape PUBLIER puis Entree pour mettre %TAG% en ligne chez les joueurs (autre chose = annuler) : 
if /i not "%OK%"=="PUBLIER" (
  echo Publication ANNULEE. Rien n'a change ^(la sauvegarde est gardee^).
  echo === annule === >> "%LOG%"
  pause
  exit /b 0
)
echo [4/4] mise en ligne puis fusion v2 -> master...
rem (13/11) master vit dans .wt-master : la mise en ligne part d'ICI (branche v2, node_modules a jour), dont le contenu
rem est celui de master apres la fusion (v2 contient deja tout master, controle plus haut). Fusion et tag ensuite.
set SANS_PAUSE=1
call lanceurs\mettre-en-ligne-prod.cmd || goto :errprod
set SANS_PAUSE=
rem revisions d'images montees par art-rev.mjs pendant la mise en ligne : on les garde dans le patch
git add src/core/artRev.json >> "%LOG%" 2>&1
git diff --cached --quiet || git commit -m "patch %TAG% : revisions d'images" >> "%LOG%" 2>&1
git -C .wt-master merge --no-ff v2 -m "patch %TAG%" >> "%LOG%" 2>&1 || goto :errmerge
git tag -a %TAG% -m "patch %TAG%" master >> "%LOG%" 2>&1 || goto :err
git merge --ff-only master >> "%LOG%" 2>&1 || goto :err
echo [git] push...
git push origin master v2 --tags >> "%LOG%" 2>&1 || (echo Push rate : relance lanceurs\push.cmd plus tard. >> "%LOG%" & echo Push rate : relance lanceurs\push.cmd plus tard.)
echo === OK %TAG% === >> "%LOG%"
echo.
echo PATCH %TAG% EN LIGNE : https://cardgamepriv.pages.dev/jeu/
echo Tu es toujours sur la branche v2. Sauvegarde d'avant patch : %SAVE%
pause
exit /b 0
:errmerge
echo Fusion v2 -^> master impossible dans .wt-master, alors que la prod est DEJA en ligne. >> "%LOG%"
git -C .wt-master merge --abort >> "%LOG%" 2>&1
echo.
echo ATTENTION : la prod est en ligne mais master n'a pas la fusion. Ne relance rien : appelle Claude
echo ^(a faire : git -C .wt-master merge --no-ff v2, puis git tag -a %TAG% master, puis git merge --ff-only master^).
pause
exit /b 1
:errprod
set SANS_PAUSE=
echo === ECHEC mise en ligne (master inchange, PAS de tag) === >> "%LOG%"
echo.
echo ECHEC pendant la mise en ligne (voir logs\deployer-prod.log). master n'a pas bouge, aucun tag n'a ete pose.
echo  - si le site des joueurs est casse : docs\V1.md (retour a %DERNIER%).
echo  - pour reessayer apres correction : corrige sur v2, puis relance publier-patch.cmd avec le MEME numero.
pause
exit /b 1
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
echo.
echo ECHEC : voir logs\publier-patch.log. Rien n'est parti en ligne.
pause
exit /b 1
