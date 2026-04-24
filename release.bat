@echo off
setlocal enabledelayedexpansion
title SFDC — Tag Release
cd /d "%~dp0"

echo.
echo  ============================================
echo   SFDC Metadata Visualizer — Tag Release
echo  ============================================
echo.
echo  This will create a git tag and push it.
echo  GitHub Actions will automatically build the
echo  Windows EXE + macOS DMG and publish a Release.
echo.

set /p VERSION="  Version (e.g. 1.0.0): "
if "!VERSION!"=="" (
    echo  [ERROR] Version cannot be empty.
    pause & exit /b 1
)

set TAG=v!VERSION!

echo.
echo  Creating tag: !TAG!
git add .
git commit -m "chore: release !TAG!" --allow-empty
git tag -a !TAG! -m "Release !TAG!"
git push origin main
git push origin !TAG!

if errorlevel 1 (
    echo.
    echo  [ERROR] Push failed.
    pause & exit /b 1
)

echo.
echo  ============================================
echo   Tag !TAG! pushed.
echo.
echo   GitHub Actions is now building:
echo     Windows EXE + macOS DMG
echo.
echo   Check progress at:
echo   https://github.com/gambacloud/sfdc-metadata-visualizer/actions
echo.
echo   When done, download from:
echo   https://github.com/gambacloud/sfdc-metadata-visualizer/releases
echo  ============================================
echo.
pause
