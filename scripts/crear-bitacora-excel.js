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
  ['__HOY__', '__AHORA__', 'Tipo operación define monedas en Nueva orden', 'Regla: primera moneda del tipo = recibida, segunda = entregada. Selects Moneda recibida/entregada se rellenan y deshabilitan según tipo (estilo gris). Cualquier código XXX-YYY aplica.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Transacciones auto sin intermediario', 'AutoCompletarInstrumentacionSinIntermediario para USD-USD, ARS-USD, USD-ARS y ARS-ARS. Al abrir instrumentación vacía se crean dos transacciones (ingreso/egreso efectivo).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.7: CC intermediario, transacciones y orden', 'Conciliación CC intermediario: cap Debe por moneda al Haber; un solo movimiento Comisión del acuerdo cuando hay tope. Modal transacción: moneda/tipo según operación (Ingreso=moneda recibida, Egreso=entregada). Orden: distribución comisión siempre visible con intermediario; carga desde comisiones_orden al editar; alerta genérica si comisión intermediario 0% (todos los tipos); ARS-USD en split y validaciones.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.8: ARS-USD/USD-ARS, anulación, mensajería interna, estado al instrumentar', 'ARS-USD/USD-ARS: foco en tipo de cambio al abrir detalle, sin comisión, cálculo Monto a Recibir/Entregar desde TC (autocompletar con base 1). Anulación de órdenes: estado anulada, botón Anular en tabla y en modal. Baja de transacciones: botón Eliminar por fila. Mensajería interna: showConfirm (modal) reemplaza confirm(); regla en .cursor/rules. Estado de orden: actualizarEstadoOrden tras auto-completar instrumentación (sin intermediario y cheque con intermediario). Eliminación de ARS-DOLAR en código y catálogo.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.9: Permisos reordenados (7 granulares, sin abm_ordenes)', 'Migración SQL: nuevos permisos ingresar_orden, editar_orden, anular_orden, editar_estado_orden, ingresar_transacciones, editar_transacciones, eliminar_transacciones; eliminados abm_ordenes, cambiar_estado_transaccion. RLS actualizado. Frontend: todos los botones y combos (Nueva orden, Editar, Anular, estado orden, Nueva transacción, Editar/Eliminar transacción) usan solo los 7 permisos; orden en Seguridad según lista acordada.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.10: Panel de Control rediseñado', 'Tarjetas Efectivo y Banco con Saldo Inicial, Saldo Actual (resaltado), Var. por moneda (USD, ARS, EUR en Efectivo; USD, ARS en Banco); iconos por moneda y por caja; sin decimales. Cards Órdenes pendientes (por estado con ojo por fila) y Transacciones pendientes (número en círculo); mismo ancho que Efectivo. Fila Saldo Actual con fondo y negrita.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Permisos de vistas por perfil', 'Migración sql/migracion_permisos_vistas.sql: permisos ver_inicio, ver_ordenes, ver_cajas, ver_clientes, ver_intermediarios, ver_cuenta_corriente, ver_seguridad. Menú lateral y vista por defecto según permisos del rol; redirección si no tiene permiso.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Panel de Control parametrizable', 'Tres permisos: ver_inicio_efectivo, ver_inicio_banco, ver_inicio_pendientes. Tarjetas Efectivo/Banco/Pendientes visibles según permiso; por defecto visor solo tarjetas de pendientes. loadInicio muestra/oculta bloques.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Seguridad: agrupación y subpermisos', 'Permisos por rol agrupados en Permisos de vistas y Permisos de alta, baja o modificación. Subpermisos del Panel (Efectivo, Banco, Pendientes) con sangría y viñeta. Títulos con icono; líneas entre filas; toggles alineados.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Seguridad: roles colapsados', 'Cada rol (Admin, Encargado, Visor) inicia colapsado; clic en el encabezado expande/contrae los permisos. Chevron animado; accesibilidad aria-expanded/aria-controls.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Presentación comercial PPT', 'Script presentacion/crear_presentacion_pptx.py: barra azul (#0d2137), logo transparente y contorno blanco, paginado "actual / total", interlineados y leyendas mejorados.', 'Presentación'],
  ['__HOY__', '__AHORA__', 'Filtros en Órdenes pendientes', 'Modal Órdenes pendientes: filtros por Cliente, Intermediario y Estado; misma barra y estilos que el resto de la web; re-render al cambiar filtros.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Regla de despliegue sin PPT', 'Flujo de despliegue ya no incluye regenerar PowerPoint; commit sin Propuesta_Pandi.pptx. Reglas bitacora-tareas y reglas-pandi actualizadas.', 'Reglas'],
  ['__HOY__', '__AHORA__', 'Tiempo de inactividad', 'Cierre de sesión automático tras X minutos sin actividad. Solo Admin ve y edita el parámetro en Seguridad. Tabla app_config, sql/app_config_session_timeout.sql.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Sidebar colapsado más visible', 'Borde derecho y sombra cuando está colapsado; botón expandir con fondo, borde y flecha más grande; title/aria-label dinámicos (Expandir/Contraer menú).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Iconos y carpeta assets', 'Tarjetas Efectivo y Banco con iconos cash.png y Banco.webp. Carpeta assets/ con favicons, logos, iconos monedas y cajas; referencias /assets/ en index.html y crear_presentacion_pptx.py; regla estructura-proyecto.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Ajustes modal Nueva transacción', 'Campo monto con etiqueta según moneda del tipo (Monto (USD/EUR/ARS)); tipo de cambio solo lectura y gris; modo de pago por defecto Ninguno con validación al guardar; mensajería interna (toast).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Modal transacción: moneda del tipo y conversión inversa', 'En operación ARS-USD: ingresos en ARS, egresos en USD. Un solo campo Monto (moneda de la transacción); bloque conversión con tipo de cambio (solo lectura) y monto calculado = conversión inversa (ARS→÷TC otra moneda, USD/EUR→×TC ARS).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Tipos de operación: moneda_in/moneda_out y ABM', 'tipos_operacion con columnas moneda_in y moneda_out; backfill desde código. Permiso abm_tipos_operacion; RLS INSERT/UPDATE/DELETE. Vista Tipos de operación en menú (solo con permiso); listado y modal Nuevo/Editar (código, nombre, moneda IN, moneda OUT, activo). adaptarFormularioOrden usa monedas del tipo.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Cuenta corriente: vista Todos y modal detalle', 'Vista Cuenta corriente con filtro fijo Todos: una sola tabla con Nombre (cliente/intermediario), Saldo a favor y Saldo negativo por moneda (USD, EUR, ARS) con iconos de moneda en encabezados; botón Ver detalle por fila. Modal Detalle: datos del cliente/intermediario, saldos por moneda (cards) y tabla de movimientos (Debe/Haber); Editar movimiento solo para clientes.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.17: Cuenta corriente y modales', 'CC: encabezado por moneda (iconos Panel), Positivo/Negativo, filtro Cliente/Intermediario, solo con saldo; columna Acción; icono Ver detalle limpio. Modales: máximo ancho/alto (95vw, 92vh), arrastrables por header; regla Modales en reglas-pandi.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.18: Intermediario en órdenes y transacciones', 'Revisión: guardado y visualización de intermediario en órdenes y modales Órdenes pendientes / Transacciones pendientes correctos. Consistencia: intermediario_id incluido en todos los selects de orden (refresco detalle, validación totales, actualizar estado).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.19: Wizard instrumentación', 'Corrección: al guardar la primera transacción desde el paso de instrumentación del alta de orden, el paso dejaba de mostrar la tabla y quedaba en "Cargando…". Definición de canEditarTr en renderWizardList para evitar ReferenceError; se puede seguir agregando transacciones en el mismo paso.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.20: Cuenta corriente y Caja', 'CC refleja todos los movimientos en cualquier estado (pendiente y ejecutada). Caja/Bancos solo cuando transacción ejecutada. Auto-completar instrumentación genera movimientos CC para cada transacción creada; helper insertarMovimientosCcParaTransaccion. Doc docs/CUENTA_CORRIENTE_Y_CAJA.md.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Cards Cajas como Panel de Control', 'Vista Cajas: una sola card Efectivo (USD, ARS, EUR en tabla con header por moneda y fila Saldo) y una sola card Banco (USD, ARS). Misma estructura y clases que Panel (inicio-cajas-dos, inicio-caja-card, inicio-caja-tabla). IDs de saldo sin cambios; setVal mantiene clase inicio-caja-valor para estilos.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Propuesta permisos por menú', 'Doc docs/PERMISOS_POR_MENU.md: reorganizar UI de permisos para que cada opción de menú (Inicio, Órdenes, Cajas, etc.) tenga Ver y Operar on/off por rol; visibilidad y transaccionalidad de Cajas desde el mismo panel. Implementación futura.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Permisos por opción de menú (UI)', 'Seguridad: permisos reorganizados por ítem de menú (Panel de Control, Órdenes, Cajas, Clientes, Intermediarios, Tipos de operación, Cuenta corriente, Seguridad). En cada uno: Ver (acceso a la vista e información) y Operar (crear, editar o anular) con leyendas claras desde app_permission. PERMISOS_POR_MENU en main.js; mismo modelo de datos.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Cajas: Ver granular y mensajes al desactivar', 'Permisos ver_cajas_efectivo y ver_cajas_banco (sql/migracion_ver_cajas_efectivo_banco.sql). Vista Cajas muestra tarjeta Efectivo/Banco según permisos. En Seguridad, Ver Efectivo/Banco como subopciones con viñeta. Al desactivar un permiso de Cajas (Ver u Operar) se muestra mensaje aclaratorio (MENSAJE_AL_DESACTIVAR_PERMISO).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Seguridad: anclaje y toggles', 'Encabezado del rol sticky al hacer scroll; input del toggle con área clicable (position absolute, z-index) para que los on/off respondan al clic.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Seguridad: menús colapsables', 'Cada ítem de menú (Panel, Órdenes, Cajas, etc.) es colapsable/expandible; por defecto colapsado. Mantiene anclaje del rol (padre).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Cajas: tarjeta solo por permiso específico', 'Tarjetas Efectivo/Banco visibles solo con ver_cajas_efectivo y ver_cajas_banco (quitado fallback ver_cajas) para que Encargado con Banco en off no vea la tarjeta.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Intermediarios: Operar en permisos', 'abm_intermediarios agregado a PERMISOS_POR_MENU para que aparezca en Operar del ítem Intermediarios en Seguridad.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'Seguridad: cascada al desactivar padre', 'Al desactivar el permiso padre (acceso al menú) se desactivan también los hijos (resto Ver y Operar) de ese ítem y se actualizan los toggles.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'CC: refresh con nueva lógica y botón Refrescar', 'Tras guardar movimiento CC o cerrar transacción, el modal de detalle actualiza saldos y tabla Operaciones que participan (no solo movimientos). Botón Refrescar en vista Cuenta corriente para recalcular saldos (compromiso − movimientos).', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'CC: compromiso solo órdenes no ejecutadas', 'El compromiso para el saldo de CC solo incluye órdenes que no están en estado orden_ejecutada. Las órdenes cerradas no suman al compromiso; la ganancia según tipo de operación queda solo en movimientos, evitando que aparezca como saldo a favor en la CC del cliente. Leyenda y docs actualizados.', 'Desarrollo'],
  ['__HOY__', '__AHORA__', 'v1.22 Despliegue', 'Versión 1.22: Cuenta corriente (compromiso solo no ejecutadas, Refrescar, lista completa y misma lógica intermediario).', 'Despliegue'],
];

