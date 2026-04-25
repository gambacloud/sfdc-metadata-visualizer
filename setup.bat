@echo off
setlocal enabledelayedexpansion
title SFDC Metadata Visualizer — Setup

echo.
echo  ============================================
echo   SFDC Metadata Visualizer — First Time Setup
echo  ============================================
echo.

:: ── Check Node.js ────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found.
    echo.
    echo  Please install Node.js 18+ from https://nodejs.org
    echo  Then re-run this script.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js found: %NODE_VER%

:: ── Check Git ─────────────────────────────────────────────────────────────────
where git >nul 2>&1
if errorlevel 1 (
    echo  [WARN] Git not found — skipping repo init.
    set HAS_GIT=0
) else (
    echo  [OK] Git found.
    set HAS_GIT=1
)

:: ── Generate icons if missing ─────────────────────────────────────────────────
if not exist electron\icon.ico (
    echo  Generating icons...
    node generate-icons.js
    echo  [OK] Icons generated.
)

:: ── Navigate to repo root ─────────────────────────────────────────────────────
cd /d "%~dp0"
echo  [OK] Working directory: %CD%

:: ── Install root dependencies (electron + electron-builder) ──────────────────
echo.
echo  [0/3] Installing root dependencies...
call npm install --silent
if errorlevel 1 (
    echo  [ERROR] npm install failed in root
    pause & exit /b 1
)
echo  [OK] Root dependencies ready.

:: ── Install parser dependencies ───────────────────────────────────────────────
echo.
echo  [1/3] Installing parser dependencies...
cd parser
call npm install --silent
if errorlevel 1 (
    echo  [ERROR] npm install failed in parser/
    pause & exit /b 1
)
echo  [OK] Parser ready.
cd ..

:: ── Install viewer dependencies ───────────────────────────────────────────────
echo.
echo  [2/3] Installing viewer dependencies...
cd viewer
call npm install --silent
if errorlevel 1 (
    echo  [ERROR] npm install failed in viewer/
    pause & exit /b 1
)
echo  [OK] Viewer ready.
cd ..

:: ── Generate demo ZIP ─────────────────────────────────────────────────────────
echo.
echo  [3/3] Generating demo metadata ZIP...
node generate-demo-zip.js
if errorlevel 1 (
    echo  [ERROR] Failed to generate demo ZIP.
    pause & exit /b 1
)

:: ── Parse demo ZIP ────────────────────────────────────────────────────────────
echo.
echo  Parsing demo metadata...
cd parser
node index.js --zip ../demo-metadata.zip
if errorlevel 1 (
    echo  [ERROR] Parser failed.
    pause & exit /b 1
)
cd ..

:: ── Copy index.json to viewer/public ─────────────────────────────────────────
if not exist viewer\public mkdir viewer\public
copy /y data\index.json viewer\public\index.json >nul
echo  [OK] index.json copied to viewer/public/

:: ── Git init ──────────────────────────────────────────────────────────────────
if "%HAS_GIT%"=="1" (
    if not exist .git (
        echo.
        echo  Initializing git repo...
        git init
        git add .
        git commit -m "feat: initial commit"
        echo  [OK] Git repo initialized.
    )
)

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   Setup complete!
echo.
echo   To launch the viewer, run:
echo     run.bat
echo.
echo   To parse your own metadata ZIP, run:
echo     parse.bat C:\path\to\your\metadata.zip
echo  ============================================
echo.
pause
