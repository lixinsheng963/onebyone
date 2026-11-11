@echo off
cd /d "%~dp0"
echo Starting Campus API and Admin...
start "Campus API" cmd /k "pnpm.cmd dev:api"
start "Campus Admin" cmd /k "pnpm.cmd dev:admin"
echo Two terminal windows opened. Keep them open.
