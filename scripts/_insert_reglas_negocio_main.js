/**
 * Fragmento a insertar en main.js antes de `/** Configuración de vistas`.
 * Uso (desde raíz): node scripts/_insert_reglas_negocio_main.js
 * Luego borrar este script si querés.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'main.js');
const fragmentPath = path.join(__dirname, '_reglas_negocio_fragment.js');
let main = fs.readFileSync(mainPath, 'utf8');
const fragment = fs.readFileSync(fragmentPath, 'utf8');
const marker = '/** Configuración de vistas: [menuId, vistaId, título, permiso de vista]. Orden del menú. */\nconst VIEWS_CONFIG = [';
if (!main.includes(marker)) {
  console.error('Marker not found');
  process.exit(1);
}
if (main.includes('function loadReglasNegocioVista')) {
  console.log('Already inserted, skip');
  process.exit(0);
}
main = main.replace(marker, fragment + '\n' + marker);
fs.writeFileSync(mainPath, main);
console.log('Inserted reglas negocio block');
