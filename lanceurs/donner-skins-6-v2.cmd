@echo off
rem (11/11) V2 SEULEMENT : donne a Tom (compte du STAGING) les 46 skins CS 6 etoiles + les 5 Berserk 6 etoiles, 1 exemplaire chacun.
rem Ne touche pas la prod (deploiement de staging lu dans .env.v2.local). Journal : logs\donner-skins-6-v2.log
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\donner-skins-6-v2.log
echo === %date% %time% === > "%LOG%"
if not exist ".env.v2.local" ( echo Pas de .env.v2.local & pause & exit /b 1 )
for /f "usebackq delims=" %%n in (`node scripts\staging-v2.mjs name`) do set V2=%%n
if "%V2%"=="" ( echo Deploiement de staging introuvable & goto :err )
echo [staging %V2%] >> "%LOG%"
echo Skins CS + Berserk 6 etoiles vers le compte tom (staging %V2%)...
call npx convex run --deployment %V2% admin:grantTestCards "{\"name\":\"tom\",\"perRarity\":0,\"mythics\":0,\"extra\":[{\"cardId\":\"cs-skin-4f8d99d09ded\",\"count\":1},{\"cardId\":\"cs-skin-8aacf99e7f2f\",\"count\":1},{\"cardId\":\"cs-skin-vanilla-weapon_knife_butterfly\",\"count\":1},{\"cardId\":\"cs-skin-51688cf28133\",\"count\":1},{\"cardId\":\"cs-skin-379727014f65\",\"count\":1},{\"cardId\":\"cs-skin-688d607e4dec\",\"count\":1},{\"cardId\":\"cs-skin-6c3fbb89c658\",\"count\":1},{\"cardId\":\"cs-skin-da19db61f316\",\"count\":1},{\"cardId\":\"cs-skin-89f34e17d8b4\",\"count\":1},{\"cardId\":\"cs-skin-6656ae9270b9\",\"count\":1},{\"cardId\":\"cs-skin-a07ae9bbbeff\",\"count\":1},{\"cardId\":\"cs-skin-c14ef2ceee15\",\"count\":1},{\"cardId\":\"cs-skin-eae7c10fa54f\",\"count\":1},{\"cardId\":\"cs-skin-c537f6da0a92\",\"count\":1},{\"cardId\":\"cs-skin-9f5234d3821f\",\"count\":1},{\"cardId\":\"cs-skin-0063b0378b5b\",\"count\":1},{\"cardId\":\"cs-skin-vanilla-weapon_knife_karambit\",\"count\":1},{\"cardId\":\"cs-skin-3d2a30953c01\",\"count\":1},{\"cardId\":\"cs-skin-e7fa76b05d6f\",\"count\":1},{\"cardId\":\"cs-skin-648d6470a3f9\",\"count\":1},{\"cardId\":\"cs-skin-c187005d5542\",\"count\":1},{\"cardId\":\"cs-skin-8370ef040f98\",\"count\":1},{\"cardId\":\"cs-skin-d1da7a632cfe\",\"count\":1},{\"cardId\":\"cs-skin-525ac56c082c\",\"count\":1},{\"cardId\":\"cs-skin-657a59e6566b\",\"count\":1},{\"cardId\":\"cs-skin-6bd8a366ec88\",\"count\":1},{\"cardId\":\"cs-skin-d23dde6eae59\",\"count\":1},{\"cardId\":\"cs-skin-cc03bb38269b\",\"count\":1},{\"cardId\":\"cs-skin-818be290cd5b\",\"count\":1},{\"cardId\":\"cs-skin-672713e8a04e\",\"count\":1},{\"cardId\":\"cs-skin-vanilla-weapon_knife_m9_bayonet\",\"count\":1},{\"cardId\":\"cs-skin-456130d33acd\",\"count\":1},{\"cardId\":\"cs-skin-d335b89fc7a5\",\"count\":1},{\"cardId\":\"cs-skin-34b5bf84f96f\",\"count\":1},{\"cardId\":\"cs-skin-ae0ce77b8db7\",\"count\":1},{\"cardId\":\"cs-skin-68778cfbe46d\",\"count\":1},{\"cardId\":\"cs-skin-8f49a19645c9\",\"count\":1},{\"cardId\":\"cs-skin-fd0ac7570eb0\",\"count\":1},{\"cardId\":\"cs-skin-07fea33b6a5f\",\"count\":1},{\"cardId\":\"cs-skin-3bc3ff53883a\",\"count\":1},{\"cardId\":\"cs-skin-8e3dc7a7458c\",\"count\":1},{\"cardId\":\"cs-skin-ae7ba223bf1f\",\"count\":1},{\"cardId\":\"cs-skin-5766610447f3\",\"count\":1},{\"cardId\":\"cs-skin-b05ee2bf4f0d\",\"count\":1},{\"cardId\":\"cs-skin-e506270deff6\",\"count\":1},{\"cardId\":\"cs-sticker-74\",\"count\":1},{\"cardId\":\"pop-griffith\",\"count\":1},{\"cardId\":\"pop-guts\",\"count\":1},{\"cardId\":\"pop-femto\",\"count\":1},{\"cardId\":\"pop-chevalier-squelette\",\"count\":1},{\"cardId\":\"pop-guts-armure-du-berserker\",\"count\":1}]}" >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
type "%LOG%"
echo.
echo SKINS DONNES (V2). Recharge le jeu sur le lien V2.
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
echo ECHEC : voir logs\donner-skins-6-v2.log
exit /b 1
