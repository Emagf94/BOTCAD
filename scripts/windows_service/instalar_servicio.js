import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Service = require('node-windows').Service;
const path = require('path');
const __dirname = import.meta.dirname;

// Crear un nuevo objeto de servicio de Windows
const svc = new Service({
  name: 'CAD Bot WhatsApp',
  description: 'Bot de Impresiones CAD funcionando 24/7 en segundo plano de manera invisible.',
  script: path.join(__dirname, '..', '..', 'src', 'app.js'),
  // Le damos un poco más de RAM por si a caso (2GB)
  nodeOptions: [
    '--max_old_space_size=2048'
  ],
  // PM2-like: Que se reinicie si falla
  wait: 2,
  grow: .5,
  maxRestarts: 10
});

// Escuchar evento de instalación exitosa
svc.on('install', function() {
  console.log('\n[EXITO] El servicio "CAD Bot WhatsApp" se ha instalado correctamente en Windows.');
  console.log('[INFO] Iniciando el servicio en segundo plano...\n');
  svc.start();
  console.log('====================================================');
  console.log('¡BOT INICIADO COMO SERVICIO!');
  console.log('Ya puedes cerrar todo. El bot se iniciará automáticamente');
  console.log('cada vez que se encienda el PC, SIN NECESIDAD de iniciar sesión.');
  console.log('====================================================\n');
});

// Si ya existe el servicio, avisamos
svc.on('alreadyinstalled', function() {
    console.log('\n[ALERTA] El servicio ya estaba instalado.');
    console.log('[INFO] Reiniciando el servicio...\n');
    svc.restart();
});

// Instalar el servicio
console.log('Instalando servicio, por favor espera...');
svc.install();
