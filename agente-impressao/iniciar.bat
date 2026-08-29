@echo off
title Agente de Impressao - Brasa
cd /d "%~dp0"
node agente.mjs
echo.
echo ================================================
echo  O agente parou. Rode o iniciar.bat de novo.
echo ================================================
pause
