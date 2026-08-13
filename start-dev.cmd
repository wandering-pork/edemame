@echo off
REM Starts the Edamame dev server on http://localhost:3000
REM Node lives at C:\Users\wukai\tools\node (also on your user PATH for new shells).

set "PATH=C:\Users\wukai\tools\node;%PATH%"
cd /d "%~dp0src"

echo Starting Edamame dev server...
echo   URL:      http://localhost:3000
echo   Login:    test@edamame.local  /  Edamame!2026
echo   Data:     C:\Users\wukai\EdamameTestData
echo.

call npm run dev
pause
