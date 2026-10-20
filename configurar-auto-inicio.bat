@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title CAD Impresiones - Panel de Control de Auto-Inicio (Windows)
color 0A

set "BOT_DIR=%~dp0"
set "BAT_PATH=%BOT_DIR%iniciar-bot-24-7.bat"
set "VBS_PATH=%BOT_DIR%iniciar-invisible.vbs"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\CAD_Bot_24_7.lnk"

:MENU
cls
echo ========================================================
echo   CAD IMPRESIONES - PANEL DE CONTROL DE AUTO-INICIO
echo ========================================================
echo.

:: Detectar estado actual del auto-inicio
set "CURRENT_TARGET="
if exist "%SHORTCUT_PATH%" (
    for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%SHORTCUT_PATH%'); Write-Output $sc.TargetPath" 2^>nul`) do (
        set "CURRENT_TARGET=%%A"
    )
    if /i "!CURRENT_TARGET!"=="%VBS_PATH%" (
        echo   [ESTADO ACTUAL]: ACTIVO - Modo 100%% Invisible (Segundo Plano)
    ) else if /i "!CURRENT_TARGET!"=="%BAT_PATH%" (
        echo   [ESTADO ACTUAL]: ACTIVO - Modo Consola Visible (Logs en vivo)
    ) else (
        echo   [ESTADO ACTUAL]: ACTIVO - Personalizado (!CURRENT_TARGET!)
    )
) else (
    echo   [ESTADO ACTUAL]: INACTIVO (El bot no arranca automaticamente)
)

echo.
echo --------------------------------------------------------
echo   SELECCIONA UNA OPCION:
echo --------------------------------------------------------
echo   [1] Activar Auto-Inicio con CONSOLA VISIBLE (Recomendado para ver logs)
echo   [2] Activar Auto-Inicio 100%% INVISIBLE (Segundo plano, sin ventanas)
echo   [3] Desactivar / Eliminar Auto-Inicio de Windows
echo   [4] Probar arranque ahora mismo (Verificar funcionamiento)
echo   [5] Abrir carpeta de Inicio de Windows (shell:startup)
echo   [0] Salir
echo --------------------------------------------------------
echo.
set /p "OPCION=Ingresa tu opcion (0-5): "

if "%OPCION%"=="1" goto MODO_VISIBLE
if "%OPCION%"=="2" goto MODO_INVISIBLE
if "%OPCION%"=="3" goto DESACTIVAR
if "%OPCION%"=="4" goto PROBAR
if "%OPCION%"=="5" goto ABRIR_CARPETA
if "%OPCION%"=="0" goto SALIR

echo.
echo [AVISO] Opcion no valida. Intenta de nuevo.
timeout /t 2 >nul
goto MENU

:: ==========================================================
:: OPCION 1: MODO VISIBLE
:: ==========================================================
:MODO_VISIBLE
cls
echo ========================================================
echo   CONFIGURANDO AUTO-INICIO (MODO CONSOLA VISIBLE)
echo ========================================================
echo.
echo   Este modo abrira la ventana negra de consola cada vez
echo   que inicies sesion en Windows, permitiendo ver:
echo     * Mensajes entrantes en tiempo real
echo     * Diagnosticos del Guardian y pedidos
echo     * Estado del latido y conexiones
echo.
echo Configurando acceso directo en Startup...

powershell -NoProfile -Command "& { param($lnk, $target, $workdir, $desc); $ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = $target; $sc.WorkingDirectory = $workdir; $sc.Description = $desc; $sc.Save() }" -lnk "%SHORTCUT_PATH%" -target "%BAT_PATH%" -workdir "%BOT_DIR%" -desc "CAD Impresiones - Bot de WhatsApp 24/7 (Consola Visible)"

if exist "%SHORTCUT_PATH%" (
    echo.
    echo ========================================================
    echo   [EXITO] Auto-inicio en Modo Visible configurado!
    echo ========================================================
    echo   Archivo creado: %SHORTCUT_PATH%
    echo   Destino: %BAT_PATH%
    echo.
    echo Cada vez que enciendas tu PC o inicies sesion,
    echo el bot abrira su consola y comenzara a atender.
) else (
    color 0C
    echo [ERROR] No se pudo crear el acceso directo en Startup.
)
echo.
pause
color 0A
goto MENU

