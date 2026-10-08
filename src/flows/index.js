// ==========================================
// ÍNDICE CENTRAL DE FLUJOS DEL BOT
// ==========================================

import {
    flowInactividad,
    flowCancelar,
    flowMainMenu,
    flowContactUserCapture,
    flowNameCapture,
    flowWelcomeRegistered,
    flowWelcome
} from './main.flow.js';

import {
    flowAdminBridgeLoop,
    flowAdminBridge,
    flowAsesor,
    flowAdminInitiatedClientBridge
} from './admin.flow.js';

import {
    flowUbicacion,
    flowHorarios,
    flowPagosFAQ,
    flowFAQ,
    flowEnvioDirectoArchivosLoop,
    flowEnvioDirectoArchivos
} from './faq.flow.js';

import {
    flowCarteleraMaterial,
    flowMenuCarteleras,
    flowPlanosColor,
    flowPlanosTipo,
    flowMenuPlanos,
    flowMenuFotos,
    flowDocColor,
    flowDocMaterial,
    flowDocTamano,
    flowMenuDocFotos,
    flowMenuGranFormatoTamano,
    flowMenuPasacalles,
    flowMenuGranFormato,
    flowMenuSublimacion,
    flowMenuCarnets,
    flowMenuOtrosServicios,
    flowConfirmarSello,
    flowMenuSellos
} from './products.flow.js';

import {
    flowPedirTelefono,
    flowPedirNombre,
    flowInicializarPedido
} from './orders.flow.js';

import {
    flowPreguntarPaginas,
    flowConfigurarArchivoPaso2,
    flowConfigurarArchivoPaso1,
    flowRecibirArchivosLoop,
    flowRecibirArchivos
} from './files.flow.js';

import {
    flowRecibirPagoLoop,
    flowRecibirPago,
    flowPagoEfectivo,
    flowOpcionesPago,
    flowResumenPedido
} from './payment.flow.js';

// Arreglo unificado con todos los flujos para inicializar el bot
export const allFlows = [
    flowWelcome,
    flowMenuCarteleras,
    flowMenuPlanos,
    flowPlanosTipo,
    flowPlanosColor,
    flowMenuDocFotos,
    flowDocTamano,
    flowDocMaterial,
    flowDocColor,
    flowMenuFotos,
    flowMenuGranFormato,
    flowMenuGranFormatoTamano,
    flowMenuPasacalles,
    flowMenuOtrosServicios,
    flowMenuSublimacion,
    flowMenuCarnets,
    flowMenuSellos,
    flowConfirmarSello,
    flowInicializarPedido,
    flowPedirNombre,
    flowPedirTelefono,
    flowRecibirArchivos,
    flowRecibirArchivosLoop,
    flowConfigurarArchivoPaso1,
    flowConfigurarArchivoPaso2,
    flowPreguntarPaginas,
    flowResumenPedido,
    flowOpcionesPago,
    flowPagoEfectivo,
    flowRecibirPago,
    flowRecibirPagoLoop,
    flowPagosFAQ,
    flowFAQ,
    flowAsesor,
    flowUbicacion,
    flowHorarios,
    flowMainMenu,
    flowNameCapture,
    flowContactUserCapture,
    flowWelcomeRegistered,
    flowInactividad,
    flowCancelar,
    flowAdminBridge,
    flowAdminBridgeLoop,
    flowAdminInitiatedClientBridge,
    flowCarteleraMaterial,
    flowEnvioDirectoArchivos,
    flowEnvioDirectoArchivosLoop
];

export default allFlows;

// Re-exportar flujos individuales
export {
    flowInactividad,
    flowCancelar,
    flowMainMenu,
    flowContactUserCapture,
    flowNameCapture,
    flowWelcomeRegistered,
    flowWelcome,
    flowAdminBridgeLoop,
    flowAdminBridge,
    flowAsesor,
    flowAdminInitiatedClientBridge,
    flowUbicacion,
    flowHorarios,
    flowPagosFAQ,
    flowFAQ,
    flowEnvioDirectoArchivosLoop,
    flowEnvioDirectoArchivos,
    flowCarteleraMaterial,
    flowMenuCarteleras,
    flowPlanosColor,
    flowPlanosTipo,
    flowMenuPlanos,
    flowMenuFotos,
    flowDocColor,
    flowDocMaterial,
    flowDocTamano,
    flowMenuDocFotos,
    flowMenuGranFormatoTamano,
    flowMenuPasacalles,
    flowMenuGranFormato,
    flowMenuSublimacion,
    flowMenuCarnets,
    flowMenuOtrosServicios,
    flowConfirmarSello,
    flowMenuSellos,
    flowPedirTelefono,
    flowPedirNombre,
    flowInicializarPedido,
    flowPreguntarPaginas,
    flowConfigurarArchivoPaso2,
    flowConfigurarArchivoPaso1,
    flowRecibirArchivosLoop,
    flowRecibirArchivos,
    flowRecibirPagoLoop,
    flowRecibirPago,
    flowPagoEfectivo,
    flowOpcionesPago,
    flowResumenPedido
};
