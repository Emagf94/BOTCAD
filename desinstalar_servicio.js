import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Service = require('node-windows').Service;
const path = require('path');
const __dirname = import.meta.dirname;

// Crear el objeto de servicio apuntando a la misma config
const svc = new Service({
  name: 'CAD Bot WhatsApp',
  script: path.join(__dirname, 'src', 'app.js')
});

// Escuchar el evento de desinstalación
svc.on('uninstall', function() {
  console.log('\n[EXITO] El servicio "CAD Bot WhatsApp" ha sido DESINSTALADO correctamente.');
  console.log('El bot ya no se iniciará automáticamente.\n');
});

console.log('Desinstalando el servicio, por favor espera...');
svc.uninstall();
