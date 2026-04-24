@echo off
setlocal
title SFDC — Parse Metadata
cd /d "%~dp0"

:: Accept ZIP path as argument or prompt
if "%~1"=="" (
    echo.
    echo  Drag and drop your metadata ZIP onto this script,
    echo  or enter the full path below.
    echo.
    set /p ZIP_PATH="  ZIP path: "
) else (
    set ZIP_PATH=%~1
)

if not exist "!ZIP_PATH!" (
    echo.
    echo  [ERROR] File not found: !ZIP_PATH!
    pause & exit /b 1
)

echo.
echo  Parsing: !ZIP_PATH!
echo.

cd parser
node index.js --zip "!ZIP_PATH!"
if errorlevel 1 (
    echo.
    echo  [ERROR] Parser failed. Check the output above.
    pause & exit /b 1
)
cd ..

:: Copy to viewer
if not exist viewer\public mkdir viewer\public
copy /y data\index.json viewer\public\index.json >nul

echo.
echo  [OK] Done. Run run.bat to open the viewer.
echo.
pause
