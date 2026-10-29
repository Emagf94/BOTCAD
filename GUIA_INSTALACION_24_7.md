# 🚀 Guía de Instalación y Despliegue 24/7 - CAD Bot

Esta guía detalla paso a paso cómo instalar, configurar y mantener en ejecución continua (24 horas al día, 7 días a la semana) el Bot de WhatsApp de **CAD Impresiones** en un equipo nuevo o servidor dedicado (Windows o Linux/VPS).

---

## 📋 1. Requisitos Previos en el Nuevo Equipo

1. **Node.js (v20 o superior)**:
   - Descargar e instalar desde [https://nodejs.org/](https://nodejs.org/) (seleccionar versión **LTS**).
   - Durante la instalación, asegurarse de marcar la casilla *"Add to PATH"*.
2. **Navegador Google Chrome** instalado (o Chromium).
3. **Git** (opcional si vas a clonar el repositorio, o puedes transferir la carpeta comprimida en ZIP).

---

## 📂 2. Copiar o Clonar el Proyecto

### Método A: Clonar con Git (Recomendado)
Abre la terminal o PowerShell en el nuevo equipo y ejecuta:
```bash
git clone <URL_DE_TU_REPOSITORIO> "BOT IMPRESIONES CAD"
cd "BOT IMPRESIONES CAD/base-js-baileys-memory"
```

### Método B: Copiar los Archivos Manualmente
Si copias la carpeta del bot mediante una memoria USB, red local o archivo ZIP:
- **Copia todo el proyecto EXCEPTO** las carpetas:
  - `node_modules` (se generará fresca en el nuevo equipo)
  - `archivos_recibidos` (archivos viejos de clientes)
  - `logs`

> 💡 **Nota sobre la sesión de WhatsApp**:
> Si **NO** copias las carpetas `.wwebjs_auth` ni `bot_sessions`, el bot te pedirá escanear el código QR una única vez al iniciar en el nuevo equipo. Una vez escaneado, la sesión quedará guardada de forma permanente en ese equipo.

---

## ⚙️ 3. Instalación de Dependencias

Abre una terminal (PowerShell o CMD en Windows, o Bash en Linux) dentro de la carpeta `base-js-baileys-memory` y corre:

```bash
npm install
```

Copia el archivo de variables de entorno:
```bash
# En Windows (PowerShell):
cp .env.example .env

# En Linux / Mac:
cp .env.example .env
```

*(Opcional: edita `.env` si deseas cambiar el puerto `PORT=3008` o activar `HEADLESS=true` para que el navegador no sea visible).*

---

## 🖥️ 4. Opciones para Ejecutar el Bot las 24 Horas

Tienes 4 alternativas para mantener tu bot ejecutándose de manera continua. Elige la que mejor se adapte a tus necesidades:

---

### 🟢 Opción A: Modo Visible en Pantalla (Consola + Chromium Abiertos 24/7 - RECOMENDADA)

Esta es la opción recomendada para ver en todo momento la **Consola de Servicio** con los logs y la **ventana gráfica de Chromium** con WhatsApp Web en tu escritorio.

1. Haz **doble clic** en el archivo:
   ```
   ACTIVAR_CONSOLA_Y_CHROMIUM_EN_PANTALLA.bat
   ```
2. Otorga los permisos de Administrador.
3. El instalador configurará el inicio automático en tu pantalla (`shell:startup`), asegurará que Chromium abra su ventana (`HEADLESS=false`) y lanzará el bot con su Watchdog de reinicio continuo.

---

### 🟣 Opción B: Servicio de Windows (100% Invisible en Segundo Plano)

Si en el futuro deseas que el bot corra totalmente oculto sin ninguna ventana en pantalla:
1. Haz doble clic en `1_Instalar_Servicio_Bot.bat`.
2. Para desinstalarlo y volver al modo visible en pantalla, ejecuta `ACTIVAR_CONSOLA_Y_CHROMIUM_EN_PANTALLA.bat`.

---

### 🟢 Opción B: Con el Script `iniciar-bot-24-7.bat` (Fácil y Visible)

Si prefieres ver la consola negra trabajando en vivo y poder cerrarla cuando quieras, usa este método. El script incluye un **Watchdog automático**: si el bot llega a cerrarse por error, el script espera 5 segundos y lo vuelve a abrir solo.

1. **Para iniciar manualmente:**
   Haz doble clic sobre el archivo `iniciar-bot-24-7.bat`.
2. **Para configurar el Auto-Inicio al iniciar sesión:**
   Haz doble clic sobre el archivo `configurar-auto-inicio.bat`. Esto creará un acceso directo en tu carpeta de Inicio (`shell:startup`) para que el bot abra la consola negra automáticamente cada vez que enciendas la computadora e inicies sesión.

---

### 🟡 Opción C: Con PM2 en Windows (Ideal para múltiples bots)

PM2 es el administrador de procesos estándar en la industria. Útil si deseas correr varios bots (diferentes números) en la misma computadora en puertos distintos.

1. **Instalar PM2 de manera global:**
   ```bash
   npm install -g pm2
   ```
2. **Iniciar el bot con la configuración 24/7:**
   ```bash
   npm run pm2:start
   ```
3. *(Opcional)* Para hacer que arranque automáticamente al encender el PC:
   ```bash
   npm install -g pm2-windows-startup
   pm2-startup install
   pm2 save
   ```
4. **Comandos útiles:**
   - Ver estado: `npm run pm2:status`
   - Ver logs: `npm run pm2:logs`
   - Reiniciar: `npm run pm2:restart`

---

### 🔵 Opción D: En un Servidor Linux (VPS / Ubuntu / Debian)

Si vas a instalar el bot en un servidor en la nube sin entorno gráfico:

1. **Instalar dependencias del sistema para Chrome/Chromium:**
   ```bash
   sudo apt update
   sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libpangocairo-1.0-0
   ```
2. **Configurar modo Headless en `.env`:**
   En el archivo `.env`, asegúrate de colocar:
   ```env
   HEADLESS=true
   ```
3. **Instalar PM2 y arrancar:**
   ```bash
   sudo npm install -g pm2
   npm run pm2:start
   pm2 startup
   # (Copia y pega el comando que te muestre la terminal para guardar el servicio de systemd)
   pm2 save
   ```

---

## 📱 5. Vinculación de WhatsApp (Primer Inicio)

1. Al arrancar el bot por primera vez, verás en la consola un mensaje indicando que el servidor web está encendido:
   ```text
   🛜  HTTP Server ON [GET]: http://localhost:3008/
   ```
2. Si estás en modo con pantalla (`HEADLESS=false`), se abrirá una ventana de Chrome con el código QR.
3. Si estás en modo sin pantalla (`HEADLESS=true`), abre tu navegador web y entra a:
   ```
   http://localhost:3008/
   ```
   *(o `http://<IP_DEL_EQUIPO>:3008/` desde otro dispositivo en la misma red).*
4. Abre WhatsApp en el celular de CAD Impresiones -> **Dispositivos vinculados** -> **Vincular un dispositivo** y escanea el código QR.
5. ¡Listo! El bot quedará conectado y nunca más pedirá el QR a menos que cierres la sesión manualmente desde el celular.

---

## 🛡️ 6. Recomendaciones para Mantener el Equipo 24/7

1. **Opciones de Energía (Windows):**
   - Ve a *Configuración de Energía y Suspensión* de Windows y coloca **"Suspender el equipo: NUNCA"**.
   - Si es un portátil, ve a *Opciones adicionales de energía* -> *Elegir el comportamiento del cierre de la tapa* -> **"No hacer nada"**.
2. **Reinicio de Emergencia:**
   - La configuración de PM2 (`ecosystem.config.cjs`) tiene configurado un límite de memoria de `1GB`. Si Chromium llega a acumular memoria tras semanas continuas, PM2 lo reiniciará en 3 segundos sin perder datos.
3. **Conexión a Internet:**
   - Conecta el equipo preferiblemente por cable de red (Ethernet) o asegúrate de que tenga una señal Wi-Fi estable.
