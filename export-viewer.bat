@echo off
setlocal enabledelayedexpansion
title SFDC — Export Standalone Viewer
cd /d "%~dp0"

echo.
echo  ============================================
echo   SFDC Metadata Visualizer — Export Viewer
echo  ============================================
echo.

:: ── Check index.json exists ───────────────────────────────────────────────────
if not exist data\index.json (
    echo  [ERROR] data\index.json not found.
    echo.
    echo  Run parse.bat first to generate it.
    echo.
    pause & exit /b 1
)
echo  [OK] data\index.json found.

:: ── Copy index.json into viewer/public so Vite bakes it in ───────────────────
if not exist viewer\public mkdir viewer\public
copy /y data\index.json viewer\public\index.json >nul
echo  [OK] index.json copied to viewer/public/

:: ── Build the viewer ──────────────────────────────────────────────────────────
echo.
echo  Building viewer (this takes ~10 seconds)...
cd viewer
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. Run setup.bat if you haven't already.
    pause & exit /b 1
)
cd ..

:: ── Copy dist to export folder ────────────────────────────────────────────────
set EXPORT_DIR=sfdc-viewer-export

if exist %EXPORT_DIR% (
    rmdir /s /q %EXPORT_DIR%
)
xcopy /e /i /q viewer\dist %EXPORT_DIR% >nul
echo  [OK] Exported to: %CD%\%EXPORT_DIR%\

:: ── Show size ─────────────────────────────────────────────────────────────────
for /f "tokens=3" %%a in ('dir /s /-c %EXPORT_DIR% ^| findstr "File(s)"') do set EXPORT_SIZE=%%a
echo  [OK] Size: %EXPORT_SIZE% bytes

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   Export complete: sfdc-viewer-export\
echo.
echo   To share:
echo     - Zip the folder and send it
echo     - Or open index.html directly in any browser
echo     - Or drop on GitHub Pages / Netlify / S3
echo.
echo   No Node.js required to view.
echo  ============================================
echo.

:: Optionally open the export folder in Explorer
explorer %EXPORT_DIR%

pause
