@echo off
setlocal
title SFDC — Export Analysis CSVs
cd /d "%~dp0"

if not exist data\index.json (
    echo.
    echo  [ERROR] data\index.json not found.
    echo  Run parse.bat first.
    echo.
    pause & exit /b 1
)

echo.
echo  Generating analysis exports...
echo.

cd parser
node export.js --index ../data/index.json --out ../data/exports
if errorlevel 1 (
    echo.
    echo  [ERROR] Export failed.
    pause & exit /b 1
)
cd ..

echo.
echo  Opening exports folder...
explorer data\exports

pause