const datosLogParaExcel = aplicarHoyAhora(datosLog);
const wsLog = XLSX.utils.aoa_to_sheet(datosLogParaExcel);
wsLog['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 45 }, { wch: 95 }, { wch: 14 }];

// --- Hoja Resumen
const funcionalidades = [
  ['Funcionalidad', 'Descripción'],
  ['Estructura del repo', 'Carpetas sql/, scripts/, docs/, Base/. Reglas en .cursor/rules (estructura-proyecto, reglas-pandi, bitácora, preguntas-solo-respuesta).'],
  ['Bitácora', 'Node.js + SheetJS (xlsx). Script scripts/crear-bitacora-excel.js genera Bitacora_tareas.xlsx con Log, Resumen, Ref Git y Vercel, Versiones, Tecnología, Presupuesto.'],
  ['Tablas de negocio (Supabase)', 'clientes, tipos_movimiento_caja, ordenes, movimientos_caja, movimientos_cuenta_corriente. Órdenes: cotizacion, cerrada, concertada. CC por cliente y moneda.'],
  ['Seguridad (Supabase)', 'Roles Admin/Encargado/Visor. Permisos abm_*. RLS. RPC set_user_role.'],
  ['UI base Pandi', 'index.html + main.js: sidebar colapsable, login/registro, 6 vistas (Inicio, Órdenes, Cajas, Clientes, Cuenta corriente, Seguridad). Estilos Everfit. Vista Seguridad funcional (asignar rol).'],
  ['ABM Clientes', 'Listado de clientes (tabla clientes), Nuevo cliente y Editar en modal. Campos: nombre, documento, email, teléfono, dirección, activo. Solo usuarios con permiso abm_clientes pueden crear/editar.'],
  ['Vista Cajas', 'Dos cards como Panel: Efectivo y Banco (visibles según ver_cajas_efectivo y ver_cajas_banco). Permisos granulares Ver Efectivo / Ver Banco; al desactivar Ver u Operar en Seguridad se muestra mensaje aclaratorio. Filtro por moneda y tabla de movimientos; ABM movimientos y tipos según permisos.'],
  ['ABM Tipos de movimiento de caja', 'Integrado en Cajas: listado, Nuevo tipo, Editar. Nombre, Dirección (Ingreso/Egreso), Activo. Permiso abm_tipos_movimiento_caja.'],
  ['Iconos y botones', 'Iconos por moneda (USA/Euro/Argentina). Todo botón de acción con icono a la izquierda (Entrar, Guardar, Editar, Nuevo, Cancelar, etc.).'],
  ['Vista Órdenes', 'Listado, Nueva orden y Editar. Estados: cotización, cerrada, concertada. Al concertar se generan movimientos de caja y cuenta corriente (evita doble concertación).'],
  ['Edición movimientos de caja', 'Editar movimiento: manual (todos los campos) o por orden (solo concepto y fecha).'],
  ['Vista Cuenta corriente', 'Saldo = compromiso por órdenes no ejecutadas menos movimientos. Órdenes cerradas no suman al compromiso (la ganancia queda solo en movimientos). Tabla por moneda; filtro Cliente/Intermediario; botón Refrescar. Modal detalle: saldos, movimientos y Operaciones que participan.'],
  ['Modales', 'Tamaño amplio (95vw, 92vh). Arrastrables por el header para mover; al cerrar se resetea posición. Estructura .modal-backdrop > .modal > .modal-header + .modal-body.'],
  ['Vista Inicio', 'Saldos de las 3 cajas y accesos rápidos a Órdenes, Cajas, Clientes, Cuenta corriente. Título de vista solo en el header (sin duplicado en el contenido).'],
  ['Panel de Control (Inicio)', 'Tarjetas Efectivo y Banco: Saldo Inicial, Saldo Actual (fila destacada), Var. con icono tendencia; USD/ARS/EUR (Efectivo) y USD/ARS (Banco); iconos por moneda. Cards Órdenes pendientes (por estado, ojo por fila y en título) y Transacciones pendientes (cantidad en círculo); mismo ancho que Efectivo.'],
  ['Convención y corrección CC', 'Signos correctos al concertar. sql/corregir_signos_cuenta_corriente.sql para corregir datos ya cargados.'],
  ['Edición movimientos cuenta corriente', 'En vista Cuenta corriente, botón Editar por movimiento. Modal: concepto y fecha. Permiso abm_ordenes.'],
  ['Responsividad móvil', 'Media queries 768px y 480px. Touch 44px, tablas con scroll táctil, modales y cards adaptados, formularios en una columna en móvil.'],
  ['Mensajería toast', 'Todos los avisos y errores con showToast() (success/error/info) en lugar de alert(). Aplicado a órdenes, transacciones, movimientos caja/CC, clientes, intermediarios, tipos movimiento, roles.'],
  ['Movimientos caja efectivo/banco', 'En nuevo movimiento de caja: selector Caja (Efectivo o Banco). Los movimientos manuales se guardan con caja_tipo; saldos por tipo en vista Cajas.'],
  ['Conceptos cuenta corriente', 'Textos más claros en CC: Conversión de moneda (ajuste por cotización), Comisión del acuerdo. Incluye compatibilidad con textos legacy al borrar/regenerar.'],
  ['Layout y responsive', 'Contenedor principal hasta 1600px. Móvil: safe area, overflow-x hidden, todos los tabla-wrap con scroll táctil, toasts y form-actions adaptados a 480px.'],
  ['Permisos granulares órdenes', 'Siete permisos: Ingresar/Editar/Anular Orden, Editar Estado de Orden, Ingresar/Editar/Eliminar Transacciones. Sin abm_ordenes. RLS y frontend (Órdenes, panel, wizard, transacciones pendientes, CC) usan solo estos permisos; orden en Seguridad según lista acordada.'],
  ['Permisos de vistas', 'Permisos ver_inicio, ver_ordenes, ver_cajas, ver_clientes, ver_intermediarios, ver_cuenta_corriente, ver_seguridad. Menú y vista por defecto según rol; redirección si no tiene permiso. Migración sql/migracion_permisos_vistas.sql.'],
  ['Panel de Control parametrizable', 'Tres permisos: ver_inicio_efectivo, ver_inicio_banco, ver_inicio_pendientes. En Inicio se muestran/ocultan tarjetas Efectivo, Banco y bloque Pendientes según permiso. Por defecto visor solo tarjetas de pendientes.'],
  ['Módulo Seguridad mejorado', 'Permisos por rol agrupados por opción de menú; cada ítem colapsable (por defecto cerrado). Encabezado del rol sticky; toggles on/off clicables. Ver/Operar con leyendas desde app_permission. Al desactivar el acceso al menú (padre) se desactivan también los hijos de ese ítem. Intermediarios incluye Operar (abm_intermediarios).'],
  ['Logo y favicon', 'Logo de app y favicon de pestaña generados desde Emoji-de-WhatsApp-panda.jpg. Recorte central 675x675 (sips cropOffset 0 262), PNG 192/32/16. Logo en header y login en círculo (object-fit contain); z-index para que no lo tape el sidebar; cache-bust en favicon.'],
  ['Tipo de operación y monedas en orden', 'En Nueva orden / Editar orden, el tipo de operación define monedas: primera = recibida, segunda = entregada. Los selects se rellenan y deshabilitan (gris).'],
  ['Instrumentación sin intermediario', 'Órdenes sin intermediario (USD-USD, ARS-USD, USD-ARS, ARS-ARS): al abrir instrumentación vacía se generan automáticamente dos transacciones (ingreso y egreso en efectivo).'],
  ['Anulación de órdenes y baja de transacciones', 'Estado anulada en órdenes. Botón Anular en tabla y en modal de orden. Botón Eliminar por transacción (dar de baja). Mensajería interna: showConfirm (modal) en lugar de confirm(); regla en .cursor/rules.'],
  ['Estado de orden al instrumentar', 'Al auto-completar instrumentación (sin intermediario o cheque con intermediario) se llama actualizarEstadoOrden: la orden pasa de Pendiente Instrumentar a Instrumentación Parcial o Cerrada en Ejecución.'],
  ['Presentación comercial (PPT)', 'Script presentacion/crear_presentacion_pptx.py genera Propuesta_Pandi.pptx desde Bitácora Presupuesto. Barra azul (#0d2137), logo transparente con contorno blanco, paginado "actual / total", interlineados y leyendas mejorados.'],
  ['Filtros en Órdenes pendientes', 'En el modal Órdenes pendientes (Panel de Control): filtros por Cliente, Intermediario y Estado; misma vista-toolbar y estilos que Transacciones pendientes; filtrado en memoria y re-render al cambiar.'],
  ['Tiempo de inactividad', 'En Seguridad (solo Admin): parámetro en minutos. Tras X minutos sin actividad (clic, teclado, scroll) se cierra la sesión automáticamente. Tabla app_config; script sql/app_config_session_timeout.sql.'],
  ['Sidebar colapsable', 'Menú lateral colapsable. Cuando está colapsado: borde derecho y sombra; botón con fondo, borde y flecha grande para expandir; al expandir, botón con flecha para contraer. Aria-label y title dinámicos.'],
  ['Carpeta assets', 'Logos e iconos en assets/: favicon, logo app, Icono_Dolar/ARS/Euro, cash.png, Banco.webp, SP_logo.svg. En la app se usan como /assets/nombre.ext. Script PPT usa assets/SP_logo.svg.'],
  ['Modal Nueva/Editar transacción', 'Un solo campo Monto (moneda de la transacción: ingreso = moneda recibida, egreso = moneda entregada). En operaciones con dos monedas: tipo de cambio solo lectura y monto calculado = conversión inversa (ARS→÷TC, USD/EUR→×TC). Modo de pago por defecto Ninguno con validación; mensajería interna.'],
  ['Tipos de operación: moneda_in/moneda_out y ABM', 'Tabla tipos_operacion con moneda_in y moneda_out (fuente de verdad). Lógica de orden y transacción usa esas columnas; fallback a parsear código. ABM Tipos de operación: vista en menú (permiso abm_tipos_operacion), listado, Nuevo/Editar con código, nombre, moneda IN, moneda OUT, activo. Migración sql/migracion_tipos_operacion_moneda_abm.sql.'],
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
  ['1.5', '__HOY__', 'Nueva orden: tipo de operación define monedas (primera = recibida, segunda = entregada). Monedas recibida/entregada se rellenan y deshabilitan según tipo; estilo gris para selects deshabilitados.'],
  ['1.6', '__HOY__', 'Instrumentación sin intermediario: auto-generación de transacciones para USD-USD, ARS-USD, USD-ARS y ARS-ARS. Al abrir instrumentación vacía se crean dos transacciones (ingreso/egreso efectivo).'],
  ['1.7', '__HOY__', 'CC intermediario: conciliación por moneda (Debe ≤ Haber), un movimiento Comisión cuando hay tope. Transacciones: moneda/tipo según tipo operación. Orden: distribución comisión visible y editable con intermediario; alerta si 0% intermediario (todos los tipos); ARS-USD en split y validaciones.'],
  ['1.8', '__HOY__', 'ARS-USD/USD-ARS (sin comisión, montos desde TC). Anulación de órdenes y baja de transacciones. Mensajería interna: showConfirm. Estado de orden se actualiza al instrumentar (auto-complete). ARS-DOLAR eliminado.'],
  ['1.9', '__HOY__', 'Permisos reordenados: 7 granulares (Ingresar/Editar/Anular Orden, Editar Estado Orden, Ingresar/Editar/Eliminar Transacciones). Eliminado abm_ordenes. Migración SQL y RLS; frontend solo usa los 7 permisos.'],
  ['1.10', '__HOY__', 'Panel de Control: tarjetas Efectivo/Banco (Saldo Inicial, Saldo Actual destacado, Var. con tendencia); Órdenes pendientes por estado con ojo por fila; Transacciones pendientes con número en círculo; mismo ancho que Efectivo.'],
  ['1.11', '__HOY__', 'Permisos de vistas por perfil (ver_inicio, ver_ordenes, etc.). Panel parametrizable: tarjetas Efectivo/Banco/Pendientes por permiso (por defecto visor solo pendientes). Seguridad: agrupación Vistas/ABM, subpermisos con sangría e iconos, roles colapsados al iniciar.'],
  ['1.12', '__HOY__', 'Presentación comercial: barra azul (#0d2137), logo con fondo transparente y contorno blanco, paginado "actual / total", interlineados y leyendas mejorados.'],
  ['1.13', '__HOY__', 'Filtros en modal Órdenes pendientes: Cliente, Intermediario y Estado. Regla de despliegue sin generación de PPT.'],
  ['1.14', '__HOY__', 'Tiempo de inactividad: cierre de sesión automático tras X minutos sin actividad (clic, teclado, scroll). Solo Admin configura en Seguridad. Tabla app_config (sql/app_config_session_timeout.sql).'],
  ['1.15', '__HOY__', 'Sidebar colapsado más visible: borde derecho, botón con fondo y flecha grande para expandir/contraer; aria-label y title dinámicos.'],
  ['1.16', '__HOY__', 'Iconos cash/Banco en tarjetas Efectivo y Banco. Reorganización: carpeta assets/ con todos los logos e iconos; rutas /assets/ en app y script PPT; regla estructura-proyecto actualizada.'],
  ['1.17', '__HOY__', 'Cuenta corriente: tabla por moneda (USD/EUR/ARS) con iconos del Panel, Positivo/Negativo, filtro Cliente/Intermediario, solo entidades con saldo; columna Acción; modales ampliados al máximo y arrastrables por el header; icono Ver detalle sin contorno/relleno; regla Modales en .cursor/rules.'],
  ['1.18', '__HOY__', 'Intermediario: revisión guardado y visualización en órdenes y modales pendientes; intermediario_id en todos los selects de orden para consistencia (refresco detalle, validación totales, actualizar estado).'],
  ['1.19', '__HOY__', 'Wizard nueva orden: corrección paso instrumentación; al guardar la primera transacción se puede seguir agregando en el mismo paso (fix canEditarTr en renderWizardList).'],
  ['1.20', '__HOY__', 'Cuenta corriente: todos los movimientos en cualquier estado; Caja solo ejecutada. Auto-complete instrumentación genera CC; doc CUENTA_CORRIENTE_Y_CAJA.md.'],
  ['1.21', '__HOY__', 'Permisos por menú: menús colapsables (por defecto cerrados), encabezado rol sticky, toggles on/off clicables. Cajas: Ver Efectivo/Banco granular (ver_cajas_efectivo, ver_cajas_banco); tarjetas solo con permiso específico. Intermediarios: Operar (abm_intermediarios) en Seguridad. Cascada: al desactivar acceso al menú se desactivan también los hijos de ese ítem.'],
  ['1.22', '__HOY__', 'Cuenta corriente: compromiso solo por órdenes no ejecutadas (ganancia no como saldo del cliente). Refresh del modal con saldos y operaciones; botón Refrescar. Lista incluye todos los clientes/intermediarios y quienes tengan compromiso; misma lógica para intermediario.'],
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
  ['Bitácora', 'Node.js + SheetJS (xlsx). Script scripts/crear-bitacora-excel.js genera Bitacora_tareas.xlsx con Log, Resumen, Ref Git y Vercel, Versiones, Tecnología, Presupuesto.'],
];
const wsTecnologia = XLSX.utils.aoa_to_sheet(tecnologia);
wsTecnologia['!cols'] = [{ wch: 18 }, { wch: 95 }];

// --- Hoja Presupuesto (propuesta comercial; el PPT toma los datos de aquí)
// Editar aquí horas/importes; al agregar nuevas líneas por código, poner "Sí" en columna Nuevo para formatear en otro color en Excel.
const presupuesto = [
  ['Funcionalidad', 'Horas hombre', 'Importe (USD)', 'Nuevo'],
  ['Setup y arquitectura (repo Supabase Vercel config)', 12, 456, ''],
  ['Autenticación y seguridad (Auth roles permisos RLS)', 24, 912, ''],
  ['UI base y navegación (sidebar vistas login responsive)', 20, 760, ''],
  ['ABM Clientes (listado alta edición permisos)', 8, 304, ''],
  ['Módulo Cajas (saldos movimientos tipos Efectivo/Banco)', 24, 912, ''],
  ['Módulo Órdenes (CRUD estados concertación monedas)', 32, 1216, ''],
  ['Instrumentación y transacciones (intermediarios comisiones)', 28, 1064, ''],
  ['Cuenta corriente (cliente e intermediario conciliación)', 24, 912, ''],
  ['Panel de Control (saldos pendientes accesos parametrizable)', 16, 608, ''],
  ['Permisos granulares y control de vistas por rol', 12, 456, ''],
  ['Experiencia de usuario (toast confirm validaciones)', 8, 304, ''],
  ['Responsive y adaptación móvil (touch safe area)', 12, 456, ''],
  ['Documentación bitácora y despliegue continuo', 12, 456, ''],
  ['TOTAL', 232, 8816, ''],
];
const wsPresupuesto = XLSX.utils.aoa_to_sheet(presupuesto);
wsPresupuesto['!cols'] = [{ wch: 52 }, { wch: 14 }, { wch: 14 }, { wch: 6 }];

const outPath = path.join(__dirname, '..', 'Bitacora_tareas.xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsLog, 'Log');
XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
XLSX.utils.book_append_sheet(wb, wsRef, 'Ref Git y Vercel');
XLSX.utils.book_append_sheet(wb, wsVersiones, 'Versiones');
XLSX.utils.book_append_sheet(wb, wsTecnologia, 'Tecnología');
XLSX.utils.book_append_sheet(wb, wsPresupuesto, 'Presupuesto');

XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);
