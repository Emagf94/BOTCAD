@echo off
title CAD Impresiones - Desinstalar Tarea Programada
color 0C

echo ========================================================
echo   DESINSTALAR TAREA PROGRAMADA - CAD BOT
echo ========================================================
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] Privilegios de Administrador detectados.
) else (
    echo [ALERTA] Se requieren permisos de Administrador.
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0..\.."
set "TASK_NAME=CAD_Bot_WhatsApp_24_7"

echo [1/2] Eliminando Tarea Programada...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [EXITO] Tarea "%TASK_NAME%" eliminada correctamente.
) else (
    echo [INFO] La tarea no existia o ya fue eliminada.
)

echo.
echo [2/2] Limpiando accesos directos de Startup...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_DIR%\CAD_Bot_24_7.lnk" (
    del /f /q "%STARTUP_DIR%\CAD_Bot_24_7.lnk" >nul 2>&1
    echo [INFO] Acceso directo de Startup eliminado.
)

echo.
echo ========================================================
echo   El bot ya NO se iniciara automaticamente.
echo   Para volver a activarlo, ejecuta:
echo     instalar-tarea-programada.bat
echo ========================================================
echo.
pause
