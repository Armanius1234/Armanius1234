@echo off
rem PL8 auf diesem Computer starten (kleiner Testserver, nur fuer diesen PC).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js fehlt auf diesem Computer.
  echo   Bitte die LTS-Version von https://nodejs.org installieren
  echo   und diese Datei danach noch einmal starten.
  echo.
  pause
  exit /b 1
)
node "%~dp0pl8-server.js"
pause
