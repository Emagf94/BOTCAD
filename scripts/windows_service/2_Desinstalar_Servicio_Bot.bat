@echo off
title Desinstalador del Bot (Servicio de Windows)
color 0C

echo ========================================================
echo   DESINSTALANDO EL BOT COMO SERVICIO DE WINDOWS
echo ========================================================
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] Privilegios de Administrador detectados.
) else (
    echo [ALERTA] Este proceso requiere permisos de Administrador.
    echo Solicitando permisos...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b
)

:: Ir a la raiz del proyecto
cd /d "%~dp0..\.."

echo [1/1] Desregistrando el Bot de Windows...
node "%~dp0desinstalar_servicio.js"

echo.
pause
