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
  ['__HOY__', '__AHORA__', 'SQL tablas y seguridad', 'Tablas negocio: clientes, tipos_movimiento_caja, ordenes, movimientos_caja, movimientos_cuenta_corriente. Seguridad: roles (Admin, Encargado, Visor), permisos abm_*, RLS, set_user_role.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'UI base y login', 'Layout tipo Everfit: sidebar (Inicio, Órdenes, Cajas, Clientes, Cuenta corriente, Seguridad), login/registro, header con logo y user-bar. Auth Supabase, navegación entre vistas. Vista Seguridad: get_users_for_admin + set_user_role.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'ABM Clientes', 'Vista Clientes: listado desde Supabase, botón Nuevo cliente (si abm_clientes), modal Alta/Edición con nombre, documento, email, teléfono, dirección, activo. Guardar insert/update.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Vista Cajas', 'Saldos USD/EUR/ARS (cards), filtro por moneda, tabla de movimientos. Nuevo movimiento manual: modal con moneda, tipo (tipos_movimiento_caja), monto, concepto, fecha. Signo según tipo ingreso/egreso.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'ABM Tipos de movimiento de caja', 'Integrado en vista Cajas: listado de tipos, Nuevo tipo y Editar. Campos: nombre, dirección (Ingreso/Egreso), activo. Al cargar se define si es Ingreso o Egreso.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Iconos y regla botones', 'Iconos por moneda en Cajas (USA USD, Euro EUR, bandera ARS). Regla: todo botón de acción con icono a la izquierda. Aplicado a Entrar, Crear cuenta, Cerrar sesión, Nuevo/Editar/Guardar/Cancelar en todas las vistas.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Importes y formato', 'Campo monto con formato es-AR (miles con punto, decimales con coma). parseImporteInput, formatImporteDisplay, setupInputImporte en modales.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Vista Órdenes', 'Listado de órdenes (fecha, cliente, estado, recibido/entregado, cotización). Nueva orden y Editar con modal (cliente, fecha, monedas y montos, estado cotización/cerrada/concertada). Al concertar se crean movimientos de caja y cuenta corriente (una sola vez por orden).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Edición movimientos de caja', 'Botón Editar en cada movimiento. Modal en modo edición: para movimientos manuales se editan moneda, tipo, monto, concepto y fecha; para movimientos por orden solo concepto y fecha.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Vista Cuenta corriente', 'Selector de cliente, saldos por moneda (USD, EUR, ARS), tabla de movimientos con filtro por moneda. Convención: positivo = cliente nos debe, negativo = nosotros le debemos.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Vista Inicio', 'Resumen con saldos de las 3 cajas (USD, EUR, ARS) y accesos rápidos a Órdenes, Cajas, Clientes y Cuenta corriente.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Convención cuenta corriente', 'Corregidos signos al concertar: moneda recibida → monto negativo (nosotros le debemos), moneda entregada → monto positivo (cliente nos debe). Leyenda aclarada en la vista. Script sql/corregir_signos_cuenta_corriente.sql para datos existentes.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Edición movimientos cuenta corriente', 'Botón Editar en tabla de movimientos de cuenta corriente (permiso abm_ordenes). Modal para editar concepto y fecha. Guardar actualiza y recarga la vista del cliente.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Responsividad móvil', 'Breakpoints 768px y 480px. Touch targets mínimos 44px en botones y menú. Tablas con scroll horizontal y -webkit-overflow-scrolling: touch. Cards y modales adaptados; form dos columnas en una en móvil; inputs font-size 16px en modal para evitar zoom iOS.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Mensajería propia (toast)', 'Reemplazo de todos los alert() por showToast(): validaciones de órdenes, transacciones, movimientos caja/CC, clientes, intermediarios, tipos movimiento, roles. Toasts con tipo success/error/info.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Tasa descuento intermediario y caja banco', 'Campo tasa ARS-ARS CHEQUE: solo coma decimal (no punto), mantener coma al escribir decimales. Modal movimiento caja: selector Caja (Efectivo/Banco) para movimientos manuales; caja_tipo guardado en movimientos_caja.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Conceptos CC y layout', 'Conceptos cuenta corriente más claros: Conversión de moneda (antes Conversión por tipo de cambio), Comisión del acuerdo (antes Comisión). Layout: max-width 1600px para aprovechar pantalla.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Responsive móvil reforzado', 'Safe area insets (notch, barra gestos), body overflow-x hidden, todos los tabla-wrap con scroll táctil, toasts y popovers adaptados, form-actions en columna en 480px, títulos y paneles con menos padding.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Panel de Control sin título redundante', 'Quitado el h3 "Panel de Control" duplicado dentro de la vista Inicio; el título solo se muestra en el header de la página.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Permisos editar orden y cambiar estado transacción', 'Nuevos permisos editar_orden y cambiar_estado_transaccion. Migración SQL (app_permission, app_role_permission, RLS en ordenes, transacciones, mov_cc, instrumentacion, comisiones_orden). Frontend: botones Editar/Transacciones, combo pendiente/ejecutada y Editar transacción según permiso; saveOrden valida permisos.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Logo y favicon desde Emoji-de-WhatsApp-panda', 'Favicon y logo de app generados desde JPG del panda. Corrección cropOffset (Y X = 0 262) con sips; PNG 192x192 (logo), 32x32 y 16x16 (pestaña). Logo en círculo (contain), z-index para que sidebar no tape; ?v=2 en links favicon para cache.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Tipo operación define monedas en Nueva orden', 'Regla: primera moneda del tipo = recibida, segunda = entregada. Selects Moneda recibida/entregada se rellenan y deshabilitan según tipo (estilo gris). ARS-USD tratado como ARS-DOLAR. Cualquier código XXX-YYY aplica.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Transacciones auto sin intermediario', 'AutoCompletarInstrumentacionSinIntermediario para USD-USD, ARS-USD, ARS-DOLAR, USD-ARS y ARS-ARS. Al abrir instrumentación vacía se crean dos transacciones (ingreso/egreso efectivo).', 'Desarrollo'],
];

