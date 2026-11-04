@echo off
rem Donne a Tom les 10 cartes 6* Yu-Gi-Oh (pour voir les invocations dans le jeu en ligne).
cd /d "%~dp0.."
if not exist logs mkdir logs
set LOG=%~dp0..\logs\donner-yugioh.log
echo === %date% %time% === > "%LOG%"
call npx convex run admin:grantTestCards "{\"name\":\"tom\",\"perRarity\":0,\"mythics\":0,\"extra\":[{\"cardId\":\"pop-blue-eyes-white-dragon\",\"count\":1},{\"cardId\":\"pop-red-eyes-black-dragon\",\"count\":1},{\"cardId\":\"pop-slifer-the-sky-dragon\",\"count\":1},{\"cardId\":\"pop-obelisk-the-tormentor\",\"count\":1},{\"cardId\":\"pop-exodia-the-forbidden-one\",\"count\":1},{\"cardId\":\"pop-dark-magician\",\"count\":1},{\"cardId\":\"pop-dark-magician-girl\",\"count\":1},{\"cardId\":\"pop-yami-yugi\",\"count\":1},{\"cardId\":\"pop-seto-kaiba\",\"count\":1},{\"cardId\":\"pop-jaden-yuki\",\"count\":1}]}" >> "%LOG%" 2>&1 || goto :err
echo === OK === >> "%LOG%"
exit /b 0
:err
echo === ECHEC (code %errorlevel%) === >> "%LOG%"
type "%LOG%"
pause
exit /b 1
