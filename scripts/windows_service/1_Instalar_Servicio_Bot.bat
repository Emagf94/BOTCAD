@echo off
title Instalador Profesional del Bot (Servicio de Windows)
color 0B

echo ========================================================
echo   INSTALANDO EL BOT COMO SERVICIO DE WINDOWS
echo ========================================================
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] Privilegios de Administrador detectados correctamente.
) else (
    echo [ALERTA] Este proceso requiere instalar un Servicio en el sistema.
    echo Solicitando permisos de Administrador...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b
)

:: Ir a la raiz del proyecto
cd /d "%~dp0..\.."

echo.
echo [1/2] Instalando libreria de servicios (node-windows)...
call npm install node-windows

echo.
echo [2/2] Registrando el Bot en Windows...
node "%~dp0instalar_servicio.js"

echo.
pause
