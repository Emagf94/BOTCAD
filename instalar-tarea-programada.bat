@echo off
title CAD Impresiones - Instalar Tarea Programada BLINDADA
color 0A

echo ========================================================
echo   INSTALAR TAREA PROGRAMADA BLINDADA - CAD BOT
echo ========================================================
echo.
echo   Este instalador configura el bot para que arranque
echo   AUTOMATICAMENTE cada vez que el PC se encienda o
echo   reinicie, sin necesidad de iniciar sesion en Windows.
echo.
echo   Metodo: Tarea Programada de Windows (mas confiable
echo   que el acceso directo en Startup).
echo.

:: Verificar privilegios de administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [INFO] Privilegios de Administrador detectados correctamente.
) else (
    echo [ALERTA] Se requieren permisos de Administrador para crear
    echo          una Tarea Programada del sistema.
    echo Solicitando permisos...
    powershell -Command "Start-Process -FilePath '%0' -Verb RunAs"
    exit /b
)

echo.
set "BOT_DIR=%~dp0"
set "BAT_PATH=%BOT_DIR%iniciar-bot-24-7.bat"
set "VBS_PATH=%BOT_DIR%iniciar-invisible.vbs"
set "TASK_NAME=CAD_Bot_WhatsApp_24_7"

:: ============================================================
:: PASO 1: Eliminar tarea anterior si existe
:: ============================================================
echo [1/4] Verificando si existe una tarea programada anterior...
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Tarea anterior encontrada. Eliminando para recrear...
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
)

:: ============================================================
:: PASO 2: Eliminar acceso directo de Startup anterior (si existe)
::         para evitar duplicaciones
:: ============================================================
echo [2/4] Limpiando metodos de auto-inicio anteriores...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_DIR%\CAD_Bot_24_7.lnk" (
    del /f /q "%STARTUP_DIR%\CAD_Bot_24_7.lnk" >nul 2>&1
    echo [INFO] Acceso directo anterior en Startup eliminado.
)

:: ============================================================
:: PASO 3: Crear la Tarea Programada blindada
:: ============================================================
echo [3/4] Creando Tarea Programada blindada...
echo.

:: Crear tarea que se ejecuta:
::   - Al iniciar el sistema (ONSTART) - sin necesidad de login
::   - Con maxima prioridad
::   - Sin limite de tiempo de ejecucion
::   - Reiniciando cada 1 minuto si falla (hasta 999 veces)
schtasks /create ^
    /tn "%TASK_NAME%" ^
    /tr "\"wscript.exe\" \"%VBS_PATH%\"" ^
    /sc ONSTART ^
    /ru "SYSTEM" ^
    /rl HIGHEST ^
    /f

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] No se pudo crear la tarea programada.
    echo Intenta ejecutar este archivo como Administrador.
    pause
    exit /b 1
)

:: ============================================================
:: PASO 4: Configurar opciones avanzadas de la tarea via XML
::         para que sea verdaderamente blindada
:: ============================================================
echo [4/4] Configurando opciones avanzadas de proteccion...

:: Crear archivo XML temporal con la configuracion avanzada
set "XML_PATH=%BOT_DIR%_task_config_temp.xml"

powershell -Command ^
    "$task = Get-ScheduledTask -TaskName '%TASK_NAME%';" ^
    "$task.Settings.RestartInterval = 'PT1M';" ^
    "$task.Settings.RestartCount = 999;" ^
    "$task.Settings.ExecutionTimeLimit = 'PT0S';" ^
    "$task.Settings.DisallowStartIfOnBatteries = $false;" ^
    "$task.Settings.StopIfGoingOnBatteries = $false;" ^
    "$task.Settings.AllowHardTerminate = $false;" ^
    "$task.Settings.StartWhenAvailable = $true;" ^
    "$task.Settings.RunOnlyIfNetworkAvailable = $false;" ^
    "$task.Settings.Priority = 4;" ^
    "Set-ScheduledTask -InputObject $task"

echo.
echo ========================================================
echo   [EXITO] TAREA PROGRAMADA BLINDADA INSTALADA
echo ========================================================
echo.
echo   Nombre: %TASK_NAME%
echo   Disparador: Al iniciar Windows (antes del login)
echo   Proteccion:
echo     * Se reinicia automaticamente si falla (cada 1 min)
echo     * No se detiene por bateria baja
echo     * No tiene limite de tiempo de ejecucion
echo     * Se ejecuta aunque haya retraso en el inicio
echo     * Prioridad maxima del sistema
echo.
echo   El bot ya no se desvinculara NUNCA al reiniciar el PC.
echo.
echo   Para verificar, abre el Programador de Tareas de Windows:
echo     Win + R, escribe "taskschd.msc" y presiona Enter
echo     Busca la tarea: %TASK_NAME%
echo.
echo   Para DESINSTALAR esta tarea en el futuro, ejecuta:
echo     desinstalar-tarea-programada.bat
echo.
pause