const datosLogParaExcel = aplicarHoyAhora(datosLog);
const wsLog = XLSX.utils.aoa_to_sheet(datosLogParaExcel);
wsLog['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 45 }, { wch: 95 }, { wch: 14 }];

// --- Hoja Resumen
const funcionalidades = [
  ['Funcionalidad', 'Descripción'],
  ['Estructura del repo', 'Carpetas sql/, scripts/, docs/, Base/. Reglas en .cursor/rules (estructura-proyecto, reglas-pandi, bitácora, preguntas-solo-respuesta).'],
  ['Bitácora', 'Node.js + SheetJS (xlsx). Script scripts/crear-bitacora-excel.js genera Bitacora_tareas.xlsx con Log, Resumen, Ref Git y Vercel, Versiones, Tecnología.'],
  ['Tablas de negocio (Supabase)', 'clientes, tipos_movimiento_caja, ordenes, movimientos_caja, movimientos_cuenta_corriente. Órdenes: cotizacion, cerrada, concertada. CC por cliente y moneda.'],
  ['Seguridad (Supabase)', 'Roles Admin/Encargado/Visor. Permisos abm_*. RLS. RPC set_user_role.'],
  ['UI base Pandi', 'index.html + main.js: sidebar colapsable, login/registro, 6 vistas (Inicio, Órdenes, Cajas, Clientes, Cuenta corriente, Seguridad). Estilos Everfit. Vista Seguridad funcional (asignar rol).'],
  ['ABM Clientes', 'Listado de clientes (tabla clientes), Nuevo cliente y Editar en modal. Campos: nombre, documento, email, teléfono, dirección, activo. Solo usuarios con permiso abm_clientes pueden crear/editar.'],
  ['Vista Cajas', 'Tres saldos (USD, EUR, ARS) calculados desde movimientos_caja. Filtro por moneda y tabla de movimientos. Alta de movimiento manual con tipo de movimiento (tipos_movimiento_caja), monto positivo; signo según ingreso/egreso.'],
  ['ABM Tipos de movimiento de caja', 'Integrado en Cajas: listado, Nuevo tipo, Editar. Nombre, Dirección (Ingreso/Egreso), Activo. Permiso abm_tipos_movimiento_caja.'],
  ['Iconos y botones', 'Iconos por moneda (USA/Euro/Argentina). Todo botón de acción con icono a la izquierda (Entrar, Guardar, Editar, Nuevo, Cancelar, etc.).'],
  ['Vista Órdenes', 'Listado, Nueva orden y Editar. Estados: cotización, cerrada, concertada. Al concertar se generan movimientos de caja y cuenta corriente (evita doble concertación).'],
  ['Edición movimientos de caja', 'Editar movimiento: manual (todos los campos) o por orden (solo concepto y fecha).'],
  ['Vista Cuenta corriente', 'Selector cliente, saldos USD/EUR/ARS, tabla de movimientos con filtro por moneda. Convención: positivo = cliente nos debe, negativo = nosotros le debemos.'],
  ['Vista Inicio', 'Saldos de las 3 cajas y accesos rápidos a Órdenes, Cajas, Clientes, Cuenta corriente. Título de vista solo en el header (sin duplicado en el contenido).'],
  ['Convención y corrección CC', 'Signos correctos al concertar. sql/corregir_signos_cuenta_corriente.sql para corregir datos ya cargados.'],
  ['Edición movimientos cuenta corriente', 'En vista Cuenta corriente, botón Editar por movimiento. Modal: concepto y fecha. Permiso abm_ordenes.'],
  ['Responsividad móvil', 'Media queries 768px y 480px. Touch 44px, tablas con scroll táctil, modales y cards adaptados, formularios en una columna en móvil.'],
  ['Mensajería toast', 'Todos los avisos y errores con showToast() (success/error/info) en lugar de alert(). Aplicado a órdenes, transacciones, movimientos caja/CC, clientes, intermediarios, tipos movimiento, roles.'],
  ['Movimientos caja efectivo/banco', 'En nuevo movimiento de caja: selector Caja (Efectivo o Banco). Los movimientos manuales se guardan con caja_tipo; saldos por tipo en vista Cajas.'],
  ['Conceptos cuenta corriente', 'Textos más claros en CC: Conversión de moneda (ajuste por cotización), Comisión del acuerdo. Incluye compatibilidad con textos legacy al borrar/regenerar.'],
  ['Layout y responsive', 'Contenedor principal hasta 1600px. Móvil: safe area, overflow-x hidden, todos los tabla-wrap con scroll táctil, toasts y form-actions adaptados a 480px.'],
  ['Permisos granulares órdenes', 'editar_orden: editar datos de orden e instrumentación. cambiar_estado_transaccion: cambiar estado pendiente/ejecutada y editar transacción. Botones y combos en vista Órdenes, panel detalle, modal transacciones pendientes y wizard según permiso; RLS actualizado en Supabase.'],
  ['Logo y favicon', 'Logo de app y favicon de pestaña generados desde Emoji-de-WhatsApp-panda.jpg. Recorte central 675x675 (sips cropOffset 0 262), PNG 192/32/16. Logo en header y login en círculo (object-fit contain); z-index para que no lo tape el sidebar; cache-bust en favicon.'],
  ['Tipo de operación y monedas en orden', 'En Nueva orden / Editar orden, el tipo de operación define monedas: primera = recibida, segunda = entregada. Los selects se rellenan y deshabilitan (gris); ARS-USD equivalente a ARS-DOLAR.'],
  ['Instrumentación sin intermediario', 'Órdenes sin intermediario (USD-USD, ARS-USD, ARS-DOLAR, USD-ARS, ARS-ARS): al abrir instrumentación vacía se generan automáticamente dos transacciones (ingreso y egreso en efectivo).'],
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
  ['1.1', '__HOY__', 'Mensajería propia (toast en lugar de alert), tasa descuento intermediario solo coma decimal, movimientos caja efectivo/banco, conceptos CC más claros (Conversión de moneda, Comisión del acuerdo), layout extendido (max-width 1600px), responsive móvil reforzado (safe area, tablas, toasts, form actions).'],
  ['1.2', '__HOY__', 'Quitar título redundante "Panel de Control" en vista Inicio (solo se muestra en el header).'],
  ['1.3', '__HOY__', 'Permisos granulares: editar_orden y cambiar_estado_transaccion. SQL migración (app_permission, RLS), frontend: botones Editar orden y combo estado transacción según permiso; guardar orden con validación de permisos.'],
  ['1.4', '__HOY__', 'Logo y favicon: Emoji-de-WhatsApp-panda como base. Recorte correcto (cropOffset Y X = 0 262) para cuadrado central; PNG 192/32/16 y favicon; logo en header/login con contenedor circular; z-index para que sidebar no tape logo; cache-bust ?v=2 en favicon.'],
  ['1.5', '__HOY__', 'Nueva orden: tipo de operación define monedas (primera = recibida, segunda = entregada). Monedas recibida/entregada se rellenan y deshabilitan según tipo; estilo gris para selects deshabilitados. ARS-USD tratado como ARS-DOLAR.'],
  ['1.6', '__HOY__', 'Instrumentación sin intermediario: auto-generación de transacciones para USD-USD, ARS-USD, ARS-DOLAR, USD-ARS y ARS-ARS. Al abrir instrumentación vacía se crean dos transacciones (ingreso/egreso efectivo).'],
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
