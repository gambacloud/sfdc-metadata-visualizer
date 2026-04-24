@echo off
setlocal enabledelayedexpansion
title SFDC — Push to GitHub
cd /d "%~dp0"

:: ── Check for changes ─────────────────────────────────────────────────────────
git status --porcelain > temp_status.txt
set /p STATUS=<temp_status.txt
del temp_status.txt

if "!STATUS!"=="" (
    echo.
    echo  Nothing to commit — working tree clean.
    echo.
    pause & exit /b 0
)

:: ── Show what's changed ───────────────────────────────────────────────────────
echo.
echo  Changes detected:
echo  ─────────────────
git status --short
echo  ─────────────────
echo.

:: ── Commit message ────────────────────────────────────────────────────────────
set /p MSG="  Commit message (or press Enter for default): "
if "!MSG!"=="" set MSG=chore: update metadata visualizer

:: ── Stage, commit, push ───────────────────────────────────────────────────────
echo.
git add .
git commit -m "!MSG!"
git push

if errorlevel 1 (
    echo.
    echo  [ERROR] Push failed. Check your credentials or network.
    pause & exit /b 1
)

echo.
echo  ============================================
echo   Pushed successfully to GitHub.
echo  ============================================
echo.
pause
