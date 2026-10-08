# 🖨️ Bot de WhatsApp - CAD Impresiones

Bot conversacional inteligente para la atención de clientes y procesamiento automatizado de pedidos de impresión digital, gran formato, sellos y personalización para **CAD Impresiones** (Quibdó), construido con [BuilderBot](https://builderbot.app/) y `@builderbot/provider-wppconnect`.

---

## 🏛️ Arquitectura del Sistema

El proyecto sigue una arquitectura modular en capas (**Globales y Micro-Flujos**) para garantizar escalabilidad, legibilidad y facilidad de mantenimiento.

```
base-js-baileys-memory/
├── assets/                     # Recursos multimedia (logos, QR pagos, imágenes de sellos)
│   └── SELLOS/                 # Fotografías de modelos de sellos
├── dashboard/                  # Dashboard web de administración (React / Firebase)
├── src/
│   ├── app.js                  # Punto de entrada maestro (~40 líneas)
│   ├── botConfig.js            # Sincronización en tiempo real con Firebase Firestore
│   ├── firebase.js             # Conexión Firestore y persistencia de usuarios
│   ├── prices.js               # Proxy de listas de precios actualizadas
│   ├── utils/
│   │   └── helpers.js          # Estados globales en memoria y funciones utilitarias
│   └── flows/                  # Módulos de flujos conversacionales
│       ├── index.js            # Agregador central y exportador de todos los flujos
│       ├── main.flow.js        # Flujo de bienvenida, menú principal, inactividad y cancelar
│       ├── products.flow.js    # Submenús y catálogos de productos (Planos, Carteleras, Sellos...)
│       ├── orders.flow.js      # Captura de datos del cliente (nombre, teléfono de contacto)
│       ├── files.flow.js       # Recepción, conteo y configuración de archivos (PDF, fotos)
│       ├── payment.flow.js     # Resumen de orden, opciones de pago (QR / Efectivo)
│       ├── admin.flow.js       # Flujos de soporte humano y comandos de administración
│       └── faq.flow.js         # Preguntas frecuentes, ubicación, horarios y envío directo
├── package.json
└── README.md
```

---

## 📦 Detalle de los Módulos de Flujos (`src/flows/`)

| Archivo | Responsabilidad |
|---|---|
| **`main.flow.js`** | Manejo de bienvenida (`flowWelcome`), registro inicial de nombre y teléfono, menú principal con 10 opciones (`flowMainMenu`), cierre por inactividad (`flowInactividad`) y cancelación de pedidos (`flowCancelar`). |
| **`products.flow.js`** | Configuración de servicios y cálculo de precios: Carteleras (A0-A3), Planos CAD (B/N, Líneas, Plenos), Fotos, Documentos, Gran Formato (Pendones, Adhesivos, Pasacalles), Sublimación, Carnets y Sellos con confirmación e imagen demostrativa. |
| **`orders.flow.js`** | Inicialización del pedido (`flowInicializarPedido`), validación de datos en caché/Firebase y recolección interactiva de información del cliente. |
| **`files.flow.js`** | Bucle de carga de archivos (`flowRecibirArchivosLoop`), validación estricta de extensiones (PDF/Imágenes), conteo automático de páginas con `pdf-lib` y asignación de número de copias. |
| **`payment.flow.js`** | Generación del resumen de cobro con subtotales, selección de método de pago (Transferencia o Efectivo presencial), envío de notificación y archivos al chat del administrador y confirmación al usuario. |
| **`admin.flow.js`** | Turnos de cola de espera para atención humana (`flowAsesor`), validación de horario de oficina y puente bidireccional en vivo (`flowAdminBridge`). |
| **`faq.flow.js`** | Información de ubicación física, horarios de atención, respuestas a preguntas frecuentes (facturación electrónica, domicilios, tiempos de entrega) y flujo de envío directo de archivos al administrador. |
| **`index.js`** | Importa y agrupa los 47 flujos en el arreglo `allFlows` para pasarlo a `createFlow()` en `app.js`. |

---

## 🧠 Estados Globales y Utilidades (`src/utils/helpers.js`)

- **`globalFilesCache`**: Mapa en memoria (`Map<userId, Array<path>>`) que almacena las rutas de los archivos temporales recibidos durante el bucle de pedido.
- **`activeBridgeChats`**: Mapa en memoria (`Map<adminPhone, clientPhone>`) que enlaza la conversación entre el asesor y el cliente en tiempo real.
- **`pendingSupportQueue`**: Arreglo que gestiona el orden de llegada (turnos de espera) de clientes que solicitan hablar con un humano.
- **`isAdmin(phone)`**: Determina si el número emisor tiene privilegios administrativos.
- **`isWorkingHour()`**: Valida si el horario actual (zona horaria Bogotá) coincide con la jornada laboral:
  - *Lunes a Viernes:* 8:30 AM - 12:30 PM y 2:00 PM - 6:00 PM.
  - *Sábados y Domingos:* Cerrado.

---

## 🛠️ Comandos de Administración (Modo Asesor)

Cuando un cliente selecciona la opción **10 (Hablar con un asesor)** dentro del horario de atención, el bot notifica al administrador designado.

Para gestionar los chats de soporte mediante el bot, el administrador envía directamente a su chat con el bot:

- **Atender siguiente en cola:** Escribe `!atender`
  *(Conecta automáticamente con el cliente en el turno #1 sin necesidad de copiar su número).*
- **Iniciar chat directo:** Escribe `!chatear <numero_del_cliente>`
  *(Ejemplo: `!chatear 573100000000`). Conecta con un cliente en específico.*
- **Finalizar sesión de soporte:** Escribe `!fin`
  *(Cierra el puente y regresa al cliente al menú principal automático).*

---

## ➕ Cómo Agregar un Nuevo Flujo o Servicio

Para incorporar un nuevo menú o flujo sin alterar el resto del código:

1. **Crear el flujo:**
   En el archivo correspondiente (por ejemplo en `src/flows/products.flow.js` o en un nuevo archivo `src/flows/miservicio.flow.js`):
   ```javascript
   import { addKeyword, EVENTS } from '@builderbot/bot';
   import { flowCancelar } from './main.flow.js';
   import { flowInicializarPedido } from './orders.flow.js';

   export const flowMiNuevoServicio = addKeyword(EVENTS.ACTION)
       .addAnswer('Bienvenido a mi nuevo servicio...', { capture: true }, async (ctx, { gotoFlow, state }) => {
           if (ctx.body === '0') return gotoFlow(flowCancelar);
           await state.update({ itemName: 'Mi Servicio', basePrice: 25000 });
           return gotoFlow(flowInicializarPedido);
       });
   ```

2. **Registrarlo en `src/flows/index.js`:**
   Importar el flujo y agregarlo al arreglo `allFlows`:
   ```javascript
   import { flowMiNuevoServicio } from './products.flow.js';

   export const allFlows = [
       ...,
       flowMiNuevoServicio
   ];
   ```

3. **Vincularlo al Menú Principal:**
   En `src/flows/main.flow.js`, agregarlo al texto y al objeto de enrutamiento del `flowMainMenu`.

---

## 🚀 Ejecución y Despliegue

```bash
# Instalar dependencias
npm install

# Iniciar bot en producción
npm start

# Iniciar bot en modo desarrollo (recarga automática con nodemon)
npm run dev

# Ejecutar dashboard administrativo
npm run dashboard:dev
```