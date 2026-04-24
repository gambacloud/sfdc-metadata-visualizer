@echo off
cd /d C:\Users\idane\Downloads\sfdc-metadata-visualizer
git init
git add .
git commit -m "feat: initial commit — SFDC metadata visualizer (parser + DAG + object-centric + table views)"
git branch -M main
git remote add origin https://github.com/gambacloud/sfdc-metadata-visualizer.git
git push -u origin main
