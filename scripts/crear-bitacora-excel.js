const XLSX = require('xlsx');
const path = require('path');

const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';
function ahoraFecha() {
  return new Date().toLocaleDateString('es-AR', { timeZone: ZONA_ARGENTINA, day: '2-digit', month: '2-digit', year: 'numeric' });
}
function ahoraHora() {
  return new Date().toLocaleTimeString('es-AR', { timeZone: ZONA_ARGENTINA, hour: '2-digit', minute: '2-digit', hour12: false });
}
function aplicarHoyAhora(rows) {
  return rows.map(row => Array.isArray(row)
    ? row.map(cell => {
        if (cell === '__HOY__') return ahoraFecha();
        if (cell === '__AHORA__') return ahoraHora();
        return cell;
      })
    : row);
}

// --- Hoja Log
const datosLog = [
  ['Fecha', 'Hora', 'titulo_tarea', 'desc_tarea', 'etapa'],
  ['__HOY__', '__AHORA__', 'Setup Pandi', 'Estructura repo (sql/, scripts/, docs/, Base/), reglas .cursor/rules, script bitácora, package.json, vercel, config.example.', 'Setup'],
];

const datosLogParaExcel = aplicarHoyAhora(datosLog);
const wsLog = XLSX.utils.aoa_to_sheet(datosLogParaExcel);
wsLog['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 45 }, { wch: 95 }, { wch: 14 }];

// --- Hoja Resumen
const funcionalidades = [
  ['Funcionalidad', 'Descripción'],
  ['Estructura del repo', 'Carpetas sql/, scripts/, docs/, Base/. Reglas en .cursor/rules (estructura-proyecto, reglas-pandi, bitácora, preguntas-solo-respuesta).'],
  ['Bitácora', 'Node.js + SheetJS (xlsx). Script scripts/crear-bitacora-excel.js genera Bitacora_tareas.xlsx con Log, Resumen, Ref Git y Vercel, Versiones, Tecnología.'],
];

const wsResumen = XLSX.utils.aoa_to_sheet(funcionalidades);
wsResumen['!cols'] = [{ wch: 32 }, { wch: 85 }];

// --- Hoja Ref Git y Vercel (actualizar cuando tengas repo y Vercel)
const refGitVercel = [
  ['Concepto', 'Valor'],
  ['Repositorio GitHub', 'https://github.com/lucasbustosmartin-coder/pandy'],
  ['URL app en vivo (Vercel)', 'https://pandi.vercel.app/'],
  ['Rama principal', 'main'],
  ['Actualizar y subir cambios', 'git add .  →  git commit -m "descripción"  →  git push origin main'],
  ['Vercel redeploy', 'Automático al hacer push a main (cuando esté conectado)'],
];

const wsRef = XLSX.utils.aoa_to_sheet(refGitVercel);
wsRef['!cols'] = [{ wch: 28 }, { wch: 70 }];

// --- Hoja Versiones
const versiones = [
  ['Versión', 'Fecha', 'Descripción'],
  ['1.0', '__HOY__', 'Setup: estructura repo, reglas de trabajo, script bitácora, package.json, Vercel, config.example.'],
];
const versionesParaExcel = aplicarHoyAhora(versiones);
const wsVersiones = XLSX.utils.aoa_to_sheet(versionesParaExcel);
wsVersiones['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 75 }];

// --- Hoja Tecnología
const tecnologia = [
  ['Componente', 'Detalle'],
  ['Datos', 'Supabase (PostgreSQL). Tablas según la app. Scripts SQL en sql/.'],
  ['Hosting', 'Vercel. Despliegue con vercel --prod tras push a main.'],
  ['Repositorio', 'Git/GitHub, rama main.'],
  ['Bitácora', 'Node.js + SheetJS (xlsx). Script scripts/crear-bitacora-excel.js genera Bitacora_tareas.xlsx con Log, Resumen, Ref Git y Vercel, Versiones, Tecnología.'],
];
const wsTecnologia = XLSX.utils.aoa_to_sheet(tecnologia);
wsTecnologia['!cols'] = [{ wch: 18 }, { wch: 95 }];

const outPath = path.join(__dirname, '..', 'Bitacora_tareas.xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsLog, 'Log');
XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
XLSX.utils.book_append_sheet(wb, wsRef, 'Ref Git y Vercel');
XLSX.utils.book_append_sheet(wb, wsVersiones, 'Versiones');
XLSX.utils.book_append_sheet(wb, wsTecnologia, 'Tecnología');

XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);
