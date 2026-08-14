@echo off
title ISEU Schedule - Deploy to GitHub
cd /d "%~dp0"

echo ISEU Schedule - Quick Deploy
echo ============================
echo.

where gh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] GitHub CLI found
    echo.
    echo Logging in...
    gh auth status >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        gh auth login
    )
    echo.
    echo Creating repository and pushing...
    echo repo name: iseu-schedule
    echo.
    gh repo create iseu-schedule --public --source=. --push --remote=origin
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ===== SUCCESS =====
        echo Now enable GitHub Pages:
        echo   1. https://github.com/你的用户名/iseu-schedule/settings/pages
        echo   2. Source: GitHub Actions
        echo   3. Or use: Deploy from branch ^> main ^> /root
        echo.
        echo Your URL will be:
        echo   https://你的用户名.github.io/iseu-schedule/
    ) else (
        echo [FAILED] Create repo failed
    )
) else (
    echo [WARN] GitHub CLI not found
    echo.
    echo Manual steps:
    echo 1. Create repo at https://github.com/new
    echo    Name: iseu-schedule
    echo    Visibility: Public
    echo.
    echo 2. Run these commands in this folder:
    echo    git init
    echo    git add .
    echo    git commit -m "init"
    echo    git remote add origin https://github.com/你的用户名/iseu-schedule.git
    echo    git push -u origin main
    echo.
    echo 3. Enable GitHub Pages in repo settings
)

pause
