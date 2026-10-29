@echo off
setlocal EnableDelayedExpansion
title CAD Impresiones - Activar Consola de Servicio y Chromium en Pantalla
color 0B

echo ========================================================
echo   CAD IMPRESIONES - MODO VISIBLE 24/7 EN PANTALLA
echo ========================================================
echo.
echo   Este instalador configura tu servidor para que:
echo     1. La CONSOLA DE SERVICIO permanezca SIEMPRE abierta
echo        y visible en pantalla mostrando los logs en vivo.
echo     2. La ventana de CHROMIUM (WhatsApp Web) permanezca
echo        SIEMPRE abierta y visible en tu escritorio.
echo     3. El bot arranque AUTOMATICAMENTE cada vez que el
echo        servidor se encienda o inicie sesion.
echo     4. Si el bot cae, se reinicia solo a los 5 segundos.
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Solicitando permisos de Administrador...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "BOT_DIR=%~dp0"
set "BAT_PATH=%BOT_DIR%iniciar-bot-24-7.bat"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\CAD_Bot_24_7.lnk"

:: ============================================================
:: PASO 1: Desinstalar servicios ocultos o tareas invisibles
:: ============================================================
echo [1/4] Desactivando servicios ocultos en segundo plano...

:: Detener y desinstalar servicio node-windows invisible si estuviera activo
if exist "%BOT_DIR%desinstalar_servicio.js" (
    node "%BOT_DIR%desinstalar_servicio.js" >nul 2>&1
)
sc stop "CAD Bot WhatsApp" >nul 2>&1
sc delete "CAD Bot WhatsApp" >nul 2>&1

:: Eliminar tarea programada SYSTEM invisible
schtasks /query /tn "CAD_Bot_WhatsApp_24_7" >nul 2>&1
if %errorlevel% equ 0 (
    schtasks /delete /tn "CAD_Bot_WhatsApp_24_7" /f >nul 2>&1
    echo [INFO] Tarea oculta de SYSTEM desinstalada correctamente.
)

:: ============================================================
:: PASO 2: Garantizar archivo .env con HEADLESS=false
:: ============================================================
echo.
echo [2/4] Verificando configuracion de Chromium visible (HEADLESS=false)...
(
    echo # CONFIGURACION DEL ENTORNO - BOT CAD IMPRESIONES
    echo PORT=3008
    echo HEADLESS=false
    echo NODE_ENV=production
) > "%BOT_DIR%.env"
echo [INFO] Archivo .env configurado con HEADLESS=false exitosamente.

:: ============================================================
:: PASO 3: Configurar Auto-Inicio con Consola Visible en Startup
:: ============================================================
echo.
echo [3/4] Creando Auto-Inicio Interactivo en Windows (shell:startup)...

powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell;" ^
    "$sc = $ws.CreateShortcut('%SHORTCUT_PATH%');" ^
    "$sc.TargetPath = '%BAT_PATH%';" ^
    "$sc.WorkingDirectory = '%BOT_DIR%';" ^
    "$sc.WindowStyle = 1;" ^
    "$sc.Description = 'CAD Impresiones - Bot de WhatsApp (Consola y Chromium Visibles en Pantalla)';" ^
    "$sc.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [INFO] Acceso directo visible creado en la carpeta de Inicio.
) else (
    echo [ALERTA] No se pudo escribir en Startup de usuario, intentando para todos los usuarios...
    set "ALL_STARTUP=%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup\CAD_Bot_24_7.lnk"
    powershell -NoProfile -Command ^
        "$ws = New-Object -ComObject WScript.Shell;" ^
        "$sc = $ws.CreateShortcut('%ALL_STARTUP%');" ^
        "$sc.TargetPath = '%BAT_PATH%';" ^
        "$sc.WorkingDirectory = '%BOT_DIR%';" ^
        "$sc.WindowStyle = 1;" ^
        "$sc.Save()"
)

:: ============================================================
:: PASO 4: Confirmacion y Opcion de Lanzamiento Inmediato
:: ============================================================
echo.
echo ========================================================
echo   [EXITO] MODO VISIBLE EN PANTALLA 100%% ACTIVADO
echo ========================================================
echo.
echo   Configuracion final:
echo     * Consola CMD: Se abrira siempre en tu pantalla.
echo     * Chromium WhatsApp: Se abrira visible en tu pantalla.
echo     * Auto-Arranque: Listo al encender el servidor.
echo     * Watchdog 24/7: Si algo se cierra, se vuelve a abrir.
echo.
echo Presiona cualquier tecla para ABRIR LA CONSOLA Y CHROMIUM AHORA...
pause >nul

echo.
echo [INFO] Lanzando el Bot con Consola y Chromium en pantalla...
start "CAD Impresiones - Bot de WhatsApp" "%BAT_PATH%"

exit /b 0
