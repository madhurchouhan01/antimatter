@echo off

call D:\AntiMatter\antimatter-env\Scripts\activate.bat

cd /d D:\AntiMatter\project

uvicorn backend.main:app --port 1842

pause
