@echo off
title Vincular Nuevo Numero de WhatsApp - CAD Bot
color 0E

echo ========================================================
echo   CAD IMPRESIONES - VINCULAR NUEVO NUMERO DE WHATSAPP
echo ========================================================
echo.
echo Este asistente te permitira vincular el bot con el numero:
echo                 *** 311 658 4423 ***
echo.
echo Pasos que se realizaran:
echo   1. Cerrar procesos previos de Node y Chrome.
echo   2. Eliminar la sesion anterior guardada (carpeta bot_sessions).
echo   3. Abrir el bot para generar un NUEVO Codigo QR.
echo   4. Escanear el QR con WhatsApp en el celular 3116584423.
echo.
echo Presiona cualquier tecla para comenzar...
pause >nul

echo.
echo [1/3] Cerrando instancias previas del bot y liberando puerto 3008...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3008" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM chrome.exe >nul 2>&1

echo [2/3] Eliminando sesion anterior para permitir nueva vinculacion...
if exist "bot_sessions\" (
    rmdir /s /q "bot_sessions" >nul 2>&1
    if exist "bot_sessions\" (
        echo   [AVISO] Si la carpeta bot_sessions esta bloqueada, cerrando procesos de Node...
        taskkill /F /IM node.exe >nul 2>&1
        timeout /t 2 /nobreak >nul
        rmdir /s /q "bot_sessions" >nul 2>&1
    )
)
if exist "bot.qr.png" del /f /q "bot.qr.png" >nul 2>&1

echo.
echo ========================================================
echo   [3/3] INICIANDO BOT PARA ESCANEO DE CODIGO QR
echo ========================================================
echo.
echo INSTRUCCIONES EN EL CELULAR (311 658 4423):
echo   1. Abre WhatsApp en el celular.
echo   2. Toca los 3 puntos (o Ajustes) y selecciona "Dispositivos vinculados".
echo   3. Toca el boton "Vincular un dispositivo".
echo   4. Escanea el codigo QR que aparecera en la ventana de Chrome
echo      o ingresa en tu navegador a: http://localhost:3008
echo.
echo Iniciando proceso...
color 0A
node ./src/app.js
pause
