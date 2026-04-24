@echo off
title SFDC Metadata Visualizer
cd /d "%~dp0"

:: Copy latest index.json to viewer/public before launching
if exist data\index.json (
    if not exist viewer\public mkdir viewer\public
    copy /y data\index.json viewer\public\index.json >nul
)

echo.
echo  Launching SFDC Metadata Visualizer...
echo  Open http://localhost:5173 in your browser.
echo  Press Ctrl+C to stop.
echo.

cd viewer
npm run dev
