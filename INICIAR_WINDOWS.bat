@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================
echo      ALERTA EVASAO V6 - INICIAR
echo ========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado. Instale o Node.js 18 ou superior.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias Node pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo Falha no npm install.
    pause
    exit /b 1
  )
)

echo.
echo Verificando modulo Python da IA...
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -m pip install -r requirements.txt
) else (
  where python >nul 2>nul
  if not errorlevel 1 python -m pip install -r requirements.txt
)

echo.
echo Validando a base demonstrativa...
call npm run check:data

echo.
echo Abrindo http://localhost:3000
start "" http://localhost:3000
call npm start
pause
