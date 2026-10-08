@echo off
title Configurar Auto-Inicio de CAD Bot
color 0A

echo ========================================================
echo   CONFIGURANDO AUTO-INICIO DEL BOT AL ENCENDER EL PC
echo ========================================================
echo.
echo Este script configurara Windows para que el bot arranque 
echo automaticamente cada vez que el computador se encienda 
echo o se reinicie.
echo.
pause

set "SCRIPT_PATH=%~dp0iniciar-bot-24-7.bat"
set "WORK_DIR=%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\CAD_Bot_24_7.lnk"

echo.
echo [INFO] Creando acceso directo en la carpeta de Inicio...
echo.

:: Usamos powershell para crear el acceso directo
powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = '%SCRIPT_PATH%'; $Shortcut.WorkingDirectory = '%WORK_DIR%'; $Shortcut.Description = 'Inicia el Bot de WhatsApp CAD Impresiones'; $Shortcut.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [EXITO] Auto-inicio configurado correctamente.
    echo El bot arrancara de forma automatica cada vez que inicies sesion en Windows.
    echo Puedes verificarlo abriendo la carpeta de inicio:
    echo Presiona Win + R, escribe shell:startup y presiona Enter.
) else (
    color 0C
    echo [ERROR] No se pudo crear el acceso directo.
)
echo.
pause
