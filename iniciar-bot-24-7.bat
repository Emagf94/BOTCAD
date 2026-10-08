@echo off
cd /d "%~dp0"
title CAD Impresiones - Bot de WhatsApp (Ejecucion 24/7 BLINDADO)
color 0A

echo ========================================================
echo   CAD IMPRESIONES - INICIANDO BOT 24/7 [BLINDADO]
echo ========================================================
echo.
echo   Este script incluye proteccion contra:
echo     - Reinicios del PC
echo     - Cierres inesperados del proceso
echo     - Corrupcion de sesion de WhatsApp
echo     - Lockfiles corruptos de Chromium
echo.

:: Verificar si Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js no esta instalado en este equipo.
    echo Por favor descarga e instala Node.js v20 o superior desde:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Verificar si node_modules existe, si no, instalar dependencias
if not exist "node_modules\" (
    echo [INFO] Primera ejecucion detectada. Instalando dependencias del proyecto...
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERROR] Hubo un problema instalando las dependencias.
        pause
        exit /b 1
    )
)

:: Crear carpeta logs si no existe
if not exist "logs\" mkdir logs

:: ============================================================
:: PROTECCION CONTRA LOCKFILES CORRUPTOS DE CHROMIUM
:: Si el PC se reinicio bruscamente, Chromium deja lockfiles que
:: impiden reutilizar la sesion de WhatsApp.
:: ============================================================
echo.
echo [GUARD] Verificando integridad de la sesion de WhatsApp...
if exist "bot_sessions\bot_sessions\lockfile" (
    del /f /q "bot_sessions\bot_sessions\lockfile" >nul 2>&1
    echo [GUARD] Lockfile corrupto eliminado.
)
if exist "bot_sessions\bot_sessions\SingletonLock" (
    del /f /q "bot_sessions\bot_sessions\SingletonLock" >nul 2>&1
    echo [GUARD] SingletonLock eliminado.
)
if exist "bot_sessions\bot_sessions\DevToolsActivePort" (
    del /f /q "bot_sessions\bot_sessions\DevToolsActivePort" >nul 2>&1
    echo [GUARD] DevToolsActivePort eliminado.
)
echo [GUARD] Sesion verificada y limpia.

echo.
echo [INFO] Iniciando el Bot de WhatsApp con proteccion BLINDADA...
echo [INFO] El bot se reiniciara automaticamente si cae.
echo [INFO] La sesion de WhatsApp esta protegida contra reinicios.
echo [INFO] Para detener el bot presiona CTRL + C en esta ventana.
echo.

:BUCLE_BOT
:: Liberar puerto 3008 si quedo ocupado por una instancia previa
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3008" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Matar procesos fantasma de Chrome que bloquean la sesion (CrashpadMetrics, etc)
taskkill /F /IM chrome.exe >nul 2>&1

:: Limpiar lockfiles antes de cada arranque (por si acaso)
if exist "bot_sessions\bot_sessions\lockfile" (
    del /f /q "bot_sessions\bot_sessions\lockfile" >nul 2>&1
)
if exist "bot_sessions\bot_sessions\SingletonLock" (
    del /f /q "bot_sessions\bot_sessions\SingletonLock" >nul 2>&1
)

echo [%DATE% %TIME%] Arrancando proceso del Bot...
node ./src/app.js

echo.
echo ========================================================
echo [ALERTA] El bot se cerro o cayo inesperadamente.
echo Limpiando lockfiles y reiniciando en 5 segundos...
echo Presiona CTRL + C si deseas detener el bucle.
echo ========================================================

:: Limpiar lockfiles inmediatamente despues de una caida
if exist "bot_sessions\bot_sessions\lockfile" (
    del /f /q "bot_sessions\bot_sessions\lockfile" >nul 2>&1
)
if exist "bot_sessions\bot_sessions\SingletonLock" (
    del /f /q "bot_sessions\bot_sessions\SingletonLock" >nul 2>&1
)

timeout /t 5 /nobreak >nul
goto BUCLE_BOT