:: ==========================================================
:: OPCION 2: MODO INVISIBLE
:: ==========================================================
:MODO_INVISIBLE
cls
echo ========================================================
echo   CONFIGURANDO AUTO-INICIO (MODO 100%% INVISIBLE)
echo ========================================================
echo.
echo   Este modo arrancara el bot de forma totalmente silenciosa
echo   en segundo plano cada vez que inicies sesion en Windows.
echo   No se mostrara ninguna ventana negra en pantalla.
echo.
echo Configurando acceso directo en Startup...

powershell -NoProfile -Command "& { param($lnk, $target, $workdir, $desc); $ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = $target; $sc.WorkingDirectory = $workdir; $sc.Description = $desc; $sc.Save() }" -lnk "%SHORTCUT_PATH%" -target "%VBS_PATH%" -workdir "%BOT_DIR%" -desc "CAD Impresiones - Bot de WhatsApp 24/7 (Modo Silencioso)"

if exist "%SHORTCUT_PATH%" (
    echo.
    echo ========================================================
    echo   [EXITO] Auto-inicio en Modo Invisible configurado!
    echo ========================================================
    echo   Archivo creado: %SHORTCUT_PATH%
    echo   Destino: %VBS_PATH%
    echo.
    echo Cada vez que enciendas tu PC o inicies sesion,
    echo el bot trabajara de fondo sin molestar en pantalla.
) else (
    color 0C
    echo [ERROR] No se pudo crear el acceso directo en Startup.
)
echo.
pause
color 0A
goto MENU

:: ==========================================================
:: OPCION 3: DESACTIVAR AUTO-INICIO
:: ==========================================================
:DESACTIVAR
cls
echo ========================================================
echo   DESACTIVANDO AUTO-INICIO DEL BOT
echo ========================================================
echo.
set "ELIMINADO=0"

if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%" >nul 2>&1
    set "ELIMINADO=1"
    echo [INFO] Acceso directo en Startup eliminado correctamente.
)

:: Limpiar tarea programada si existiera de versiones anteriores
schtasks /query /tn "CAD_Bot_WhatsApp_24_7" >nul 2>&1
if %errorlevel% equ 0 (
    schtasks /delete /tn "CAD_Bot_WhatsApp_24_7" /f >nul 2>&1
    set "ELIMINADO=1"
    echo [INFO] Tarea programada antigua eliminada.
)

if "%ELIMINADO%"=="1" (
    echo.
    echo ========================================================
    echo   [EXITO] El auto-inicio ha sido completamente desactivado.
    echo ========================================================
    echo El bot ya NO arrancara solo al encender el PC.
) else (
    echo [INFO] El auto-inicio ya se encontraba desactivado.
)
echo.
pause
goto MENU

:: ==========================================================
:: OPCION 4: PROBAR ARRANQUE AHORA MISMO
:: ==========================================================
:PROBAR
cls
echo ========================================================
echo   PROBANDO ARRANQUE DEL BOT
echo ========================================================
echo.
echo ¿Como deseas probar el bot?
echo   [1] Con Consola Visible (iniciar-bot-24-7.bat)
echo   [2] Invisible en Segundo Plano (iniciar-invisible.vbs)
echo   [0] Cancelar
echo.
set /p "TEST_OPCION=Selecciona (0-2): "

if "%TEST_OPCION%"=="1" (
    echo [INFO] Iniciando bot con consola visible...
    start "" "%BAT_PATH%"
    echo [EXITO] Bot lanzado en ventana separada.
    pause
    goto MENU
)
if "%TEST_OPCION%"=="2" (
    echo [INFO] Iniciando bot en segundo plano...
    start "" "%VBS_PATH%"
    echo [EXITO] Bot lanzado de forma invisible.
    pause
    goto MENU
)
goto MENU

:: ==========================================================
:: OPCION 5: ABRIR CARPETA DE INICIO
:: ==========================================================
:ABRIR_CARPETA
echo [INFO] Abriendo carpeta de Inicio en el Explorador de Windows...
start "" "%STARTUP_DIR%"
goto MENU

:: ==========================================================
:: OPCION 0: SALIR
:: ==========================================================
:SALIR
cls
echo Gracias por usar CAD Impresiones Bot 24/7.
timeout /t 1 >nul
exit /b 0
