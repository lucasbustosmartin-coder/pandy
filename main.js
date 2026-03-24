import { formatMonto, formatImporteDisplay, formatImporteParaInput, formatearCeldaMoneda, formatearCeldaMonedaConSigno, htmlTipoOperacionIconos, htmlIconoMonedaTipoOp, isHttpsUrlSegura } from './utils.js';
// XLSX se carga por script en index.html (CDN) para que funcione en producción sin bundler
const XLSX = window.XLSX;

const SUPABASE_URL = (typeof window.SUPABASE_URL !== 'undefined' && window.SUPABASE_URL) ? window.SUPABASE_URL : '';
const SUPABASE_ANON_KEY = (typeof window.SUPABASE_ANON_KEY !== 'undefined' && window.SUPABASE_ANON_KEY) ? window.SUPABASE_ANON_KEY : '';

if (!SUPABASE_ANON_KEY || !SUPABASE_URL) {
  document.body.innerHTML = '<div class="card" style="margin:2rem; color:#b91c1c;">Falta config. Copiá <code>config.example.js</code> a <code>config.js</code> y configurá SUPABASE_URL y SUPABASE_ANON_KEY.</div>';
  throw new Error('Missing Supabase config');
}

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Bucket público para iconos de tipos de operación. Ver sql/storage_bucket_tipo_operacion_iconos.sql */
const STORAGE_BUCKET_TIPO_OP_ICONOS = 'tipo-operacion-iconos';

let userPermissions = [];
let currentUserEmail = '';
let currentUserId = null;

// --- Wizard Orden + Instrumentación ---
let ordenWizardOrdenIdActual = null;
/** Si la columna ordenes.numero no existe (migración no ejecutada), se pone en false tras el primer error. */
let ordenesTieneNumeroColumn = true;
/** Ya no se crea borrador al abrir "Nueva orden"; la orden se inserta solo al guardar o ir a Instrumentación (se preserva la correlación del número). */
let ordenIdBorradorParaEliminar = null;
let ordenWizardInstrumentacionIdActual = null;

const SIDEBAR_KEY = 'pandi-sidebar-expanded';

/** Layout estrecho: menú lateral fijo + drawer con backdrop (debe coincidir con CSS max-width: 768px). */
function pandiIsMobileNavLayout() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
}

function pandiSyncSidebarBackdrop() {
  const bd = document.getElementById('sidebar-backdrop');
  const sidebar = document.getElementById('sidebar');
  if (!bd || !sidebar) return;
  const loggedIn = document.body.classList.contains('pandi-shell-logged-in');
  if (!loggedIn || sidebar.style.display === 'none' || !pandiIsMobileNavLayout()) {
    bd.classList.remove('is-visible');
    bd.setAttribute('aria-hidden', 'true');
    return;
  }
  if (sidebar.classList.contains('expanded')) {
    bd.classList.add('is-visible');
    bd.setAttribute('aria-hidden', 'false');
  } else {
    bd.classList.remove('is-visible');
    bd.setAttribute('aria-hidden', 'true');
  }
}

/** Tras elegir una vista en el menú, cerrar el drawer en móvil para ver el contenido. */
function pandiCollapseMobileSidebarAfterNav() {
  if (!pandiIsMobileNavLayout()) return;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || !sidebar.classList.contains('expanded')) return;
  sidebar.classList.remove('expanded');
  try {
    localStorage.setItem(SIDEBAR_KEY, '0');
  } catch (e) {
    /* ignore */
  }
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle) {
    toggle.setAttribute('aria-label', 'Expandir menú');
    toggle.setAttribute('title', 'Expandir menú');
  }
  pandiSyncSidebarBackdrop();
}

/** Tiempo mínimo (ms) que se muestra el spinner al cambiar de solapa, para que se vea el "trabajando". */
const VISTA_LOADING_MIN_MS = 450;
function delayMinLoading(shownAt, minMs) {
  const elapsed = Date.now() - (shownAt || 0);
  const wait = Math.max(0, (minMs || VISTA_LOADING_MIN_MS) - elapsed);
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

// Tiempo de inactividad: tras X minutos sin usar la app se cierra la sesión (configurable por Admin en Seguridad)
let lastActivityTime = 0;
let sessionTimeoutMinutes = 60;
let sessionCheckIntervalId = null;
/** Vista actual para el refresco automático de datos cada 30 s. */
let currentVistaId = 'vista-inicio';
let refreshDataIntervalId = null;
const REFRESH_DATA_INTERVAL_MS = 30000;
const SESSION_ACTIVITY_THROTTLE_MS = 30000; // actualizar lastActivityTime como máximo cada 30 s
let lastActivityUpdate = 0;
/** Evita carrera: si el usuario envía el login antes de que termine getSession() al cargar, el .then tardío no debe volver a mostrar login ni registrar de nuevo los listeners. */
let authBootstrapFromGetSessionDone = false;

function showLogin() {
  document.body.classList.remove('pandi-shell-logged-in');
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'none';
  pandiSyncSidebarBackdrop();
}

function showAppContent() {
  document.body.classList.add('pandi-shell-logged-in');
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';
  pandiSyncSidebarBackdrop();
}

function ensureProfile(session) {
  return client
    .from('user_profiles')
    .upsert({ id: session.user.id, email: session.user.email || '' }, { onConflict: 'id' })
    .then(() => client.from('app_user_profile').select('role').eq('user_id', session.user.id).maybeSingle())
    .then((res) => {
      if (res.data === null) {
        return client.from('app_user_profile').insert({ user_id: session.user.id, role: 'visor' });
      }
      return Promise.resolve();
    });
}

function setupLoginAndRegister() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  document.getElementById('link-registro').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('register-screen').style.display = 'block';
    loginError.textContent = '';
    registerError.textContent = '';
  });

  document.getElementById('link-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'block';
    loginError.textContent = '';
    registerError.textContent = '';
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    client.auth
      .signInWithPassword({
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      })
      .then((res) => {
        if (res.error) {
          loginError.textContent = res.error.message || 'Error al iniciar sesión';
          return;
        }
        authBootstrapFromGetSessionDone = true;
        onSessionReady(res.data.session);
      });
  });

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    registerError.textContent = '';
    client.auth
      .signUp({
        email: document.getElementById('register-email').value.trim(),
        password: document.getElementById('register-password').value,
      })
      .then((res) => {
        if (res.error) {
          registerError.textContent = res.error.message || 'Error al registrarse';
          return;
        }
        if (res.data.session) {
          authBootstrapFromGetSessionDone = true;
          onSessionReady(res.data.session);
        } else {
          registerError.textContent = 'Revisá tu email para confirmar la cuenta y luego iniciá sesión.';
        }
      });
  });
}

function refreshPermisosYVista() {
  client
    .rpc('get_my_permissions')
    .then((res) => {
      if (res.error) return;
      userPermissions = res.data || [];
      applyVistasMenuVisibility();
      const currentVistaId = VIEWS_CONFIG.find((r) => {
        const el = document.getElementById(r[1]);
        return el && el.style.display === 'block';
      })?.[1];
      if (currentVistaId && !canViewVista(currentVistaId)) {
        const [firstId, firstTitle] = getFirstAllowedView();
        showView(firstId, firstTitle);
      }
    });
}

function showView(vistaId, pageTitle) {
  if (!canViewVista(vistaId)) {
    const [firstId, firstTitle] = getFirstAllowedView();
    showView(firstId, firstTitle);
    return;
  }
  currentVistaId = vistaId;
  ['vista-inicio', 'vista-ordenes', 'vista-cajas', 'vista-clientes', 'vista-intermediarios', 'vista-tipos-operacion', 'vista-cuenta-corriente', 'vista-reglas-negocio', 'vista-seguridad'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === vistaId ? 'block' : 'none';
  });
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = pageTitle;
  document.querySelectorAll('.sidebar-nav .menu-item').forEach((m) => m.classList.remove('menu-item-active'));
  const activeItem = document.querySelector(`.sidebar-nav .menu-item[id="menu-${vistaId.replace('vista-', '')}"]`);
  if (activeItem) activeItem.classList.add('menu-item-active');

  if (vistaId === 'vista-seguridad') loadSeguridad();
  if (vistaId === 'vista-clientes') loadClientes();
  if (vistaId === 'vista-cajas') loadCajas();
  if (vistaId === 'vista-ordenes') loadOrdenes();
  if (vistaId === 'vista-inicio') loadInicio();
  if (vistaId === 'vista-cuenta-corriente') {
    // Evitar flash de datos viejos (ej. -200.000): mostrar loading y ocultar paneles antes de cargar.
    const ccLoading = document.getElementById('cc-loading');
    const ccContenido = document.getElementById('cc-contenido');
    const ccPanelSaldos = document.getElementById('cc-panel-saldos');
    const ccPanelMov = document.getElementById('cc-panel-movimientos');
    if (ccLoading) ccLoading.style.display = 'block';
    if (ccContenido) ccContenido.style.display = 'none';
    if (ccPanelSaldos) ccPanelSaldos.style.display = 'none';
    if (ccPanelMov) ccPanelMov.style.display = 'none';
    loadCuentaCorriente();
  }
  if (vistaId === 'vista-intermediarios') loadIntermediarios();
  if (vistaId === 'vista-tipos-operacion') loadTiposOperacion();
  if (vistaId === 'vista-reglas-negocio') loadReglasNegocioVista();
  pandiCollapseMobileSidebarAfterNav();
}

/** Mensaje al desactivar un permiso (para mostrar contexto al administrador). Solo permisos con mensaje específico. */
const MENSAJE_AL_DESACTIVAR_PERMISO = {
  ver_cajas: 'Los usuarios con este rol no podrán acceder a la vista Cajas.',
  ver_cajas_efectivo: 'Los usuarios no verán la tarjeta Efectivo en Panel de Control ni en Cajas. Si tienen Operar, igual podrán registrar movimientos en efectivo desde órdenes o transacciones.',
  ver_cajas_banco: 'Los usuarios no verán la tarjeta Banco en Panel de Control ni en Cajas. Si tienen Operar, igual podrán registrar movimientos en banco desde órdenes o transacciones.',
  ver_cajas_cheque: 'Los usuarios no verán la tarjeta Cheque (solo ARS) en Panel de Control ni en Cajas. Los movimientos con modo de pago cheque se imputan a Caja Cheque (no a efectivo).',
  abm_movimientos_caja: 'Los usuarios podrán ver los saldos (según Ver Efectivo/Banco/Cheque) pero no crear ni editar movimientos en Cajas.',
  abm_tipos_movimiento_caja: 'Los usuarios no podrán crear ni editar tipos de movimiento de caja.',
  abm_reglas_negocio: 'Sin este permiso no podrán abrir el menú crítico de reglas de cuenta corriente (riesgo de romper el modelo CC).',
};

/** Devuelve el permiso "padre" (acceso a la vista) y los "hijos" del menú que contiene este permiso. Si permission es el padre, hijos = resto Ver + Operar. */
function getMenuParentAndChildren(permission) {
  for (let i = 0; i < PERMISOS_POR_MENU.length; i++) {
    const menu = PERMISOS_POR_MENU[i];
    const inVer = (menu.ver || []).includes(permission);
    const inOperar = (menu.operar || []).includes(permission);
    if (!inVer && !inOperar) continue;
    const parentVer = menu.ver && menu.ver[0] ? menu.ver[0] : null;
    const children = [...(menu.ver || []).slice(1), ...(menu.operar || [])].filter((p) => p !== permission);
    return { parentVer, children };
  }
  return null;
}

/** Permisos agrupados por opción de menú. Ver = acceso a la vista e información; Operar = crear/editar/anular. */
const PERMISOS_POR_MENU = [
  { id: 'inicio', titulo: 'Panel de Control', ver: ['ver_inicio', 'ver_inicio_pendientes'], operar: [] },
  { id: 'ordenes', titulo: 'Órdenes', ver: ['ver_ordenes'], operar: ['ingresar_orden', 'editar_orden', 'anular_orden', 'editar_estado_orden', 'ingresar_transacciones', 'editar_transacciones', 'eliminar_transacciones'] },
  { id: 'cajas', titulo: 'Cajas', ver: ['ver_cajas', 'ver_cajas_efectivo', 'ver_cajas_banco', 'ver_cajas_cheque'], verSubPerms: ['ver_cajas_efectivo', 'ver_cajas_banco', 'ver_cajas_cheque'], operar: ['abm_movimientos_caja', 'abm_tipos_movimiento_caja'] },
  { id: 'clientes', titulo: 'Clientes', ver: ['ver_clientes'], operar: ['abm_clientes'] },
  { id: 'intermediarios', titulo: 'Intermediarios', ver: ['ver_intermediarios'], operar: ['abm_intermediarios'] },
  { id: 'tipos-operacion', titulo: 'Tipos de operación', ver: [], operar: ['abm_tipos_operacion'] },
  { id: 'cuenta-corriente', titulo: 'Cuenta corriente', ver: ['ver_cuenta_corriente'], operar: [] },
  { id: 'seguridad', titulo: 'Seguridad', ver: ['ver_seguridad'], operar: ['assign_roles'] },
  { id: 'reglas-negocio', titulo: 'Reglas de negocio (CC)', ver: [], operar: ['abm_reglas_negocio'] },
];

function loadSeguridad() {
  const loadingEl = document.getElementById('seguridad-loading');
  const wrapEl = document.getElementById('seguridad-tabla-wrap');
  const tbody = document.getElementById('seguridad-tbody');
  const permisosWrap = document.getElementById('seguridad-permisos-wrap');
  const permisosGrid = document.getElementById('seguridad-permisos-grid');
  if (!loadingEl || !wrapEl || !tbody) return;

  if (!userPermissions.includes('assign_roles')) {
    loadingEl.style.display = 'none';
    wrapEl.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="3">No tenés permiso para gestionar usuarios y roles. Solo un Admin puede asignar roles.</td></tr>';
    if (permisosWrap) permisosWrap.style.display = 'none';
    return;
  }

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';
  if (permisosWrap) permisosWrap.style.display = 'none';
  if (permisosGrid) permisosGrid.innerHTML = '';

  Promise.all([
    client.rpc('get_users_for_admin'),
    client.rpc('get_my_role'),
    client.from('app_role').select('role, label').order('role'),
    client.from('app_permission').select('permission, description').order('permission'),
    client.from('app_role_permission').select('role, permission'),
  ]).then(([rUsers, rMyRole, rRoles, rPerms, rRolePerms]) => {
    loadingEl.style.display = 'none';

    const myRole = (rMyRole && rMyRole.data != null) ? String(rMyRole.data) : '';
    const tiempoSesionWrap = document.getElementById('seguridad-tiempo-sesion-wrap');
    const inputTimeout = document.getElementById('seguridad-session-timeout-min');
    const btnGuardarTimeout = document.getElementById('seguridad-session-timeout-guardar');
    if (tiempoSesionWrap && myRole === 'admin') {
      tiempoSesionWrap.style.display = 'block';
      client.from('app_config').select('value').eq('key', 'session_timeout_minutes').maybeSingle().then((r) => {
        const val = (r && r.data && r.data.value) ? parseInt(r.data.value, 10) : 60;
        if (inputTimeout) inputTimeout.value = (val >= 1 && val <= 1440) ? val : 60;
      });
      if (btnGuardarTimeout && inputTimeout) {
        btnGuardarTimeout.replaceWith(btnGuardarTimeout.cloneNode(true));
        document.getElementById('seguridad-session-timeout-guardar').addEventListener('click', () => {
          const v = parseInt(inputTimeout.value, 10);
          if (isNaN(v) || v < 1 || v > 1440) {
            showToast('Ingresá un número entre 1 y 1440.', 'error');
            return;
          }
          client.from('app_config').upsert({ key: 'session_timeout_minutes', value: String(v), updated_at: new Date().toISOString(), updated_by: currentUserId }, { onConflict: 'key' }).then((res) => {
            if (res.error) {
              showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
              return;
            }
            sessionTimeoutMinutes = v;
            showToast('Tiempo de inactividad actualizado. Se aplicará a todas las sesiones.', 'success');
          });
        });
      }
    } else if (tiempoSesionWrap) {
      tiempoSesionWrap.style.display = 'none';
    }

    const users = rUsers.data || [];
    const roles = (rRoles.data || []).slice();

    if (rUsers.error || users.length === 0) {
      if (rUsers.error) tbody.innerHTML = '<tr><td colspan="3">Error: ' + (rUsers.error.message || '') + '</td></tr>';
      else tbody.innerHTML = '<tr><td colspan="3">No hay usuarios.</td></tr>';
      wrapEl.style.display = 'block';
    } else {
      const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      tbody.innerHTML = users
        .map((u) => {
          const uid = u.user_id;
          const email = esc(u.email || '');
          const role = u.role || 'visor';
          const optionsWithSelected = roles.map((r) => `<option value="${escapeHtml(r.role)}" ${role === r.role ? ' selected' : ''}>${escapeHtml(r.label || r.role)}</option>`).join('');
          return `<tr data-user-id="${uid}">
            <td>${email}</td>
            <td><select class="seguridad-rol" data-user-id="${uid}">${optionsWithSelected}</select></td>
            <td><button type="button" class="btn-guardar-rol btn-primary" data-user-id="${uid}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></span>Guardar</button></td>
          </tr>`;
        })
        .join('');

      tbody.querySelectorAll('.btn-guardar-rol').forEach((btn) => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-user-id');
          const row = btn.closest('tr');
          const sel = row.querySelector('.seguridad-rol');
          const newRole = sel.value;
          client
            .rpc('set_user_role', { p_user_id: uid, p_role: newRole })
            .then((r) => {
              if (r.error) showToast('Error: ' + (r.error.message || 'No se pudo guardar.'), 'error');
            });
        });
      });
      wrapEl.style.display = 'block';
    }

    const allPerms = rPerms.data || [];
    const permMap = {};
    allPerms.forEach((p) => { permMap[p.permission] = p.description || p.permission; });
    const rolePermList = rRolePerms.data || [];
    const rolePermSet = new Set(rolePermList.map((r) => r.role + '|' + r.permission));

    const iconChevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const iconVer = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const iconOperar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

    const renderPermToggle = (permKey, roleKey, permMap, isSub) => {
      const desc = escapeHtml(permMap[permKey] || permKey);
      const checked = rolePermSet.has(roleKey + '|' + permKey);
      const id = 'perm-' + roleKey + '-' + permKey.replace(/_/g, '-');
      const rowClass = 'seguridad-perm-row' + (isSub ? ' seguridad-perm-row-sub' : '');
      const labelContent = isSub ? `<span class="seguridad-perm-bullet" aria-hidden="true"></span><span>${desc}</span>` : desc;
      return `<div class="${rowClass}">
        <label for="${id}">${labelContent}</label>
        <span class="toggle-switch">
          <input type="checkbox" id="${id}" class="seguridad-perm-toggle" data-role="${roleKey}" data-permission="${permKey}" ${checked ? ' checked' : ''} />
          <span class="slider"></span>
        </span>
      </div>`;
    };

    const renderMenuBlock = (menu, roleKey, permMap) => {
      const verPerms = (menu.ver || []).filter((p) => permMap[p]);
      const operarPerms = (menu.operar || []).filter((p) => permMap[p]);
      if (verPerms.length === 0 && operarPerms.length === 0) return '';
      const titulo = escapeHtml(menu.titulo);
      const menuBodyId = `seguridad-menu-body-${roleKey}-${menu.id}`;
      const menuHeaderId = `seguridad-menu-header-${roleKey}-${menu.id}`;
      let bodyHtml = '';
      if (verPerms.length > 0) {
        const verSubPerms = menu.verSubPerms || [];
        bodyHtml += `<div class="seguridad-permisos-subgrupo"><span class="seguridad-permisos-subgrupo-label"><span class="seguridad-permisos-grupo-icono" aria-hidden="true">${iconVer}</span>Ver</span><p class="seguridad-permisos-subgrupo-leyenda">Acceso a la vista y a la información.</p>`;
        verPerms.forEach((p) => { bodyHtml += renderPermToggle(p, roleKey, permMap, verSubPerms.includes(p)); });
        bodyHtml += '</div>';
      }
      if (operarPerms.length > 0) {
        bodyHtml += `<div class="seguridad-permisos-subgrupo"><span class="seguridad-permisos-subgrupo-label"><span class="seguridad-permisos-grupo-icono" aria-hidden="true">${iconOperar}</span>Operar</span><p class="seguridad-permisos-subgrupo-leyenda">Crear, editar o anular según corresponda.</p>`;
        operarPerms.forEach((p) => { bodyHtml += renderPermToggle(p, roleKey, permMap, false); });
        bodyHtml += '</div>';
      }
      return `<div class="seguridad-permisos-por-menu seguridad-permisos-menu-colapsable collapsed" data-menu="${menu.id}">
        <button type="button" class="seguridad-permisos-menu-header" id="${menuHeaderId}" aria-expanded="false" aria-controls="${menuBodyId}" aria-label="Expandir ${titulo}">
          <span class="seguridad-permisos-menu-titulo">${titulo}</span>
          <span class="seguridad-permisos-menu-chevron" aria-hidden="true">${iconChevron}</span>
        </button>
        <div class="seguridad-permisos-menu-body" id="${menuBodyId}" role="region" aria-labelledby="${menuHeaderId}">${bodyHtml}</div>
      </div>`;
    };

    if (permisosGrid && roles.length > 0 && allPerms.length > 0) {
      permisosGrid.innerHTML = roles
        .map((r) => {
          const roleKey = r.role;
          const label = escapeHtml(r.label || roleKey);
          const blocksByMenu = PERMISOS_POR_MENU.map((menu) => renderMenuBlock(menu, roleKey, permMap)).filter(Boolean).join('');
          return `<div class="seguridad-permisos-rol" data-role="${roleKey}">
            <button type="button" class="seguridad-permisos-rol-header" aria-expanded="false" aria-controls="seguridad-rol-body-${roleKey}" id="seguridad-rol-header-${roleKey}">
              <span>${label}</span>
              <span class="seguridad-permisos-rol-chevron" aria-hidden="true">${iconChevron}</span>
            </button>
            <div class="seguridad-permisos-rol-body" id="seguridad-rol-body-${roleKey}" role="region" aria-labelledby="seguridad-rol-header-${roleKey}">${blocksByMenu}</div>
          </div>`;
        })
        .join('');

      permisosGrid.querySelectorAll('.seguridad-permisos-rol-header').forEach((btn) => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.seguridad-permisos-rol');
          if (!card) return;
          const isExpanded = card.classList.toggle('expanded');
          btn.setAttribute('aria-expanded', isExpanded);
          btn.setAttribute('aria-label', isExpanded ? 'Contraer rol' : 'Expandir rol');
        });
      });

      permisosGrid.querySelectorAll('.seguridad-permisos-menu-header').forEach((btn) => {
        btn.addEventListener('click', () => {
          const block = btn.closest('.seguridad-permisos-menu-colapsable');
          if (!block) return;
          block.classList.toggle('collapsed');
          const isExpanded = !block.classList.contains('collapsed');
          btn.setAttribute('aria-expanded', isExpanded);
          const titulo = block.querySelector('.seguridad-permisos-menu-titulo');
          const name = titulo ? titulo.textContent.trim() : 'menú';
          btn.setAttribute('aria-label', isExpanded ? `Contraer ${name}` : `Expandir ${name}`);
        });
      });

      permisosGrid.querySelectorAll('.seguridad-perm-toggle').forEach((chk) => {
        chk.addEventListener('change', function () {
          const role = this.getAttribute('data-role');
          const permission = this.getAttribute('data-permission');
          const enable = this.checked;
          if (enable) {
            client.from('app_role_permission').insert({ role, permission }).then((res) => {
              if (res.error) {
                showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
                this.checked = false;
              } else {
                showToast('Permiso activado.', 'success');
              }
            });
            return;
          }
          const menuInfo = getMenuParentAndChildren(permission);
          const isParent = menuInfo && menuInfo.parentVer === permission;
          const toRemove = (isParent && menuInfo.children)
            ? menuInfo.children.filter((p) => permMap[p])
            : [];
          const removeParent = () => {
            client.from('app_role_permission').delete().eq('role', role).eq('permission', permission).then((res) => {
              if (res.error) {
                showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
                this.checked = true;
              } else {
                if (toRemove.length > 0) {
                  showToast('Se desactivó el acceso al menú y también los demás permisos de este ítem (sin acceso no aplican).', 'info');
                } else {
                  const msg = MENSAJE_AL_DESACTIVAR_PERMISO[permission];
                  if (msg) showToast(msg, 'info');
                  else showToast('Permiso desactivado.', 'success');
                }
              }
            });
          };
          if (toRemove.length === 0) {
            removeParent();
            return;
          }
          Promise.all(toRemove.map((p) => client.from('app_role_permission').delete().eq('role', role).eq('permission', p))).then(() => {
            toRemove.forEach((p) => {
              const other = permisosGrid.querySelector(`.seguridad-perm-toggle[data-role="${role}"][data-permission="${p}"]`);
              if (other) other.checked = false;
            });
            removeParent();
          });
        });
      });
      if (permisosWrap) permisosWrap.style.display = 'block';
    }
  });
}

/** Fecha calendario YYYY-MM-DD en zona Argentina (operación del negocio). */
function fechaHoyYYYYMMDDArgentina() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year').value;
  const mo = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return y + '-' + mo + '-' + d;
}

// --- Cajas ---
let cajasMonedaActual = 'TODO';
/** Tabla movimientos: por defecto solo el día (fechas en AR); «Todo el historial» sin filtro de fecha. */
let cajasMovMostrarTodoHistorial = false;
let cajasMovFechaDesde = '';
let cajasMovFechaHasta = '';
/** 'todo' | 'efectivo' | 'banco' | 'cheque' — filtro de la tabla (no afecta saldos de las cards). */
let cajasMovCajaTipoTab = 'todo';
let cajasMovFiltrosListenersAttached = false;
/** Solapa principal vista Cajas: 'movimientos' | 'tipos' (mismo patrón que CC). */
let cajasVistaSolapa = 'movimientos';
let tiposMovimientoCaja = [];

/** Concepto para movimientos de cuenta corriente: "Cobro por USD 5.000,00" (Pandy cobró), "Deuda por ARS 4.170.000,00" (Pandy debe), "Pago por comisión USD 60,00". */
function conceptoCcMovimiento(moneda, monto, tipo) {
  const m = Number(monto) || 0;
  const mon = moneda || 'USD';
  const txt = mon + ' ' + formatMonto(m, mon);
  if (tipo === 'comision') return 'Pago por comisión ' + txt;
  if (tipo === 'cobro') return 'Cobro por ' + txt;
  if (tipo === 'deuda') return 'Deuda por ' + txt;
  return 'Pago por ' + txt;
}

/** Leyenda de concepto + " - Orden Nro x" (ordenLabel suele ser "nro orden 1"). Para que todo movimiento CC lleve referencia a la orden. */
function conceptoConOrden(leyenda, ordenLabel) {
  if (!leyenda) return (ordenLabel || '').replace('nro orden ', 'Orden Nro ');
  const sufijo = ordenLabel ? ' - ' + (ordenLabel + '').replace('nro orden ', 'Orden Nro ') : '';
  return leyenda + sufijo;
}

/** Leyendas unificadas para movimientos CC: "Pago Realizado - Orden x y Trans x", "Cobro Realizado - Orden x y Trans x", "Compromiso de Pago - Orden x y Trans x", "Compromiso a Cobrar - Orden x y Trans x". El Originante del movimiento es siempre el Pagador de la transacción. */
function conceptoCcLeyenda(tipo, ordenNumero, transNumero) {
  const ord = ordenNumero != null && ordenNumero !== '' ? String(ordenNumero) : '?';
  const tr = transNumero != null && transNumero !== '' ? String(transNumero) : '?';
  const suf = ' - Orden ' + ord + ' y Trans ' + tr;
  if (tipo === 'cobro_realizado') return 'Cobro Realizado' + suf;
  if (tipo === 'pago_realizado') return 'Pago Realizado' + suf;
  if (tipo === 'compromiso_pago') return 'Compromiso de Pago' + suf;
  if (tipo === 'compromiso_cobrar') return 'Compromiso a Cobrar' + suf;
  if (tipo === 'comision_acuerdo') return 'Comisión del acuerdo' + suf;
  return 'Movimiento' + suf;
}

/**
 * Convención para concepto de movimiento de caja originado por una transacción.
 * Formato: "Ingreso de [moneda], por [monto], nro orden [nro], nro transacción [nro]" o "Egreso de ...".
 * nroOrden y nroTransaccion pueden ser null/undefined; en ese caso se omite esa parte o se pone "?".
 */
function conceptoCajaTransaccion(esIngreso, moneda, monto, nroOrden, nroTransaccion) {
  const tipo = esIngreso ? 'Ingreso' : 'Egreso';
  const mon = (moneda || 'USD').toUpperCase();
  const montoStr = formatMonto(Math.abs(Number(monto)) || 0, mon);
  const ord = nroOrden != null && nroOrden !== '' ? String(nroOrden) : '?';
  const trx = nroTransaccion != null && nroTransaccion !== '' ? String(nroTransaccion) : '?';
  return tipo + ' de ' + mon + ', por ' + montoStr + ', nro orden ' + ord + ', nro transacción ' + trx;
}

/**
 * Igual que conceptoCajaTransaccion pero con un concepto especial (ej. "Ganancia del acuerdo", "Comisión del acuerdo").
 * Formato: "[Concepto]. Ingreso de [moneda], por [monto], nro orden [nro], nro transacción [nro]".
 */
function conceptoCajaTransaccionEspecial(nombreConcepto, moneda, monto, nroOrden, nroTransaccion) {
  const base = conceptoCajaTransaccion(true, moneda, monto, nroOrden, nroTransaccion);
  return (nombreConcepto || 'Transacción') + '. ' + base;
}

/** Objeto monto_usd, monto_ars, monto_eur para inserts en movimientos_cuenta_corriente. Moneda que participa = valor; las demás = 0 (nunca null). */
function montosCcPorMoneda(moneda, valor) {
  const v = Number(valor) || 0;
  const mon = (moneda || 'USD').toUpperCase();
  return {
    monto_usd: mon === 'USD' ? v : 0,
    monto_ars: mon === 'ARS' ? v : 0,
    monto_eur: mon === 'EUR' ? v : 0,
  };
}

/**
 * Montos CC cuando la orden tiene dos monedas (monR, monE): la fila debe llevar el mismo importe económico en AMBAS monedas (con signo que corresponda).
 * monedaTransaccion + valorTransaccion = monto de la transacción; se convierte a la otra moneda con mr/me para que nunca quede 0 en una moneda participante.
 */
function montosCcPorOrden(monR, monE, mr, me, monedaTransaccion, valorTransaccion) {
  const v = numCc(valorTransaccion);
  const mR = (monR || 'USD').toUpperCase();
  const mE = (monE || 'USD').toUpperCase();
  const mon = (monedaTransaccion || 'USD').toUpperCase();
  if (mR === mE) return montosCcPorMoneda(mon, v);
  const enMonR = mon === mR ? v : ratioCc(v * mr, me, v);
  const enMonE = mon === mE ? v : ratioCc(v * me, mr, v);
  return {
    monto_usd: mR === 'USD' ? numCc(enMonR) : (mE === 'USD' ? numCc(enMonE) : 0),
    monto_ars: mR === 'ARS' ? numCc(enMonR) : (mE === 'ARS' ? numCc(enMonE) : 0),
    monto_eur: mR === 'EUR' ? numCc(enMonR) : (mE === 'EUR' ? numCc(enMonE) : 0),
  };
}

/** División segura para montos CC: evita NaN e infinitos. Si denominador es 0 o muy chico, devuelve fallback (nunca null). */
function ratioCc(num, denom, fallback) {
  const d = Number(denom);
  if (d == null || isNaN(d) || Math.abs(d) < 1e-6) return fallback != null ? Number(fallback) || 0 : 0;
  const q = Number(num) / d;
  if (q == null || isNaN(q) || !isFinite(q)) return fallback != null ? Number(fallback) || 0 : 0;
  return q;
}

/** Asegura que un monto por moneda para CC nunca sea null; si es NaN o no numérico, devuelve 0. Para monedas participantes no usar 0 cuando hay monto real (evitar en el cálculo). */
function numCc(val) {
  const n = Number(val);
  return (n != null && !isNaN(n) && isFinite(n)) ? n : 0;
}

/** Montos para movimiento "Cancelación de deuda" a partir de la transacción y la orden. Usa siempre el monto de la transacción (item.monto), no mr/me. En órdenes misma moneda (monR === monE) se usa solo ese monto en la moneda participante. */
function montosCancelacionDesdeOrden(item, orden) {
  const monR = (orden.moneda_recibida || 'USD').toUpperCase();
  const monE = (orden.moneda_entregada || 'USD').toUpperCase();
  const mr = Number(orden.monto_recibido) || 0;
  const me = Number(orden.monto_entregado) || 0;
  const montoTrx = Number(item.monto) || 0;
  const esIngreso = (item.pagador || '').toLowerCase() === 'cliente';
  if (monR === monE) {
    const signo = esIngreso ? 1 : -1;
    return {
      monto_usd: numCc(monR === 'USD' ? signo * montoTrx : 0),
      monto_ars: numCc(monR === 'ARS' ? signo * montoTrx : 0),
      monto_eur: numCc(monR === 'EUR' ? signo * montoTrx : 0),
    };
  }
  if (esIngreso) {
    const enMonE = ratioCc(montoTrx * me, mr, montoTrx);
    return {
      monto_usd: numCc(monR === 'USD' ? montoTrx : (monE === 'USD' ? enMonE : 0)),
      monto_ars: numCc(monR === 'ARS' ? montoTrx : (monE === 'ARS' ? enMonE : 0)),
      monto_eur: numCc(monR === 'EUR' ? montoTrx : (monE === 'EUR' ? enMonE : 0)),
    };
  }
  const enMonR = ratioCc(montoTrx * mr, me, montoTrx);
  return {
    monto_usd: numCc(monR === 'USD' ? -enMonR : (monE === 'USD' ? -montoTrx : 0)),
    monto_ars: numCc(monR === 'ARS' ? -enMonR : (monE === 'ARS' ? -montoTrx : 0)),
    monto_eur: numCc(monR === 'EUR' ? -enMonR : (monE === 'EUR' ? -montoTrx : 0)),
  };
}

/**
 * Única fuente de verdad para movimientos de caja (cerrados): sync + fetch + dedupe por id.
 * Lo usan loadCajas (cards + tabla) y loadInicio (Panel) para que los saldos coincidan siempre.
 * @returns {Promise<Array<{id, moneda, monto, concepto, fecha, caja_tipo, ...}>>}
 */
function getListaMovimientosCajaParaSaldos() {
  return sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion()
    .then(() =>
      client
        .from('movimientos_caja')
        .select('id, moneda, monto, concepto, fecha, tipo_movimiento_id, orden_id, transaccion_id, orden_numero, transaccion_numero, estado, estado_fecha, caja_tipo')
        .eq('estado', 'cerrado')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
    )
    .then((res) => {
      if (res.error) return [];
      const raw = res.data || [];
      const seenIds = new Set();
      return raw.filter((m) => {
        if (m.id != null && seenIds.has(m.id)) return false;
        if (m.id != null) seenIds.add(m.id);
        return true;
      });
    });
}

/**
 * A partir de la lista de movimientos (de getListaMovimientosCajaParaSaldos), calcula saldos por caja_tipo y moneda.
 * Misma lógica que las cards de Cajas: efectivo, banco y cheque (por moneda).
 */
function saldosCajaDesdeLista(list) {
  const saldos = { efectivo: { USD: 0, EUR: 0, ARS: 0 }, banco: { USD: 0, EUR: 0, ARS: 0 }, cheque: { USD: 0, EUR: 0, ARS: 0 } };
  (list || []).forEach((m) => {
    const tipo = (m.caja_tipo || 'efectivo').toLowerCase();
    const moneda = (m.moneda || '').toUpperCase();
    if (saldos[tipo] && saldos[tipo][moneda] != null) saldos[tipo][moneda] += Number(m.monto);
  });
  return saldos;
}

/**
 * Devuelve true si existe al menos un tipo de operación activo que use la moneda en IN u OUT.
 * Si hay error de consulta, fallback conservador: true (no ocultar columna).
 */
function hayTipoOperacionActivoConMoneda(moneda) {
  const mon = String(moneda || '').toUpperCase().trim();
  if (!mon) return Promise.resolve(true);
  return client
    .from('tipos_operacion')
    .select('id', { head: true, count: 'exact' })
    .eq('activo', true)
    .or(`moneda_in.eq.${mon},moneda_out.eq.${mon}`)
    .then((res) => {
      if (res.error) return true;
      return Number(res.count || 0) > 0;
    })
    .catch(() => true);
}

const MONEDAS_PANEL_CAJA_EFECTIVO = ['USD', 'ARS', 'EUR'];
const MONEDAS_PANEL_CAJA_BANCO = ['USD', 'ARS'];

/** Monedas en UI CC (resumen y movimientos): mismo criterio que Panel/Cajas (`hayTipoOperacionActivoConMoneda`). Orden resumen = USD, EUR, ARS. */
const MONEDAS_CC_UI = ['USD', 'EUR', 'ARS'];
/** Orden de columnas monetarias en tablas de movimientos CC (vista + modal). */
const MONEDAS_CC_MOVIMIENTOS_COLS = ['USD', 'ARS', 'EUR'];
let ccUiMonedasVisibles = { USD: true, EUR: true, ARS: true };

/**
 * Cruce con tipo de cambio (misma convención que ARS-USD / USD-ARS, anclado en USD o en EUR).
 * - compra_usd / compra_eur: el cliente compra la moneda entregada (USD o EUR); la otra fiat se calcula con tc = unidades de la moneda recibida por 1 unidad entregada.
 * - vende_usd / vende_eur: el cliente vende la moneda recibida (USD o EUR); la otra se calcula con tc.
 * No aplica a USD-USD ni CHEQUE-ARS.
 */
function patronTipoCambioOrden(recNorm, entNorm) {
  const r = (recNorm || '').toUpperCase();
  const e = (entNorm || '').toUpperCase();
  if (!r || !e || r === e) return '';
  const fiat = ['USD', 'EUR', 'ARS'];
  if (!fiat.includes(r) || !fiat.includes(e)) return '';
  if (e === 'USD' && r !== 'USD') return 'compra_usd';
  if (r === 'USD' && e !== 'USD') return 'vende_usd';
  if (e === 'EUR' && r !== 'EUR') return 'compra_eur';
  if (r === 'EUR' && e !== 'EUR') return 'vende_eur';
  return '';
}

/** compra_usd o compra_eur: TC × monto entregado → monto recibido. */
function esPatronCompraFiatConTc(p) {
  return p === 'compra_usd' || p === 'compra_eur';
}
/** vende_usd o vende_eur: monto recibido × TC → monto entregado. */
function esPatronVendeFiatConTc(p) {
  return p === 'vende_usd' || p === 'vende_eur';
}

function reaplicarVisibilidadMonedasCuentaCorrienteDom() {
  ['#vista-cuenta-corriente', '#modal-cc-detalle-backdrop'].forEach((sel) => {
    const root = document.querySelector(sel);
    if (!root) return;
    MONEDAS_CC_UI.forEach((m) => {
      const show = !!ccUiMonedasVisibles[m];
      root.querySelectorAll(`[data-cc-moneda-col="${m}"]`).forEach((el) => {
        el.style.display = show ? '' : 'none';
      });
    });
  });
}

/** Aplica visibilidad USD/EUR/ARS en CC según tipos de operación activos (IN/OUT). */
function aplicarVisibilidadMonedasCuentaCorriente(flagsRaw) {
  ccUiMonedasVisibles = normalizarFlagsCajaMonedas(flagsRaw, MONEDAS_CC_UI);
  reaplicarVisibilidadMonedasCuentaCorrienteDom();
}

function ccColspanResumenSaldosVacio() {
  const n = MONEDAS_CC_UI.filter((m) => ccUiMonedasVisibles[m]).length;
  return 1 + n + 1;
}

function ccColspanVistaDetalleMovimientos() {
  const n = MONEDAS_CC_MOVIMIENTOS_COLS.filter((m) => ccUiMonedasVisibles[m]).length;
  return 5 + n + 3;
}

function ccColspanModalDetalleMovimientos() {
  const n = MONEDAS_CC_MOVIMIENTOS_COLS.filter((m) => ccUiMonedasVisibles[m]).length;
  return 5 + n + 1;
}

function htmlCcModalSaldosCards(saldos) {
  const sal = saldos || { USD: 0, EUR: 0, ARS: 0 };
  const iconUrls = { USD: '/assets/Icono_Dolar.avif', EUR: '/assets/Icono_Euro.avif', ARS: '/assets/Icono_ARS.webp' };
  return MONEDAS_CC_UI.map((mon) => {
    const s = Number(sal[mon]) || 0;
    const label = s >= 0 ? 'Positivo' : 'Negativo';
    const val = formatMonto(s >= 0 ? s : -s, mon);
    const cls = 'valor ' + (s >= 0 ? 'positivo' : 'negativo');
    return `<div class="card" data-cc-moneda-col="${mon}" style="min-width:120px;"><span class="card-titulo"><img src="${iconUrls[mon]}" alt="" class="cc-icono-moneda" width="20" height="20"/> ${mon}</span><span class="cc-saldo-label" aria-hidden="true">${label}</span><span class="${cls}">${val}</span></div>`;
  }).join('');
}

function normalizarFlagsCajaMonedas(flags, ordenKeys) {
  const out = {};
  ordenKeys.forEach((k) => { out[k] = !!(flags && flags[k]); });
  if (ordenKeys.every((k) => !out[k])) ordenKeys.forEach((k) => { out[k] = true; });
  return out;
}

function labelWidthRemPanelCaja() {
  try {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches ? '5.5rem' : '6.5rem';
  } catch (_) {
    return '6.5rem';
  }
}

/** Oculta columnas USD/ARS/EUR (Efectivo) y USD/ARS (Banco) en Panel y Cajas si ningún tipo de operación activo usa esa moneda en IN/OUT. */
function setVisibilidadColumnasMonedasPanelCajas(efectivoFlagsRaw, bancoFlagsRaw) {
  const ef = normalizarFlagsCajaMonedas(efectivoFlagsRaw, MONEDAS_PANEL_CAJA_EFECTIVO);
  const ba = normalizarFlagsCajaMonedas(bancoFlagsRaw, MONEDAS_PANEL_CAJA_BANCO);
  const labelW = labelWidthRemPanelCaja();

  function aplicarCard(cardId, flags, ordenMonedas) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const n = ordenMonedas.filter((m) => flags[m]).length;
    const gridTpl = n === 0 ? labelW : `${labelW} repeat(${n}, minmax(0, 1fr))`;
    ordenMonedas.forEach((m) => {
      const show = !!flags[m];
      card.querySelectorAll(`[data-caja-moneda-col="${m}"]`).forEach((el) => {
        el.style.display = show ? '' : 'none';
      });
    });
    card.querySelectorAll('.inicio-caja-fila').forEach((fila) => {
      fila.style.gridTemplateColumns = gridTpl;
    });
  }

  aplicarCard('inicio-card-efectivo', ef, MONEDAS_PANEL_CAJA_EFECTIVO);
  aplicarCard('cajas-card-efectivo', ef, MONEDAS_PANEL_CAJA_EFECTIVO);
  aplicarCard('inicio-card-banco', ba, MONEDAS_PANEL_CAJA_BANCO);
  aplicarCard('cajas-card-banco', ba, MONEDAS_PANEL_CAJA_BANCO);
}

function syncCajasMovFechaInputs() {
  const dEl = document.getElementById('cajas-mov-desde');
  const hEl = document.getElementById('cajas-mov-hasta');
  if (!dEl || !hEl) return;
  if (cajasMovMostrarTodoHistorial) {
    dEl.value = '';
    hEl.value = '';
    return;
  }
  dEl.value = cajasMovFechaDesde || '';
  hEl.value = cajasMovFechaHasta || '';
}

/** Permisos de ver saldos/filtros por tipo de caja (alineado a cards de Cajas e Inicio). */
function getPermisosVerCajaTipoMovimientos() {
  const verEfectivo = userPermissions.includes('ver_cajas_efectivo');
  const verBanco = userPermissions.includes('ver_cajas_banco');
  const verCheque = userPermissions.includes('ver_cajas_cheque');
  const tieneAlgunoSubPerm = verEfectivo || verBanco || verCheque;
  return { verEfectivo, verBanco, verCheque, tieneAlgunoSubPerm };
}

/** Ajusta pestaña activa si el usuario ya no puede ver ese tipo o si solo puede una caja (no tiene sentido "Todas"). */
function normalizarCajasMovCajaTipoTabSegunPermisos() {
  const { verEfectivo, verBanco, verCheque, tieneAlgunoSubPerm } = getPermisosVerCajaTipoMovimientos();
  if (!tieneAlgunoSubPerm) return;
  const permitidos = [];
  if (verEfectivo) permitidos.push('efectivo');
  if (verBanco) permitidos.push('banco');
  if (verCheque) permitidos.push('cheque');
  const n = permitidos.length;
  if (n === 0) return;
  if (cajasMovCajaTipoTab === 'todo') {
    if (n === 1) cajasMovCajaTipoTab = permitidos[0];
    return;
  }
  if (!permitidos.includes(cajasMovCajaTipoTab)) {
    cajasMovCajaTipoTab = n === 1 ? permitidos[0] : 'todo';
  }
}

/** Muestra/oculta botones [data-caja-tab] según ver_cajas_efectivo/banco/cheque (misma lógica que las cards). */
function aplicarVisibilidadBotonesFiltroCajaMovimientos() {
  const { verEfectivo, verBanco, verCheque, tieneAlgunoSubPerm } = getPermisosVerCajaTipoMovimientos();
  document.querySelectorAll('[data-caja-tab]').forEach((b) => {
    const v = (b.getAttribute('data-caja-tab') || 'todo').toLowerCase();
    if (v === 'todo') {
      if (!tieneAlgunoSubPerm) b.style.display = '';
      else {
        const cuantos = [verEfectivo, verBanco, verCheque].filter(Boolean).length;
        b.style.display = cuantos >= 2 ? '' : 'none';
      }
      return;
    }
    if (!tieneAlgunoSubPerm) {
      b.style.display = '';
      return;
    }
    const show =
      (v === 'efectivo' && verEfectivo) ||
      (v === 'banco' && verBanco) ||
      (v === 'cheque' && verCheque);
    b.style.display = show ? '' : 'none';
  });
}

/** Filtra la lista completa para la tabla (moneda, tipo caja, rango fechas). Los saldos usan `list` sin este filtro. */
function filtrarMovimientosCajaVista(list) {
  const { verEfectivo, verBanco, verCheque, tieneAlgunoSubPerm } = getPermisosVerCajaTipoMovimientos();
  let filtrados = (cajasMonedaActual === 'TODO' ? list : list.filter((m) => m.moneda === cajasMonedaActual))
    .filter((m) => ['efectivo', 'banco', 'cheque'].includes((m.caja_tipo || 'efectivo').toLowerCase()));
  if (tieneAlgunoSubPerm) {
    filtrados = filtrados.filter((m) => {
      const t = (m.caja_tipo || 'efectivo').toLowerCase();
      const tipo = t === 'cheque' ? 'cheque' : t === 'banco' ? 'banco' : 'efectivo';
      if (tipo === 'efectivo') return verEfectivo;
      if (tipo === 'banco') return verBanco;
      return verCheque;
    });
  }
  if (cajasMovCajaTipoTab !== 'todo') {
    const tab = cajasMovCajaTipoTab;
    filtrados = filtrados.filter((m) => (m.caja_tipo || 'efectivo').toLowerCase() === tab);
  }
  if (!cajasMovMostrarTodoHistorial) {
    const hoyM = fechaHoyYYYYMMDDArgentina();
    const desde = cajasMovFechaDesde || hoyM;
    const hasta = cajasMovFechaHasta || hoyM;
    filtrados = filtrados.filter((m) => {
      const f = (m.fecha || '').toString().slice(0, 10);
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      return true;
    });
  }
  return filtrados;
}

function exportarMovimientosCajaExcel() {
  getListaMovimientosCajaParaSaldos().then((list) => {
    const filtrados = filtrarMovimientosCajaVista(list);
    if (filtrados.length === 0) {
      showToast('No hay movimientos para exportar con el filtro actual.', 'info');
      return;
    }
    const origenLabel = (m) => {
      if (m.tipo_movimiento_id) return 'Manual';
      if (m.transaccion_id) return 'Acuerdo';
      if (m.orden_id) return 'Orden concertada';
      return '–';
    };
    const tipoIngresoEgreso = (m) => (Number(m.monto) >= 0 ? 'Ingreso' : 'Egreso');
    const cajaTipoLabel = (m) => {
      const t = (m.caja_tipo || 'efectivo').toLowerCase();
      if (t === 'banco') return 'Banco';
      if (t === 'cheque') return 'Cheque';
      return 'Efectivo';
    };
    const header = ['Fecha', 'Origen', 'Nro orden', 'Nro transacción', 'Tipo', 'Moneda', 'Monto', 'Caja', 'Concepto'];
    const rows = filtrados.map((m) => {
      const nroOrden = m.orden_numero != null ? Number(m.orden_numero) : null;
      const nroTrans = m.transaccion_numero != null ? Number(m.transaccion_numero) : null;
      const fecha = (m.fecha || '').toString().slice(0, 10);
      return [
        fecha,
        origenLabel(m),
        nroOrden,
        nroTrans,
        tipoIngresoEgreso(m),
        (m.moneda || '').toString(),
        m.monto != null ? Number(m.monto) : null,
        cajaTipoLabel(m),
        (m.concepto || '').toString(),
      ];
    });
    const aoa = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos caja');
    const nombreArchivo = 'caja_movimientos_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, nombreArchivo);
    showToast('Exportado: ' + nombreArchivo, 'success');
  });
}

function loadCajas() {
  syncCajasPaneles();
  const loadingEl = document.getElementById('cajas-loading');
  const wrapEl = document.getElementById('cajas-tabla-wrap');
  const tbody = document.getElementById('movimientos-caja-tbody');
  const btnNuevo = document.getElementById('btn-nuevo-movimiento-caja');
  const toggleMoneda = document.getElementById('cajas-toggle-moneda');
  if (!loadingEl || !wrapEl || !tbody) return;

  const canAbm = userPermissions.includes('abm_movimientos_caja');
  if (btnNuevo) btnNuevo.style.display = canAbm ? '' : 'none';

  const verEfectivo = userPermissions.includes('ver_cajas_efectivo');
  const verBanco = userPermissions.includes('ver_cajas_banco');
  const verCheque = userPermissions.includes('ver_cajas_cheque');
  const cardEfectivo = document.getElementById('cajas-card-efectivo');
  const cardBanco = document.getElementById('cajas-card-banco');
  const cardCheque = document.getElementById('cajas-card-cheque');
  if (cardEfectivo) cardEfectivo.style.display = verEfectivo ? '' : 'none';
  if (cardBanco) cardBanco.style.display = verBanco ? '' : 'none';
  if (cardCheque) cardCheque.style.display = verCheque ? '' : 'none';

  normalizarCajasMovCajaTipoTabSegunPermisos();
  aplicarVisibilidadBotonesFiltroCajaMovimientos();

  loadingEl.style.display = 'block';
  const loadingShownAtCajas = Date.now();
  wrapEl.style.display = 'none';
  const cajasSaldoIds = ['cajas-saldo-efectivo-usd', 'cajas-saldo-efectivo-eur', 'cajas-saldo-efectivo-ars', 'cajas-saldo-banco-usd', 'cajas-saldo-banco-ars', 'cajas-saldo-cheque-ars'];
  cajasSaldoIds.forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = '–'; });

  Promise.all([
    getListaMovimientosCajaParaSaldos(),
    client.from('tipos_movimiento_caja').select('id, nombre'),
    hayTipoOperacionActivoConMoneda('USD'),
    hayTipoOperacionActivoConMoneda('ARS'),
    hayTipoOperacionActivoConMoneda('EUR'),
  ])
    .then(([list, resTipos, monUsd, monArs, monEur]) => {
    return delayMinLoading(loadingShownAtCajas).then(() => {
    loadingEl.style.display = 'none';
    const efRaw = { USD: !!monUsd, ARS: !!monArs, EUR: !!monEur };
    const baRaw = { USD: !!monUsd, ARS: !!monArs };
    setVisibilidadColumnasMonedasPanelCajas(efRaw, baRaw);
    const efVis = normalizarFlagsCajaMonedas(efRaw, MONEDAS_PANEL_CAJA_EFECTIVO);
    const baVis = normalizarFlagsCajaMonedas(baRaw, MONEDAS_PANEL_CAJA_BANCO);
    const saldos = saldosCajaDesdeLista(list);
    const tiposMap = {};
    (resTipos.data || []).forEach((t) => { tiposMap[t.id] = t.nombre || '–'; });
    const setVal = (el, valor, moneda) => {
      if (!el) return;
      el.textContent = formatMonto(valor, moneda);
      const base = el.id && el.id.startsWith('cajas-saldo-') ? 'inicio-caja-valor valor ' : 'valor ';
      el.className = base + (valor >= 0 ? 'positivo' : 'negativo');
    };
    if (efVis.USD) setVal(document.getElementById('cajas-saldo-efectivo-usd'), saldos.efectivo.USD, 'USD');
    if (efVis.ARS) setVal(document.getElementById('cajas-saldo-efectivo-ars'), saldos.efectivo.ARS, 'ARS');
    if (efVis.EUR) setVal(document.getElementById('cajas-saldo-efectivo-eur'), saldos.efectivo.EUR, 'EUR');
    if (baVis.USD) setVal(document.getElementById('cajas-saldo-banco-usd'), saldos.banco.USD, 'USD');
    if (baVis.ARS) setVal(document.getElementById('cajas-saldo-banco-ars'), saldos.banco.ARS, 'ARS');
    setVal(document.getElementById('cajas-saldo-cheque-ars'), saldos.cheque.ARS, 'ARS');

    if (!cajasMovMostrarTodoHistorial && !cajasMovFechaDesde && !cajasMovFechaHasta) {
      const hm = fechaHoyYYYYMMDDArgentina();
      cajasMovFechaDesde = hm;
      cajasMovFechaHasta = hm;
    }
    syncCajasMovFechaInputs();
    document.querySelectorAll('[data-caja-tab]').forEach((b) => {
      const v = (b.getAttribute('data-caja-tab') || 'todo').toLowerCase();
      const on = cajasMovCajaTipoTab === 'todo' ? v === 'todo' : v === cajasMovCajaTipoTab;
      b.classList.toggle('activo', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    const filtrados = filtrarMovimientosCajaVista(list);
    const origenLabel = (m) => {
      if (m.tipo_movimiento_id) return 'Manual';
      if (m.transaccion_id) return 'Acuerdo';
      if (m.orden_id) return 'Orden concertada';
      return '–';
    };
    const tipoIngresoEgreso = (m) => (Number(m.monto) >= 0 ? 'Ingreso' : 'Egreso');
    const cajaTipoLabel = (m) => {
      const t = (m.caja_tipo || 'efectivo').toLowerCase();
      if (t === 'banco') return 'Banco';
      if (t === 'cheque') return 'Cheque';
      return 'Efectivo';
    };
    const canAbmCaja = userPermissions.includes('abm_movimientos_caja');
    tbody.innerHTML = filtrados
      .map(
        (m) =>
          `<tr>
              <td>${(m.fecha || '').toString().slice(0, 10)}</td>
              <td>${escapeHtml(origenLabel(m))}</td>
              <td>${m.orden_numero != null ? escapeHtml(String(m.orden_numero)) : '–'}</td>
              <td>${m.transaccion_numero != null ? escapeHtml(String(m.transaccion_numero)) : '–'}</td>
              <td>${tipoIngresoEgreso(m)}</td>
              <td>${escapeHtml(m.moneda || '–')}</td>
              <td class="${Number(m.monto) >= 0 ? 'monto-positivo' : 'monto-negativo'}">${formatMonto(m.monto)}</td>
              <td>${cajaTipoLabel(m)}</td>
              <td class="concepto-mov-caja">${escapeHtml((m.concepto || '–').slice(0, 80))}${(m.concepto && m.concepto.length > 80) ? '…' : ''}</td>
              <td>${canAbmCaja ? `<button type="button" class="btn-editar btn-editar-mov-caja" data-id="${m.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
            </tr>`
      )
      .join('');
      if (filtrados.length === 0) tbody.innerHTML = '<tr><td colspan="10">' + (cajasMonedaActual === 'TODO' ? 'No hay movimientos.' : 'No hay movimientos en esta moneda.') + '</td></tr>';
      else {
        tbody.querySelectorAll('.btn-editar-mov-caja').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const mov = list.find((x) => String(x.id) === String(id));
            if (mov) openModalMovimientoCaja(mov);
          });
        });
      }
      wrapEl.style.display = 'block';
    });
    });

  if (cajasVistaSolapa === 'tipos') {
    loadTiposMovimientoCajaTable();
  }
}

function loadInicio() {
  const elEfectivo = document.getElementById('inicio-card-efectivo');
  const elBanco = document.getElementById('inicio-card-banco');
  const elSaldos = document.getElementById('inicio-saldos');
  const elPendientes = document.getElementById('inicio-cards-pendientes');
  const canIngresarOrden = userPermissions.includes('ingresar_orden');
  const btnChatInicio = document.getElementById('btn-orden-por-chat-inicio');
  if (btnChatInicio) btnChatInicio.style.display = canIngresarOrden ? '' : 'none';

  const elCheque = document.getElementById('inicio-card-cheque');
  const hasEfectivoPerm = userPermissions.includes('ver_cajas_efectivo');
  const hasBancoPerm = userPermissions.includes('ver_cajas_banco');
  const hasChequePerm = userPermissions.includes('ver_cajas_cheque');
  const hasPendientesPerm = userPermissions.includes('ver_inicio_pendientes');
  const hasAnyPanelCardPerm = hasEfectivoPerm || hasBancoPerm || hasChequePerm || hasPendientesPerm;
  if (hasAnyPanelCardPerm) {
    if (elEfectivo) elEfectivo.style.display = hasEfectivoPerm ? '' : 'none';
    if (elBanco) elBanco.style.display = hasBancoPerm ? '' : 'none';
    if (elCheque) elCheque.style.display = hasChequePerm ? '' : 'none';
    if (elSaldos) elSaldos.style.display = hasEfectivoPerm || hasBancoPerm || hasChequePerm ? '' : 'none';
    if (elPendientes) elPendientes.style.display = hasPendientesPerm ? '' : 'none';
  } else {
    if (elEfectivo) elEfectivo.style.display = '';
    if (elBanco) elBanco.style.display = '';
    if (elCheque) elCheque.style.display = '';
    if (elSaldos) elSaldos.style.display = '';
    if (elPendientes) elPendientes.style.display = '';
  }

  const hoy = new Date();
  const hoyStr = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.getFullYear() + '-' + String(ayer.getMonth() + 1).padStart(2, '0') + '-' + String(ayer.getDate()).padStart(2, '0');

  // Usar la misma lista y el mismo cálculo que la vista Cajas: Saldo Actual = saldos de las cards de Cajas.
  Promise.all([
    getListaMovimientosCajaParaSaldos(),
    hayTipoOperacionActivoConMoneda('USD'),
    hayTipoOperacionActivoConMoneda('ARS'),
    hayTipoOperacionActivoConMoneda('EUR'),
  ])
    .then(([list, monUsd, monArs, monEur]) => {
      const efRaw = { USD: !!monUsd, ARS: !!monArs, EUR: !!monEur };
      const baRaw = { USD: !!monUsd, ARS: !!monArs };
      setVisibilidadColumnasMonedasPanelCajas(efRaw, baRaw);
      const efVis = normalizarFlagsCajaMonedas(efRaw, MONEDAS_PANEL_CAJA_EFECTIVO);
      const baVis = normalizarFlagsCajaMonedas(baRaw, MONEDAS_PANEL_CAJA_BANCO);
      const saldoActual = saldosCajaDesdeLista(list);
      const saldoT1 = { efectivo: { USD: 0, EUR: 0, ARS: 0 }, banco: { USD: 0, EUR: 0, ARS: 0 }, cheque: { USD: 0, EUR: 0, ARS: 0 } };
      (list || []).forEach((m) => {
        const tipoRaw = (m.caja_tipo || 'efectivo').toLowerCase();
        const t = tipoRaw === 'cheque' ? 'cheque' : tipoRaw === 'efectivo' || tipoRaw === 'banco' ? tipoRaw : 'efectivo';
        const moneda = (m.moneda || '').toUpperCase();
        if (!saldoT1[t] || saldoT1[t][moneda] == null) return;
        const fecha = (m.fecha || '').toString().slice(0, 10);
        if (fecha && fecha <= ayerStr) saldoT1[t][moneda] += Number(m.monto);
      });
      const svgSube = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
      const svgBaja = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
      const svgIgual = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      const formatInicio = (n) => (n == null || isNaN(n)) ? '–' : Math.round(Number(n)).toLocaleString('es-AR', { maximumFractionDigits: 0, minimumFractionDigits: 0 });

      const setFila = (caja, moneda) => {
        const s1 = saldoT1[caja][moneda] ?? 0;
        const sT = saldoActual[caja][moneda] ?? 0;
        const variacion = sT - s1;
        const pct = s1 !== 0 ? (variacion / Math.abs(s1)) * 100 : (variacion !== 0 ? 100 : 0);
        const elInicial = document.getElementById(`inicio-${caja}-${moneda.toLowerCase()}-inicial`);
        const elActual = document.getElementById(`inicio-${caja}-${moneda.toLowerCase()}-actual`);
        const elVar = document.getElementById(`inicio-${caja}-${moneda.toLowerCase()}-var`);
        const elTend = document.getElementById(`inicio-${caja}-${moneda.toLowerCase()}-tendencia`);
        if (elInicial) {
          elInicial.textContent = formatInicio(s1);
          elInicial.className = 'inicio-caja-valor ' + (s1 >= 0 ? 'positivo' : 'negativo');
        }
        if (elActual) {
          elActual.textContent = formatInicio(sT);
          elActual.className = 'inicio-caja-valor ' + (sT >= 0 ? 'positivo' : 'negativo');
        }
        if (elVar) {
          const signo = variacion > 0 ? '+' : '';
          elVar.textContent = `${signo}${formatInicio(variacion)} (${variacion >= 0 ? '+' : ''}${Math.round(pct)}%)`;
          elVar.className = 'inicio-caja-var-valor ' + (variacion > 0 ? 'sube' : variacion < 0 ? 'baja' : 'igual');
        }
        if (elTend) {
          elTend.className = 'inicio-caja-tendencia ' + (variacion > 0 ? 'tendencia-sube' : variacion < 0 ? 'tendencia-baja' : 'tendencia-igual');
          elTend.innerHTML = variacion > 0 ? svgSube : variacion < 0 ? svgBaja : svgIgual;
        }
      };
      MONEDAS_PANEL_CAJA_EFECTIVO.filter((mon) => efVis[mon]).forEach((mon) => setFila('efectivo', mon));
      MONEDAS_PANEL_CAJA_BANCO.filter((mon) => baVis[mon]).forEach((mon) => setFila('banco', mon));
      setFila('cheque', 'ARS');
      loadInicioPendientes();
    });
}

function loadInicioPendientes() {
  const bodyOrd = document.getElementById('inicio-ordenes-pendientes-body');
  const elCountTr = document.getElementById('inicio-count-transacciones-pendientes');

  const estadoLabelOrd = (e) => ({ pendiente_instrumentar: 'Pend. Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada', anulada: 'Anulada' }[e] || (e ? String(e) : '–'));
  const estadoBadgeOrd = (e) => (e && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'anulada'].includes(e) ? `badge badge-estado-${e.replace(/_/g, '-')}` : '');

  const ordenEstados = ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion'];
  if (bodyOrd) {
    client.from('ordenes').select('id, estado').neq('estado', 'orden_ejecutada').neq('estado', 'anulada').then((r) => {
      const list = r.data || [];
      const byEstado = {};
      list.forEach((o) => { byEstado[o.estado] = (byEstado[o.estado] || 0) + 1; });
      const svgOjo = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
      const filas = ordenEstados.filter((e) => (byEstado[e] || 0) > 0).map((estado) => {
        const badgeClass = estadoBadgeOrd(estado);
        const label = estadoLabelOrd(estado);
        const num = byEstado[estado];
        return `<div class="inicio-card-ordenes-fila" data-estado="${estado}">
          <span class="inicio-card-ordenes-badge"><span class="${badgeClass}">${label}</span></span>
          <span class="inicio-card-ordenes-num">${num}</span>
          <button type="button" class="btn-ver-estado" data-estado="${estado}" title="Ver estas órdenes" aria-label="Ver estas órdenes">${svgOjo}</button>
        </div>`;
      });
      bodyOrd.innerHTML = filas.length ? filas.join('') : '<div class="inicio-card-ordenes-fila"><span class="inicio-card-pendientes-valor" style="grid-column:1/-1;">–</span></div>';
      bodyOrd.querySelectorAll('.btn-ver-estado').forEach((btn) => {
        btn.addEventListener('click', () => { openModalOrdenesPendientes(btn.getAttribute('data-estado')); });
      });
    });
  }
  if (elCountTr) client.from('transacciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').then((r) => { elCountTr.textContent = r.count != null ? String(r.count) : '–'; });
}

/** Datos del modal de órdenes pendientes para filtrado y re-render. */
let ordenesPendientesList = [];
let ordenesPendientesClientesMap = {};
let ordenesPendientesTiposOpMap = {};
let ordenesPendientesIntermediariosMap = {};

function renderOrdenesPendientesFiltros(list, clientesMap, intermediariosMap) {
  const selCliente = document.getElementById('ordenes-pendientes-filtro-cliente');
  const selIntermediario = document.getElementById('ordenes-pendientes-filtro-intermediario');
  if (!selCliente || !selIntermediario) return;
  const clienteIds = [...new Set(list.map((o) => o.cliente_id).filter(Boolean))].sort((a, b) => (clientesMap[a] || '').localeCompare(clientesMap[b] || ''));
  const intIds = [...new Set(list.map((o) => o.intermediario_id).filter(Boolean))].sort((a, b) => (intermediariosMap[a] || '').localeCompare(intermediariosMap[b] || ''));
  selCliente.innerHTML = '<option value="">Todos</option>' + clienteIds.map((id) => `<option value="${id}">${escapeHtml(clientesMap[id] || id)}</option>`).join('');
  selIntermediario.innerHTML = '<option value="">Todos</option>' + intIds.map((id) => `<option value="${id}">${escapeHtml(intermediariosMap[id] || id)}</option>`).join('');
}

function renderOrdenesPendientesTabla() {
  const backdrop = document.getElementById('modal-ordenes-pendientes-backdrop');
  const tbody = document.getElementById('ordenes-pendientes-tbody');
  const selCliente = document.getElementById('ordenes-pendientes-filtro-cliente');
  const selIntermediario = document.getElementById('ordenes-pendientes-filtro-intermediario');
  const selEstado = document.getElementById('ordenes-pendientes-filtro-estado');
  if (!tbody) return;
  const clienteId = selCliente && selCliente.value ? selCliente.value : '';
  const intermediarioId = selIntermediario && selIntermediario.value ? selIntermediario.value : '';
  const estadoVal = selEstado && selEstado.value ? selEstado.value : '';
  let list = ordenesPendientesList;
  if (clienteId) list = list.filter((o) => o.cliente_id === clienteId);
  if (intermediarioId) list = list.filter((o) => o.intermediario_id === intermediarioId);
  if (estadoVal) list = list.filter((o) => o.estado === estadoVal);
  const canEditarOrden = userPermissions.includes('editar_orden');
  const canIngresarTransacciones = userPermissions.includes('ingresar_transacciones');
  const canEditarTransacciones = userPermissions.includes('editar_transacciones');
  const canEliminarTransacciones = userPermissions.includes('eliminar_transacciones');
  const canVerAccionesOrden = userPermissions.includes('editar_orden') || userPermissions.includes('anular_orden') || userPermissions.includes('editar_estado_orden') || canIngresarTransacciones || canEditarTransacciones || canEliminarTransacciones;
  const estadoLabel = (e) => ({ pendiente_instrumentar: 'Pendiente Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada', anulada: 'Anulada' }[e] || (e ? String(e) : '–'));
  const estadoBadgeClass = (e) => (e && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'anulada'].includes(e) ? `badge badge-estado-${e.replace(/_/g, '-')}` : '');
  const clientesMap = ordenesPendientesClientesMap;
  const tiposOpMap = ordenesPendientesTiposOpMap;
  const intermediariosMap = ordenesPendientesIntermediariosMap;
  tbody.innerHTML = list.length ? list.map((o) => {
    const estado = o.estado || '';
    const badgeClass = estadoBadgeClass(estado);
    const estadoHtml = badgeClass ? `<span class="${badgeClass}">${estadoLabel(estado)}</span>` : estadoLabel(estado);
    return `<tr data-id="${o.id}">
      <td>${(o.fecha || '').toString().slice(0, 10)}</td>
      <td class="td-tipo-op-iconos">${o.tipo_operacion_id ? htmlCeldaTipoOperacionDesdeMap(o.tipo_operacion_id, tiposOpMap) : htmlTipoOperacionIconos('')}</td>
      <td>${escapeHtml(o.cliente_id ? clientesMap[o.cliente_id] || '–' : '–')}</td>
      <td>${escapeHtml(o.intermediario_id ? intermediariosMap[o.intermediario_id] || '–' : '–')}</td>
      <td>${estadoHtml}</td>
      <td>${o.moneda_recibida} ${formatMonto(o.monto_recibido)}</td>
      <td>${o.moneda_entregada} ${formatMonto(o.monto_entregado)}</td>
      <td>${canVerAccionesOrden ? `${canEditarOrden ? `<button type="button" class="btn-editar btn-editar-orden-pendiente" data-id="${o.id}" title="Editar"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span></button> ` : ''}<button type="button" class="btn-secondary btn-transacciones-pendiente" data-id="${o.id}" title="Transacciones"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg></span></button>` : ''}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="8">No hay órdenes que coincidan con los filtros.</td></tr>';
  tbody.querySelectorAll('.btn-editar-orden-pendiente').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const row = ordenesPendientesList.find((r) => r.id === id);
      if (row && backdrop) { backdrop.classList.remove('activo'); openModalOrden(row); }
    });
  });
  tbody.querySelectorAll('.btn-transacciones-pendiente').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const orden = ordenesPendientesList.find((r) => r.id === id);
      if (!orden) return;
      if (backdrop) backdrop.classList.remove('activo');
      showView('vista-ordenes', 'Órdenes');
      loadOrdenes().then(() => { expandOrdenTransacciones(id, orden); });
    });
  });
}

/** Abre el modal de órdenes pendientes (estado ≠ orden_ejecutada). Si se pasa estadoFilter, solo se muestran órdenes de ese estado inicialmente y se preselecciona el filtro Estado. */
function openModalOrdenesPendientes(estadoFilter) {
  const backdrop = document.getElementById('modal-ordenes-pendientes-backdrop');
  const loadingEl = document.getElementById('ordenes-pendientes-loading');
  const wrapEl = document.getElementById('ordenes-pendientes-tabla-wrap');
  const filtrosWrap = document.getElementById('ordenes-pendientes-filtros-wrap');
  const tbody = document.getElementById('ordenes-pendientes-tbody');
  if (!backdrop || !loadingEl || !wrapEl || !tbody) return;
  backdrop.classList.add('activo');
  loadingEl.style.display = 'block';
  if (filtrosWrap) filtrosWrap.style.display = 'none';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';
  const selEstado = document.getElementById('ordenes-pendientes-filtro-estado');
  if (selEstado) selEstado.value = estadoFilter || '';
  const selectOrdPend = ordenesTieneNumeroColumn ? 'id, numero, cliente_id, fecha, estado, tipo_operacion_id, operacion_directa, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, cotizacion, observaciones' : 'id, cliente_id, fecha, estado, tipo_operacion_id, operacion_directa, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, cotizacion, observaciones';
  client.from('ordenes').select(selectOrdPend).neq('estado', 'orden_ejecutada').neq('estado', 'anulada').order('fecha', { ascending: false }).order('created_at', { ascending: false }).then((res) => {
      if (res.error) {
        loadingEl.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="8">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      const list = res.data || [];
      if (list.length === 0) {
        loadingEl.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="8">No hay órdenes pendientes.</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      const clienteIds = [...new Set(list.map((o) => o.cliente_id).filter(Boolean))];
      const tipoOpIds = [...new Set(list.map((o) => o.tipo_operacion_id).filter(Boolean))];
      const intIds = [...new Set(list.map((o) => o.intermediario_id).filter(Boolean))];
      return Promise.all([
        clienteIds.length ? client.from('clientes').select('id, nombre').in('id', clienteIds) : Promise.resolve({ data: [] }),
        tipoOpIds.length ? client.from('tipos_operacion').select('id, nombre, codigo, moneda_in, moneda_out, usa_intermediario, icono_modo, icono_url_publica').in('id', tipoOpIds) : Promise.resolve({ data: [] }),
        intIds.length ? client.from('intermediarios').select('id, nombre').in('id', intIds) : Promise.resolve({ data: [] }),
      ]).then(([cr, tr, ir]) => {
        const clientesMap = {};
        (cr.data || []).forEach((c) => { clientesMap[c.id] = c.nombre || ''; });
        const tiposOpMap = {};
        (tr.data || []).forEach((t) => {
          tiposOpMap[t.id] = {
            codigo: t.codigo || '',
            nombre: t.nombre || '',
            moneda_in: (t.moneda_in || '').toString().trim(),
            moneda_out: (t.moneda_out || '').toString().trim(),
            usa_intermediario: t.usa_intermediario === true,
            icono_modo: (t.icono_modo || 'auto').toString().trim().toLowerCase(),
            icono_url_publica: (t.icono_url_publica || '').toString().trim(),
          };
        });
        const intermediariosMap = {};
        (ir.data || []).forEach((i) => { intermediariosMap[i.id] = i.nombre || ''; });
        ordenesPendientesList = list;
        ordenesPendientesClientesMap = clientesMap;
        ordenesPendientesTiposOpMap = tiposOpMap;
        ordenesPendientesIntermediariosMap = intermediariosMap;
        renderOrdenesPendientesFiltros(list, clientesMap, intermediariosMap);
        if (filtrosWrap) filtrosWrap.style.display = 'flex';
        renderOrdenesPendientesTabla();
        loadingEl.style.display = 'none';
        wrapEl.style.display = 'block';
      });
    });
}

function setupOrdenesPendientesFiltrosListeners() {
  const selCliente = document.getElementById('ordenes-pendientes-filtro-cliente');
  const selIntermediario = document.getElementById('ordenes-pendientes-filtro-intermediario');
  const selEstado = document.getElementById('ordenes-pendientes-filtro-estado');
  if (selCliente) selCliente.addEventListener('change', () => renderOrdenesPendientesTabla());
  if (selIntermediario) selIntermediario.addEventListener('change', () => renderOrdenesPendientesTabla());
  if (selEstado) selEstado.addEventListener('change', () => renderOrdenesPendientesTabla());
}

/** Lista de transacciones pendientes con filtros (cliente, intermediario, solo Pandy). Guarda en ventana para filtrado. */
let transaccionesPendientesList = [];
let transaccionesPendientesOrdenesMap = {};
let transaccionesPendientesClientesMap = {};
let transaccionesPendientesIntermediariosMap = {};

function openModalTransaccionesPendientes() {
  const backdrop = document.getElementById('modal-transacciones-pendientes-backdrop');
  const loadingEl = document.getElementById('transacciones-pendientes-loading');
  const wrapEl = document.getElementById('transacciones-pendientes-tabla-wrap');
  const tbody = document.getElementById('transacciones-pendientes-tbody');
  const selCliente = document.getElementById('transacciones-pendientes-filtro-cliente');
  const selIntermediario = document.getElementById('transacciones-pendientes-filtro-intermediario');
  const chkPandy = document.getElementById('transacciones-pendientes-filtro-pandy');
  if (!backdrop || !loadingEl || !wrapEl || !tbody) return;
  backdrop.classList.add('activo');
  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';
  client.from('transacciones').select('id, tipo, moneda, monto, cobrador, pagador, estado, concepto, tipo_cambio, modo_pago_id, instrumentacion_id').eq('estado', 'pendiente').order('created_at', { ascending: false }).then((rTr) => {
    if (rTr.error) {
      loadingEl.style.display = 'none';
      tbody.innerHTML = '<tr><td colspan="10">Error: ' + (rTr.error.message || '') + '</td></tr>';
      wrapEl.style.display = 'block';
      return;
    }
    const transacciones = rTr.data || [];
    if (transacciones.length === 0) {
      loadingEl.style.display = 'none';
      tbody.innerHTML = '<tr><td colspan="10">No hay transacciones pendientes.</td></tr>';
      wrapEl.style.display = 'block';
      renderTransaccionesPendientesFiltros([], {}, {});
      return;
    }
    const instIds = [...new Set(transacciones.map((t) => t.instrumentacion_id).filter(Boolean))];
    client.from('instrumentacion').select('id, orden_id').in('id', instIds).then((rInst) => {
      const instToOrden = {};
      (rInst.data || []).forEach((i) => { instToOrden[i.id] = i.orden_id; });
      const ordenIds = [...new Set(Object.values(instToOrden).filter(Boolean))];
      const selectOrdTr = ordenesTieneNumeroColumn ? 'id, numero, cliente_id, intermediario_id, fecha' : 'id, cliente_id, intermediario_id, fecha';
      client.from('ordenes').select(selectOrdTr).in('id', ordenIds).then((rOrd) => {
        const ordenesMap = {};
        (rOrd.data || []).forEach((o) => { ordenesMap[o.id] = o; });
        transaccionesPendientesOrdenesMap = ordenesMap;
        const clienteIds = [...new Set((rOrd.data || []).map((o) => o.cliente_id).filter(Boolean))];
        const intIds = [...new Set((rOrd.data || []).map((o) => o.intermediario_id).filter(Boolean))];
        Promise.all([
          clienteIds.length ? client.from('clientes').select('id, nombre').in('id', clienteIds) : Promise.resolve({ data: [] }),
          intIds.length ? client.from('intermediarios').select('id, nombre').in('id', intIds) : Promise.resolve({ data: [] }),
        ]).then(([rC, rI]) => {
          const clientesMap = {};
          (rC.data || []).forEach((c) => { clientesMap[c.id] = c.nombre || ''; });
          const intermediariosMap = {};
          (rI.data || []).forEach((i) => { intermediariosMap[i.id] = i.nombre || ''; });
          transaccionesPendientesClientesMap = clientesMap;
          transaccionesPendientesIntermediariosMap = intermediariosMap;
          transaccionesPendientesList = transacciones.map((t) => {
            const ordenId = instToOrden[t.instrumentacion_id];
            const orden = ordenesMap[ordenId];
            return { ...t, orden_id: ordenId, cliente_id: orden && orden.cliente_id, intermediario_id: orden && orden.intermediario_id, orden_fecha: orden && orden.fecha };
          });
          renderTransaccionesPendientesFiltros(transaccionesPendientesList, clientesMap, intermediariosMap);
          renderTransaccionesPendientesTabla();
          loadingEl.style.display = 'none';
          wrapEl.style.display = 'block';
        });
      });
    });
  });
}

function renderTransaccionesPendientesFiltros(list, clientesMap, intermediariosMap) {
  const selCliente = document.getElementById('transacciones-pendientes-filtro-cliente');
  const selIntermediario = document.getElementById('transacciones-pendientes-filtro-intermediario');
  if (!selCliente || !selIntermediario) return;
  const clientesUniq = [...new Set(list.map((t) => t.cliente_id).filter(Boolean))];
  const intUniq = [...new Set(list.map((t) => t.intermediario_id).filter(Boolean))];
  selCliente.innerHTML = '<option value="">Todos</option>' + clientesUniq.map((id) => `<option value="${id}">${escapeHtml(clientesMap[id] || id)}</option>`).join('');
  selIntermediario.innerHTML = '<option value="">Todos</option>' + intUniq.map((id) => `<option value="${id}">${escapeHtml(intermediariosMap[id] || id)}</option>`).join('');
}

function renderTransaccionesPendientesTabla() {
  const tbody = document.getElementById('transacciones-pendientes-tbody');
  const selCliente = document.getElementById('transacciones-pendientes-filtro-cliente');
  const selIntermediario = document.getElementById('transacciones-pendientes-filtro-intermediario');
  const chkPandy = document.getElementById('transacciones-pendientes-filtro-pandy');
  if (!tbody) return;
  const canEditarTransacciones = userPermissions.includes('editar_transacciones');
  const clienteId = selCliente && selCliente.value ? selCliente.value : '';
  const intermediarioId = selIntermediario && selIntermediario.value ? selIntermediario.value : '';
  const soloPandy = chkPandy && chkPandy.checked;
  let list = transaccionesPendientesList;
  if (clienteId) list = list.filter((t) => t.cliente_id === clienteId);
  if (intermediarioId) list = list.filter((t) => t.intermediario_id === intermediarioId);
  if (soloPandy) list = list.filter((t) => t.cobrador === 'pandy' || t.pagador === 'pandy');
  const ordenesMap = transaccionesPendientesOrdenesMap;
  const clientesMap = transaccionesPendientesClientesMap;
  const intermediariosMap = transaccionesPendientesIntermediariosMap;
  const estadoTrxCombo = (t) => {
    const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente';
    return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" data-instrumentacion-id="${t.instrumentacion_id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`;
  };
  const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
  const listSorted = sortTransaccionesIngresosPrimero(list);
  tbody.innerHTML = listSorted.map((t) => {
    const orden = ordenesMap[t.orden_id];
    const ordenLabel = orden ? (orden.numero != null ? '#' + orden.numero + ' · ' : '') + (orden.fecha || '').toString().slice(0, 10) + (orden.cliente_id ? ' · ' + (clientesMap[orden.cliente_id] || '–') : '') : '–';
    return `<tr data-id="${t.id}" data-instrumentacion-id="${t.instrumentacion_id}">
      <td>${escapeHtml(ordenLabel)}</td>
      <td>${escapeHtml(t.cliente_id ? clientesMap[t.cliente_id] || '–' : '–')}</td>
      <td>${escapeHtml(t.intermediario_id ? intermediariosMap[t.intermediario_id] || '–' : '–')}</td>
      <td>${tipoTransaccionHtml(t.tipo)}</td>
      <td>${escapeHtml(t.moneda)}</td>
      <td>${formatMonto(t.monto)}</td>
      <td>${participantLabelHtml(t.pagador)}</td>
      <td>${participantLabelHtml(t.cobrador)}</td>
      <td>${canEditarTransacciones ? estadoTrxCombo(t) : estadoTexto(t)}</td>
      <td>${canEditarTransacciones ? `<button type="button" class="btn-editar btn-editar-transaccion-pendiente" data-id="${t.id}" data-instrumentacion-id="${t.instrumentacion_id}" title="Editar"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span></button>` : ''}</td>
    </tr>`;
  }).join('');
  if (canEditarTransacciones) {
  tbody.querySelectorAll('.combo-estado-transaccion').forEach((sel) => {
    sel.addEventListener('change', function() {
      const transaccionId = this.getAttribute('data-id');
      const instrumentacionId = this.getAttribute('data-instrumentacion-id');
      const nuevoEstado = this.value;
      cambiarEstadoTransaccion(transaccionId, nuevoEstado, instrumentacionId, this).then(() => {
        if (nuevoEstado === 'ejecutada') {
          const idx = transaccionesPendientesList.findIndex((r) => r.id === transaccionId);
          if (idx >= 0) transaccionesPendientesList.splice(idx, 1);
        } else {
          const item = list.find((r) => r.id === transaccionId);
          if (item) item.estado = nuevoEstado;
        }
        renderTransaccionesPendientesTabla();
        loadInicio();
      });
    });
  });
  tbody.querySelectorAll('.btn-editar-transaccion-pendiente').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const instId = btn.getAttribute('data-instrumentacion-id');
      const row = list.find((r) => r.id === id);
      if (row) openModalTransaccion(row, instId);
    });
  });
  }
}

function setupPanelControl() {
  const btnVerOrdenes = document.getElementById('btn-ver-ordenes-pendientes');
  const btnVerTrans = document.getElementById('btn-ver-transacciones-pendientes');
  if (btnVerOrdenes) btnVerOrdenes.addEventListener('click', () => openModalOrdenesPendientes());
  if (btnVerTrans) btnVerTrans.addEventListener('click', () => openModalTransaccionesPendientes());
  const closeOrdenes = document.getElementById('modal-ordenes-pendientes-close');
  const closeTrans = document.getElementById('modal-transacciones-pendientes-close');
  if (closeOrdenes) closeOrdenes.addEventListener('click', () => document.getElementById('modal-ordenes-pendientes-backdrop')?.classList.remove('activo'));
  if (closeTrans) closeTrans.addEventListener('click', () => document.getElementById('modal-transacciones-pendientes-backdrop')?.classList.remove('activo'));
  const backdropOrdenes = document.getElementById('modal-ordenes-pendientes-backdrop');
  const backdropTrans = document.getElementById('modal-transacciones-pendientes-backdrop');
  if (backdropOrdenes) setupBackdropCloseOnlyOnRealClick(backdropOrdenes, () => backdropOrdenes.classList.remove('activo'));
  if (backdropTrans) setupBackdropCloseOnlyOnRealClick(backdropTrans, () => backdropTrans.classList.remove('activo'));
  const selCliente = document.getElementById('transacciones-pendientes-filtro-cliente');
  const selIntermediario = document.getElementById('transacciones-pendientes-filtro-intermediario');
  const chkPandy = document.getElementById('transacciones-pendientes-filtro-pandy');
  if (selCliente) selCliente.addEventListener('change', () => renderTransaccionesPendientesTabla());
  if (selIntermediario) selIntermediario.addEventListener('change', () => renderTransaccionesPendientesTabla());
  if (chkPandy) chkPandy.addEventListener('change', () => renderTransaccionesPendientesTabla());
  setupOrdenesPendientesFiltrosListeners();
}

// --- Cuenta corriente ---
let ccMonedaActual = 'TODAS';
let ccMovimientosList = [];
let ccEsIntermediario = false;
let ccDetalleTipo = null;
let ccDetalleId = null;
let ccDetalleMovimientosList = [];
let ccDetalleOrdenesList = [];
/** Todas las filas de resumen CC (todas las entidades con sus saldos). */
let ccResumenRowsTodos = [];
/** Lista plana de todos los movimientos CC con tipo y nombre (cliente/intermediario) para la vista "Detalle de movimientos". */
let ccMovimientosDetalleList = [];
let ccFiltroTipo = 'cliente';
/** 'resumen' | 'detalle': vista actual en Cuenta corriente. */
let ccVistaToggle = 'resumen';
/** Filtro de fechas para vista Detalle de movimientos (desde/hasta). Con «solo día» ambos suelen ser hoy. */
let ccDetalleDesde = '';
let ccDetalleHasta = '';
/** Si true, no se filtra por fecha en la tabla detalle (todo el historial). Los saldos del resumen siguen siendo históricos completos. */
let ccMovimientosMostrarTodoHistorial = false;
/** Filtro opcional por cliente_id o intermediario_id en solapa Movimientos (vacío = todos). */
let ccDetalleFiltroEntidadId = '';
/** Filas actuales de la vista Detalle (para ordenar sin volver a filtrar). */
let ccDetalleVistaRowsActual = [];
/** Ordenación vista Detalle: clave (fecha, nroOrden, ...) y dirección 1 | -1. */
let ccDetalleSortCol = null;
let ccDetalleSortDir = 1;
/** Ordenación modal Detalle. */
let ccDetalleModalSortCol = null;
let ccDetalleModalSortDir = 1;

/** Join tipos_operacion de Supabase (objeto o array de un elemento). */
function tiposOperacionNestedMeta(tiposNested) {
  const t = tiposNested && (Array.isArray(tiposNested) ? tiposNested[0] : tiposNested);
  if (!t || typeof t !== 'object') {
    return { codigo: '–', nombre: '', icono_modo: 'auto', icono_url_publica: '', usa_intermediario: false };
  }
  const modRaw = (t.icono_modo != null ? String(t.icono_modo) : 'auto').trim().toLowerCase();
  const modo = modRaw === 'cheque' || modRaw === 'custom' ? modRaw : 'auto';
  return {
    codigo: t.codigo != null && String(t.codigo).trim() !== '' ? String(t.codigo) : '–',
    nombre: t.nombre != null ? String(t.nombre) : '',
    icono_modo: modo,
    icono_url_publica: t.icono_url_publica != null ? String(t.icono_url_publica).trim() : '',
    usa_intermediario: t.usa_intermediario === true,
  };
}

function ordenTipoOpMetaMapFromOrdenes(ordenes) {
  const out = {};
  (ordenes || []).forEach((o) => {
    out[o.id] = tiposOperacionNestedMeta(o.tipos_operacion);
  });
  return out;
}

/** Enriquece movimientos CC (modal detalle / refresh) con código y metadatos de icono del tipo de la orden. */
function ccDetalleRowsConTipoOpDesdeOrdenes(movimientos, ordenes) {
  const ordenNumeroById = Object.fromEntries((ordenes || []).map((o) => [o.id, o.numero]).filter(([, n]) => n != null));
  const metaByOrdenId = ordenTipoOpMetaMapFromOrdenes(ordenes);
  return (movimientos || []).map((m) => {
    const meta = m.orden_id && metaByOrdenId[m.orden_id];
    return {
      ...m,
      orden_numero: ordenNumeroById[m.orden_id] != null ? ordenNumeroById[m.orden_id] : (m.orden_numero != null ? m.orden_numero : null),
      tipo_operacion: meta ? meta.codigo : '–',
      tipo_op_nombre: meta ? meta.nombre : '',
      tipo_op_icono_modo: meta ? meta.icono_modo : 'auto',
      tipo_op_icono_url: meta ? meta.icono_url_publica : '',
      tipo_op_usa_intermediario: meta ? meta.usa_intermediario === true : false,
    };
  });
}

// Conceptos de movimientos CC (legibles para el usuario). Incluimos textos legacy en listas para borrar/consultar datos ya guardados.
const CONCEPTO_CC_CONVERSION = 'Conversión de moneda';
const CONCEPTO_CC_COMISION = 'Comisión del acuerdo';
const CONCEPTOS_CC_CONVERSION_TODOS = ['Conversión por tipo de cambio', 'Conversión de moneda'];
const CONCEPTOS_CC_COMISION_TODOS = ['Comisión', 'Comisión del acuerdo'];
const CONCEPTOS_CC_AUTOGENERADOS = [...CONCEPTOS_CC_CONVERSION_TODOS, ...CONCEPTOS_CC_COMISION_TODOS];

/**
 * Regla unificada CC: a partir de una transacción y su orden devuelve la contribución al saldo (pendientes) para cliente e intermediario.
 * Sirve para resumen y para cualquier flujo que deba reflejar la realidad según estado, pagador, cobrador, moneda.
 * @param {Object} t - transacción { estado, pagador, cobrador, moneda, monto }
 * @param {Object} orden - orden { cliente_id, intermediario_id, monto_recibido, monto_entregado, moneda_recibida, moneda_entregada }
 * @param {Array} transaccionesOrden - todas las transacciones de la misma instrumentación (para cliente: ingreso/egreso)
 * @returns {{ cliente: { id, delta: {USD,EUR,ARS} } | null, intermediario: { id, delta: {USD,EUR,ARS} } | null }}
 */
function contribucionPendienteCcUnificada(t, orden, transaccionesOrden) {
  const estado = (t.estado || '').toString().toLowerCase();
  const pagador = String(t.pagador || '').toLowerCase();
  const cobrador = String(t.cobrador || '').toLowerCase();
  const mon = ((t.moneda || 'ARS') + '').toUpperCase();
  if (mon !== 'USD' && mon !== 'EUR' && mon !== 'ARS') return { cliente: null, intermediario: null };
  const val = Number(t.monto) || 0;
  const out = { cliente: null, intermediario: null };
  if (estado !== 'pendiente') return out;
  // Intermediario: Pandy debe → restar del saldo (se muestra en rojo).
  if (orden.intermediario_id && pagador === 'pandy' && cobrador === 'intermediario') {
    out.intermediario = { id: orden.intermediario_id, delta: { USD: 0, EUR: 0, ARS: 0 } };
    out.intermediario.delta[mon] = -val;
  }
  // Cliente: mismo criterio por moneda (ingreso pendiente + egreso ejecutada → +mr; ingreso ejecutada + egreso pendiente → -me).
  if (orden.cliente_id && transaccionesOrden && transaccionesOrden.length) {
    const mr = Number(orden.monto_recibido) || 0;
    const me = Number(orden.monto_entregado) || 0;
    const monR = (orden.moneda_recibida || 'USD').toString().toUpperCase();
    const monE = (orden.moneda_entregada || 'USD').toString().toUpperCase();
    if (monR !== monE) return out;
    const ingreso = transaccionesOrden.find((x) => String(x.pagador || '').toLowerCase() === 'cliente' && String(x.cobrador || '').toLowerCase() === 'pandy');
    const egreso = transaccionesOrden.find((x) => String(x.cobrador || '').toLowerCase() === 'cliente' && String(x.pagador || '').toLowerCase() === 'pandy');
    if (ingreso && egreso) {
      const ingresoPend = (ingreso.estado || '').toString().toLowerCase() !== 'ejecutada';
      const egresoPend = (egreso.estado || '').toString().toLowerCase() !== 'ejecutada';
      const delta = { USD: 0, EUR: 0, ARS: 0 };
      if (ingresoPend && !egresoPend) delta[monR] = mr;
      if (!ingresoPend && egresoPend) delta[monE] = -me;
      if (delta.USD !== 0 || delta.EUR !== 0 || delta.ARS !== 0) out.cliente = { id: orden.cliente_id, delta };
    }
  }
  return out;
}

/**
 * Contribución al saldo CC cliente según modelo CC_MODELO (docs/CC_MODELO_REFERENCIA.md).
 * Solo aplica a órdenes ARS-ARS con intermediario. Regla: si hay ingreso Cliente→Pandy ejecutado y egreso Pandy→Cliente pendiente, suma -(me - sum_egreso) (Pandy debe al cliente). Cualquier orden de cambios de estado.
 * @param {Object} orden - { monto_recibido, monto_entregado, moneda_recibida, moneda_entregada }
 * @param {Array} transacciones - de la instrumentación de la orden: { tipo, pagador, cobrador, monto, estado }
 * @returns {{ USD: number, EUR: number, ARS: number }}
 */
function contribucionSaldoClienteModeloCc(orden, transacciones) {
  const mr = Number(orden.monto_recibido) || 0;
  const me = Number(orden.monto_entregado) || 0;
  const monR = ((orden.moneda_recibida || 'ARS') + '').toUpperCase();
  const monE = ((orden.moneda_entregada || 'ARS') + '').toUpperCase();
  const out = { USD: 0, EUR: 0, ARS: 0 };
  if (!transacciones || transacciones.length === 0) return out;
  const sumIngreso = transacciones
    .filter((t) => (t.tipo || '').toString().toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'cliente' && String(t.cobrador || '').toLowerCase() === 'pandy' && (t.estado || '').toString().toLowerCase() === 'ejecutada')
    .reduce((s, t) => s + (Number(t.monto) || 0), 0);
  const sumEgreso = transacciones
    .filter((t) => (t.tipo || '').toString().toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'cliente' && (t.estado || '').toString().toLowerCase() === 'ejecutada')
    .reduce((s, t) => s + (Number(t.monto) || 0), 0);
  const mon = monE === 'USD' ? 'USD' : (monE === 'EUR' ? 'EUR' : 'ARS');
  const monCli = monR === 'USD' ? 'USD' : (monR === 'EUR' ? 'EUR' : 'ARS');
  // Tx1 ejecutada + Tx2 pendiente: Pandy debe al cliente → -pendiente (egreso pendiente).
  if (sumIngreso >= 1e-6 && sumEgreso < me - 1e-6) {
    out[mon] = -(me - sumEgreso);
    return out;
  }
  // Tx1 pendiente + Tx2 ejecutada: regla SUMA_SALDO Y para Tx1 → -mr en saldo (modelo).
  if (sumIngreso < 1e-6 && sumEgreso >= 1e-6) {
    out[monCli] = -mr;
    return out;
  }
  return out;
}

/**
 * Contribución al saldo CC intermediario según modelo CC_MODELO (docs/CC_MODELO_REFERENCIA.md).
 * Solo aplica a órdenes ARS-ARS con intermediario. Regla: solo suma la contrapartida pendiente (Int→Pandy) cuando el egreso Pandy→Int está ejecutado; el valor es -(monto pendiente). Se usa el monto de la transacción Int→Pandy pendiente (197k en el modelo), no el bruto 200k.
 * @param {Object} orden - { monto_recibido, tasa_descuento_intermediario, moneda_recibida }
 * @param {Array} transacciones - de la instrumentación: { tipo, pagador, cobrador, monto, estado }
 * @returns {{ USD: number, EUR: number, ARS: number }}
 */
function contribucionSaldoIntermediarioModeloCc(orden, transacciones) {
  const out = { USD: 0, EUR: 0, ARS: 0 };
  if (!transacciones || transacciones.length === 0) return out;
  const hayEgresoIntEjecutado = transacciones.some((t) => (t.tipo || '').toString().toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario' && (t.estado || '').toString().toLowerCase() === 'ejecutada');
  const hayIngresoIntEjecutado = transacciones.some((t) => (t.tipo || '').toString().toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'intermediario' && String(t.cobrador || '').toLowerCase() === 'pandy' && (t.estado || '').toString().toLowerCase() === 'ejecutada');
  const sumEgresoPandyIntEjecutado = transacciones
    .filter((t) => (t.tipo || '').toString().toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario' && (t.estado || '').toString().toLowerCase() === 'ejecutada')
    .reduce((s, t) => s + (Number(t.monto) || 0), 0);
  const sumIngresoIntEjecutado = transacciones
    .filter((t) => (t.tipo || '').toString().toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'intermediario' && String(t.cobrador || '').toLowerCase() === 'pandy' && (t.estado || '').toString().toLowerCase() === 'ejecutada')
    .reduce((s, t) => s + (Number(t.monto) || 0), 0);
  const pendientesIntPandy = transacciones.filter((t) => (t.tipo || '').toString().toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'intermediario' && String(t.cobrador || '').toLowerCase() === 'pandy' && (t.estado || '').toString().toLowerCase() === 'pendiente');
  const pendientesPandyInt = transacciones.filter((t) => (t.tipo || '').toString().toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario' && (t.estado || '').toString().toLowerCase() === 'pendiente');
  // Ambas ejecutadas (montos de transacción): fórmula legacy coherente con neto en ARS (−cheque bruto + efectivo cobrado).
  // Los movimientos persistidos en CC int usan +cheque, −comisión, −efectivo (reglas CHEQUE-ARS); la suma de movimientos = 0 al cerrar.
  if (hayEgresoIntEjecutado && hayIngresoIntEjecutado) {
    out.ARS = -sumEgresoPandyIntEjecutado + sumIngresoIntEjecutado;
    return out;
  }
  // Tx3 pendiente + Tx4 ejecutada: saldo = -(monto Tx3 pendiente) + 197k = -200k + 197k = -3k.
  if (!hayEgresoIntEjecutado && hayIngresoIntEjecutado && pendientesPandyInt.length > 0) {
    const montoPandyIntPendiente = pendientesPandyInt.reduce((s, t) => s + (Number(t.monto) || 0), 0);
    if (montoPandyIntPendiente >= 1e-6) {
      out.ARS = -montoPandyIntPendiente + sumIngresoIntEjecutado;
      return out;
    }
  }
  // Ambas pendientes (escenario Excel: Tx3 P, Tx4 P): saldo = -200k + 197k = -3.000.
  if (!hayEgresoIntEjecutado && !hayIngresoIntEjecutado && (pendientesPandyInt.length > 0 || pendientesIntPandy.length > 0)) {
    const sumPandyIntP = pendientesPandyInt.reduce((s, t) => s + (Number(t.monto) || 0), 0);
    const sumIntPandyP = pendientesIntPandy.reduce((s, t) => s + (Number(t.monto) || 0), 0);
    out.ARS = -sumPandyIntP + sumIntPandyP;
    return out;
  }
  if (!hayEgresoIntEjecutado) return out;
  // Tx3 ejecutada + Tx4 pendiente: saldo = -(monto Int→Pandy pendiente) = -197k.
  const montoPendienteIntPandy = pendientesIntPandy.reduce((s, t) => s + (Number(t.monto) || 0), 0);
  if (montoPendienteIntPandy >= 1e-6) {
    out.ARS = -montoPendienteIntPandy;
    return out;
  }
  const mr = Number(orden.monto_recibido) || 0;
  const tasa = Number(orden.tasa_descuento_intermediario) || 0;
  const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : (tasa >= 1 && tasa <= 100 ? mr * (1 - tasa / 100) : mr);
  if (sumIngresoIntEjecutado >= montoEfectivoInt - 1e-6) return out;
  out.ARS = -(montoEfectivoInt - sumIngresoIntEjecutado);
  return out;
}

/**
 * Según modelo CC_MODELO.xlsx (columnas INCLUIR EN  MOV CC CLIENTE / INCLUIR EN MOV DE CC INTERMEDIARIO).
 * Solo aplica a órdenes ARS-ARS con intermediario. Devuelve true si la transacción t debe generar un movimiento en la CC del cliente.
 * En el Excel: Y para Tx1 (Ingreso Cliente→Pandy) y Tx2 (Egreso Pandy→Cliente) cuando están ejecutadas.
 */
function incluirEnMovimientosCcClienteModelo(orden, t) {
  if (!esTipoOperacionChequeArsDesdeJoin(orden.tipos_operacion) || !orden.intermediario_id) return true; // No modelo: incluir todo
  if ((t.estado || '').toString().toLowerCase() !== 'ejecutada') return false;
  const tipo = (t.tipo || '').toString().toLowerCase();
  const pag = String(t.pagador || '').toLowerCase();
  const cob = String(t.cobrador || '').toLowerCase();
  return (tipo === 'ingreso' && pag === 'cliente' && cob === 'pandy') || (tipo === 'egreso' && pag === 'pandy' && cob === 'cliente');
}

/**
 * Según modelo CC_MODELO.xlsx. True si la transacción t debe generar un movimiento en la CC del intermediario.
 * En el Excel: Y para Tx3 (Egreso Pandy→Intermediario) y Tx4 (Ingreso Intermediario→Pandy) cuando están ejecutadas.
 */
function incluirEnMovimientosCcIntermediarioModelo(orden, t) {
  if (!esTipoOperacionChequeArsDesdeJoin(orden.tipos_operacion) || !orden.intermediario_id) return true;
  if ((t.estado || '').toString().toLowerCase() !== 'ejecutada') return false;
  const tipo = (t.tipo || '').toString().toLowerCase();
  const pag = String(t.pagador || '').toLowerCase();
  const cob = String(t.cobrador || '').toLowerCase();
  return (tipo === 'egreso' && pag === 'pandy' && cob === 'intermediario') || (tipo === 'ingreso' && pag === 'intermediario' && cob === 'pandy');
}

/**
 * Normaliza codigo de tipo de operación para coincidir con `reglas_de_negocio` / catálogo (ej. "CHEQUE - ARS" → "CHEQUE-ARS").
 * @param {string} codigo
 * @returns {string|null}
 */
function normalizarCodigoTipoOperacion(codigo) {
  if (codigo == null || typeof codigo !== 'string') return null;
  const s = codigo.trim();
  if (!s) return null;
  return s.replace(/\s*-\s*/g, '-').replace(/\s*\(\s*/g, '-').replace(/\s*\)\s*/g, '').replace(/\s+/g, '');
}

/** Catálogo tipos_operacion: CHEQUE en UI; en tabla ordenes solo USD/EUR/ARS (cheque = ARS). */
function monedaCatalogoParaOrden(m) {
  const u = (m || '').toString().trim().toUpperCase();
  return u === 'CHEQUE' ? 'ARS' : u;
}

/**
 * Operación cheque en pesos: **CHEQUE-ARS** (catálogo) o moneda_in/out CHEQUE+ARS.
 * El código **ARS-ARS** ya no se usa como tipo de operación (eliminado del catálogo).
 */
function esTipoOperacionChequeArs(codigo, monedaIn, monedaOut) {
  const c = (codigo || '').toString().trim().toUpperCase();
  if (c.includes('CHEQUE')) return true;
  const mi = (monedaIn || '').toString().trim().toUpperCase();
  const mo = (monedaOut || '').toString().trim().toUpperCase();
  return (mi === 'CHEQUE' && mo === 'ARS') || (mi === 'ARS' && mo === 'CHEQUE');
}

function esTipoOperacionChequeArsDesdeJoin(tiposNested, codigoFallback) {
  const t = tiposNested && (Array.isArray(tiposNested) ? tiposNested[0] : tiposNested);
  const codigo = (t && t.codigo) || codigoFallback || '';
  return esTipoOperacionChequeArs(codigo, t && t.moneda_in, t && t.moneda_out);
}

/** Desde <option data-codigo data-moneda-in data-moneda-out> del tipo en el modal de orden. */
function esChequeArsDesdeSelectOption(opt) {
  if (!opt) return false;
  return esTipoOperacionChequeArs(
    opt.getAttribute('data-codigo') || '',
    opt.getAttribute('data-moneda-in') || '',
    opt.getAttribute('data-moneda-out') || '',
  );
}

/**
 * Orden de lista puede no traer join tipos_operacion; se completa con ordenesVistaTiposOpMap (loadOrdenes).
 */
function tiposOperacionEfectivoParaOrden(orden) {
  if (!orden) return null;
  const nested = orden.tipos_operacion && (Array.isArray(orden.tipos_operacion) ? orden.tipos_operacion[0] : orden.tipos_operacion);
  if (nested && (nested.codigo != null || nested.moneda_in != null || nested.moneda_out != null)) return nested;
  const tid = orden.tipo_operacion_id;
  let m = tid ? ordenesVistaTiposOpMap[tid] : null;
  if (!m && tid) m = ordenesPendientesTiposOpMap[tid];
  if (!m) return null;
  return { codigo: m.codigo, moneda_in: m.moneda_in, moneda_out: m.moneda_out };
}

function esOrdenChequeArsDesdeOrden(orden) {
  const t = tiposOperacionEfectivoParaOrden(orden);
  return esTipoOperacionChequeArs(t && t.codigo, t && t.moneda_in, t && t.moneda_out);
}

/**
 * Booleano desde Postgres/JSON (evita que el string "false" sea truthy con !!v en filtros de reglas).
 */
function coercePgBooleanStrict(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 't' || s === '1';
}

/** True si la contrapartida del par (cliente↔pandy o pandy↔intermediario) está ejecutada. */
function contrapartidaEjecutada(transacciones, pagador, cobrador, tipoTransaccion) {
  const pag = String(pagador || '').toLowerCase();
  const cob = String(cobrador || '').toLowerCase();
  const tipo = String(tipoTransaccion || '').toLowerCase();
  // Flujo inverso operativo: Cliente->Intermediario se considera contrapartida de Pandy->Cliente.
  if (tipo === 'ingreso' && pag === 'cliente' && cob === 'intermediario') {
    return (transacciones || []).some((t) =>
      (t.tipo || '').toLowerCase() === 'egreso' &&
      String(t.pagador || '').toLowerCase() === 'pandy' &&
      String(t.cobrador || '').toLowerCase() === 'cliente' &&
      (t.estado || '').toLowerCase() === 'ejecutada'
    );
  }
  if (tipo === 'egreso' && pag === 'pandy' && cob === 'cliente') {
    return (transacciones || []).some((t) =>
      (t.tipo || '').toLowerCase() === 'ingreso' &&
      String(t.pagador || '').toLowerCase() === 'cliente' &&
      (
        String(t.cobrador || '').toLowerCase() === 'pandy' ||
        String(t.cobrador || '').toLowerCase() === 'intermediario'
      ) &&
      (t.estado || '').toLowerCase() === 'ejecutada'
    );
  }
  // Flujo intermediado (Pandy central): cuando la transacción es Int->Cliente (egreso),
  // su contrapartida operativa es Cliente->Pandy (ingreso), no Cliente->Intermediario.
  if (tipo === 'egreso' && pag === 'intermediario' && cob === 'cliente') {
    return (transacciones || []).some((t) =>
      (t.tipo || '').toLowerCase() === 'ingreso' &&
      String(t.pagador || '').toLowerCase() === 'cliente' &&
      String(t.cobrador || '').toLowerCase() === 'pandy' &&
      (t.estado || '').toLowerCase() === 'ejecutada'
    );
  }
  // Simétrico: para Cliente->Pandy (ingreso), considerar como contrapartida pagador hacia Cliente
  // tanto Pandy->Cliente como Intermediario->Cliente.
  if (tipo === 'ingreso' && pag === 'cliente' && cob === 'pandy') {
    return (transacciones || []).some((t) =>
      (t.tipo || '').toLowerCase() === 'egreso' &&
      ((String(t.cobrador || '').toLowerCase() === 'cliente') || (String(t.cobrador || '').toLowerCase() === 'intermediario')) &&
      ((String(t.pagador || '').toLowerCase() === 'pandy') || (String(t.pagador || '').toLowerCase() === 'intermediario')) &&
      (t.estado || '').toLowerCase() === 'ejecutada'
    );
  }
  // Pandy->Intermediario (egreso): sin caso especial. La contrapartida simétrica es
  // Ingreso Intermediario->Pandy ejecutada (Tx4). No usar Cliente->Pandy: en E,P,P,P
  // Tx1 ejecutada no debe marcar contrapartida de Tx3 si Tx4 sigue pendiente (CHEQUE-ARS).
  const otroTipo = tipo === 'ingreso' ? 'egreso' : 'ingreso';
  const otroPag = cob;
  const otroCob = pag;
  return (transacciones || []).some((t) =>
    (t.tipo || '').toLowerCase() === otroTipo &&
    String(t.pagador || '').toLowerCase() === otroPag &&
    String(t.cobrador || '').toLowerCase() === otroCob &&
    (t.estado || '').toLowerCase() === 'ejecutada'
  );
}

/** True si hay egreso ejecutado que entrega al cliente (Pandy→Cliente o Intermediario→Cliente). Usado para “par cliente cerrado” en USD-USD+int. */
function egresoEntregaAClienteEjecutado(transacciones) {
  return (transacciones || []).some((t) =>
    (t.tipo || '').toLowerCase() === 'egreso' &&
    String(t.cobrador || '').toLowerCase() === 'cliente' &&
    (String(t.pagador || '').toLowerCase() === 'pandy' || String(t.pagador || '').toLowerCase() === 'intermediario') &&
    (t.estado || '').toLowerCase() === 'ejecutada'
  );
}

/**
 * Patrón de instrumentación con intermediario (2 tx típicas):
 * - **ci_pc**: ingreso Cliente→Intermediario + egreso Pandy→Cliente (cobro al int., entrega desde caja Pandy).
 * - **cp_ic**: ingreso Cliente→Pandy + egreso Intermediario→Cliente.
 * Se infiere por las filas de instrumentación (no solo por estado ejecutada), para P/E y comisiones.
 */
function patronInstrumentacionIntDesdeTransacciones(transacciones) {
  const txs = transacciones || [];
  const hayIngClienteInter = txs.some((t) =>
    (t.tipo || '').toLowerCase() === 'ingreso' &&
    String(t.pagador || '').toLowerCase() === 'cliente' &&
    String(t.cobrador || '').toLowerCase() === 'intermediario');
  const hayIngClientePandy = txs.some((t) =>
    (t.tipo || '').toLowerCase() === 'ingreso' &&
    String(t.pagador || '').toLowerCase() === 'cliente' &&
    String(t.cobrador || '').toLowerCase() === 'pandy');
  if (hayIngClienteInter && !hayIngClientePandy) return 'ci_pc';
  return 'cp_ic';
}

/** Ingreso ejecutado del cliente hacia Pandy o hacia intermediario (patrones USD-USD+int). */
function ingresoDesdeClienteHaciaPandyOIntermediarioEjecutado(transacciones) {
  return (transacciones || []).some((t) =>
    (t.tipo || '').toLowerCase() === 'ingreso' &&
    String(t.pagador || '').toLowerCase() === 'cliente' &&
    (String(t.cobrador || '').toLowerCase() === 'pandy' || String(t.cobrador || '').toLowerCase() === 'intermediario') &&
    (t.estado || '').toLowerCase() === 'ejecutada'
  );
}

/**
 * Estado efectivo para comisión sin transacción propia. La tabla define condicion_estado_comision; este motor solo interpreta el nombre.
 * par_pandy_int: ejecutada si al menos Tx3 o Tx4 ejecutada. Si existen transacciones Pandy↔Intermediario
 * en la instrumentación, no se usa el cierre Cliente↔Pandy como sustituto (comisión int. solo con actividad en ese par).
 * par_cliente (comisión Pandy): ejecutada si Tx1 o Tx2 ejecutada.
 */
function estadoEfectivoComision(transacciones, condicion) {
  if (condicion === 'par_pandy_int') {
    const hayTx3 = (transacciones || []).some((t) => (t.tipo || '').toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario' && (t.estado || '').toLowerCase() === 'ejecutada');
    const hayTx4 = (transacciones || []).some((t) => (t.tipo || '').toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'intermediario' && String(t.cobrador || '').toLowerCase() === 'pandy' && (t.estado || '').toLowerCase() === 'ejecutada');
    if (hayTx3 || hayTx4) return 'ejecutada';
    // Si la orden tiene patas Pandy↔Intermediario instrumentadas (CHEQUE-ARS canónico), la comisión int. no debe
    // devengar solo por cerrar Cliente↔Pandy (evita E,E,P,P con comisión int. indebida; ver E2E 12 combinaciones).
    const hayInstrumentacionPandyInt = (transacciones || []).some((t) => {
      const tipo = (t.tipo || '').toLowerCase();
      const pag = String(t.pagador || '').toLowerCase();
      const cob = String(t.cobrador || '').toLowerCase();
      return (tipo === 'egreso' && pag === 'pandy' && cob === 'intermediario')
        || (tipo === 'ingreso' && pag === 'intermediario' && cob === 'pandy');
    });
    if (hayInstrumentacionPandyInt) return 'pendiente';
    // Legacy: órdenes que solo instrumentan Cliente↔Pandy o Cliente↔Intermediario+Pandy→Cliente (sin filas Tx3/Tx4).
    const tx1 = ingresoDesdeClienteHaciaPandyOIntermediarioEjecutado(transacciones);
    const tx2 = egresoEntregaAClienteEjecutado(transacciones);
    return tx1 && tx2 ? 'ejecutada' : 'pendiente';
  }
  if (condicion === 'par_cliente') {
    const tx1 = ingresoDesdeClienteHaciaPandyOIntermediarioEjecutado(transacciones);
    const tx2 = egresoEntregaAClienteEjecutado(transacciones);
    return (tx1 || tx2) ? 'ejecutada' : 'pendiente';
  }
  return 'ejecutada';
}

/** Condición de comisión desde `reglas_de_negocio` (filas es_comision con condicion_estado_comision). */
function getCondicionComisionReglasNegocio(reglas, tipoCodigo, pagador, cobrador, tipoTransaccion) {
  const tc = String(tipoCodigo || '').toUpperCase();
  const pag = String(pagador || '').toLowerCase();
  const cob = String(cobrador || '').toLowerCase();
  const tip = String(tipoTransaccion || '').toLowerCase();
  const candidates = (reglas || []).filter((r) =>
    String(r.tipo_operacion_codigo || '').toUpperCase() === tc &&
    coercePgBooleanStrict(r.es_comision) === true &&
    (r.pagador || '').toLowerCase() === pag &&
    (r.cobrador || '').toLowerCase() === cob &&
    (r.tipo_transaccion || '').toLowerCase() === tip
  );
  const withC = candidates.find((r) => (r.condicion_estado_comision || '').trim() !== '');
  return (withC && withC.condicion_estado_comision) ? withC.condicion_estado_comision : null;
}

/**
 * Reglas de negocio (`reglas_de_negocio`): fuente de verdad del motor CC (ver docs/MIGRACION_UNA_TABLA_REGLAS_DE_NEGOCIO.md).
 * Si no hay filas para el par `(codigo, usa_intermediario)`, el sync usa fallbacks legacy (sin motor de tabla).
 */
function getReglasDeNegocio(codigoTipoOperacion, usaIntermediario) {
  const c = String(codigoTipoOperacion || '').trim().toUpperCase();
  if (!c) return Promise.resolve([]);
  return client.from('reglas_de_negocio').select('*')
    .eq('tipo_operacion_codigo', c)
    .eq('usa_intermediario', !!usaIntermediario)
    .then((r) => (r.data && Array.isArray(r.data) ? r.data : []))
    .catch(() => []);
}

function lookupReglasDeNegocio(reglas, tipoOperacionCodigo, pagador, cobrador, tipoTransaccion, esComision, estadoTransaccion, contrapartidaEjecutada) {
  if (!reglas || !reglas.length) return [];
  const cod = String(tipoOperacionCodigo || '').toUpperCase();
  const pag = String(pagador || '').toLowerCase();
  const cob = String(cobrador || '').toLowerCase();
  const tipo = String(tipoTransaccion || '').toLowerCase();
  const est = String(estadoTransaccion || '').toLowerCase();
  const cont = !!contrapartidaEjecutada;
  const out = reglas.filter((r) =>
    String(r.tipo_operacion_codigo || '').toUpperCase() === cod &&
    (r.pagador || '').toLowerCase() === pag &&
    (r.cobrador || '').toLowerCase() === cob &&
    (r.tipo_transaccion || '').toLowerCase() === tipo &&
    coercePgBooleanStrict(r.es_comision) === !!esComision &&
    (r.estado_transaccion || '').toLowerCase() === est &&
    coercePgBooleanStrict(r.contrapartida_ejecutada) === cont
  );
  out.sort((a, b) => (Number(a.linea) || 0) - (Number(b.linea) || 0));
  return out;
}

/**
 * Base numérica para un movimiento CC según `monto_origen` de la regla.
 * me_prorrateado / mr_prorrateado: permiten varias transacciones del mismo rol cuya suma concilia con el acuerdo (orden mr/me).
 */
function montoBaseReglaNegocio(montoOrigen, ctx) {
  const mo = String(montoOrigen || '').toLowerCase();
  const mrN = Number(ctx.mr) || 0;
  const meN = Number(ctx.me) || 0;
  const montoT = Number(ctx.montoT) || 0;
  if (mo === 'mr') return mrN;
  if (mo === 'me') return meN;
  if (mo === 'monto_transaccion') return montoT;
  if (mo === 'me_prorrateado') {
    if (mrN < 1e-12) return 0;
    return montoT * (meN / mrN);
  }
  if (mo === 'mr_prorrateado') {
    if (meN < 1e-12) return 0;
    return montoT * (mrN / meN);
  }
  if (mo === 'mr_menos_me') return mrN - meN;
  if (mo === 'monto_efectivo_intermediario') return Number(ctx.montoEfectivoInt) || 0;
  if (mo === 'comision_intermediario') return Number(ctx.comisionIntMonto) || 0;
  return montoT;
}

/**
 * Motor CC desde `reglas_de_negocio` (una fila = un movimiento; `entidad_cc` → cliente o intermediario).
 */
function aplicarMotorCcDesdeReglasDeNegocio(opts) {
  const {
    tipoOperacionCodigo,
    transacciones,
    reglasDeNegocio,
    orden,
    clienteId,
    intermediarioId,
    ordenId,
    rowsCcCliente,
    rowsCcInt,
    fecha,
    ahora,
    comisionPandyMonto,
    comisionPandyMon,
    comisionIntMonto,
    comisionIntMon,
    montoEfectivoInt,
  } = opts;
  if (!reglasDeNegocio || !reglasDeNegocio.length) return;
  const mr = Number(orden.monto_recibido) || 0;
  const me = Number(orden.monto_entregado) || 0;
  const comM = Number(comisionPandyMonto) || 0;
  (transacciones || []).forEach((t) => {
    if ((t.concepto || '').includes('Ganancia del acuerdo')) return;
    const montoT = Number(t.monto) || 0;
    // Instrumentación USD-USD: el ingreso de cobro lleva monto = mr (acuerdo). `comisiones_orden` solo reparte el spread (Pandy/int.); si existiera otra fila ingreso con monto = parte Pandy de ese reparto, no duplicar aquí movimientos por transacción (la comisión implícita cliente sale de la fila `es_comision` + `mr_menos_me` en reglas, bloque más abajo). El cobro principal tiene siempre monto ≈ mr; solo omitir cuando el monto coincide con la parte Pandy y es claramente menor que mr (no es el cobro nominal).
    if (
      comM >= 1e-6 &&
      (t.tipo || '').toLowerCase() === 'ingreso' &&
      String(t.pagador || '').toLowerCase() === 'cliente' &&
      String(t.cobrador || '').toLowerCase() === 'pandy' &&
      Math.abs(montoT - comM) < 1e-6 &&
      montoT < mr - 1e-6
    ) {
      return;
    }
    const pag = String(t.pagador || '').toLowerCase();
    const cob = String(t.cobrador || '').toLowerCase();
    const tipo = (t.tipo || '').toLowerCase();
    const estado = (t.estado || '').toLowerCase();
    const contrapartida = contrapartidaEjecutada(transacciones, t.pagador, t.cobrador, t.tipo);
    const reglasTx = lookupReglasDeNegocio(reglasDeNegocio, tipoOperacionCodigo, pag, cob, tipo, false, estado, contrapartida);
    if (!reglasTx.length) return;
    const estadoMov = (estado === 'ejecutada' ? 'cerrado' : 'pendiente');
    const codOp = String(tipoOperacionCodigo || '').toUpperCase();
    for (const regla of reglasTx) {
      let entidad = (regla.entidad_cc == null || String(regla.entidad_cc).trim() === '')
        ? 'cliente'
        : String(regla.entidad_cc).toLowerCase();
      const moR = String(regla.monto_origen || '').toLowerCase();
      if (codOp === 'CHEQUE-ARS' && moR === 'monto_efectivo_intermediario') entidad = 'intermediario';
      if (entidad === 'cliente' && !clienteId) continue;
      if (entidad === 'intermediario' && !intermediarioId) continue;
      // P,E: egreso ejecutado con ingreso aún pendiente (contrapartida=false) no debe duplicar la pata “equivalente” en moneda recibida (netea el compromiso pendiente del ingreso). Solo CC cliente (sin int).
      if (entidad === 'cliente' && tipo === 'egreso' && estado === 'ejecutada' && !contrapartida) {
        const monR = String(regla.moneda || '').toUpperCase();
        const mo = String(regla.monto_origen || '').toLowerCase();
        if (codOp === 'USD-ARS' && monR === 'USD' && mo === 'mr_prorrateado') continue;
        if (codOp === 'ARS-USD' && monR === 'ARS' && mo === 'mr_prorrateado') continue;
      }
      const base = montoBaseReglaNegocio(regla.monto_origen, {
        mr, me, montoT, montoEfectivoInt,
        comisionIntMonto: Number(comisionIntMonto) || 0,
      });
      const montoCc = Number(regla.signo) * base;
      if (Math.abs(montoCc) < 1e-12) continue;
      const moneda = String(regla.moneda || 'USD').toUpperCase();
      const ley = regla.concepto_leyenda || 'cobro_realizado';
      const rowBase = {
        orden_id: ordenId,
        transaccion_id: t.id,
        transaccion_numero: t.numero != null ? t.numero : null,
        concepto: conceptoCcLeyenda(ley, orden.numero, t.numero),
        fecha,
        usuario_id: currentUserId,
        moneda,
        monto: montoCc,
        estado: estadoMov,
        estado_fecha: ahora,
        incluir_en_detalle: coercePgBooleanStrict(regla.incluir_en_detalle),
        ...montosCcPorMoneda(moneda, montoCc),
      };
      if (entidad === 'intermediario') {
        rowsCcInt.push({
          intermediario_id: intermediarioId,
          ...rowBase,
        });
      } else {
        rowsCcCliente.push({
          cliente_id: clienteId,
          ...rowBase,
        });
      }
    }
  });
  // Comisión implícita USD-USD: `reglas_de_negocio` fila es_comision + monto_origen mr_menos_me (ver reglas_de_negocio_tabla / migraciones). Condición de negocio: acuerdo con spread (mr > me) en la orden; par cliente cerrado. No usar comisiones_orden como “llave” para esta fila — el monto sale de mr−me (tabla + orden), no del reparto Pandy/intermediario.
  const spreadUsdUsd = mr - me;
  if (String(tipoOperacionCodigo || '').toUpperCase() === 'USD-USD' && clienteId && spreadUsdUsd >= 1e-6) {
    const parClienteCerrado =
      ingresoDesdeClienteHaciaPandyOIntermediarioEjecutado(transacciones) &&
      egresoEntregaAClienteEjecutado(transacciones);
    const estadoComPandy = parClienteCerrado ? 'ejecutada' : 'pendiente';
    const reglasCom = lookupReglasDeNegocio(
      reglasDeNegocio,
      tipoOperacionCodigo,
      'cliente',
      'pandy',
      'ingreso',
      true,
      estadoComPandy,
      parClienteCerrado
    );
    const reglaCom = reglasCom.length ? reglasCom[0] : null;
    if (reglaCom) {
      const base = montoBaseReglaNegocio(reglaCom.monto_origen, {
        mr, me, montoT: 0,
        comisionIntMonto: Number(comisionIntMonto) || 0,
      });
      const montoCc = Number(reglaCom.signo) * base;
      if (Math.abs(montoCc) >= 1e-12) {
        const trIngresoClienteAcuerdo = (transacciones || [])
          .filter((t) =>
            (t.tipo || '').toLowerCase() === 'ingreso' &&
            String(t.pagador || '').toLowerCase() === 'cliente' &&
            (String(t.cobrador || '').toLowerCase() === 'pandy' || String(t.cobrador || '').toLowerCase() === 'intermediario') &&
            (t.estado || '').toLowerCase() === 'ejecutada' &&
            Math.abs(Number(t.monto) - comM) >= 1e-6
          )
          .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))[0];
        const nroTransComisionConcepto = trIngresoClienteAcuerdo && trIngresoClienteAcuerdo.numero != null ? trIngresoClienteAcuerdo.numero : null;
        const moneda = String(reglaCom.moneda || 'USD').toUpperCase();
        const ley = reglaCom.concepto_leyenda || 'comision_acuerdo';
        const cerrado = estadoComPandy === 'ejecutada';
        rowsCcCliente.push({
          cliente_id: clienteId,
          orden_id: ordenId,
          transaccion_id: null,
          transaccion_numero: null,
          concepto: conceptoCcLeyenda(ley, orden.numero, nroTransComisionConcepto),
          fecha,
          usuario_id: currentUserId,
          moneda,
          monto: montoCc,
          estado: cerrado ? 'cerrado' : 'pendiente',
          estado_fecha: ahora,
          incluir_en_detalle: coercePgBooleanStrict(reglaCom.incluir_en_detalle),
          ...montosCcPorMoneda(moneda, montoCc),
        });
      }
    }
  }
  // Comisión intermediario USD-USD (comisiones_orden; par cliente cerrado: ingreso desde cliente + entrega al cliente ejecutados).
  if (String(tipoOperacionCodigo || '').toUpperCase() === 'USD-USD' && intermediarioId && Number(comisionIntMonto) >= 1e-6) {
    const parClienteCerradoUsdInt =
      ingresoDesdeClienteHaciaPandyOIntermediarioEjecutado(transacciones) &&
      egresoEntregaAClienteEjecutado(transacciones);
    const estadoComInt = parClienteCerradoUsdInt ? 'ejecutada' : 'pendiente';
    const reglaComIntUsd = lookupReglasDeNegocio(
      reglasDeNegocio,
      tipoOperacionCodigo,
      'pandy',
      'intermediario',
      'egreso',
      true,
      estadoComInt,
      parClienteCerradoUsdInt
    )[0];
    if (reglaComIntUsd && coercePgBooleanStrict(reglaComIntUsd.incluir_en_detalle)) {
      const baseInt = montoBaseReglaNegocio(reglaComIntUsd.monto_origen, {
        mr, me, montoT: 0,
        comisionIntMonto: Number(comisionIntMonto) || 0,
      });
      const rawComInt = Number(reglaComIntUsd.signo) * baseInt;
      // cp_ic: comisión en CC int. negativa (Pandy debe al intermediario). ci_pc: signo inverso (+ comisión a favor del int.).
      const patronIntUsd = patronInstrumentacionIntDesdeTransacciones(transacciones);
      const montoCcInt = patronIntUsd === 'ci_pc' ? -rawComInt : rawComInt;
      if (Math.abs(montoCcInt) >= 1e-12) {
        const monedaInt = String(comisionIntMon || reglaComIntUsd.moneda || 'USD').toUpperCase();
        const cerradoInt = estadoComInt === 'ejecutada';
        rowsCcInt.push({
          intermediario_id: intermediarioId,
          orden_id: ordenId,
          transaccion_id: null,
          transaccion_numero: null,
          concepto: conceptoCcLeyenda('comision_acuerdo', orden.numero, null),
          fecha,
          usuario_id: currentUserId,
          moneda: monedaInt,
          monto: montoCcInt,
          estado: cerradoInt ? 'cerrado' : 'pendiente',
          estado_fecha: ahora,
          incluir_en_detalle: coercePgBooleanStrict(reglaComIntUsd.incluir_en_detalle),
          ...montosCcPorMoneda(monedaInt, montoCcInt),
        });
      }
    }
  }
  // Comisión CHEQUE-ARS (comisiones_orden Pandy e intermediario; filas es_comision + condicion_estado_comision).
  const codOpCh = String(tipoOperacionCodigo || '').toUpperCase();
  if (codOpCh === 'CHEQUE-ARS' && clienteId && comM >= 1e-6) {
    const parClienteCerrado =
      (transacciones || []).some((t) =>
        (t.tipo || '').toLowerCase() === 'ingreso' &&
        String(t.pagador || '').toLowerCase() === 'cliente' &&
        String(t.cobrador || '').toLowerCase() === 'pandy' &&
        (t.estado || '').toLowerCase() === 'ejecutada'
      ) &&
      (transacciones || []).some((t) =>
        (t.tipo || '').toLowerCase() === 'egreso' &&
        String(t.pagador || '').toLowerCase() === 'pandy' &&
        String(t.cobrador || '').toLowerCase() === 'cliente' &&
        (t.estado || '').toLowerCase() === 'ejecutada'
      );
    const condicionPandy = getCondicionComisionReglasNegocio(reglasDeNegocio, tipoOperacionCodigo, 'cliente', 'pandy', 'ingreso');
    const estadoComPandy = condicionPandy
      ? estadoEfectivoComision(transacciones, condicionPandy)
      : (parClienteCerrado ? 'ejecutada' : 'pendiente');
    const reglaComPandy = lookupReglasDeNegocio(
      reglasDeNegocio,
      tipoOperacionCodigo,
      'cliente',
      'pandy',
      'ingreso',
      true,
      estadoComPandy,
      parClienteCerrado
    )[0];
    // Comisión Pandy: estado efectivo ejecutada si Tx1 o Tx2 ejecutada (ver estadoEfectivoComision par_cliente). P,P,P,P sin ninguna → pendiente → no fila.
    if (estadoComPandy === 'ejecutada' && reglaComPandy && coercePgBooleanStrict(reglaComPandy.incluir_en_detalle)) {
      const signo = Number(reglaComPandy.signo) != null ? Number(reglaComPandy.signo) : 1;
      const cerrado = estadoComPandy === 'ejecutada';
      const trIngresoClientePandy = (transacciones || [])
        .filter((t) =>
          (t.tipo || '').toLowerCase() === 'ingreso' &&
          String(t.pagador || '').toLowerCase() === 'cliente' &&
          String(t.cobrador || '').toLowerCase() === 'pandy' &&
          (t.estado || '').toLowerCase() === 'ejecutada' &&
          Math.abs(Number(t.monto) - comM) >= 1e-6
        )
        .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))[0];
      const nroTransComisionConcepto = trIngresoClientePandy && trIngresoClientePandy.numero != null ? trIngresoClientePandy.numero : null;
      const moneda = String(comisionPandyMon || reglaComPandy.moneda || 'ARS').toUpperCase();
      rowsCcCliente.push({
        cliente_id: clienteId,
        orden_id: ordenId,
        transaccion_id: null,
        transaccion_numero: null,
        concepto: conceptoCcLeyenda('comision_acuerdo', orden.numero, nroTransComisionConcepto),
        fecha,
        usuario_id: currentUserId,
        moneda,
        monto: signo * comM,
        estado: cerrado ? 'cerrado' : 'pendiente',
        estado_fecha: ahora,
        incluir_en_detalle: coercePgBooleanStrict(reglaComPandy.incluir_en_detalle),
        ...montosCcPorMoneda(moneda, signo * comM)
      });
    }
  }
  if (codOpCh === 'CHEQUE-ARS' && intermediarioId && Number(comisionIntMonto) >= 1e-6) {
    const condicion = getCondicionComisionReglasNegocio(reglasDeNegocio, tipoOperacionCodigo, 'pandy', 'intermediario', 'egreso');
    const estadoEf = condicion
      ? estadoEfectivoComision(transacciones, condicion)
      : estadoEfectivoComision(transacciones, 'par_pandy_int');
    const parIntCerrado = estadoEf === 'ejecutada';
    const reglaComInt = lookupReglasDeNegocio(
      reglasDeNegocio,
      tipoOperacionCodigo,
      'pandy',
      'intermediario',
      'egreso',
      true,
      estadoEf,
      parIntCerrado
    )[0];
    // Comisión intermediario en CC solo cuando Tx3 o Tx4 ejecutada (par_pandy_int efectivo); no fila con todo pendiente (E2E P,P,P,P).
    if (estadoEf === 'ejecutada' && reglaComInt && coercePgBooleanStrict(reglaComInt.incluir_en_detalle)) {
      const signo = Number(reglaComInt.signo) != null ? Number(reglaComInt.signo) : 1;
      const comInt = Number(comisionIntMonto) || 0;
      const monCom = String(comisionIntMon || 'ARS').toUpperCase();
      rowsCcInt.push({
        intermediario_id: intermediarioId,
        orden_id: ordenId,
        transaccion_id: null,
        transaccion_numero: null,
        concepto: conceptoCcLeyenda('comision_acuerdo', orden.numero, null),
        fecha,
        usuario_id: currentUserId,
        moneda: monCom,
        monto: signo * comInt,
        estado: parIntCerrado ? 'cerrado' : 'pendiente',
        estado_fecha: ahora,
        incluir_en_detalle: coercePgBooleanStrict(reglaComInt.incluir_en_detalle),
        ...montosCcPorMoneda(monCom, signo * comInt)
      });
    }
  }
}

/** Actualiza las tarjetas de saldo de cuenta corriente: etiqueta "Saldo a favor" / "Saldo negativo" y monto. saldos = { USD, EUR, ARS } o null para reset. */
function setCcSaldoCards(saldos) {
  const monedas = ['USD', 'EUR', 'ARS'];
  monedas.forEach((moneda) => {
    const labelEl = document.getElementById('cc-saldo-label-' + moneda.toLowerCase());
    const valorEl = document.getElementById('cc-saldo-' + moneda.toLowerCase());
    if (!valorEl) return;
    if (saldos == null) {
      if (labelEl) labelEl.textContent = '';
      valorEl.textContent = '–';
      valorEl.className = 'valor';
      return;
    }
    const saldo = Number(saldos[moneda]) || 0;
    if (labelEl) {
      labelEl.textContent = saldo >= 0 ? 'Saldo a favor' : 'Saldo negativo';
    }
    valorEl.textContent = formatMonto(saldo >= 0 ? saldo : -saldo, moneda);
    valorEl.className = 'valor ' + (saldo >= 0 ? 'positivo' : 'negativo');
  });
}

/**
 * Recalcula CC y caja desde orden + transacciones para todas las órdenes que tienen instrumentación.
 * Así, al refrescar la página o abrir Cuenta corriente, los movimientos quedan derivados de la fuente de verdad (no hace falta truncar).
 */
function sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion() {
  return client.from('instrumentacion').select('orden_id').then((r) => {
    const ordenIds = (r.data || []).map((x) => x.orden_id).filter(Boolean);
    if (ordenIds.length === 0) return Promise.resolve();
    // Encadenar (no Promise.all): evita picos de carga y condiciones de carrera en DB al leer transacciones
    // mientras otra orden termina su RPC sync_cc_caja_orden; el detalle/modal y el resumen quedan más alineados.
    return ordenIds.reduce(
      (prev, ordenId) => prev.then(() => sincronizarCcYCajaDesdeOrden(ordenId)),
      Promise.resolve()
    );
  });
}

function loadCuentaCorriente() {
  const loadingEl = document.getElementById('cc-loading');
  const contenido = document.getElementById('cc-contenido');
  const tbody = document.getElementById('cc-resumen-tbody');
  const panelSaldos = document.getElementById('cc-panel-saldos');
  const panelMov = document.getElementById('cc-panel-movimientos');
  if (!contenido || !tbody) return;

  if (loadingEl) loadingEl.style.display = 'block';
  const loadingShownAtCc = Date.now();
  contenido.style.display = 'none';
  if (panelSaldos) panelSaldos.style.display = 'none';
  if (panelMov) panelMov.style.display = 'none';

  // Corazón de la app: la única fuente de verdad es orden + transacciones. Siempre sincronizar CC (y caja) antes de cargar, así el detalle muestra exactamente lo que indica el modelo (ej. 3 movimientos cliente para ARS-ARS+int). Si sync falla, se cargan igual los movimientos ya guardados.
  const promDatos = sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion()
    .then(() => {})
    .catch(() => {})
    .then(() => Promise.all([
      client.from('clientes').select('id, nombre').order('nombre', { ascending: true }),
      client.from('intermediarios').select('id, nombre').order('nombre', { ascending: true }),
      client.from('movimientos_cuenta_corriente').select('id, cliente_id, orden_id, transaccion_id, transaccion_numero, fecha, moneda, monto, concepto, monto_usd, monto_ars, monto_eur, estado, incluir_en_detalle'),
      client.from('movimientos_cuenta_corriente_intermediario').select('id, intermediario_id, orden_id, transaccion_id, transaccion_numero, fecha, moneda, monto, concepto, monto_usd, monto_ars, monto_eur, estado, incluir_en_detalle'),
    ]));
  promDatos.then(([rClientes, rInt, rMovCli, rMovInt]) => {
    const clientes = rClientes.data || [];
    const intermediarios = rInt.data || [];
    const movCliRaw = rMovCli.data || [];
    const movIntRaw = rMovInt.data || [];
    const transaccionIds = [...new Set([...(movCliRaw.map((m) => m.transaccion_id)), ...(movIntRaw.map((m) => m.transaccion_id))].filter(Boolean))];
    const ordenIds = [...new Set([...(movCliRaw.map((m) => m.orden_id)), ...(movIntRaw.map((m) => m.orden_id))].filter(Boolean))];
    // Una sola carga de pendientes CC: instrumentación (global + por órdenes con movimientos) → órdenes → transacciones pendientes. Regla unificada para cliente e intermediario.
    const promPendientesCcGlobal = Promise.all([
      client.from('instrumentacion').select('id, orden_id'),
      ordenIds.length > 0 ? client.from('instrumentacion').select('id, orden_id').in('orden_id', ordenIds) : Promise.resolve({ data: [] }),
    ]).then(([rInstAll, rInstFromOrdenes]) => {
      const instAll = (rInstAll.data || []).filter((i) => i && i.id);
      const instFromOrdenes = (rInstFromOrdenes.data || []).filter((i) => i && i.id);
      const instById = {};
      instAll.forEach((i) => { instById[i.id] = i; });
      instFromOrdenes.forEach((i) => { instById[i.id] = i; });
      const inst = Object.values(instById);
      const ordenIdsFromInst = [...new Set(inst.map((i) => i.orden_id).filter(Boolean))];
      if (ordenIdsFromInst.length === 0) return { pendienteClienteAjusteByCli: {}, pendientePandyDebeIntByInt: {} };
      return client.from('ordenes').select('id, cliente_id, intermediario_id, monto_recibido, monto_entregado, moneda_recibida, moneda_entregada')
          .in('id', ordenIdsFromInst)
          .then((rO) => {
            if (rO.error) return { pendienteClienteAjusteByCli: {}, pendientePandyDebeIntByInt: {} };
            const ordenes = rO.data || [];
            const ordenById = Object.fromEntries(ordenes.map((o) => [o.id, o]));
            const instIdSet = new Set(inst.map((i) => i.id));
            const instIdToOrdenId = Object.fromEntries(inst.map((i) => [i.id, i.orden_id]));
            // Cargar TODAS las transacciones pendientes y filtrar por instrumentación en JS (evita límite .in y RLS por orden).
            return client.from('transacciones').select('id, instrumentacion_id, estado, pagador, cobrador, monto, moneda')
              .eq('estado', 'pendiente')
              .then((rTrx) => {
                if (rTrx.error) return { pendienteClienteAjusteByCli: {}, pendientePandyDebeIntByInt: {} };
                const pendientes = (rTrx.data || []).filter((t) => (t.estado || '').toString().toLowerCase() === 'pendiente');
                const trx = pendientes.filter((t) => t.instrumentacion_id && instIdSet.has(t.instrumentacion_id));
                const byInst = {};
                trx.forEach((t) => {
                  const id = t.instrumentacion_id;
                  if (!byInst[id]) byInst[id] = [];
                  byInst[id].push(t);
                });
                const pendienteClienteAjusteByCli = {};
                const pendientePandyDebeIntByInt = {};
                trx.forEach((t) => {
                  const ordenId = instIdToOrdenId[t.instrumentacion_id];
                  const orden = ordenId ? ordenById[ordenId] : null;
                  if (!orden) return;
                  const transaccionesOrden = byInst[t.instrumentacion_id] || [];
                  const { cliente, intermediario } = contribucionPendienteCcUnificada(t, orden, transaccionesOrden);
                  if (intermediario && intermediario.id) {
                    if (!pendientePandyDebeIntByInt[intermediario.id]) pendientePandyDebeIntByInt[intermediario.id] = { USD: 0, EUR: 0, ARS: 0 };
                    ['USD', 'EUR', 'ARS'].forEach((mon) => { pendientePandyDebeIntByInt[intermediario.id][mon] += intermediario.delta[mon] || 0; });
                  }
                  if (cliente && cliente.id) {
                    if (!pendienteClienteAjusteByCli[cliente.id]) pendienteClienteAjusteByCli[cliente.id] = { USD: 0, EUR: 0, ARS: 0 };
                    ['USD', 'EUR', 'ARS'].forEach((mon) => { pendienteClienteAjusteByCli[cliente.id][mon] += cliente.delta[mon] || 0; });
                  }
                });
                return { pendienteClienteAjusteByCli, pendientePandyDebeIntByInt };
              });
          });
    })
      .catch(() => ({ pendienteClienteAjusteByCli: {}, pendientePandyDebeIntByInt: {} }));
    return Promise.all([
      transaccionIds.length > 0 ? client.from('transacciones').select('id, estado, pagador, monto, moneda').in('id', transaccionIds) : Promise.resolve({ data: [] }),
      ordenIds.length > 0 ? client.from('instrumentacion').select('id, orden_id').in('orden_id', ordenIds) : Promise.resolve({ data: [] }),
      ordenIds.length > 0 ? client.from('ordenes').select('id, numero, cliente_id, intermediario_id, tipo_operacion_id, tipos_operacion(codigo, nombre, icono_modo, icono_url_publica, moneda_in, moneda_out, usa_intermediario), monto_recibido, monto_entregado, moneda_recibida, moneda_entregada, tasa_descuento_intermediario').in('id', ordenIds) : Promise.resolve({ data: [] }),
      promPendientesCcGlobal,
    ]).then(([rTr, rInst, rOrdenes, pendientesResult]) => {
      const trById = {};
      const trPagadorById = {};
      const trMontoById = {};
      (rTr.data || []).forEach((t) => {
        trById[t.id] = t.estado;
        trPagadorById[t.id] = (t.pagador || '').toLowerCase();
        trMontoById[t.id] = { monto: t.monto, moneda: t.moneda };
      });
      const instByOrden = {};
      (rInst.data || []).forEach((i) => { instByOrden[i.orden_id] = i.id; });
      const ordenNumeroById = Object.fromEntries((rOrdenes.data || []).map((o) => [o.id, o.numero]));
      const ordenById = Object.fromEntries((rOrdenes.data || []).map((o) => [o.id, o]));
      const instIds = (rInst.data || []).map((i) => i.id).filter(Boolean);
      const promTrInst = instIds.length > 0
        ? client.from('transacciones').select('id, instrumentacion_id, estado, tipo, pagador, cobrador, monto').in('instrumentacion_id', instIds)
        : Promise.resolve({ data: [] });
      return promTrInst.then((rTrInst) => ({
        rTrInst,
        pendientePandyDebeIntByInt: (pendientesResult && pendientesResult.pendientePandyDebeIntByInt) || {},
        pendienteClienteAjusteByCli: (pendientesResult && pendientesResult.pendienteClienteAjusteByCli) || {},
        trById,
        instByOrden,
        ordenNumeroById,
        trPagadorById,
        ordenById,
        trMontoById,
      }));
    }).then(({ rTrInst, pendientePandyDebeIntByInt, pendienteClienteAjusteByCli, trById, instByOrden, ordenNumeroById, trPagadorById, ordenById, trMontoById }) => {
      const orderHasEjecutada = {};
      (rTrInst.data || []).forEach((t) => {
        const ordenId = Object.keys(instByOrden || {}).find((oid) => instByOrden[oid] === t.instrumentacion_id);
        if (ordenId && t.estado === 'ejecutada') orderHasEjecutada[ordenId] = true;
      });
      return { rTrInst, instByOrden, trById, orderHasEjecutada, ordenNumeroById, trPagadorById, ordenById, trMontoById, pendientePandyDebeIntByInt, pendienteClienteAjusteByCli };
    }).then(({ rTrInst, instByOrden, trById, orderHasEjecutada, ordenNumeroById, trPagadorById, ordenById, trMontoById, pendientePandyDebeIntByInt, pendienteClienteAjusteByCli }) => {
      // Incluir en saldo: compromisos (Compromiso de Pago / Compromiso a Cobrar o legacy "Compromiso") y realizados (Cobro/Pago Realizado o legacy "Compromiso Saldado").
      function incluirEnSaldo(m, trEstados, ordEjecutada) {
        if (m.estado === 'anulado') return false;
        const concepto = (m.concepto || '').toString();
        if (concepto.includes('Cobro Realizado') || concepto.includes('Pago Realizado')) return true;
        if (concepto.includes('Compromiso de Pago') || concepto.includes('Compromiso a Cobrar')) return true;
        if (concepto.includes('Compromiso Saldado')) return true;
        if (concepto.includes('Compromiso') && !concepto.includes('Compromiso Saldado')) return true;
        return true;
      }
      const movCli = movCliRaw.filter((m) => incluirEnSaldo(m, trById, orderHasEjecutada));
      const movInt = movIntRaw.filter((m) => incluirEnSaldo(m, trById, orderHasEjecutada));
      // Para intermediario: usar monto real de la transacción en "Compromiso a Cobrar" pendiente (Int→Pandy), así el resumen refleja lo que el intermediario aún debe.
      const movIntEnriched = (movInt || []).map((m) => {
        if (m.estado === 'pendiente' && (m.concepto || '').includes('Compromiso a Cobrar')) {
          const t = trMontoById[m.transaccion_id];
          if (t != null && t.monto != null) {
            const mon = ((t.moneda || m.moneda || 'ARS') || '').toString().toUpperCase();
            const val = Number(t.monto) || 0;
            return {
              ...m,
              monto: val,
              monto_usd: mon === 'USD' ? val : 0,
              monto_ars: mon === 'ARS' ? val : 0,
              monto_eur: mon === 'EUR' ? val : 0,
            };
          }
        }
        return m;
      });
      // Saldos por modelo CC (docs/CC_MODELO_REFERENCIA.md): por orden, modelo ARS-ARS+int o suma de movimientos; responde a cualquier cambio y orden.
      // Saldo por orden (precomp): suma de **todos** los movimientos no anulados (coherente con lo que se ve en Movimientos).
      function sumMovsPorMoneda(movs) {
        const acc = { USD: 0, EUR: 0, ARS: 0 };
        (movs || []).forEach((m) => {
          if ((m.estado || '').toString().toLowerCase() === 'anulado') return;
          const has = m.monto_usd != null || m.monto_ars != null || m.monto_eur != null;
          if (has) {
            acc.USD += Number(m.monto_usd) || 0;
            acc.ARS += Number(m.monto_ars) || 0;
            acc.EUR += Number(m.monto_eur) || 0;
          } else {
            const mon = (m.moneda || 'ARS').toString().toUpperCase();
            const val = Number(m.monto) || 0;
            if (mon === 'USD') acc.USD += val; else if (mon === 'EUR') acc.EUR += val; else acc.ARS += val;
          }
        });
        return acc;
      }
      const transaccionesByOrdenId = {};
      (rTrInst.data || []).forEach((t) => {
        const ordenId = t.instrumentacion_id ? Object.keys(instByOrden || {}).find((oid) => instByOrden[oid] === t.instrumentacion_id) : null;
        if (!ordenId) return;
        if (!transaccionesByOrdenId[ordenId]) transaccionesByOrdenId[ordenId] = [];
        transaccionesByOrdenId[ordenId].push(t);
      });
      const movsCliByOrdenCliente = {};
      (movCli || []).forEach((m) => {
        const oid = m.orden_id;
        const cid = m.cliente_id;
        if (!oid || !cid) return;
        if (!movsCliByOrdenCliente[oid]) movsCliByOrdenCliente[oid] = {};
        if (!movsCliByOrdenCliente[oid][cid]) movsCliByOrdenCliente[oid][cid] = [];
        movsCliByOrdenCliente[oid][cid].push(m);
      });
      const movsIntByOrdenInt = {};
      (movIntEnriched || []).forEach((m) => {
        const oid = m.orden_id;
        const iid = m.intermediario_id;
        if (!oid || !iid) return;
        if (!movsIntByOrdenInt[oid]) movsIntByOrdenInt[oid] = {};
        if (!movsIntByOrdenInt[oid][iid]) movsIntByOrdenInt[oid][iid] = [];
        movsIntByOrdenInt[oid][iid].push(m);
      });
      const saldoClienteByCliPrecomp = {};
      const saldoIntByIdPrecomp = {};
      Object.keys(ordenById || {}).forEach((ordenId) => {
        const orden = ordenById[ordenId];
        if (!orden) return;
        const metaPre = tiposOperacionNestedMeta(orden.tipos_operacion);
        const codigo = metaPre.codigo !== '–' ? metaPre.codigo : null;
        const toJoin = orden.tipos_operacion && (Array.isArray(orden.tipos_operacion) ? orden.tipos_operacion[0] : orden.tipos_operacion);
        const esModelo = esTipoOperacionChequeArs(codigo, toJoin?.moneda_in, toJoin?.moneda_out) && orden.intermediario_id;
        const transacciones = transaccionesByOrdenId[ordenId] || [];
        let contribCliente = { USD: 0, EUR: 0, ARS: 0 };
        let contribInt = { USD: 0, EUR: 0, ARS: 0 };
        if (esModelo) {
          contribCliente = contribucionSaldoClienteModeloCc(orden, transacciones);
          contribInt = contribucionSaldoIntermediarioModeloCc(orden, transacciones);
        } else {
          if (orden.cliente_id) contribCliente = sumMovsPorMoneda(movsCliByOrdenCliente[ordenId]?.[orden.cliente_id]);
          if (orden.intermediario_id) contribInt = sumMovsPorMoneda(movsIntByOrdenInt[ordenId]?.[orden.intermediario_id]);
        }
        if (orden.cliente_id) {
          if (!saldoClienteByCliPrecomp[orden.cliente_id]) saldoClienteByCliPrecomp[orden.cliente_id] = { USD: 0, EUR: 0, ARS: 0 };
          ['USD', 'EUR', 'ARS'].forEach((mon) => { saldoClienteByCliPrecomp[orden.cliente_id][mon] += contribCliente[mon] || 0; });
        }
        if (orden.intermediario_id) {
          if (!saldoIntByIdPrecomp[orden.intermediario_id]) saldoIntByIdPrecomp[orden.intermediario_id] = { USD: 0, EUR: 0, ARS: 0 };
          ['USD', 'EUR', 'ARS'].forEach((mon) => { saldoIntByIdPrecomp[orden.intermediario_id][mon] += contribInt[mon] || 0; });
        }
      });
      return delayMinLoading(loadingShownAtCc).then(() => {
        buildCcResumenRows(clientes, intermediarios, movCli, movIntEnriched, loadingEl, contenido, tbody, ordenNumeroById, trPagadorById || {}, ordenById || {}, pendientePandyDebeIntByInt || {}, pendienteClienteAjusteByCli || {}, saldoClienteByCliPrecomp, saldoIntByIdPrecomp);
      });
    });
  }).catch((err) => {
    if (loadingEl) loadingEl.style.display = 'none';
    contenido.style.display = 'block';
    syncCcPestañasYPaneles();
  });
}

function buildCcResumenRows(clientes, intermediarios, movCli, movInt, loadingEl, contenido, tbody, ordenNumeroById, trPagadorById, ordenById, pendientePandyDebeIntByInt, pendienteClienteAjusteByCli, saldoClienteByCliPrecomp, saldoIntByIdPrecomp) {
  if (loadingEl) loadingEl.style.display = 'none';
  ordenNumeroById = ordenNumeroById || {};
  trPagadorById = trPagadorById || {};
  ordenById = ordenById || {};
  pendientePandyDebeIntByInt = pendientePandyDebeIntByInt || {};
  pendienteClienteAjusteByCli = pendienteClienteAjusteByCli || {};
  saldoClienteByCliPrecomp = saldoClienteByCliPrecomp || null;
  saldoIntByIdPrecomp = saldoIntByIdPrecomp || null;
  const ordenTipoOpMetaById = {};
  Object.keys(ordenById).forEach((oid) => {
    ordenTipoOpMetaById[oid] = tiposOperacionNestedMeta(ordenById[oid]?.tipos_operacion);
  });
  function nombreOriginante(mov, tipo, clientesById, intermediariosById) {
    const pagador = trPagadorById[mov.transaccion_id];
    const orden = ordenById[mov.orden_id];
    if (!pagador) return '–';
    if (pagador === 'pandy') return 'Pandy';
    if (pagador === 'cliente') {
      const clienteId = tipo === 'cliente' ? mov.cliente_id : (orden && orden.cliente_id);
      return (clientesById[clienteId] && clientesById[clienteId].nombre) || '–';
    }
    if (pagador === 'intermediario') {
      const intId = orden && orden.intermediario_id;
      return (intermediariosById[intId] && intermediariosById[intId].nombre) || '–';
    }
    return '–';
  }
  function parseOrdenNumero(concepto) {
    const txt = (concepto || '').toString();
    let m = txt.match(/(?:ORDEN|NRO ORDEN)\s*(\d+)/i);
    if (m && m[1]) return m[1];
    m = txt.match(/nro\s*orden\s*(\d+)/i);
    if (m && m[1]) return m[1];
    return null;
  }
  function parseMonedaDesdeConcepto(concepto) {
    const txt = (concepto || '').toString().toUpperCase();
    const m = txt.match(/\b(USD|ARS|EUR)\b/);
    return m ? m[1] : null;
  }
  function getMontosPorMoneda(m) {
    const hasPorMoneda = m.monto_usd != null || m.monto_ars != null || m.monto_eur != null;
    if (hasPorMoneda) {
      return {
        USD: Number(m.monto_usd) || 0,
        ARS: Number(m.monto_ars) || 0,
        EUR: Number(m.monto_eur) || 0,
      };
    }
    const mon = (m.moneda || '').toString().toUpperCase();
    const val = Number(m.monto) || 0;
    return {
      USD: mon === 'USD' ? val : 0,
      ARS: mon === 'ARS' ? val : 0,
      EUR: mon === 'EUR' ? val : 0,
    };
  }
  /**
   * Saldo CC resumen: suma algebraica por moneda de todos los movimientos no anulados (igual criterio que la lista Movimientos).
   */
  function saldosDesdeMovimientosPorOrden(movs) {
    const acc = { USD: 0, EUR: 0, ARS: 0 };
    (movs || []).forEach((m) => {
      if ((m.estado || '').toString().toLowerCase() === 'anulado') return;
      const montos = getMontosPorMoneda(m);
      acc.USD += montos.USD;
      acc.ARS += montos.ARS;
      acc.EUR += montos.EUR;
    });
    return acc;
  }

  const movsCliById = {};
  (movCli || []).forEach((m) => {
    const id = m.cliente_id;
    if (!id) return;
    if (!movsCliById[id]) movsCliById[id] = [];
    movsCliById[id].push(m);
  });
  const movsIntById = {};
  (movInt || []).forEach((m) => {
    const id = m.intermediario_id;
    if (!id) return;
    if (!movsIntById[id]) movsIntById[id] = [];
    movsIntById[id].push(m);
  });

  const clientesById = Object.fromEntries((clientes || []).map((c) => [c.id, c]));
  const intermediariosById = Object.fromEntries((intermediarios || []).map((i) => [i.id, i]));
  const rows = [];
  const addedCli = new Set();
  const addedInt = new Set();
  // Pendiente “ajuste” global (legacy/UI): no reemplaza la suma de movimientos del resumen.
  function pendienteClienteAjusteForCli(clienteId) {
    const p = pendienteClienteAjusteByCli[clienteId];
    if (!p) return null;
    const has = Math.abs(p.USD || 0) + Math.abs(p.EUR || 0) + Math.abs(p.ARS || 0);
    return has >= 1e-6 ? p : null;
  }
  // Saldo = suma de movimientos no anulados (coherente con listado).
  const saldosCliente = (id) => saldosDesdeMovimientosPorOrden(movsCliById[id] || []);
  clientes.forEach((c) => {
    const saldos = saldosCliente(c.id);
    rows.push({ tipo: 'cliente', id: c.id, nombre: c.nombre, saldos, pendienteClienteAjuste: pendienteClienteAjusteForCli(c.id) });
    addedCli.add(c.id);
  });
  Object.keys(movsCliById || {}).forEach((id) => {
    if (addedCli.has(id)) return;
    const c = clientesById[id];
    const saldos = saldosCliente(id);
    rows.push({ tipo: 'cliente', id, nombre: (c && c.nombre) || '–', saldos, pendienteClienteAjuste: pendienteClienteAjusteForCli(id) });
    addedCli.add(id);
  });
  Object.keys(pendienteClienteAjusteByCli || {}).forEach((id) => {
    if (addedCli.has(id)) return;
    const c = clientesById[id];
    const pendienteClienteAjuste = pendienteClienteAjusteForCli(id);
    if (!pendienteClienteAjuste) return;
    rows.push({ tipo: 'cliente', id, nombre: (c && c.nombre) || '–', saldos: { USD: 0, EUR: 0, ARS: 0 }, pendienteClienteAjuste });
    addedCli.add(id);
  });
  function pendientePandyDebeForInt(intId) {
    const p = pendientePandyDebeIntByInt[intId];
    if (!p) return null;
    const has = Math.abs(p.USD || 0) + Math.abs(p.EUR || 0) + Math.abs(p.ARS || 0);
    return has >= 1e-6 ? p : null;
  }
  const saldosInt = (id) => saldosDesdeMovimientosPorOrden(movsIntById[id] || []);
  intermediarios.forEach((i) => {
    const saldos = saldosInt(i.id);
    rows.push({ tipo: 'intermediario', id: i.id, nombre: i.nombre, saldos, pendientePandyDebe: pendientePandyDebeForInt(i.id) });
    addedInt.add(i.id);
  });
  Object.keys(movsIntById || {}).forEach((id) => {
    if (addedInt.has(id)) return;
    const i = intermediariosById[id];
    const saldos = saldosInt(id);
    rows.push({ tipo: 'intermediario', id, nombre: (i && i.nombre) || '–', saldos, pendientePandyDebe: pendientePandyDebeForInt(id) });
    addedInt.add(id);
  });
  Object.keys(pendientePandyDebeIntByInt || {}).forEach((id) => {
    if (addedInt.has(id)) return;
    const i = intermediariosById[id];
    const pendientePandyDebe = pendientePandyDebeForInt(id);
    if (!pendientePandyDebe) return;
    rows.push({ tipo: 'intermediario', id, nombre: (i && i.nombre) || '–', saldos: { USD: 0, EUR: 0, ARS: 0 }, pendientePandyDebe });
    addedInt.add(id);
  });
  ccResumenRowsTodos = [...rows].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  // Detalle = solo movimientos con incluir_en_detalle (si la columna no existe, se muestran todos).
  const detalleList = [];
  (movCli || []).forEach((m) => {
    if (m.incluir_en_detalle === false) return;
    const metaC = ordenTipoOpMetaById[m.orden_id];
    detalleList.push({
      ...m,
      tipo: 'cliente',
      nombre: (clientesById[m.cliente_id] && clientesById[m.cliente_id].nombre) || '–',
      originante: nombreOriginante(m, 'cliente', clientesById, intermediariosById),
      orden_numero: ordenNumeroById[m.orden_id] != null ? ordenNumeroById[m.orden_id] : (m.orden_numero != null ? m.orden_numero : null),
      tipo_operacion: metaC ? metaC.codigo : '–',
      tipo_op_nombre: metaC ? metaC.nombre : '',
      tipo_op_icono_modo: metaC ? metaC.icono_modo : 'auto',
      tipo_op_icono_url: metaC ? metaC.icono_url_publica : '',
      tipo_op_usa_intermediario: metaC ? metaC.usa_intermediario === true : false,
    });
  });
  (movInt || []).forEach((m) => {
    if (m.incluir_en_detalle === false) return;
    const metaI = ordenTipoOpMetaById[m.orden_id];
    detalleList.push({
      ...m,
      tipo: 'intermediario',
      nombre: (intermediariosById[m.intermediario_id] && intermediariosById[m.intermediario_id].nombre) || '–',
      originante: nombreOriginante(m, 'intermediario', clientesById, intermediariosById),
      orden_numero: ordenNumeroById[m.orden_id] != null ? ordenNumeroById[m.orden_id] : (m.orden_numero != null ? m.orden_numero : null),
      tipo_operacion: metaI ? metaI.codigo : '–',
      tipo_op_nombre: metaI ? metaI.nombre : '',
      tipo_op_icono_modo: metaI ? metaI.icono_modo : 'auto',
      tipo_op_icono_url: metaI ? metaI.icono_url_publica : '',
      tipo_op_usa_intermediario: metaI ? metaI.usa_intermediario === true : false,
    });
  });
  // Corazón de la app: un movimiento lógico = una fila. Dedupe por (tipo, orden, transacción, monto, concepto) por si la DB tuviera duplicados históricos.
  const detalleKey = (a) => [a.tipo, a.orden_id, a.transaccion_id, a.monto, (a.concepto || '').slice(0, 60)].join('\t');
  const seenDetalle = new Set();
  const detalleListUnicos = detalleList.filter((a) => {
    const k = detalleKey(a);
    if (seenDetalle.has(k)) return false;
    seenDetalle.add(k);
    return true;
  });
  ccMovimientosDetalleList = detalleListUnicos.sort((a, b) => {
    const fa = (a.fecha || '').toString();
    const fb = (b.fecha || '').toString();
    if (fb !== fa) return fb.localeCompare(fa);
    return (b.id || 0) - (a.id || 0);
  });

  Promise.all([
    hayTipoOperacionActivoConMoneda('USD'),
    hayTipoOperacionActivoConMoneda('ARS'),
    hayTipoOperacionActivoConMoneda('EUR'),
  ]).then(([u, a, e]) => {
    // Por defecto: movimientos del día (hoy AR); el resumen de saldos sigue usando toda la historia en ccResumenRowsTodos.
    ccMovimientosMostrarTodoHistorial = false;
    const hoyCc = fechaHoyYYYYMMDDArgentina();
    ccDetalleDesde = hoyCc;
    ccDetalleHasta = hoyCc;
    aplicarVisibilidadMonedasCuentaCorriente({ USD: !!u, ARS: !!a, EUR: !!e });
    poblarSelectCcDetalleEntidad();
    aplicarFiltroCcResumen();
  });
}

/** Rellena el combo Cliente/Intermediario en Movimientos según movimientos cargados y tipo actual. */
function poblarSelectCcDetalleEntidad() {
  const sel = document.getElementById('cc-detalle-entidad-select');
  const labelSpan = document.getElementById('cc-detalle-entidad-label-text');
  if (!sel) return;
  if (labelSpan) labelSpan.textContent = ccFiltroTipo === 'cliente' ? 'Cliente:' : 'Intermediario:';
  const idKey = ccFiltroTipo === 'cliente' ? 'cliente_id' : 'intermediario_id';
  const movs = ccMovimientosDetalleList.filter((m) => m.tipo === ccFiltroTipo);
  const map = new Map();
  movs.forEach((m) => {
    const id = m[idKey];
    if (!id) return;
    const nombre = ((m.nombre || '') + '').trim() || '–';
    if (!map.has(id)) map.set(id, nombre);
  });
  const sorted = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const prev = ccDetalleFiltroEntidadId;
  sel.innerHTML = '<option value="">' + (ccFiltroTipo === 'cliente' ? 'Todos los clientes' : 'Todos los intermediarios') + '</option>'
    + sorted.map(([id, nom]) => '<option value="' + escapeHtml(String(id)) + '">' + escapeHtml(nom) + '</option>').join('');
  if (prev && sorted.some(([id]) => id === prev)) {
    sel.value = prev;
    ccDetalleFiltroEntidadId = prev;
  } else {
    ccDetalleFiltroEntidadId = '';
    sel.value = '';
  }
  const ariaEnt = ccFiltroTipo === 'cliente' ? 'Filtrar movimientos por cliente' : 'Filtrar movimientos por intermediario';
  sel.setAttribute('aria-label', ariaEnt);
}

/** Muestra el panel Saldos o Movimientos y actualiza solapas (clase activo y aria-selected). */
function syncCcPestañasYPaneles() {
  const panelSaldos = document.getElementById('cc-panel-saldos');
  const panelMov = document.getElementById('cc-panel-movimientos');
  const toggleEl = document.getElementById('cc-vista-toggle');
  const esDetalle = ccVistaToggle === 'detalle';
  if (panelSaldos) panelSaldos.style.display = esDetalle ? 'none' : 'block';
  if (panelMov) panelMov.style.display = esDetalle ? 'block' : 'none';
  if (toggleEl) {
    toggleEl.querySelectorAll('button[data-vista]').forEach((b) => {
      const v = b.getAttribute('data-vista');
      const on = (esDetalle && v === 'detalle') || (!esDetalle && v === 'resumen');
      b.classList.toggle('activo', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
}

function aplicarFiltroCcResumen() {
  const contenidoEl = document.getElementById('cc-contenido');
  const detalleWrap = document.getElementById('cc-detalle-wrap');

  if (ccVistaToggle === 'detalle') {
    syncCcPestañasYPaneles();
    if (contenidoEl) contenidoEl.style.display = 'none';
    if (detalleWrap) detalleWrap.style.display = 'block';
    const rangoWrap = document.getElementById('cc-detalle-rango-wrap');
    if (rangoWrap) rangoWrap.style.display = 'flex';
    let filtrados = ccMovimientosDetalleList.filter((m) => m.tipo === ccFiltroTipo);
    if (ccDetalleFiltroEntidadId) {
      if (ccFiltroTipo === 'cliente') {
        filtrados = filtrados.filter((m) => m.cliente_id === ccDetalleFiltroEntidadId);
      } else {
        filtrados = filtrados.filter((m) => m.intermediario_id === ccDetalleFiltroEntidadId);
      }
    }
    if (!ccMovimientosMostrarTodoHistorial) {
      const hoyStr = fechaHoyYYYYMMDDArgentina();
      const desde = ccDetalleDesde || hoyStr;
      const hasta = ccDetalleHasta || hoyStr;
      filtrados = filtrados.filter((m) => {
        const f = (m.fecha || '').toString().slice(0, 10);
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        return true;
      });
    }
    actualizarRangoDetalleDefaults();
    renderCcVistaDetalle(filtrados);
    return;
  }
  syncCcPestañasYPaneles();
  const rangoWrap = document.getElementById('cc-detalle-rango-wrap');
  if (rangoWrap) rangoWrap.style.display = 'none';
  if (contenidoEl) contenidoEl.style.display = 'block';
  if (detalleWrap) detalleWrap.style.display = 'none';
  // Resumen: solo filas con saldo ≠ 0 (saldo = suma movimientos no anulados).
  const EPSILON_SALDO = 1e-6;
  const conSaldo = (r) => Math.abs(Number(r.saldos.USD) || 0) >= EPSILON_SALDO || Math.abs(Number(r.saldos.EUR) || 0) >= EPSILON_SALDO || Math.abs(Number(r.saldos.ARS) || 0) >= EPSILON_SALDO;
  const filtrados = ccResumenRowsTodos.filter((r) => r.tipo === ccFiltroTipo).filter(conSaldo);
  renderCcResumenTable(filtrados);
}

function renderCcResumenTable(rows) {
  const tbody = document.getElementById('cc-resumen-tbody');
  if (!tbody) return;

  const monedas = MONEDAS_CC_UI;
  // Mostrar saldos con su signo real almacenado en CC (tabla fuente de verdad).
  tbody.innerHTML = rows
    .map((row) => {
      let tr = '<tr><td>' + escapeHtml(row.nombre || '–') + '</td>';
      monedas.forEach((mon) => {
        const s = Number(row.saldos[mon]) || 0;
        const val = s !== 0 ? formatMonto(s, mon) : '–';
        const cls = s > 0 ? 'valor-positivo' : (s < 0 ? 'valor-negativo' : '');
        tr += `<td data-cc-moneda-col="${mon}"><span class="${cls}">${val}</span></td>`;
      });
      tr += '<td><button type="button" class="btn-ver-detalle" data-tipo="' + escapeHtml(row.tipo) + '" data-id="' + escapeHtml(row.id) + '" data-nombre="' + escapeHtml(row.nombre || '') + '" title="Ver detalle de movimientos" aria-label="Ver detalle de movimientos"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="2.5" fill="none"/></svg></span></button></td></tr>';
      return tr;
    })
    .join('');

  if (rows.length === 0) {
    const tipoLabel = ccFiltroTipo === 'cliente' ? 'clientes' : 'intermediarios';
    const colspan = ccColspanResumenSaldosVacio();
    tbody.innerHTML = '<tr><td colspan="' + colspan + '">No hay ' + tipoLabel + ' con saldo distinto de cero.</td></tr>';
  } else {
    tbody.querySelectorAll('.btn-ver-detalle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tipo = btn.getAttribute('data-tipo');
        const id = btn.getAttribute('data-id');
        const nombre = btn.getAttribute('data-nombre') || '';
        if (tipo && id) openModalCcDetalle(tipo, id, nombre);
      });
    });
  }
  reaplicarVisibilidadMonedasCuentaCorrienteDom();
}

/** Sincroniza inputs Desde/Hasta con el estado (no expande solo al rango de filas visibles). */
function actualizarRangoDetalleDefaults() {
  const desdeEl = document.getElementById('cc-detalle-desde');
  const hastaEl = document.getElementById('cc-detalle-hasta');
  if (!desdeEl || !hastaEl) return;
  if (ccMovimientosMostrarTodoHistorial) {
    desdeEl.value = '';
    hastaEl.value = '';
    return;
  }
  desdeEl.value = ccDetalleDesde || '';
  hastaEl.value = ccDetalleHasta || '';
}

/** Comparador para ordenar filas de detalle CC por columna (fecha, nroOrden, nroTrans, concepto, usd, ars, eur, estado, nombre). */
function compareCcDetalleRow(a, b, col, dir) {
  let va, vb;
  switch (col) {
    case 'fecha':
      va = (a.fecha || '').toString().slice(0, 10);
      vb = (b.fecha || '').toString().slice(0, 10);
      return dir * (va < vb ? -1 : va > vb ? 1 : 0);
    case 'nroOrden':
      va = a.orden_numero != null ? Number(a.orden_numero) : -Infinity;
      vb = b.orden_numero != null ? Number(b.orden_numero) : -Infinity;
      return dir * (va - vb);
    case 'nroTrans':
      va = a.transaccion_numero != null ? Number(a.transaccion_numero) : -Infinity;
      vb = b.transaccion_numero != null ? Number(b.transaccion_numero) : -Infinity;
      return dir * (va - vb);
    case 'tipo_operacion':
      va = (a.tipo_operacion || '–').toString();
      vb = (b.tipo_operacion || '–').toString();
      return dir * (va.localeCompare(vb));
    case 'concepto':
      va = (a.concepto || '').toString();
      vb = (b.concepto || '').toString();
      return dir * (va.localeCompare(vb));
    case 'usd': case 'ars': case 'eur': {
      const key = col === 'usd' ? 'monto_usd' : (col === 'ars' ? 'monto_ars' : 'monto_eur');
      const mon = col === 'usd' ? 'USD' : (col === 'ars' ? 'ARS' : 'EUR');
      const tieneA = a.monto_usd != null || a.monto_ars != null || a.monto_eur != null;
      const tieneB = b.monto_usd != null || b.monto_ars != null || b.monto_eur != null;
      va = tieneA && a[key] != null ? Number(a[key]) : (a.moneda === mon ? Number(a.monto) || 0 : -Infinity);
      vb = tieneB && b[key] != null ? Number(b[key]) : (b.moneda === mon ? Number(b.monto) || 0 : -Infinity);
      return dir * (va - vb);
    }
    case 'estado':
      va = (a.estado || '').toString();
      vb = (b.estado || '').toString();
      return dir * (va.localeCompare(vb));
    case 'nombre':
      va = (a.nombre || '').toString();
      vb = (b.nombre || '').toString();
      return dir * (va.localeCompare(vb));
    case 'originante':
      va = (a.originante || '').toString();
      vb = (b.originante || '').toString();
      return dir * (va.localeCompare(vb));
    default:
      return 0;
  }
}

/** Renderiza la tabla de la vista "Detalle de movimientos". Columnas: Fecha, Orden, Trans., Concepto, USD, ARS, EUR, Estado, Cliente/Intermediario (entidad), Originante (pagador de la transacción). */
function renderCcVistaDetalle(filtrados) {
  const tbody = document.getElementById('cc-vista-detalle-tbody');
  const thEntity = document.getElementById('cc-detalle-th-entity');
  const thOriginante = document.getElementById('cc-detalle-th-originante');
  if (!tbody) return;
  const entityLabel = ccFiltroTipo === 'cliente' ? 'Cliente' : 'Intermediario';
  if (thEntity) thEntity.textContent = entityLabel;
  if (thOriginante) thOriginante.textContent = 'Originante';
  ccDetalleVistaRowsActual = filtrados;

  tbody.innerHTML = filtrados
    .map((m) => {
      // Un movimiento = una moneda (la de la transacción). Mostrar solo esa columna; el resto "–".
      const mon = (m.moneda || 'USD').toUpperCase();
      const valUsd = mon === 'USD' ? (m.monto_usd != null ? Number(m.monto_usd) : Number(m.monto) || 0) : null;
      const valArs = mon === 'ARS' ? (m.monto_ars != null ? Number(m.monto_ars) : Number(m.monto) || 0) : null;
      const valEur = mon === 'EUR' ? (m.monto_eur != null ? Number(m.monto_eur) : Number(m.monto) || 0) : null;
      const celdaUsd = mon === 'USD' ? formatearCeldaMonedaConSigno(valUsd, 'USD') : '–';
      const celdaArs = mon === 'ARS' ? formatearCeldaMonedaConSigno(valArs, 'ARS') : '–';
      const celdaEur = mon === 'EUR' ? formatearCeldaMonedaConSigno(valEur, 'EUR') : '–';
      const estadoLabel = (m.estado === 'pendiente' ? 'Pendiente' : (m.estado === 'cerrado' ? 'Cerrado' : (m.estado || '–')));
      const nroOrden = m.orden_numero != null ? String(m.orden_numero) : '–';
      const nroTrans = m.transaccion_numero != null ? String(m.transaccion_numero) : '–';
      const tipoOp = (m.tipo_operacion != null && m.tipo_operacion !== '–') ? String(m.tipo_operacion) : '–';
      const tipoOpHtml = tipoOp === '–' ? '–' : htmlTipoOperacionIconos(tipoOp, m.tipo_op_nombre || '', { iconoModo: m.tipo_op_icono_modo, iconoUrlPublica: m.tipo_op_icono_url, usaIntermediario: m.tipo_op_usa_intermediario === true });
      return `<tr>
          <td class="cc-col-fija cc-col-fija-1">${(m.fecha || '').toString().slice(0, 10)}</td>
          <td class="cc-col-fija cc-col-fija-2 cc-col-tipo-op-iconos">${tipoOpHtml}</td>
          <td>${escapeHtml(nroOrden)}</td>
          <td>${escapeHtml(nroTrans)}</td>
          <td class="td-concepto">${escapeHtml(m.concepto || '–')}</td>
          <td data-cc-moneda-col="USD">${celdaUsd}</td>
          <td data-cc-moneda-col="ARS">${celdaArs}</td>
          <td data-cc-moneda-col="EUR">${celdaEur}</td>
          <td>${escapeHtml(estadoLabel)}</td>
          <td>${escapeHtml(m.nombre || '–')}</td>
          <td>${escapeHtml(m.originante || '–')}</td>
        </tr>`;
    })
    .join('');

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + ccColspanVistaDetalleMovimientos() + '">No hay movimientos para el filtro seleccionado.</td></tr>';
  } else {
    setupCcDetalleVistaSortHeaders();
  }
  reaplicarVisibilidadMonedasCuentaCorrienteDom();
}

function setupCcDetalleVistaSortHeaders() {
  const table = document.getElementById('tabla-cc-detalle');
  if (!table || !table.closest('#cc-detalle-wrap')) return;
  const thead = table.querySelector('thead tr');
  if (!thead) return;
  thead.querySelectorAll('th[data-sort]').forEach((th) => {
    const col = th.getAttribute('data-sort');
    const indicator = th.querySelector('.sort-indicator') || (() => { const s = document.createElement('span'); s.className = 'sort-indicator'; th.appendChild(s); return s; })();
    indicator.textContent = ccDetalleSortCol === col ? (ccDetalleSortDir === 1 ? ' ▲' : ' ▼') : '';
    th.onclick = () => {
      if (ccDetalleVistaRowsActual.length === 0) return;
      if (ccDetalleSortCol === col) ccDetalleSortDir *= -1;
      else { ccDetalleSortCol = col; ccDetalleSortDir = 1; }
      const sorted = [...ccDetalleVistaRowsActual].sort((a, b) => compareCcDetalleRow(a, b, col, ccDetalleSortDir));
      ccDetalleVistaRowsActual = sorted;
      renderCcVistaDetalle(sorted);
    };
  });
}

/** Exporta la tabla actual de cuenta corriente (resumen o detalle según vista, filtro tipo e incluir cero). */
function exportarCcResumenExcel() {
  if (ccVistaToggle === 'detalle') {
    let filtrados = ccMovimientosDetalleList.filter((m) => m.tipo === ccFiltroTipo);
    if (ccDetalleFiltroEntidadId) {
      if (ccFiltroTipo === 'cliente') {
        filtrados = filtrados.filter((m) => m.cliente_id === ccDetalleFiltroEntidadId);
      } else {
        filtrados = filtrados.filter((m) => m.intermediario_id === ccDetalleFiltroEntidadId);
      }
    }
    if (!ccMovimientosMostrarTodoHistorial) {
      const hoyStr = fechaHoyYYYYMMDDArgentina();
      const desde = ccDetalleDesde || hoyStr;
      const hasta = ccDetalleHasta || hoyStr;
      filtrados = filtrados.filter((m) => {
        const f = (m.fecha || '').toString().slice(0, 10);
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        return true;
      });
    }
    if (filtrados.length === 0) {
      showToast('No hay movimientos para exportar.', 'info');
      return;
    }
    const entityHeader = ccFiltroTipo === 'cliente' ? 'Cliente' : 'Intermediario';
    const monedasExp = MONEDAS_CC_MOVIMIENTOS_COLS.filter((mon) => ccUiMonedasVisibles[mon]);
    const header = ['Fecha', 'Tipo op.', 'Orden', 'Trans.', 'Concepto', ...monedasExp, 'Estado', entityHeader, 'Originante'];
    const rows = filtrados.map((m) => {
      const tienePorMoneda = m.monto_usd != null || m.monto_ars != null || m.monto_eur != null;
      let usd = null, ars = null, eur = null;
      if (tienePorMoneda) {
        usd = m.monto_usd != null ? Number(m.monto_usd) : null;
        ars = m.monto_ars != null ? Number(m.monto_ars) : null;
        eur = m.monto_eur != null ? Number(m.monto_eur) : null;
      } else if (m.moneda && m.monto != null) {
        const val = Number(m.monto);
        if (m.moneda === 'USD') usd = val;
        else if (m.moneda === 'ARS') ars = val;
        else if (m.moneda === 'EUR') eur = val;
      }
      const porMon = { USD: usd, ARS: ars, EUR: eur };
      const estado = (m.estado === 'pendiente' ? 'Pendiente' : (m.estado === 'cerrado' ? 'Cerrado' : (m.estado || '–')));
      const nroOrden = m.orden_numero != null ? Number(m.orden_numero) : null;
      const nroTrans = m.transaccion_numero != null ? Number(m.transaccion_numero) : null;
      const tipoOp = (m.tipo_operacion != null && m.tipo_operacion !== '–') ? String(m.tipo_operacion) : '–';
      const celdasMon = monedasExp.map((mon) => porMon[mon]);
      return [(m.fecha || '').toString().slice(0, 10), tipoOp, nroOrden, nroTrans, m.concepto || '', ...celdasMon, estado, m.nombre || '', m.originante || ''];
    });
    const aoa = [header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CC detalle movimientos');
    const nombreArchivo = 'cc_detalle_movimientos_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, nombreArchivo);
    showToast('Exportado: ' + nombreArchivo, 'success');
    return;
  }
  const EPSILON_SALDO = 1e-6;
  const conSaldo = (r) => Math.abs(Number(r.saldos.USD) || 0) >= EPSILON_SALDO || Math.abs(Number(r.saldos.EUR) || 0) >= EPSILON_SALDO || Math.abs(Number(r.saldos.ARS) || 0) >= EPSILON_SALDO;
  const conSaldoList = ccResumenRowsTodos.filter(conSaldo);
  const filtrados = conSaldoList.filter((r) => r.tipo === ccFiltroTipo);
  if (filtrados.length === 0) {
    showToast('No hay filas para exportar.', 'info');
    return;
  }
  const monedasExp = MONEDAS_CC_UI.filter((mon) => ccUiMonedasVisibles[mon]);
  const header = ['Nombre', 'Tipo', ...monedasExp];
  const rows = filtrados.map((r) => {
    const tipoLabel = r.tipo === 'cliente' ? 'Cliente' : 'Intermediario';
    const cels = [r.nombre || '', tipoLabel];
    monedasExp.forEach((mon) => {
      const s = Number(r.saldos[mon]) || 0;
      cels.push(s);
    });
    return cels;
  });
  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cuenta corriente');
  const nombreArchivo = 'cuenta_corriente_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  XLSX.writeFile(wb, nombreArchivo);
  showToast('Exportado: ' + nombreArchivo, 'success');
}

/** Compromiso por moneda desde órdenes (solo no anuladas y no ejecutadas): +monto_recibido en moneda_recibida, -monto_entregado en moneda_entregada. Las ejecutadas ya están realizadas en movimientos (incl. comisión/ganancia). */
function compromisoDesdeOrdenes(ordenes, entityId, campoId) {
  const comp = { USD: 0, EUR: 0, ARS: 0 };
  (ordenes || []).forEach((o) => {
    if (o.estado === 'orden_ejecutada') return;
    if (o[campoId] !== entityId) return;
    const monR = o.moneda_recibida;
    const monE = o.moneda_entregada;
    const mR = Number(o.monto_recibido) || 0;
    const mE = Number(o.monto_entregado) || 0;
    if (comp[monR] != null) comp[monR] += mR;
    if (monE && comp[monE] != null) comp[monE] -= mE;
  });
  return comp;
}

/** Devuelve Promise<{ movimientos, saldos, ordenes }>. Saldo = solo movimientos que corresponden a transacciones ejecutadas (si todo pendiente, nadie le debe a nadie). */
function fetchMovimientosCcPorEntidad(tipo, entityId) {
  const campoId = tipo === 'cliente' ? 'cliente_id' : 'intermediario_id';
  const tablaMov = tipo === 'cliente' ? 'movimientos_cuenta_corriente' : 'movimientos_cuenta_corriente_intermediario';
  const filtroMov = tipo === 'cliente' ? { cliente_id: entityId } : { intermediario_id: entityId };
  const selectMov = tipo === 'cliente'
    ? 'id, moneda, monto, concepto, fecha, estado, estado_fecha, monto_usd, monto_ars, monto_eur, orden_id, transaccion_id, transaccion_numero, incluir_en_detalle'
    : 'id, moneda, monto, concepto, fecha, estado, estado_fecha, monto_usd, monto_ars, monto_eur, orden_id, transaccion_id, transaccion_numero, incluir_en_detalle';
  return Promise.all([
    client.from(tablaMov).select(selectMov).match(filtroMov).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    client.from('ordenes').select(ordenesTieneNumeroColumn ? 'id, numero, cliente_id, intermediario_id, fecha, estado, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, tipo_operacion_id, tipos_operacion(codigo, nombre, icono_modo, icono_url_publica, moneda_in, moneda_out, usa_intermediario)' : 'id, cliente_id, intermediario_id, fecha, estado, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, tipo_operacion_id, tipos_operacion(codigo, nombre, icono_modo, icono_url_publica, moneda_in, moneda_out, usa_intermediario)').neq('estado', 'anulada').match({ [campoId]: entityId }),
  ]).then(([rMov, rOrd]) => {
    if (rMov.error) return Promise.reject(rMov.error);
    if (rOrd.error) return Promise.reject(rOrd.error);
    const movimientos = rMov.data || [];
    const ordenes = rOrd.data || [];
    const transaccionIds = [...new Set((movimientos.map((m) => m.transaccion_id)).filter(Boolean))];
    const ordenIds = [...new Set((movimientos.map((m) => m.orden_id)).filter(Boolean))];
    return Promise.all([
      transaccionIds.length > 0 ? client.from('transacciones').select('id, estado').in('id', transaccionIds) : Promise.resolve({ data: [] }),
      ordenIds.length > 0 ? client.from('instrumentacion').select('id, orden_id').in('orden_id', ordenIds) : Promise.resolve({ data: [] }),
    ]).then(([rTr, rInst]) => {
      const trById = {};
      (rTr.data || []).forEach((t) => { trById[t.id] = t.estado; });
      const instByOrden = {};
      (rInst.data || []).forEach((i) => { instByOrden[i.orden_id] = i.id; });
      const instIds = (rInst.data || []).map((i) => i.id).filter(Boolean);
      const promTrInst = instIds.length > 0
        ? client.from('transacciones').select('id, instrumentacion_id, estado').in('instrumentacion_id', instIds)
        : Promise.resolve({ data: [] });
      return promTrInst.then((rTrInst) => ({ rTrInst, trById, instByOrden }));
    }).then(({ rTrInst, trById, instByOrden }) => {
      const orderHasEjecutada = {};
      (rTrInst.data || []).forEach((t) => {
        const ordenId = Object.keys(instByOrden || {}).find((oid) => instByOrden[oid] === t.instrumentacion_id);
        if (ordenId && t.estado === 'ejecutada') orderHasEjecutada[ordenId] = true;
      });
      return { trById, orderHasEjecutada };
    }).then(({ trById, orderHasEjecutada }) => {
      // Saldo modal detalle: suma de todos los movimientos no anulados (misma lógica que resumen CC).
      function incluirEnSaldo(m) {
        if ((m.estado || '').toString().toLowerCase() === 'anulado') return false;
        return true;
      }
      const sumAll = { USD: 0, EUR: 0, ARS: 0 };
      movimientos.forEach((m) => {
        if (!incluirEnSaldo(m)) return;
        if (m.monto_usd != null || m.monto_ars != null || m.monto_eur != null) {
          if (m.monto_usd != null) sumAll.USD += Number(m.monto_usd);
          if (m.monto_ars != null) sumAll.ARS += Number(m.monto_ars);
          if (m.monto_eur != null) sumAll.EUR += Number(m.monto_eur);
        } else if (m.moneda && sumAll[m.moneda] != null) {
          sumAll[m.moneda] += Number(m.monto);
        }
      });
      const saldos = { USD: sumAll.USD, EUR: sumAll.EUR, ARS: sumAll.ARS };
      // Detalle = solo movimientos que deben mostrarse en el listado (incluir_en_detalle). Si la columna no existe, mostrar todos.
      const movimientosParaDetalle = movimientos.filter((m) => m.incluir_en_detalle !== false);
      return { movimientos: movimientosParaDetalle, saldos, ordenes };
    });
  });
}

function openModalCcDetalle(tipo, id, nombre) {
  const backdrop = document.getElementById('modal-cc-detalle-backdrop');
  const tituloEl = document.getElementById('modal-cc-detalle-titulo');
  const entityEl = document.getElementById('modal-cc-detalle-entity');
  const saldosWrap = document.getElementById('modal-cc-detalle-saldos');
  const loadingEl = document.getElementById('modal-cc-detalle-loading');
  const tablaWrap = document.getElementById('modal-cc-detalle-tabla-wrap');
  if (!backdrop || !tituloEl) return;

  ccDetalleTipo = tipo;
  ccDetalleId = id;
  const tipoLabel = tipo === 'intermediario' ? 'Intermediario' : 'Cliente';
  tituloEl.textContent = 'Detalle de movimientos – ' + (nombre || '');
  entityEl.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = tipoLabel + ': ' + (nombre || '–');
  entityEl.appendChild(strong);
  saldosWrap.innerHTML = '';
  loadingEl.style.display = 'block';
  tablaWrap.style.display = 'none';
  backdrop.classList.add('activo');

  const timeoutMs = 12000;
  const promFetch = fetchMovimientosCcPorEntidad(tipo, id);
  const promTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado')), timeoutMs));
  Promise.race([promFetch, promTimeout]).then(({ movimientos, saldos, ordenes }) => {
    ccDetalleMovimientosList = ccDetalleRowsConTipoOpDesdeOrdenes(movimientos, ordenes);
    ccDetalleOrdenesList = ordenes || [];
    if (loadingEl) loadingEl.style.display = 'none';

    saldosWrap.innerHTML = htmlCcModalSaldosCards(saldos);
    reaplicarVisibilidadMonedasCuentaCorrienteDom();

    renderCcDetalleTable();
    tablaWrap.style.display = 'block';
    renderCcDetalleOperaciones();
    const operacionesWrap = document.getElementById('modal-cc-detalle-operaciones-wrap');
    if (operacionesWrap) operacionesWrap.style.display = ccDetalleOrdenesList.length > 0 ? 'block' : 'none';
  }).catch((err) => {
    if (loadingEl) loadingEl.style.display = 'none';
    if (tablaWrap) tablaWrap.style.display = 'block';
    const msg = (err && (err.message || err.details || String(err))) || 'Error al cargar';
    showToast('Detalle CC: ' + msg, 'error', 6000);
    ccDetalleMovimientosList = [];
    ccDetalleOrdenesList = [];
    renderCcDetalleTable();
    reaplicarVisibilidadMonedasCuentaCorrienteDom();
  });
}

function renderCcDetalleOperaciones() {
  const wrap = document.getElementById('modal-cc-detalle-operaciones-wrap');
  const tbody = document.getElementById('cc-detalle-operaciones-tbody');
  if (!wrap || !tbody) return;
  const todas = ccDetalleOrdenesList || [];
  const ordenes = todas.filter((o) => o.estado !== 'orden_ejecutada');
  const estadoLabel = (e) => ({ pendiente_instrumentar: 'Pend. Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada' }[e] || (e || '–'));
  if (wrap) wrap.style.display = ordenes.length > 0 ? 'block' : 'none';
  if (ordenes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">No hay órdenes vinculadas a este cliente/intermediario.</td></tr>';
    return;
  }
  tbody.innerHTML = ordenes
    .map((o) => {
      const fecha = (o.fecha || '').toString().slice(0, 10);
      const monR = o.moneda_recibida || '–';
      const mR = formatMonto(Number(o.monto_recibido) || 0, o.moneda_recibida);
      const monE = o.moneda_entregada || '–';
      const mE = formatMonto(Number(o.monto_entregado) || 0, o.moneda_entregada);
      const est = estadoLabel(o.estado);
      return `<tr><td>${fecha}</td><td>${o.numero != null ? '#' + o.numero : '<code>' + escapeHtml((o.id || '').slice(0, 8)) + '</code>'}</td><td>${escapeHtml(monR)}</td><td>${mR}</td><td>${escapeHtml(monE)}</td><td>${mE}</td><td>${escapeHtml(est)}</td></tr>`;
    })
    .join('');
}

function closeModalCcDetalle() {
  const backdrop = document.getElementById('modal-cc-detalle-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
  ccDetalleTipo = null;
  ccDetalleId = null;
  ccDetalleMovimientosList = [];
  ccDetalleOrdenesList = [];
  ccDetalleModalSortCol = null;
  ccDetalleModalSortDir = 1;
}

function renderCcDetalleTable() {
  const tbody = document.getElementById('cc-detalle-tbody');
  const tfoot = document.getElementById('cc-detalle-tfoot');
  if (!tbody) return;

  const filtrados = ccDetalleMovimientosList;
  tbody.innerHTML = filtrados
    .map((m) => {
      // Un movimiento = una moneda (la de la transacción). Mostrar solo esa columna; el resto "–".
      const mon = (m.moneda || 'USD').toUpperCase();
      const valUsd = mon === 'USD' ? (m.monto_usd != null ? Number(m.monto_usd) : Number(m.monto) || 0) : null;
      const valArs = mon === 'ARS' ? (m.monto_ars != null ? Number(m.monto_ars) : Number(m.monto) || 0) : null;
      const valEur = mon === 'EUR' ? (m.monto_eur != null ? Number(m.monto_eur) : Number(m.monto) || 0) : null;
      const celdaUsd = mon === 'USD' ? formatearCeldaMonedaConSigno(valUsd, 'USD') : '–';
      const celdaArs = mon === 'ARS' ? formatearCeldaMonedaConSigno(valArs, 'ARS') : '–';
      const celdaEur = mon === 'EUR' ? formatearCeldaMonedaConSigno(valEur, 'EUR') : '–';
      const estadoLabel = (m.estado === 'pendiente' ? 'Pendiente' : (m.estado === 'cerrado' ? 'Cerrado' : (m.estado || '–')));
      const nroOrden = m.orden_numero != null ? String(m.orden_numero) : '–';
      const nroTrans = m.transaccion_numero != null ? String(m.transaccion_numero) : '–';
      const tipoOp = (m.tipo_operacion != null && m.tipo_operacion !== '–') ? String(m.tipo_operacion) : '–';
      const tipoOpHtml = tipoOp === '–' ? '–' : htmlTipoOperacionIconos(tipoOp, m.tipo_op_nombre || '', { iconoModo: m.tipo_op_icono_modo, iconoUrlPublica: m.tipo_op_icono_url, usaIntermediario: m.tipo_op_usa_intermediario === true });
      return `<tr>
          <td class="cc-col-fija cc-col-fija-1">${(m.fecha || '').toString().slice(0, 10)}</td>
          <td class="cc-col-fija cc-col-fija-2 cc-col-tipo-op-iconos">${tipoOpHtml}</td>
          <td>${escapeHtml(nroOrden)}</td>
          <td>${escapeHtml(nroTrans)}</td>
          <td class="td-concepto">${escapeHtml(m.concepto || '–')}</td>
          <td data-cc-moneda-col="USD">${celdaUsd}</td>
          <td data-cc-moneda-col="ARS">${celdaArs}</td>
          <td data-cc-moneda-col="EUR">${celdaEur}</td>
          <td>${escapeHtml(estadoLabel)}</td>
        </tr>`;
    })
    .join('');

  if (tfoot) tfoot.innerHTML = filtrados.length === 0 ? '' : '';
  if (filtrados.length === 0) tbody.innerHTML = '<tr><td colspan="' + ccColspanModalDetalleMovimientos() + '">No hay movimientos.</td></tr>';
  else setupCcDetalleModalSortHeaders();
  reaplicarVisibilidadMonedasCuentaCorrienteDom();
}

function setupCcDetalleModalSortHeaders() {
  const table = document.getElementById('tabla-cc-detalle-modal');
  if (!table) return;
  const thead = table.querySelector('thead tr');
  if (!thead) return;
  thead.querySelectorAll('th[data-sort]').forEach((th) => {
    const col = th.getAttribute('data-sort');
    const indicator = th.querySelector('.sort-indicator') || (() => { const s = document.createElement('span'); s.className = 'sort-indicator'; th.appendChild(s); return s; })();
    indicator.textContent = ccDetalleModalSortCol === col ? (ccDetalleModalSortDir === 1 ? ' ▲' : ' ▼') : '';
    th.onclick = () => {
      if (ccDetalleMovimientosList.length === 0) return;
      if (ccDetalleModalSortCol === col) ccDetalleModalSortDir *= -1;
      else { ccDetalleModalSortCol = col; ccDetalleModalSortDir = 1; }
      ccDetalleMovimientosList = [...ccDetalleMovimientosList].sort((a, b) => compareCcDetalleRow(a, b, col, ccDetalleModalSortDir));
      renderCcDetalleTable();
    };
  });
}

/** Carga CC de un intermediario: misma regla que resumen — saldo = solo movimientos cerrados (se excluye anulado y pendiente). */
function loadCuentaCorrienteIntermediario(intermediarioId) {
  const loadingEl = document.getElementById('cc-loading');
  const wrapEl = document.getElementById('cc-tabla-wrap');
  const tbody = document.getElementById('cc-tbody');
  if (!loadingEl || !wrapEl || !tbody) return;

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';

  fetchMovimientosCcPorEntidad('intermediario', intermediarioId)
    .then(({ movimientos, saldos }) => {
      loadingEl.style.display = 'none';
      ccMovimientosList = movimientos || [];
      setCcSaldoCards(saldos || { USD: 0, EUR: 0, ARS: 0 });
      renderCcTable();
      wrapEl.style.display = 'block';
    })
    .catch((err) => {
      loadingEl.style.display = 'none';
      tbody.innerHTML = '<tr><td colspan="9">Error: ' + (err && err.message ? err.message : 'No se pudo cargar.') + '</td></tr>';
      wrapEl.style.display = 'block';
    });
}

/** Carga CC de un cliente: saldo = solo movimientos cerrados (se excluye anulado y pendiente). */
function loadCuentaCorrienteCliente(clienteId) {
  const loadingEl = document.getElementById('cc-loading');
  const wrapEl = document.getElementById('cc-tabla-wrap');
  const tbody = document.getElementById('cc-tbody');
  if (!loadingEl || !wrapEl || !tbody) return;

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';

  fetchMovimientosCcPorEntidad('cliente', clienteId)
    .then(({ movimientos, saldos }) => {
      loadingEl.style.display = 'none';
      ccMovimientosList = movimientos || [];
      setCcSaldoCards(saldos || { USD: 0, EUR: 0, ARS: 0 });
      renderCcTable();
      wrapEl.style.display = 'block';
    })
    .catch((err) => {
      loadingEl.style.display = 'none';
      tbody.innerHTML = '<tr><td colspan="9">Error: ' + (err && err.message ? err.message : 'No se pudo cargar.') + '</td></tr>';
      wrapEl.style.display = 'block';
    });
}

function renderCcTable() {
  const tbody = document.getElementById('cc-tbody');
  const tfoot = document.getElementById('cc-tfoot');
  const moneda = ccMonedaActual === 'TODAS' ? null : ccMonedaActual;
  const filtrados = moneda ? ccMovimientosList.filter((m) => m.moneda === moneda) : ccMovimientosList;
  const canAbmCc = userPermissions.includes('editar_transacciones') && !ccEsIntermediario;
  if (!tbody) return;

  const totals = { USD: { debe: 0, haber: 0 }, EUR: { debe: 0, haber: 0 }, ARS: { debe: 0, haber: 0 } };
  filtrados.forEach((m) => {
    const n = Number(m.monto);
    const mon = m.moneda;
    if (totals[mon]) {
      if (n > 0) totals[mon].debe += n;
      else totals[mon].haber += -n;
    }
  });

  tbody.innerHTML = filtrados
    .map((m) => {
      const n = Number(m.monto);
      const mon = m.moneda;
      const debeUsd = mon === 'USD' ? (n > 0 ? formatMonto(n, 'USD') : '–') : '–';
      const haberUsd = mon === 'USD' ? (n <= 0 ? formatMonto(-n, 'USD') : '–') : '–';
      const debeEur = mon === 'EUR' ? (n > 0 ? formatMonto(n, 'EUR') : '–') : '–';
      const haberEur = mon === 'EUR' ? (n <= 0 ? formatMonto(-n, 'EUR') : '–') : '–';
      const debeArs = mon === 'ARS' ? (n > 0 ? formatMonto(n, 'ARS') : '–') : '–';
      const haberArs = mon === 'ARS' ? (n <= 0 ? formatMonto(-n, 'ARS') : '–') : '–';
      return `<tr>
          <td>${(m.fecha || '').toString().slice(0, 10)}</td>
          <td>${escapeHtml(m.concepto || '–')}</td>
          <td>${debeUsd}</td><td>${haberUsd}</td>
          <td>${debeEur}</td><td>${haberEur}</td>
          <td>${debeArs}</td><td>${haberArs}</td>
          <td>${canAbmCc ? `<button type="button" class="btn-editar btn-editar-cc" data-id="${m.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
        </tr>`;
    })
    .join('');

  if (tfoot) {
    tfoot.innerHTML = filtrados.length === 0
      ? ''
      : `<tr>
          <td colspan="2">Total</td>
          <td>${formatMonto(totals.USD.debe, 'USD')}</td><td>${formatMonto(totals.USD.haber, 'USD')}</td>
          <td>${formatMonto(totals.EUR.debe, 'EUR')}</td><td>${formatMonto(totals.EUR.haber, 'EUR')}</td>
          <td>${formatMonto(totals.ARS.debe, 'ARS')}</td><td>${formatMonto(totals.ARS.haber, 'ARS')}</td>
          <td></td>
        </tr>`;
  }

  if (filtrados.length === 0) tbody.innerHTML = '<tr><td colspan="9">No hay movimientos.</td></tr>';
  else if (canAbmCc) {
    tbody.querySelectorAll('.btn-editar-cc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const mov = ccMovimientosList.find((x) => x.id === id);
        if (mov) openModalMovimientoCc(mov);
      });
    });
  }
}

function openModalMovimientoCc(mov) {
  const backdrop = document.getElementById('modal-movimiento-cc-backdrop');
  const idEl = document.getElementById('mov-cc-id');
  const conceptoEl = document.getElementById('mov-cc-concepto');
  const fechaEl = document.getElementById('mov-cc-fecha');
  if (!backdrop || !idEl) return;
  idEl.value = mov.id;
  conceptoEl.value = mov.concepto || '';
  fechaEl.value = (mov.fecha || '').toString().slice(0, 10);
  backdrop.classList.add('activo');
}

function closeModalMovimientoCc() {
  const backdrop = document.getElementById('modal-movimiento-cc-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function saveMovimientoCc() {
  const idEl = document.getElementById('mov-cc-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const concepto = document.getElementById('mov-cc-concepto').value.trim() || null;
  const fecha = document.getElementById('mov-cc-fecha').value;
  if (!id || !fecha) {
    showToast('Falta fecha.', 'error');
    return;
  }
  client
    .from('movimientos_cuenta_corriente')
    .update({ concepto, fecha })
    .eq('id', id)
    .then((res) => {
      if (res.error) {
        showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
        return;
      }
      closeModalMovimientoCc();
      if (ccDetalleId && ccDetalleTipo) {
        fetchMovimientosCcPorEntidad(ccDetalleTipo, ccDetalleId).then(({ movimientos, saldos, ordenes }) => {
          ccDetalleMovimientosList = ccDetalleRowsConTipoOpDesdeOrdenes(movimientos, ordenes);
          ccDetalleOrdenesList = ordenes || [];
          renderCcDetalleTable();
          const saldosWrap = document.getElementById('modal-cc-detalle-saldos');
          if (saldosWrap && saldos) {
            saldosWrap.innerHTML = htmlCcModalSaldosCards(saldos);
            reaplicarVisibilidadMonedasCuentaCorrienteDom();
          }
          renderCcDetalleOperaciones();
          const operacionesWrap = document.getElementById('modal-cc-detalle-operaciones-wrap');
          if (operacionesWrap) operacionesWrap.style.display = (ccDetalleOrdenesList.length > 0) ? 'block' : 'none';
        });
      }
      loadCuentaCorriente();
    });
}

function setupModalMovimientoCc() {
  const backdrop = document.getElementById('modal-movimiento-cc-backdrop');
  const btnClose = document.getElementById('modal-movimiento-cc-close');
  const btnCancel = document.getElementById('modal-movimiento-cc-cancelar');
  const form = document.getElementById('form-movimiento-cc');
  if (btnClose) btnClose.addEventListener('click', closeModalMovimientoCc);
  if (btnCancel) btnCancel.addEventListener('click', closeModalMovimientoCc);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalMovimientoCc);
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveMovimientoCc(); });
}

/**
 * Cierra el modal solo cuando el usuario hizo clic realmente en el backdrop (mousedown + click en backdrop).
 * Evita que se cierre al elegir una opción de un <select> u otro control nativo, donde el click
 * a veces se reporta en el backdrop.
 */
function setupBackdropCloseOnlyOnRealClick(backdrop, onClose) {
  if (!backdrop || typeof onClose !== 'function') return;
  let mousedownOnBackdrop = false;
  backdrop.addEventListener('mousedown', function _md(e) {
    mousedownOnBackdrop = (e.target === backdrop);
  }, true);
  backdrop.addEventListener('click', function _cl(e) {
    if (e.target === backdrop && mousedownOnBackdrop) onClose();
    mousedownOnBackdrop = false;
  }, true);
}

/** Modales: arrastrar por el header para mover; al cerrar se resetea la posición. */
function setupModalesDraggable() {
  let dragState = null;

  document.querySelectorAll('.modal').forEach((modal) => {
    const header = modal.querySelector('.modal-header');
    if (!header) return;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.modal-close')) return;
      e.preventDefault();
      const rect = modal.getBoundingClientRect();
      modal.style.position = 'fixed';
      modal.style.left = rect.left + 'px';
      modal.style.top = rect.top + 'px';
      modal.style.margin = '0';
      dragState = { modal, startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    dragState.modal.style.left = (dragState.startLeft + dx) + 'px';
    dragState.modal.style.top = (dragState.startTop + dy) + 'px';
  });

  document.addEventListener('mouseup', () => { dragState = null; });

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    const modal = backdrop.querySelector('.modal');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      if (!backdrop.classList.contains('activo')) {
        modal.style.position = '';
        modal.style.left = '';
        modal.style.top = '';
        modal.style.margin = '';
      }
    });
    observer.observe(backdrop, { attributes: true, attributeFilter: ['class'] });
  });
}

function setupCuentaCorriente() {
  const backdropDetalle = document.getElementById('modal-cc-detalle-backdrop');
  const btnCloseDetalle = document.getElementById('modal-cc-detalle-close');
  if (btnCloseDetalle) btnCloseDetalle.addEventListener('click', closeModalCcDetalle);
  if (backdropDetalle) setupBackdropCloseOnlyOnRealClick(backdropDetalle, closeModalCcDetalle);

  const ccVistaToggleEl = document.getElementById('cc-vista-toggle');
  if (ccVistaToggleEl) {
    ccVistaToggleEl.querySelectorAll('button[data-vista]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vista = btn.getAttribute('data-vista');
        if (!vista || vista === ccVistaToggle) return;
        ccVistaToggle = vista;
        aplicarFiltroCcResumen();
      });
    });
  }
  const ccFiltroTipoEl = document.getElementById('cc-filtro-tipo');
  if (ccFiltroTipoEl) {
    ccFiltroTipoEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tipo = btn.getAttribute('data-tipo');
        if (!tipo) return;
        ccFiltroTipo = tipo;
        ccFiltroTipoEl.querySelectorAll('button').forEach((b) => b.classList.remove('activo'));
        btn.classList.add('activo');
        ccDetalleFiltroEntidadId = '';
        poblarSelectCcDetalleEntidad();
        aplicarFiltroCcResumen();
      });
    });
  }

  const ccDetalleEntidadSel = document.getElementById('cc-detalle-entidad-select');
  if (ccDetalleEntidadSel) {
    ccDetalleEntidadSel.addEventListener('change', () => {
      ccDetalleFiltroEntidadId = ccDetalleEntidadSel.value || '';
      aplicarFiltroCcResumen();
    });
  }

  function onCcRefrescarClick() {
    showToast('Sincronizando CC y caja desde órdenes…', 'info');
    sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion()
      .then(() => {
        loadCuentaCorriente();
        showToast('Cuenta corriente actualizada.', 'success');
        setTimeout(() => {
          const tbody = document.getElementById('cc-vista-detalle-tbody');
          const sinMovimientos = tbody && tbody.querySelector('td[colspan]') && tbody.textContent.includes('No hay movimientos');
          if (sinMovimientos) {
            showToast('Si tenés órdenes con transacciones ejecutadas y no ves movimientos: verificá que existan filas en reglas_de_negocio para el tipo de operación (y usa_intermediario) de cada orden, o revisá permisos/sync. Volvé a Refrescar.', 'info', 12000);
          }
        }, 800);
      })
      .catch((e) => {
        showToast(e && (e.message || String(e)) || 'Error al sincronizar', 'error');
      });
  }
  const ccBtnRefrescar = document.getElementById('cc-btn-refrescar');
  const ccBtnRefrescarMov = document.getElementById('cc-btn-refrescar-movimientos');
  if (ccBtnRefrescar) ccBtnRefrescar.addEventListener('click', onCcRefrescarClick);
  if (ccBtnRefrescarMov) ccBtnRefrescarMov.addEventListener('click', onCcRefrescarClick);

  function onCcExportarClick() {
    exportarCcResumenExcel();
  }
  const ccBtnExportar = document.getElementById('cc-btn-exportar-excel');
  const ccBtnExportarMov = document.getElementById('cc-btn-exportar-movimientos');
  if (ccBtnExportar) ccBtnExportar.addEventListener('click', onCcExportarClick);
  if (ccBtnExportarMov) ccBtnExportarMov.addEventListener('click', onCcExportarClick);
  const ccDetalleDesdeEl = document.getElementById('cc-detalle-desde');
  const ccDetalleHastaEl = document.getElementById('cc-detalle-hasta');
  function aplicarRangoDetalle() {
    ccDetalleDesde = (ccDetalleDesdeEl && ccDetalleDesdeEl.value) || '';
    ccDetalleHasta = (ccDetalleHastaEl && ccDetalleHastaEl.value) || '';
    if (ccDetalleDesde === '' && ccDetalleHasta === '') {
      ccMovimientosMostrarTodoHistorial = true;
    } else {
      ccMovimientosMostrarTodoHistorial = false;
    }
    aplicarFiltroCcResumen();
  }
  if (ccDetalleDesdeEl) ccDetalleDesdeEl.addEventListener('change', aplicarRangoDetalle);
  if (ccDetalleHastaEl) ccDetalleHastaEl.addEventListener('change', aplicarRangoDetalle);
  const ccBtnDetalleHoy = document.getElementById('cc-detalle-btn-hoy');
  const ccBtnDetalleTodo = document.getElementById('cc-detalle-btn-todo-historial');
  if (ccBtnDetalleHoy) {
    ccBtnDetalleHoy.addEventListener('click', () => {
      ccMovimientosMostrarTodoHistorial = false;
      const h = fechaHoyYYYYMMDDArgentina();
      ccDetalleDesde = h;
      ccDetalleHasta = h;
      if (ccDetalleDesdeEl) ccDetalleDesdeEl.value = h;
      if (ccDetalleHastaEl) ccDetalleHastaEl.value = h;
      aplicarFiltroCcResumen();
    });
  }
  if (ccBtnDetalleTodo) {
    ccBtnDetalleTodo.addEventListener('click', () => {
      ccMovimientosMostrarTodoHistorial = true;
      ccDetalleDesde = '';
      ccDetalleHasta = '';
      if (ccDetalleDesdeEl) ccDetalleDesdeEl.value = '';
      if (ccDetalleHastaEl) ccDetalleHastaEl.value = '';
      aplicarFiltroCcResumen();
    });
  }

  document.querySelectorAll('.link-inicio').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const vistaId = a.getAttribute('data-vista');
      const titles = { 'vista-inicio': 'Panel de Control', 'vista-ordenes': 'Órdenes', 'vista-cajas': 'Cajas', 'vista-clientes': 'Clientes', 'vista-cuenta-corriente': 'Cuenta corriente' };
      showView(vistaId, titles[vistaId] || vistaId);
    });
  });
}

function loadTiposMovimientoCajaTable() {
  const loadingEl = document.getElementById('tipos-mov-loading');
  const wrapEl = document.getElementById('tipos-mov-tabla-wrap');
  const tbody = document.getElementById('tipos-movimiento-tbody');
  const btnNuevo = document.getElementById('btn-nuevo-tipo-movimiento');
  if (!loadingEl || !wrapEl || !tbody) return;

  const canAbm = userPermissions.includes('abm_tipos_movimiento_caja');
  if (btnNuevo) btnNuevo.style.display = canAbm ? '' : 'none';

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';

  client
    .from('tipos_movimiento_caja')
    .select('id, nombre, direccion, activo')
    .order('nombre')
    .then((res) => {
      loadingEl.style.display = 'none';
      if (res.error) {
        tbody.innerHTML = '<tr><td colspan="4">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      const list = res.data || [];
      tbody.innerHTML = list
        .map(
          (t) =>
            `<tr data-id="${t.id}">
              <td>${escapeHtml(t.nombre)}</td>
              <td>${t.direccion === 'egreso' ? 'Egreso' : 'Ingreso'}</td>
              <td>${t.activo ? 'Sí' : 'No'}</td>
              <td>${canAbm ? `<button type="button" class="btn-editar" data-id="${t.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
            </tr>`
        )
        .join('');
      tbody.querySelectorAll('.btn-editar').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const row = list.find((r) => r.id === id);
          if (row) openModalTipoMovimientoCaja(row);
        });
      });
      if (list.length === 0) tbody.innerHTML = '<tr><td colspan="4">No hay tipos cargados. Agregá uno para usar en movimientos manuales.</td></tr>';
      wrapEl.style.display = 'block';
    });
}

function openModalTipoMovimientoCaja(registro) {
  const backdrop = document.getElementById('modal-tipo-movimiento-backdrop');
  const titulo = document.getElementById('modal-tipo-movimiento-titulo');
  const idEl = document.getElementById('tipo-movimiento-id');
  const form = document.getElementById('form-tipo-movimiento');
  if (!backdrop || !titulo || !idEl || !form) return;

  if (registro) {
    titulo.textContent = 'Editar tipo de movimiento';
    idEl.value = registro.id;
    document.getElementById('tipo-movimiento-nombre').value = registro.nombre || '';
    document.getElementById('tipo-movimiento-direccion').value = registro.direccion === 'egreso' ? 'egreso' : 'ingreso';
    document.getElementById('tipo-movimiento-activo').checked = registro.activo !== false;
  } else {
    titulo.textContent = 'Nuevo tipo de movimiento';
    idEl.value = '';
    form.reset();
    document.getElementById('tipo-movimiento-direccion').value = 'ingreso';
    document.getElementById('tipo-movimiento-activo').checked = true;
  }
  backdrop.classList.add('activo');
}

function closeModalTipoMovimientoCaja() {
  const backdrop = document.getElementById('modal-tipo-movimiento-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function saveTipoMovimientoCaja() {
  const idEl = document.getElementById('tipo-movimiento-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const nombre = document.getElementById('tipo-movimiento-nombre').value.trim();
  if (!nombre) {
    showToast('El nombre es obligatorio.', 'error');
    return;
  }
  const direccion = document.getElementById('tipo-movimiento-direccion').value;
  const activo = document.getElementById('tipo-movimiento-activo').checked;
  const payload = { nombre, direccion: direccion || 'ingreso', activo };
  const prom = id
    ? client.from('tipos_movimiento_caja').update(payload).eq('id', id)
    : client.from('tipos_movimiento_caja').insert(payload);
  prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return;
    }
    closeModalTipoMovimientoCaja();
    loadTiposMovimientoCajaTable();
    loadTiposMovimientoCaja().then(() => {}); // refresh dropdown en modal movimiento
  });
}

function setupCajasToggle() {
  const toggleMoneda = document.getElementById('cajas-toggle-moneda');
  if (!toggleMoneda) return;
  toggleMoneda.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      cajasMonedaActual = btn.getAttribute('data-moneda');
      toggleMoneda.querySelectorAll('button').forEach((b) => b.classList.remove('activo'));
      btn.classList.add('activo');
      loadCajas();
    });
  });
}

/** Muestra el panel Movimientos o Tipos según cajasVistaSolapa (alineado a solapas CC). */
function syncCajasPaneles() {
  const panelMov = document.getElementById('cajas-panel-movimientos');
  const panelTipos = document.getElementById('cajas-panel-tipos');
  const tablist = document.getElementById('cajas-vista-tabs');
  if (!panelMov || !panelTipos || !tablist) return;
  const esMov = cajasVistaSolapa === 'movimientos';
  panelMov.style.display = esMov ? '' : 'none';
  panelTipos.style.display = esMov ? 'none' : '';
  tablist.querySelectorAll('button[data-cajas-vista]').forEach((b) => {
    const v = b.getAttribute('data-cajas-vista');
    const on = (v === 'movimientos' && esMov) || (v === 'tipos' && !esMov);
    b.classList.toggle('activo', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function setupCajasMovFiltrosYTabs() {
  if (cajasMovFiltrosListenersAttached) return;
  const dEl = document.getElementById('cajas-mov-desde');
  const hEl = document.getElementById('cajas-mov-hasta');
  function aplicarRangoCajasMov() {
    cajasMovFechaDesde = (dEl && dEl.value) || '';
    cajasMovFechaHasta = (hEl && hEl.value) || '';
    if (cajasMovFechaDesde === '' && cajasMovFechaHasta === '') {
      cajasMovMostrarTodoHistorial = true;
    } else {
      cajasMovMostrarTodoHistorial = false;
    }
    loadCajas();
  }
  if (dEl) dEl.addEventListener('change', aplicarRangoCajasMov);
  if (hEl) hEl.addEventListener('change', aplicarRangoCajasMov);
  const btnHoy = document.getElementById('cajas-mov-btn-hoy');
  const btnTodo = document.getElementById('cajas-mov-btn-todo');
  if (btnHoy) {
    btnHoy.addEventListener('click', () => {
      cajasMovMostrarTodoHistorial = false;
      const h = fechaHoyYYYYMMDDArgentina();
      cajasMovFechaDesde = h;
      cajasMovFechaHasta = h;
      syncCajasMovFechaInputs();
      loadCajas();
    });
  }
  if (btnTodo) {
    btnTodo.addEventListener('click', () => {
      cajasMovMostrarTodoHistorial = true;
      cajasMovFechaDesde = '';
      cajasMovFechaHasta = '';
      syncCajasMovFechaInputs();
      loadCajas();
    });
  }
  document.querySelectorAll('[data-caja-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = (btn.getAttribute('data-caja-tab') || 'todo').toLowerCase();
      cajasMovCajaTipoTab = v === 'efectivo' || v === 'banco' || v === 'cheque' ? v : 'todo';
      document.querySelectorAll('[data-caja-tab]').forEach((b) => {
        b.classList.remove('activo');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('activo');
      btn.setAttribute('aria-pressed', 'true');
      loadCajas();
    });
  });
  const cajasVistaTabsEl = document.getElementById('cajas-vista-tabs');
  if (cajasVistaTabsEl) {
    cajasVistaTabsEl.querySelectorAll('button[data-cajas-vista]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-cajas-vista');
        if (!v || v === cajasVistaSolapa) return;
        cajasVistaSolapa = v;
        syncCajasPaneles();
        if (v === 'tipos') loadTiposMovimientoCajaTable();
      });
    });
  }
  syncCajasPaneles();
  const btnExp = document.getElementById('cajas-btn-exportar-excel');
  if (btnExp) {
    btnExp.addEventListener('click', () => {
      exportarMovimientosCajaExcel();
    });
  }
  cajasMovFiltrosListenersAttached = true;
}

function loadTiposMovimientoCaja() {
  return client
    .from('tipos_movimiento_caja')
    .select('id, nombre, direccion')
    .eq('activo', true)
    .order('nombre')
    .then((res) => {
      tiposMovimientoCaja = res.data || [];
      return tiposMovimientoCaja;
    });
}

function openModalMovimientoCaja(registro) {
  const backdrop = document.getElementById('modal-movimiento-caja-backdrop');
  const titulo = document.getElementById('modal-movimiento-caja-titulo');
  const form = document.getElementById('form-movimiento-caja');
  const idEl = document.getElementById('mov-caja-id');
  const ordenIdEl = document.getElementById('mov-caja-orden-id');
  const hintOrden = document.getElementById('mov-caja-hint-orden');
  const wrapTipoCaja = document.getElementById('mov-caja-wrap-tipo-caja');
  const selTipoCaja = document.getElementById('mov-caja-tipo-caja');
  const selTipo = document.getElementById('mov-caja-tipo');
  const selMoneda = document.getElementById('mov-caja-moneda');
  const inputMonto = document.getElementById('mov-caja-monto');
  const inputConcepto = document.getElementById('mov-caja-concepto');
  const fechaEl = document.getElementById('mov-caja-fecha');
  if (!backdrop || !form || !selTipo) return;

  loadTiposMovimientoCaja().then(() => {
    selTipo.innerHTML = tiposMovimientoCaja
      .map((t) => `<option value="${t.id}" data-direccion="${t.direccion}">${escapeHtml(t.nombre)} (${t.direccion})</option>`)
      .join('');
    if (tiposMovimientoCaja.length === 0) selTipo.innerHTML = '<option value="">No hay tipos cargados</option>';

    const esOrden = registro && registro.orden_id;
    if (idEl) idEl.value = registro ? registro.id : '';
    if (ordenIdEl) ordenIdEl.value = registro && registro.orden_id ? registro.orden_id : '';
    if (titulo) titulo.textContent = registro ? 'Editar movimiento' : 'Nuevo movimiento de caja';
    if (hintOrden) hintOrden.style.display = esOrden ? 'block' : 'none';

    if (wrapTipoCaja) wrapTipoCaja.style.display = esOrden ? 'none' : 'block';
    if (selTipoCaja) {
      selTipoCaja.disabled = esOrden;
      const cajaTipo = (registro && registro.caja_tipo) ? String(registro.caja_tipo).toLowerCase() : 'efectivo';
      selTipoCaja.value = (cajaTipo === 'banco') ? 'banco' : 'efectivo';
    }

    selMoneda.disabled = esOrden;
    selTipo.disabled = esOrden;
    inputMonto.disabled = esOrden;

    if (registro) {
      selMoneda.value = registro.moneda || 'USD';
      fechaEl.value = (registro.fecha || '').toString().slice(0, 10);
      inputConcepto.value = registro.concepto || '';
      inputMonto.value = formatImporteParaInput(Math.abs(Number(registro.monto)));
      if (!esOrden) selTipo.value = registro.tipo_movimiento_id || '';
    } else {
      const hoy = new Date().toISOString().slice(0, 10);
      fechaEl.value = hoy;
      selMoneda.value = cajasMonedaActual;
      inputConcepto.value = '';
      inputMonto.value = '';
    }
    backdrop.classList.add('activo');
    setupInputImporte(inputMonto);
  });
}

function closeModalMovimientoCaja() {
  const backdrop = document.getElementById('modal-movimiento-caja-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function saveMovimientoCaja() {
  const idEl = document.getElementById('mov-caja-id');
  const ordenIdEl = document.getElementById('mov-caja-orden-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const esDeOrden = ordenIdEl && ordenIdEl.value && ordenIdEl.value.trim() !== '';
  const concepto = document.getElementById('mov-caja-concepto').value.trim() || null;
  const fecha = document.getElementById('mov-caja-fecha').value;

  if (id && esDeOrden) {
    const payload = { concepto, fecha: fecha || new Date().toISOString().slice(0, 10) };
    client
      .from('movimientos_caja')
      .update(payload)
      .eq('id', id)
      .then((res) => {
        if (res.error) {
          showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
          return;
        }
        closeModalMovimientoCaja();
        loadCajas();
      });
    return;
  }

  const moneda = document.getElementById('mov-caja-moneda').value;
  const tipoId = document.getElementById('mov-caja-tipo').value;
  const montoInput = parseImporteInput(document.getElementById('mov-caja-monto').value);
  if (!tipoId || isNaN(montoInput) || montoInput <= 0) {
    showToast('Completá tipo y monto (número positivo).', 'error');
    return;
  }
  const tipo = tiposMovimientoCaja.find((t) => t.id === tipoId);
  const signo = tipo && tipo.direccion === 'egreso' ? -1 : 1;
  const monto = montoInput * signo;
  const cajaTipoEl = document.getElementById('mov-caja-tipo-caja');
  const cajaTipo = (cajaTipoEl && cajaTipoEl.value) ? cajaTipoEl.value : 'efectivo';
  const ahora = new Date().toISOString();
  const payloadBase = {
    moneda,
    monto,
    tipo_movimiento_id: tipoId,
    orden_id: null,
    caja_tipo: cajaTipo,
    concepto,
    fecha: fecha || ahora.slice(0, 10),
    usuario_id: currentUserId,
  };
  const payload = id ? payloadBase : { ...payloadBase, estado: 'cerrado', estado_fecha: ahora };

  if (id) {
    client
      .from('movimientos_caja')
      .update(payloadBase)
      .eq('id', id)
      .then((res) => {
        if (res.error) {
          showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
          return;
        }
        closeModalMovimientoCaja();
        loadCajas();
      });
  } else {
    client
      .from('movimientos_caja')
      .insert(payload)
      .then((res) => {
        if (res.error) {
          showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
          return;
        }
        closeModalMovimientoCaja();
        loadCajas();
      });
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Devuelve HTML con clase por participante: Pandy azul negrita, Cliente negro, Intermediario violeta. */
function participantLabelHtml(role) {
  const r = (role || '').toLowerCase();
  const map = { pandy: 'Pandy', cliente: 'Cliente', intermediario: 'Intermediario' };
  const label = map[r] || role || '–';
  const cls = r === 'pandy' ? 'participante-pandy' : (r === 'cliente' ? 'participante-cliente' : 'participante-intermediario');
  return '<span class="' + cls + '">' + escapeHtml(label) + '</span>';
}

/** Devuelve HTML para tipo de transacción: Ingreso verde negrita, Egreso rojo negrita. */
function tipoTransaccionHtml(tipo) {
  const esIngreso = (tipo || '').toLowerCase() === 'ingreso';
  const label = esIngreso ? 'Ingreso' : 'Egreso';
  const cls = esIngreso ? 'tipo-ingreso' : 'tipo-egreso';
  return '<span class="' + cls + '">' + escapeHtml(label) + '</span>';
}

/** Orden para listas de transacciones en la UI: siempre ingreso y su contrapartida de egreso; por pagador: primero cliente, segundo Pandy, tercero intermediario (cualquier tipo de operación). */
function ordenPagador(p) {
  const q = (p || '').toLowerCase();
  if (q === 'cliente') return 0;
  if (q === 'pandy') return 1;
  if (q === 'intermediario') return 2;
  return 3;
}
function sortTransaccionesIngresosPrimero(lista) {
  return (lista || []).slice().sort((a, b) => {
    const pagadorA = ordenPagador(a.pagador);
    const pagadorB = ordenPagador(b.pagador);
    if (pagadorA !== pagadorB) return pagadorA - pagadorB;
    const aEsIngreso = (a.tipo || '').toLowerCase() === 'ingreso';
    const bEsIngreso = (b.tipo || '').toLowerCase() === 'ingreso';
    const tipoA = aEsIngreso ? 0 : 1;
    const tipoB = bEsIngreso ? 0 : 1;
    if (tipoA !== tipoB) return tipoA - tipoB;
    const cobradorA = ordenPagador(a.cobrador);
    const cobradorB = ordenPagador(b.cobrador);
    return cobradorA - cobradorB;
  });
}

/** Ordena transacciones por numero (1, 2, 3, 4…) para que en instrumentación la fila 1 sea siempre Tx1, la 2 sea Tx2, etc. */
function sortTransaccionesPorNumero(lista) {
  return (lista || []).slice().sort((a, b) => {
    const na = a.numero != null ? Number(a.numero) : Infinity;
    const nb = b.numero != null ? Number(b.numero) : Infinity;
    return na - nb;
  });
}

// --- Formato importes: miles con punto, decimales con coma (es-AR) ---
function parseImporteInput(str) {
  if (str == null || typeof str !== 'string') return NaN;
  const s = str.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s, 10);
  return isNaN(n) ? NaN : n;
}

/** Guarda solo el monto de una transacción. Si está ejecutada, reajusta CC y caja. Órdenes con filas en `reglas_de_negocio`: solo actualiza la trx y `sincronizarCcYCajaDesdeOrden` (sin insertar “Cancelación de deuda” legacy). Resto: lógica momento cero / Cancelación / caja heredada. Llama onSuccess() tras guardar. */
function guardarSoloMontoTransaccion(transaccionId, valorInput, onSuccess) {
  const newMonto = parseImporteInput(typeof valorInput === 'string' ? valorInput : (valorInput && valorInput.value));
  if (isNaN(newMonto) || newMonto <= 0) {
    showToast('Monto inválido.', 'error');
    return Promise.resolve();
  }
  if (!currentUserId) return Promise.resolve();
  return client.from('transacciones').select('id, numero, estado, monto, tipo, instrumentacion_id, modo_pago_id, moneda, cobrador, pagador, concepto, tipo_cambio, owner').eq('id', transaccionId).single().then((rTr) => {
    const t = rTr.data;
    if (!t) return Promise.resolve();
    const oldMonto = Number(t.monto) || 0;
    const esEjecutada = (t.estado || '').toLowerCase() === 'ejecutada';
    if (!esEjecutada) {
      return client.from('transacciones').update({ monto: newMonto, updated_at: new Date().toISOString() }).eq('id', transaccionId).then((r) => {
        if (r.error) { showToast('Error al actualizar monto: ' + (r.error?.message || ''), 'error'); return; }
        if (onSuccess) onSuccess();
      });
    }
    const instrumentacionId = t.instrumentacion_id;
    if (!instrumentacionId) { showToast('Falta instrumentación.', 'error'); return Promise.resolve(); }
    return client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rInst) => {
      const ordenId = rInst.data && rInst.data.orden_id;
      if (!ordenId) { showToast('No se encontró la orden.', 'error'); return Promise.resolve(); }
      return client.from('ordenes').select('cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, numero, tipos_operacion(codigo, usa_intermediario)').eq('id', ordenId).single().then((rOrd) => {
        const orden = rOrd.data || {};
        const clienteId = orden.cliente_id || null;
        const mr = Number(orden.monto_recibido) || 0;
        const me = Number(orden.monto_entregado) || 0;
        const monR = orden.moneda_recibida || 'USD';
        const monE = orden.moneda_entregada || 'USD';
        const ordenLabel = orden.numero != null ? 'nro orden ' + orden.numero : 'nro orden ' + (ordenId || '').toString().slice(0, 8);
        const fecha = new Date().toISOString().slice(0, 10);
        const ahora = new Date().toISOString();
        const toJoinOrd = orden.tipos_operacion && (Array.isArray(orden.tipos_operacion) ? orden.tipos_operacion[0] : orden.tipos_operacion);
        const codigoTipoRaw = (toJoinOrd && toJoinOrd.codigo) || null;
        const codigoTipoNorm = normalizarCodigoTipoOperacion(codigoTipoRaw) || codigoTipoRaw;
        const usaIntermediarioOrd =
          (toJoinOrd && toJoinOrd.usa_intermediario === true) || !!orden.intermediario_id;
        return getReglasDeNegocio(codigoTipoNorm, usaIntermediarioOrd).then((reglasDeNegocio) => {
          const usarMotorReglasNegocio = Array.isArray(reglasDeNegocio) && reglasDeNegocio.length > 0;
          if (usarMotorReglasNegocio) {
            return client
              .from('transacciones')
              .update({ monto: newMonto, updated_at: new Date().toISOString() })
              .eq('id', transaccionId)
              .then((rUp) => {
                if (rUp.error) {
                  showToast('Error al actualizar monto: ' + (rUp.error?.message || ''), 'error');
                  return Promise.resolve();
                }
                return sincronizarCcYCajaDesdeOrden(ordenId);
              })
              .then(() => {
                if (onSuccess) onSuccess();
              })
              .catch((err) => {
                showToast('Error al reajustar CC/caja: ' + (err?.message || String(err)), 'error');
              });
          }
          return Promise.all([
          client.from('movimientos_cuenta_corriente').select('id, transaccion_id, concepto, monto_usd, monto_ars, monto_eur').eq('orden_id', ordenId).eq('cliente_id', clienteId),
          client.from('transacciones').select('id, tipo, monto, estado, cobrador, pagador').eq('instrumentacion_id', instrumentacionId),
        ]).then(([rMov, rTrxList]) => {
          const rows = rMov.data || [];
          const listTrx = rTrxList.data || [];
          const sumIngresosOthers = listTrx.filter((tr) => tr.tipo === 'ingreso' && tr.pagador === 'cliente' && tr.estado === 'ejecutada' && tr.id !== transaccionId).reduce((s, tr) => s + Number(tr.monto), 0);
          const sumEgresosOthers = listTrx.filter((tr) => tr.tipo === 'egreso' && tr.cobrador === 'cliente' && tr.estado === 'ejecutada' && tr.id !== transaccionId).reduce((s, tr) => s + Number(tr.monto), 0);
          const sumIngresosClienteEjecutados = sumIngresosOthers + (t.tipo === 'ingreso' && t.pagador === 'cliente' ? newMonto : 0);
          const sumEgresosClienteEjecutados = sumEgresosOthers + (t.tipo === 'egreso' && t.cobrador === 'cliente' ? newMonto : 0);
          const cancelacionIds = rows.filter((m) => m.transaccion_id === transaccionId && ((m.concepto || '').includes('Cancelación de deuda') || (m.concepto || '').includes('Contraparte cancelación'))).map((m) => m.id);
          const rowDebe = rows.find((r) => { const c = (r.concepto || '').toUpperCase(); return c.includes('DEBE') || c.includes('COMPROMISO DE PAGO'); });
          const rowComp = rows.find((r) => { const c = (r.concepto || '').normalize('NFD').replace(/\u0301/g, '').toUpperCase(); return c.includes('COMPENSACION') || c.includes('COMPROMISO A COBRAR'); });
          const tieneMomentoCero = rowDebe && rowComp && (rowDebe.monto_usd != null || rowDebe.monto_ars != null || rowDebe.monto_eur != null);
          let prom = Promise.resolve();
          if (cancelacionIds.length > 0) prom = prom.then(() => Promise.all(cancelacionIds.map((id) => client.from('movimientos_cuenta_corriente').delete().eq('id', id))));
          prom = prom.then(() => client.from('movimientos_caja').delete().eq('transaccion_id', transaccionId));
          prom = prom.then(() => client.from('transacciones').update({ monto: newMonto, updated_at: ahora }).eq('id', transaccionId));
          const esIngreso = t.tipo === 'ingreso';
          const delta = oldMonto - newMonto;
          if (tieneMomentoCero && clienteId) {
            const amountDebeMonR = rowDebe && (monR === 'USD' ? rowDebe.monto_usd : (monR === 'ARS' ? rowDebe.monto_ars : rowDebe.monto_eur));
            const amountCompMonE = rowComp && (monE === 'USD' ? rowComp.monto_usd : (monE === 'ARS' ? rowComp.monto_ars : rowComp.monto_eur));
            const restoEnFila = esIngreso ? Math.abs(Number(amountDebeMonR) || 0) : Math.abs(Number(amountCompMonE) || 0);
            const restoTrxId = esIngreso ? (rowDebe.transaccion_id || null) : (rowComp.transaccion_id || null);
            // Si la fila es nuestra (ejecutamos todo sin split), el nuevo resto es solo delta. Si hay otra transacción pendiente, nuevo resto = restoEnFila + delta.
            const newRestoMonto = (restoTrxId && restoTrxId !== transaccionId) ? Math.max(0, restoEnFila + delta) : Math.max(0, delta);
            if (restoTrxId && restoTrxId !== transaccionId && newRestoMonto >= 1e-6) {
              prom = prom.then(() => client.from('transacciones').update({ monto: newRestoMonto, updated_at: ahora }).eq('id', restoTrxId));
              const difUsd = esIngreso ? (monR === 'USD' ? -newRestoMonto : (monE === 'USD' ? -ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'USD' ? -ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'USD' ? -newRestoMonto : 0));
              const difArs = esIngreso ? (monR === 'ARS' ? -newRestoMonto : (monE === 'ARS' ? -ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'ARS' ? -ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'ARS' ? -newRestoMonto : 0));
              const difEur = esIngreso ? (monR === 'EUR' ? -newRestoMonto : (monE === 'EUR' ? -ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'EUR' ? -ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'EUR' ? -newRestoMonto : 0));
              const remUsd = esIngreso ? (monR === 'USD' ? newRestoMonto : (monE === 'USD' ? ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'USD' ? ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'USD' ? newRestoMonto : 0));
              const remArs = esIngreso ? (monR === 'ARS' ? newRestoMonto : (monE === 'ARS' ? ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'ARS' ? ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'ARS' ? newRestoMonto : 0));
              const remEur = esIngreso ? (monR === 'EUR' ? newRestoMonto : (monE === 'EUR' ? ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'EUR' ? ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'EUR' ? newRestoMonto : 0));
              prom = prom.then(() => client.from('movimientos_cuenta_corriente').update({
                monto_usd: esIngreso ? difUsd : remUsd, monto_ars: esIngreso ? difArs : remArs, monto_eur: esIngreso ? difEur : remEur, estado_fecha: ahora,
              }).eq('id', rowDebe.id));
              prom = prom.then(() => client.from('movimientos_cuenta_corriente').update({
                monto_usd: esIngreso ? remUsd : difUsd, monto_ars: esIngreso ? remArs : difArs, monto_eur: esIngreso ? remEur : difEur, estado_fecha: ahora,
              }).eq('id', rowComp.id));
            } else if (newRestoMonto > 1e-6) {
              prom = prom.then(() => client.from('transacciones').insert({
                instrumentacion_id: instrumentacionId, tipo: t.tipo, modo_pago_id: t.modo_pago_id, moneda: t.moneda || (esIngreso ? monR : monE),
                monto: newRestoMonto, cobrador: t.cobrador, pagador: t.pagador, owner: t.owner || 'pandy', estado: 'pendiente',
                concepto: t.concepto || '', tipo_cambio: t.tipo_cambio, updated_at: ahora,
              }).select('id').single()).then((rNew) => {
                const newId = rNew.data && rNew.data.id;
                if (!newId) return;
                const difUsd = esIngreso ? (monR === 'USD' ? -newRestoMonto : (monE === 'USD' ? -ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'USD' ? -ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'USD' ? -newRestoMonto : 0));
                const difArs = esIngreso ? (monR === 'ARS' ? -newRestoMonto : (monE === 'ARS' ? -ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'ARS' ? -ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'ARS' ? -newRestoMonto : 0));
                const difEur = esIngreso ? (monR === 'EUR' ? -newRestoMonto : (monE === 'EUR' ? -ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'EUR' ? -ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'EUR' ? -newRestoMonto : 0));
                const remUsd = esIngreso ? (monR === 'USD' ? newRestoMonto : (monE === 'USD' ? ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'USD' ? ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'USD' ? newRestoMonto : 0));
                const remArs = esIngreso ? (monR === 'ARS' ? newRestoMonto : (monE === 'ARS' ? ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'ARS' ? ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'ARS' ? newRestoMonto : 0));
                const remEur = esIngreso ? (monR === 'EUR' ? newRestoMonto : (monE === 'EUR' ? ratioCc(me * newRestoMonto, mr, newRestoMonto) : 0)) : (monR === 'EUR' ? ratioCc(mr * newRestoMonto, me, newRestoMonto) : (monE === 'EUR' ? newRestoMonto : 0));
                return Promise.all([
                  client.from('movimientos_cuenta_corriente').update({
                    transaccion_id: newId, monto_usd: esIngreso ? difUsd : remUsd, monto_ars: esIngreso ? difArs : remArs, monto_eur: esIngreso ? difEur : remEur, estado_fecha: ahora,
                  }).eq('id', rowDebe.id),
                  client.from('movimientos_cuenta_corriente').update({
                    monto_usd: esIngreso ? remUsd : difUsd, monto_ars: esIngreso ? remArs : difArs, monto_eur: esIngreso ? remEur : difEur, estado_fecha: ahora,
                  }).eq('id', rowComp.id),
                ]);
              });
            } else if (newRestoMonto < 1e-6) {
              prom = prom.then(() => Promise.all([
                client.from('movimientos_cuenta_corriente').update({ estado: 'cerrado', estado_fecha: ahora }).eq('id', rowDebe.id),
                client.from('movimientos_cuenta_corriente').update({ estado: 'cerrado', estado_fecha: ahora }).eq('id', rowComp.id),
              ]));
            }
          }
          // Sin momento cero: solo crear "resto" si tras este cambio la suma ejecutada del cliente sigue siendo menor que mr/me.
          const faltaIngreso = mr - sumIngresosClienteEjecutados > 1e-6;
          const faltaEgreso = me - sumEgresosClienteEjecutados > 1e-6;
          const splitSinMc = !tieneMomentoCero && clienteId && (
            (esIngreso && t.pagador === 'cliente' && mr > 1e-6 && newMonto > 1e-6 && faltaIngreso) ||
            (!esIngreso && t.cobrador === 'cliente' && me > 1e-6 && newMonto > 1e-6 && faltaEgreso)
          );
          if (splitSinMc) {
            const diferencia = esIngreso ? (mr - sumIngresosClienteEjecutados) : (me - sumEgresosClienteEjecutados);
            if (diferencia >= 1e-6) {
              prom = prom.then(() => client.from('transacciones').insert({
              instrumentacion_id: instrumentacionId,
              tipo: t.tipo,
              modo_pago_id: t.modo_pago_id,
              moneda: t.moneda || (esIngreso ? monR : monE),
              monto: diferencia,
              cobrador: t.cobrador,
              pagador: t.pagador,
              owner: t.owner || 'pandy',
              estado: 'pendiente',
              concepto: t.concepto || '',
              tipo_cambio: t.tipo_cambio || null,
              updated_at: ahora,
            }).then(() => {}));
            }
          }
          function montosCancelacionItem(montoTrx, pagadorCliente) {
            if (monR === monE) {
              const signo = pagadorCliente ? 1 : -1;
              return { monto_usd: numCc(monR === 'USD' ? signo * montoTrx : 0), monto_ars: numCc(monR === 'ARS' ? signo * montoTrx : 0), monto_eur: numCc(monR === 'EUR' ? signo * montoTrx : 0) };
            }
            if (pagadorCliente) {
              const enMonE = ratioCc(montoTrx * me, mr, montoTrx);
              return { monto_usd: numCc(monR === 'USD' ? montoTrx : (monE === 'USD' ? enMonE : 0)), monto_ars: numCc(monR === 'ARS' ? montoTrx : (monE === 'ARS' ? enMonE : 0)), monto_eur: numCc(monR === 'EUR' ? montoTrx : (monE === 'EUR' ? enMonE : 0)) };
            }
            const enMonR = ratioCc(montoTrx * mr, me, montoTrx);
            return { monto_usd: numCc(monR === 'USD' ? -enMonR : (monE === 'USD' ? -montoTrx : 0)), monto_ars: numCc(monR === 'ARS' ? -enMonR : (monE === 'ARS' ? -montoTrx : 0)), monto_eur: numCc(monR === 'EUR' ? -enMonR : (monE === 'EUR' ? -montoTrx : 0)) };
          }
          if (clienteId) {
            prom = prom.then(() => {
              if (monR !== monE && t.pagador === 'cliente') {
                const enMonEVal = ratioCc(newMonto * me, mr, newMonto);
                const cancelacion = { monto_usd: numCc(monR === 'USD' ? newMonto : 0), monto_ars: numCc(monR === 'ARS' ? newMonto : 0), monto_eur: numCc(monR === 'EUR' ? newMonto : 0) };
                const contraparte = { monto_usd: numCc(monR === 'USD' ? -newMonto : (monE === 'USD' ? -enMonEVal : 0)), monto_ars: numCc(monR === 'ARS' ? -newMonto : (monE === 'ARS' ? -enMonEVal : 0)), monto_eur: numCc(monR === 'EUR' ? -newMonto : (monE === 'EUR' ? -enMonEVal : 0)) };
                return client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId, concepto: 'Cancelación de deuda ' + ordenLabel,
                  fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora, monto_usd: cancelacion.monto_usd, monto_ars: cancelacion.monto_ars, monto_eur: cancelacion.monto_eur, moneda: monR, monto: 0,
                }).then(() => client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId, concepto: 'Contraparte cancelación ' + ordenLabel,
                  fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora, monto_usd: contraparte.monto_usd, monto_ars: contraparte.monto_ars, monto_eur: contraparte.monto_eur, moneda: monE, monto: 0,
                }));
              }
              const montos = montosCancelacionItem(newMonto, t.pagador === 'cliente');
              return client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId, concepto: 'Cancelación de deuda ' + ordenLabel,
                fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora, monto_usd: montos.monto_usd, monto_ars: montos.monto_ars, monto_eur: montos.monto_eur, moneda: esIngreso ? monR : monE, monto: 0,
              });
            });
          }
          prom = prom.then(() => client.from('modos_pago').select('codigo').eq('id', t.modo_pago_id).single()).then((rModo) => {
            const codigo = (rModo.data && rModo.data.codigo) || '';
            const cajaTipo = codigoCajaTipoDesdeCodigo(codigo);
            const signoCaja = (t.cobrador || '') === 'pandy' ? 1 : -1;
            const concepto = conceptoCajaTransaccion((t.cobrador || '') === 'pandy', t.moneda || 'USD', newMonto, orden.numero, t.numero);
            return client.from('movimientos_caja').insert({
              moneda: t.moneda || 'USD', monto: signoCaja * newMonto, caja_tipo: cajaTipo, transaccion_id: transaccionId,
              orden_numero: orden.numero != null ? orden.numero : null, transaccion_numero: t.numero != null ? t.numero : null,
              concepto, fecha, usuario_id: currentUserId,
            });
          });
          return prom.then(() => { if (onSuccess) onSuccess(); }).catch((err) => { showToast('Error al reajustar CC/caja: ' + (err?.message || ''), 'error'); });
        });
        });
      });
    });
  });
}

/** Guarda solo el modo de pago de una transacción. Si está ejecutada, reajusta caja (borra movimiento anterior e inserta uno con el nuevo modo). Llama onSuccess() tras guardar. onFailure() opcional si no se puede guardar (ej. operación CHEQUE con modo Cheque). */
function guardarSoloModoPagoTransaccion(transaccionId, modoPagoId, onSuccess, onFailure) {
  if (!modoPagoId || !transaccionId || !currentUserId) return Promise.resolve();
  return client.from('transacciones').select('id, numero, estado, monto, moneda, concepto, instrumentacion_id, modo_pago_id, cobrador').eq('id', transaccionId).single().then((rTr) => {
    const t = rTr.data;
    if (!t) return Promise.resolve();
    if (t.modo_pago_id === modoPagoId) {
      if (onSuccess) onSuccess();
      return Promise.resolve();
    }
    return client.from('instrumentacion').select('orden_id').eq('id', t.instrumentacion_id).single().then((rInst) => {
      const ordenId = rInst.data && rInst.data.orden_id;
      if (!ordenId) return Promise.resolve();
      return Promise.all([
        client.from('ordenes').select('numero, tipos_operacion(codigo, moneda_in, moneda_out)').eq('id', ordenId).single(),
        client.from('modos_pago').select('codigo').eq('id', t.modo_pago_id).single(),
      ]).then(([rOrd, rModoActual]) => {
        const to = rOrd.data?.tipos_operacion;
        const tipoCodigo = to?.codigo || '';
        const modoActualCodigo = (rModoActual.data && rModoActual.data.codigo) || '';
        if (esTipoOperacionChequeArs(tipoCodigo, to?.moneda_in, to?.moneda_out) && modoActualCodigo === 'cheque') {
          showToast('En operación CHEQUE no se puede cambiar el modo de pago de las transacciones generadas con Cheque.', 'error');
          if (onFailure) onFailure();
          return Promise.resolve();
        }
        const esEjecutada = (t.estado || '').toLowerCase() === 'ejecutada';
        return client.from('transacciones').update({ modo_pago_id: modoPagoId, updated_at: new Date().toISOString() }).eq('id', transaccionId).then((r) => {
      if (r.error) {
        showToast('Error al actualizar modo de pago: ' + (r.error?.message || ''), 'error');
        return;
      }
      if (!esEjecutada) {
        if (onSuccess) onSuccess();
        return;
      }
      const fecha = new Date().toISOString().slice(0, 10);
      const nroOrden = rOrd.data && rOrd.data.numero;
      return client.from('movimientos_caja').delete().eq('transaccion_id', transaccionId).then(() =>
        client.from('modos_pago').select('codigo').eq('id', modoPagoId).single()
      ).then((rModo) => {
        const codigo = (rModo.data && rModo.data.codigo) || '';
        const cajaTipo = codigoCajaTipoDesdeCodigo(codigo);
        const signoCaja = (t.cobrador || '') === 'pandy' ? 1 : -1;
        const concepto = conceptoCajaTransaccion((t.cobrador || '') === 'pandy', t.moneda || 'USD', Number(t.monto) || 0, nroOrden, t.numero);
        return client.from('movimientos_caja').insert({
          moneda: t.moneda || 'USD', monto: signoCaja * (Number(t.monto) || 0), caja_tipo: cajaTipo, transaccion_id: transaccionId,
          orden_numero: nroOrden != null ? nroOrden : null, transaccion_numero: t.numero != null ? t.numero : null,
          concepto, fecha, usuario_id: currentUserId,
        });
      }).then((rIns) => {
        if (rIns.error) showToast('Error al actualizar caja: ' + (rIns.error?.message || ''), 'error');
        if (onSuccess) onSuccess();
      });
        });
      });
    });
  });
}

/**
 * Formato en tiempo real: solo dígitos y una coma (decimal).
 * - Parte entera: se agregan puntos como separador de miles al cumplirse (ej. 1000 → 1.000).
 * - Parte decimal: solo si el usuario escribe una coma; después de la coma, solo dígitos (sin puntos).
 * No se agregan decimales automáticamente; el separador decimal es la coma al escribir.
 */
function formatImporteInputOnType(inputEl, maxDecimales, soloComaDecimal) {
  if (!inputEl) return;
  const maxDec = (typeof maxDecimales === 'number' && maxDecimales >= 0) ? maxDecimales : 2;
  const oldValue = inputEl.value;
  const cursorPos = inputEl.selectionStart ?? oldValue.length;

  // Extraer parte entera (solo dígitos; los puntos son miles y se quitan) y parte decimal (solo si el usuario escribió una coma)
  let raw = oldValue.replace(/\s/g, '');
  if (soloComaDecimal && raw.includes('.')) {
    // Aceptar punto como decimal y convertirlo a coma (teclado en inglés): "2.5" → "2,5"
    const partes = raw.split('.');
    if (partes.length === 2 && /^\d*$/.test(partes[0]) && /^\d*$/.test(partes[1]) && partes[1].length <= maxDec) raw = partes[0] + ',' + partes[1];
    else if (partes.length === 2 && partes[1] === '' && /^\d*$/.test(partes[0])) raw = partes[0] + ',';
  }
  if (!soloComaDecimal) raw = raw.replace(/\./g, ''); // quitar puntos de miles
  const idxComa = raw.indexOf(',');
  const tieneDecimal = idxComa >= 0;
  let parteEnteraStr = tieneDecimal ? raw.slice(0, idxComa).replace(/\D/g, '') : raw.replace(/\D/g, '');
  const valorPrevio = inputEl._importeValorPrevio;
  inputEl._importeValorPrevio = oldValue; // guardar para la próxima tecla
  // Si el usuario escribe sobre "0" (modal recién abierto): "01" → "1", y "10" (cursor al inicio) → "1"
  if (parteEnteraStr.length > 1) {
    if (parteEnteraStr[0] === '0') {
      parteEnteraStr = parteEnteraStr.replace(/^0+/, '') || '0';
    } else if ((valorPrevio === '0' || valorPrevio === '') && parteEnteraStr === '10') {
      parteEnteraStr = '1';
    }
  }
  const parteDecimalStr = tieneDecimal ? raw.slice(idxComa + 1).replace(/\D/g, '').slice(0, maxDec) : '';

  // Formatear parte entera con puntos (miles); parte decimal sin puntos, solo tras coma. Mantener la coma aunque aún no haya decimales (ej. "2,") para que el usuario pueda seguir escribiendo.
  const formattedEntera = parteEnteraStr === '' ? '' : parteEnteraStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = tieneDecimal ? (formattedEntera + ',' + parteDecimalStr) : formattedEntera;

  // Si el valor ya está igual al formateado, es reentrada (el navegador disparó input al cambiar value).
  // Solo fijar cursor al final para no dejarlo tras el primer dígito (que haría que el siguiente 0 → "10.000").
  if (formatted === oldValue) {
    inputEl.setSelectionRange(formatted.length, formatted.length);
    return;
  }

  // Cuántos "caracteres lógicos" (dígitos o una coma) hay antes del cursor en el valor actual
  const antesDeCursor = oldValue.slice(0, cursorPos);
  let cuentaAntes = 0;
  let viComa = false;
  for (let i = 0; i < antesDeCursor.length; i++) {
    const c = antesDeCursor[i];
    if (/\d/.test(c)) cuentaAntes++;
    else if ((c === ',' || c === '.') && !viComa) { viComa = true; cuentaAntes++; }
  }

  inputEl.value = formatted;
  inputEl._importeValorPrevio = formatted;

  // Restaurar cursor: misma cantidad de dígitos (y una coma) que antes
  let newPos = formatted.length;
  if (cuentaAntes > 0) {
    let count = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) count++;
      else if (formatted[i] === ',') count++;
      if (count === cuentaAntes) {
        newPos = i + 1;
        break;
      }
    }
  } else {
    newPos = 0;
  }
  inputEl.setSelectionRange(newPos, newPos);
}

function setupInputImporte(inputEl, maxDecimales, soloComaDecimal) {
  if (!inputEl) return;
  // Evita acumular listeners si el mismo input se configura en cada apertura de modal (p. ej. transaccion-monto).
  if (inputEl.dataset.importeInputBound === '1') {
    inputEl._importeValorPrevio = inputEl.value;
    return;
  }
  inputEl.dataset.importeInputBound = '1';
  inputEl.addEventListener('focus', () => {
    if (inputEl.value === '0' || inputEl.value === '') inputEl._importeValorPrevio = inputEl.value || '0';
  });
  // Capture: corre antes que otros listeners en bubble (p. ej. actualizarMontoCalculado en transaccion-monto)
  // para que miles/decimales queden aplicados antes de parsear el valor.
  inputEl.addEventListener('input', () => formatImporteInputOnType(inputEl, maxDecimales, soloComaDecimal), true);
  inputEl.addEventListener('blur', () => {
    const val = inputEl.value.trim();
    const n = parseImporteInput(val);
    if (isNaN(n) || val === '') return;
    if (n === 0) {
      inputEl.value = '0';
      inputEl._importeValorPrevio = '0';
      return;
    }
    // No agregar ",00" si el usuario no escribió coma: solo parte entera con miles
    const usuarioEscribioComa = val.indexOf(',') >= 0;
    if (soloComaDecimal) {
      inputEl.value = Number(n).toFixed(2).replace('.', ',');
    } else if (!usuarioEscribioComa && Number.isInteger(n)) {
      const entera = String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      inputEl.value = entera;
    } else {
      inputEl.value = formatImporteDisplay(n);
    }
  });
}

/** Muestra una notificación toast integrada (reemplazo de alert para mensajes de éxito/info). type: 'success' | 'info' | 'error'. Duración en ms; 0 = no auto-cerrar. */
function showToast(mensaje, type = 'success', duracionMs = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type === 'error' ? 'error' : type === 'info' ? 'info' : 'success');
  const icon = type === 'error'
    ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  toast.innerHTML = icon + '<span class="toast-text">' + escapeHtml(mensaje) + '</span><button type="button" class="toast-close" aria-label="Cerrar">×</button>';
  const close = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 200);
  };
  toast.querySelector('.toast-close').addEventListener('click', close);
  if (duracionMs > 0) setTimeout(close, duracionMs);
  container.appendChild(toast);
}

/** Cierra todos los toasts visibles (p. ej. al cerrar un modal para no dejar mensajes de error). */
function dismissAllToasts() {
  const container = document.getElementById('toast-container');
  if (!container) return;
  container.querySelectorAll('.toast').forEach((toast) => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 200);
  });
}

/** Confirmación con mensajería interna (no usar confirm() del navegador). Muestra un modal con mensaje y botones; llama onConfirm al aceptar, onCancel al cancelar o cerrar. textoCancelar y titulo opcionales. */
function showConfirm(mensaje, textoConfirmar, onConfirm, onCancel, textoCancelar, tituloModal) {
  const backdrop = document.getElementById('modal-confirm-backdrop');
  const titulo = document.getElementById('modal-confirm-titulo');
  const texto = document.getElementById('modal-confirm-mensaje');
  const btnAceptar = document.getElementById('modal-confirm-aceptar');
  const btnCancelar = document.getElementById('modal-confirm-cancelar');
  const btnCerrar = document.getElementById('modal-confirm-cerrar');
  if (!backdrop || !texto || !btnAceptar || !btnCancelar) return;
  texto.textContent = mensaje;
  if (titulo) titulo.textContent = (tituloModal !== undefined && tituloModal !== null && tituloModal !== '') ? tituloModal : 'Confirmar';
  btnAceptar.textContent = textoConfirmar || 'Confirmar';
  btnCancelar.textContent = (textoCancelar !== undefined && textoCancelar !== null) ? textoCancelar : 'Cancelar';
  backdrop.classList.add('activo');
  backdrop.setAttribute('aria-hidden', 'false');
  const cerrar = (ejecutado) => {
    backdrop.classList.remove('activo');
    backdrop.setAttribute('aria-hidden', 'true');
    btnAceptar.onclick = null;
    btnCancelar.onclick = null;
    btnCerrar.onclick = null;
    if (backdrop._confirmMousedown) backdrop.removeEventListener('mousedown', backdrop._confirmMousedown, true);
    if (backdrop._confirmAbort) backdrop.removeEventListener('click', backdrop._confirmAbort, true);
    backdrop._confirmMousedown = null;
    backdrop._confirmAbort = null;
    if (!ejecutado && typeof onCancel === 'function') onCancel();
  };
  btnAceptar.onclick = () => { if (typeof onConfirm === 'function') onConfirm(); cerrar(true); };
  btnCancelar.onclick = () => cerrar(false);
  btnCerrar.onclick = () => cerrar(false);
  backdrop._confirmMousedown = (e) => { backdrop._confirmMouseOnBackdrop = (e.target === backdrop); };
  backdrop._confirmAbort = (e) => {
    if (e.target === backdrop && backdrop._confirmMouseOnBackdrop) cerrar(false);
    backdrop._confirmMouseOnBackdrop = false;
  };
  backdrop.addEventListener('mousedown', backdrop._confirmMousedown, true);
  backdrop.addEventListener('click', backdrop._confirmAbort, true);
}

function setupModalMovimientoCaja() {
  const backdrop = document.getElementById('modal-movimiento-caja-backdrop');
  const btnClose = document.getElementById('modal-movimiento-caja-close');
  const btnCancel = document.getElementById('modal-movimiento-caja-cancelar');
  const form = document.getElementById('form-movimiento-caja');
  const btnNuevo = document.getElementById('btn-nuevo-movimiento-caja');
  if (btnClose) btnClose.addEventListener('click', closeModalMovimientoCaja);
  if (btnCancel) btnCancel.addEventListener('click', closeModalMovimientoCaja);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalMovimientoCaja);
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveMovimientoCaja(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalMovimientoCaja(null));
  setupInputImporte(document.getElementById('mov-caja-monto'));
}

function setupModalTipoMovimientoCaja() {
  const backdrop = document.getElementById('modal-tipo-movimiento-backdrop');
  const btnClose = document.getElementById('modal-tipo-movimiento-close');
  const btnCancel = document.getElementById('modal-tipo-movimiento-cancelar');
  const form = document.getElementById('form-tipo-movimiento');
  const btnNuevo = document.getElementById('btn-nuevo-tipo-movimiento');
  if (btnClose) btnClose.addEventListener('click', closeModalTipoMovimientoCaja);
  if (btnCancel) btnCancel.addEventListener('click', closeModalTipoMovimientoCaja);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalTipoMovimientoCaja);
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveTipoMovimientoCaja(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalTipoMovimientoCaja(null));
}

// --- Órdenes ---
let ordenesVistaList = [];
let ordenesVistaClientesMap = {};
let ordenesVistaTiposOpMap = {};
let ordenesVistaIntermediariosMap = {};
let ordenesFiltrosListenersAttached = false;

/** tiposMap[id] = { codigo, nombre, icono_modo?, icono_url_publica?, usa_intermediario? } o legacy string (solo código). */
function htmlCeldaTipoOperacionDesdeMap(tipoOpId, tiposMap) {
  const t = tipoOpId ? tiposMap[tipoOpId] : null;
  if (t == null) return htmlTipoOperacionIconos('');
  if (typeof t === 'string') return htmlTipoOperacionIconos(t);
  return htmlTipoOperacionIconos(t.codigo || '', t.nombre || '', { iconoModo: t.icono_modo, iconoUrlPublica: t.icono_url_publica, usaIntermediario: t.usa_intermediario === true });
}

function clearOrdenTipoOperacionListboxFixedStyles(list) {
  if (!list) return;
  list.style.position = '';
  list.style.left = '';
  list.style.top = '';
  list.style.right = '';
  list.style.width = '';
  list.style.maxHeight = '';
  list.style.zIndex = '';
}

/** Evita que el listbox quede recortado por overflow del modal (.modal-body / .modal). */
function positionOrdenTipoOperacionListbox() {
  const btn = document.getElementById('orden-tipo-operacion-combo-btn');
  const list = document.getElementById('orden-tipo-operacion-listbox');
  if (!btn || !list || list.hidden) return;
  const r = btn.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = r.left;
  let width = r.width;
  if (left + width > vw - margin) {
    width = Math.max(200, vw - margin * 2);
    left = Math.min(left, vw - margin - width);
  }
  left = Math.max(margin, left);
  const spaceBelow = vh - r.bottom - gap - margin;
  const maxH = Math.min(280, Math.max(100, spaceBelow));
  list.style.position = 'fixed';
  list.style.left = `${left}px`;
  list.style.top = `${r.bottom + gap}px`;
  list.style.width = `${width}px`;
  list.style.maxHeight = `${maxH}px`;
  list.style.right = 'auto';
  list.style.zIndex = '10050';
}

function closeOrdenTipoOperacionListbox() {
  const list = document.getElementById('orden-tipo-operacion-listbox');
  const btn = document.getElementById('orden-tipo-operacion-combo-btn');
  if (list) {
    list.hidden = true;
    list.classList.remove('is-open');
    clearOrdenTipoOperacionListboxFixedStyles(list);
  }
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/** Rellena el listbox custom desde las <option> del select nativo (mantiene data-codigo para E2E). */
function rebuildOrdenTipoOperacionListbox() {
  const sel = document.getElementById('orden-tipo-operacion');
  const list = document.getElementById('orden-tipo-operacion-listbox');
  if (!sel || !list) return;
  const current = sel.value || '';
  const opts = Array.from(sel.querySelectorAll('option'));
  list.innerHTML = opts
    .map((opt) => {
      const v = opt.value != null ? String(opt.value) : '';
      const codigo = (opt.getAttribute('data-codigo') || '').trim();
      const nombrePlano = (opt.textContent || '').trim();
      const nombreBase = (opt.getAttribute('data-nombre-base') || '').trim() || nombrePlano.replace(/\s+-\s*Int\.\s*$/i, '').trim();
      const modoRaw = (opt.getAttribute('data-icono-modo')) || 'auto';
      const modo = modoRaw === 'cheque' || modoRaw === 'custom' ? modoRaw : 'auto';
      const url = (opt.getAttribute('data-icono-url')) || '';
      const usaInt = opt.getAttribute('data-usa-intermediario') === 'true';
      const escV = escapeHtml(v).replace(/"/g, '&quot;');
      const selected = v === current ? 'true' : 'false';
      if (!v) {
        return `<li role="presentation"><button type="button" class="orden-tipo-operacion-option" role="option" data-value="" aria-selected="${selected}"><span class="orden-tipo-operacion-placeholder">Elegir…</span></button></li>`;
      }
      const iconsHtml = codigo
        ? htmlTipoOperacionIconos(codigo, nombreBase || nombrePlano, { iconoModo: modo, iconoUrlPublica: url, usaIntermediario: usaInt })
        : `<span class="tipo-op-iconos">${escapeHtml(nombreBase || nombrePlano)}</span>`;
      const labelHtml = htmlOrdenTipoOperacionEtiquetaVisible(nombreBase, usaInt);
      return `<li role="presentation"><button type="button" class="orden-tipo-operacion-option" role="option" data-value="${escV}" aria-selected="${selected}">${iconsHtml}<span class="orden-tipo-operacion-option-label">${labelHtml}</span></button></li>`;
    })
    .join('');
}

function syncOrdenTipoOperacionIconosPreview() {
  const sel = document.getElementById('orden-tipo-operacion');
  const display = document.getElementById('orden-tipo-operacion-combo-display');
  if (!display) return;
  if (!sel || !sel.value) {
    display.innerHTML = '<span class="orden-tipo-operacion-placeholder">Elegir…</span>';
    return;
  }
  const opt = sel.selectedOptions && sel.selectedOptions[0];
  const codigo = opt ? (opt.getAttribute('data-codigo') || '').trim() : '';
  const nombrePlano = opt && opt.textContent ? opt.textContent.trim() : '';
  const nombreBaseAttr = opt ? (opt.getAttribute('data-nombre-base') || '').trim() : '';
  const usaIntSel = opt && opt.getAttribute('data-usa-intermediario') === 'true';
  let base = nombreBaseAttr;
  if (!base) base = usaIntSel ? nombrePlano.replace(/\s+-\s*Int\.\s*$/i, '').trim() : nombrePlano;
  const modoRaw = (opt && opt.getAttribute('data-icono-modo')) || 'auto';
  const modo = modoRaw === 'cheque' || modoRaw === 'custom' ? modoRaw : 'auto';
  const url = (opt && opt.getAttribute('data-icono-url')) || '';
  const usaInt = !!usaIntSel;
  const ic = codigo ? htmlTipoOperacionIconos(codigo, base || nombrePlano, { iconoModo: modo, iconoUrlPublica: url, usaIntermediario: usaInt }) : '';
  const nombreHtml = htmlOrdenTipoOperacionEtiquetaVisible(base, usaInt);
  display.innerHTML = `<span class="orden-tipo-operacion-combo-display-inner">${ic}<span class="orden-tipo-operacion-combo-nombre">${nombreHtml}</span></span>`;
}

function renderOrdenesTabla(list) {
  const tbody = document.getElementById('ordenes-tbody');
  const wrapEl = document.getElementById('ordenes-tabla-wrap');
  if (!tbody || !wrapEl) return;
  const canEditarOrden = userPermissions.includes('editar_orden');
  const canAnularOrden = userPermissions.includes('anular_orden');
  const canIngresarTransacciones = userPermissions.includes('ingresar_transacciones');
  const canEditarTransacciones = userPermissions.includes('editar_transacciones');
  const canEliminarTransacciones = userPermissions.includes('eliminar_transacciones');
  const canVerAccionesOrden = canEditarOrden || canAnularOrden || userPermissions.includes('editar_estado_orden') || canIngresarTransacciones || canEditarTransacciones || canEliminarTransacciones;
  const clientesMap = ordenesVistaClientesMap;
  const tiposOpMap = ordenesVistaTiposOpMap;
  const intermediariosMap = ordenesVistaIntermediariosMap;
  const estadoLabel = (e) => ({ pendiente_instrumentar: 'Pendiente Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada', anulada: 'Anulada', cotizacion: 'Cotización', concertada: 'Concertada' }[e] || (e ? String(e) : '–'));
  const estadoBadgeClass = (e) => (e && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'anulada', 'cotizacion', 'concertada'].includes(e) ? `badge badge-estado-${e.replace(/_/g, '-')}` : '');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">No hay órdenes con los filtros aplicados.</td></tr>';
    wrapEl.style.display = 'block';
    return;
  }
  tbody.innerHTML = list
    .map(
      (o) => {
        const estado = o.estado || '';
        const badgeClass = estadoBadgeClass(estado);
        const estadoHtml = badgeClass ? `<span class="${badgeClass}">${estadoLabel(estado)}</span>` : estadoLabel(estado);
        return `<tr data-id="${o.id}">
          <td>${o.numero != null ? o.numero : '–'}</td>
          <td>${(o.fecha || '').toString().slice(0, 10)}</td>
          <td class="td-tipo-op-iconos">${o.tipo_operacion_id ? htmlCeldaTipoOperacionDesdeMap(o.tipo_operacion_id, tiposOpMap) : htmlTipoOperacionIconos('')}</td>
          <td>${escapeHtml(o.cliente_id ? clientesMap[o.cliente_id] || '–' : '–')}</td>
          <td>${escapeHtml(o.intermediario_id ? intermediariosMap[o.intermediario_id] || '–' : '–')}</td>
          <td>${estadoHtml}</td>
          <td>${o.moneda_recibida} ${formatMonto(o.monto_recibido)}</td>
          <td>${o.moneda_entregada} ${formatMonto(o.monto_entregado)}</td>
          <td>${canVerAccionesOrden ? `${canEditarOrden ? `<button type="button" class="btn-editar btn-editar-orden btn-icon-only" data-id="${o.id}" title="Editar" aria-label="Editar"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span></button> ` : ''}<button type="button" class="btn-secondary btn-transacciones btn-icon-only" data-id="${o.id}" title="Transacciones" aria-label="Transacciones" style="margin-left:0.25rem;"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg></span></button>${canAnularOrden && o.estado !== 'anulada' && o.estado !== 'orden_ejecutada' ? ` <button type="button" class="btn-secondary btn-anular-orden-tabla btn-icon-only" data-id="${o.id}" title="Anular orden" aria-label="Anular orden" style="margin-left:0.25rem;"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span></button>` : ''}` : ''}</td>
        </tr>
        <tr class="orden-detalle-tr" id="orden-detalle-${o.id}" data-orden-id="${o.id}" style="display:none;">
          <td colspan="9" class="orden-detalle-cell">
            <div class="orden-detalle-panel" id="panel-orden-${o.id}" data-orden-id="${o.id}">
              <div class="orden-detalle-encabezado"></div>
              <div class="orden-detalle-loading" style="display:none;">Cargando transacciones…</div>
              <div class="orden-detalle-content" style="display:none;">
                <div class="orden-detalle-totales" style="margin-bottom:0.75rem; font-size:0.9rem; color:#555;"></div>
                <div class="vista-toolbar" style="margin-bottom:0.75rem;">
                  <button type="button" class="btn-nuevo btn-nueva-transaccion-panel" data-orden-id="${o.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>Nueva transacción</button>
                </div>
                <table class="tabla-transacciones-panel"><thead><tr><th>Nro</th><th>Tipo</th><th>Modo pago</th><th>Moneda</th><th>Monto</th><th>Pagador</th><th>Cobrador</th><th>Estado</th><th></th></tr></thead><tbody class="orden-detalle-tbody"></tbody></table>
              </div>
            </div>
          </td>
        </tr>`;
      }
    )
    .join('');
  tbody.querySelectorAll('.btn-editar-orden').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const row = list.find((r) => r.id === id);
      if (row) openModalOrden(row);
    });
  });
  tbody.querySelectorAll('.btn-transacciones').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) expandOrdenTransacciones(id, list.find((r) => r.id === id));
    });
  });
  tbody.querySelectorAll('.btn-anular-orden-tabla').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) {
        showConfirm('¿Anular esta orden? El estado pasará a Anulada.', 'Anular', () => {
          client.from('ordenes').update({ estado: 'anulada', updated_at: new Date().toISOString() }).eq('id', id).then((r) => {
            if (r.error) showToast('Error: ' + (r.error?.message || ''), 'error');
            else { showToast('Orden anulada.', 'success'); loadOrdenes(); }
          });
        });
      }
    });
  });
  wrapEl.style.display = 'block';
}

function aplicarFiltrosOrdenesVista() {
  const selCliente = document.getElementById('ordenes-filtro-cliente');
  const selIntermediario = document.getElementById('ordenes-filtro-intermediario');
  const selEstado = document.getElementById('ordenes-filtro-estado');
  const clienteId = selCliente && selCliente.value ? selCliente.value.trim() : '';
  const intermediarioId = selIntermediario && selIntermediario.value ? selIntermediario.value.trim() : '';
  const estadoRaw = selEstado && selEstado.value != null ? String(selEstado.value).trim() : '__activas__';
  const filtered = ordenesVistaList.filter((o) => {
    if (clienteId && o.cliente_id !== clienteId) return false;
    if (intermediarioId && o.intermediario_id !== intermediarioId) return false;
    if (estadoRaw === '__activas__') {
      const es = (o.estado || '').toString();
      if (es === 'orden_ejecutada' || es === 'anulada') return false;
    } else if (estadoRaw !== '' && (o.estado || '') !== estadoRaw) return false;
    return true;
  });
  renderOrdenesTabla(filtered);
}

function loadOrdenes() {
  // No recargar la lista mientras el modal de orden está abierto: evita que la vista atrás cargue y el modal pierda el foco.
  if (document.getElementById('modal-orden-backdrop')?.classList?.contains('activo')) return Promise.resolve();
  const loadingEl = document.getElementById('ordenes-loading');
  const wrapEl = document.getElementById('ordenes-tabla-wrap');
  const tbody = document.getElementById('ordenes-tbody');
  const btnNuevo = document.getElementById('btn-nueva-orden');
  const filtrosWrap = document.getElementById('ordenes-filtros-wrap');
  if (!loadingEl || !wrapEl || !tbody) return Promise.resolve();

  const canIngresarOrden = userPermissions.includes('ingresar_orden');
  const canEditarOrden = userPermissions.includes('editar_orden');
  if (btnNuevo) btnNuevo.style.display = canIngresarOrden ? '' : 'none';
  const btnOrdenPorChat = document.getElementById('btn-orden-por-chat');
  if (btnOrdenPorChat) btnOrdenPorChat.style.display = canIngresarOrden ? '' : 'none';

  loadingEl.style.display = 'block';
  const loadingShownAtOrdenes = Date.now();
  if (filtrosWrap) filtrosWrap.style.display = 'none';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';

  const selectBase = 'id, cliente_id, fecha, estado, tipo_operacion_id, operacion_directa, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, cotizacion, tasa_descuento_intermediario, observaciones';
  const selectConNumero = 'id, numero, cliente_id, fecha, estado, tipo_operacion_id, operacion_directa, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, cotizacion, tasa_descuento_intermediario, observaciones';

  function runLoadOrdenes(selectCols) {
    return client
      .from('ordenes')
      .select(selectCols)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .then((res) => {
        if (res.error) {
          const msg = String(res.error.message || '');
          if ((msg.includes('numero') || msg.includes('does not exist')) && selectCols === selectConNumero) {
            ordenesTieneNumeroColumn = false;
            return runLoadOrdenes(selectBase);
          }
          return delayMinLoading(loadingShownAtOrdenes).then(() => {
            loadingEl.style.display = 'none';
            tbody.innerHTML = '<tr><td colspan="9">Error: ' + (msg || '') + '</td></tr>';
            wrapEl.style.display = 'block';
          });
        }
        const list = res.data || [];
        const clienteIds = [...new Set(list.map((o) => o.cliente_id).filter(Boolean))];
        const tipoOpIds = [...new Set(list.map((o) => o.tipo_operacion_id).filter(Boolean))];
        const intIds = [...new Set(list.map((o) => o.intermediario_id).filter(Boolean))];
        return Promise.all([
          client.from('clientes').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
          tipoOpIds.length ? client.from('tipos_operacion').select('id, nombre, codigo, moneda_in, moneda_out, usa_intermediario, icono_modo, icono_url_publica').in('id', tipoOpIds) : Promise.resolve({ data: [] }),
          client.from('intermediarios').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
        ]).then(([crClientes, tr, crInt]) => {
          const clientesMap = {};
          (crClientes.data || []).forEach((c) => { clientesMap[c.id] = c.nombre || ''; });
          const tiposOpMap = {};
          (tr.data || []).forEach((t) => {
            tiposOpMap[t.id] = {
              codigo: t.codigo || '',
              nombre: t.nombre || '',
              moneda_in: (t.moneda_in || '').toString().trim(),
              moneda_out: (t.moneda_out || '').toString().trim(),
              usa_intermediario: t.usa_intermediario === true,
              icono_modo: (t.icono_modo || 'auto').toString().trim().toLowerCase(),
              icono_url_publica: (t.icono_url_publica || '').toString().trim(),
            };
          });
          const intermediariosMap = {};
          (crInt.data || []).forEach((i) => { intermediariosMap[i.id] = i.nombre || ''; });
          ordenesVistaList = list;
          ordenesVistaClientesMap = clientesMap;
          ordenesVistaTiposOpMap = tiposOpMap;
          ordenesVistaIntermediariosMap = intermediariosMap;

          const selCliente = document.getElementById('ordenes-filtro-cliente');
          const selIntermediario = document.getElementById('ordenes-filtro-intermediario');
          if (selCliente) {
            selCliente.innerHTML = '<option value="">Todos</option>' + (crClientes.data || []).map((c) => `<option value="${c.id}">${escapeHtml(c.nombre || '')}</option>`).join('');
          }
          if (selIntermediario) {
            selIntermediario.innerHTML = '<option value="">Todos</option>' + (crInt.data || []).map((i) => `<option value="${i.id}">${escapeHtml(i.nombre || '')}</option>`).join('');
          }
          if (filtrosWrap) filtrosWrap.style.display = 'flex';
          return delayMinLoading(loadingShownAtOrdenes).then(() => {
            loadingEl.style.display = 'none';
            if (!ordenesFiltrosListenersAttached) {
              const selC = document.getElementById('ordenes-filtro-cliente');
              const selI = document.getElementById('ordenes-filtro-intermediario');
              const selE = document.getElementById('ordenes-filtro-estado');
              if (selC) selC.addEventListener('change', aplicarFiltrosOrdenesVista);
              if (selI) selI.addEventListener('change', aplicarFiltrosOrdenesVista);
              if (selE) selE.addEventListener('change', aplicarFiltrosOrdenesVista);
              ordenesFiltrosListenersAttached = true;
            }
            aplicarFiltrosOrdenesVista();
          });
        });
      });
  }

  // Recalcular CC y caja desde orden + transacciones; luego cargar órdenes.
  return sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion().then(() => runLoadOrdenes(selectConNumero));
}

/** Crea una orden borrador (mínima) para "Nueva orden". Si el usuario cierra sin guardar, se elimina en closeModalOrden. */
function crearOrdenBorrador() {
  const fecha = new Date().toISOString().slice(0, 10);
  const payload = {
    fecha,
    estado: 'pendiente_instrumentar',
    moneda_recibida: 'USD',
    moneda_entregada: 'USD',
    monto_recibido: 0,
    monto_entregado: 0,
    usuario_id: currentUserId,
    updated_at: new Date().toISOString(),
  };
  const selectCols = ordenesTieneNumeroColumn ? 'id, numero, fecha, estado, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado' : 'id, fecha, estado, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado';
  return client.from('ordenes').insert(payload).select(selectCols).single().then((r) => {
    if (r.error || !r.data) return Promise.reject(new Error(r.error?.message || 'No se pudo crear la orden'));
    return r.data;
  });
}

function syncOrdenIntPatronInstrumentacionWrap() {
  const wrap = document.getElementById('orden-wrap-int-patron-instrumentacion');
  if (!wrap) return;
  const opt = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  if (!opt) return;
  const codigo = opt.getAttribute('data-codigo') || '';
  const mi = opt.getAttribute('data-moneda-in') || '';
  const mo = opt.getAttribute('data-moneda-out') || '';
  const usaInt = opt.getAttribute('data-usa-intermediario') === 'true';
  const intVal = document.getElementById('orden-intermediario')?.value?.trim();
  const esCheque = esTipoOperacionChequeArs(codigo, mi, mo);
  const show = usaInt && !!intVal && !esCheque;
  wrap.style.display = show ? 'block' : 'none';
}

function setupOrdenIntPatronRadiosOnce() {
  if (typeof document === 'undefined' || document.body.dataset.ordenIntPatronRadiosBound === '1') return;
  document.body.dataset.ordenIntPatronRadiosBound = '1';
  document.querySelectorAll('input[name="orden-int-patron-radio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const hid = document.getElementById('orden-int-patron');
      if (hid && radio.checked) hid.value = radio.value;
    });
  });
}

function resetOrdenIntPatronUi() {
  const hid = document.getElementById('orden-int-patron');
  const r0 = document.querySelector('input[name="orden-int-patron-radio"][value="cp_ic"]');
  if (r0) r0.checked = true;
  if (hid) hid.value = 'cp_ic';
}

/** Si ya hay 2 transacciones, alinea radios con patrón detectado (solo UI; no persiste en orden). */
function syncPatronDesdeTransaccionesOrdenInt(ordenId) {
  if (!ordenId || !client) return Promise.resolve();
  return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle()
    .then((rInst) => {
      const instId = rInst.data && rInst.data.id;
      if (!instId) return Promise.resolve();
      return client.from('transacciones').select('tipo, pagador, cobrador, numero, created_at').eq('instrumentacion_id', instId).order('numero', { ascending: true }).order('created_at', { ascending: true });
    })
    .then((rTr) => {
      const list = (rTr && rTr.data) || [];
      if (list.length < 2) return;
      const t1 = list[0];
      const cob1 = String(t1.cobrador || '').toLowerCase();
      const esIngreso = (t1.tipo || '').toLowerCase() === 'ingreso';
      const hid = document.getElementById('orden-int-patron');
      const rCi = document.querySelector('input[name="orden-int-patron-radio"][value="ci_pc"]');
      const rCp = document.querySelector('input[name="orden-int-patron-radio"][value="cp_ic"]');
      if (esIngreso && cob1 === 'intermediario') {
        if (hid) hid.value = 'ci_pc';
        if (rCi) rCi.checked = true;
      } else {
        if (hid) hid.value = 'cp_ic';
        if (rCp) rCp.checked = true;
      }
    })
    .catch(() => {});
}

function openModalOrden(registro) {
  const backdrop = document.getElementById('modal-orden-backdrop');
  const titulo = document.getElementById('modal-orden-titulo');
  const idEl = document.getElementById('orden-id');
  const form = document.getElementById('form-orden');
  const wizard = document.getElementById('orden-wizard');
  const stepParticipantes = document.getElementById('orden-step-participantes');
  const stepDetalles = document.getElementById('orden-step-detalles');
  const btnNext = document.getElementById('orden-btn-next');
  const btnBack = document.getElementById('orden-btn-back');
  const btnIrInst = document.getElementById('orden-btn-ir-instrumentacion');
  const btnBackDetalles = document.getElementById('orden-btn-back-detalles');
  const btnNuevaTr = document.getElementById('orden-btn-nueva-transaccion');
  if (!backdrop || !titulo || !idEl || !form) return;
  const montoEntregadoInput = document.getElementById('orden-monto-entregado');
  if (montoEntregadoInput && !montoEntregadoInput.dataset.cursorInicio) {
    montoEntregadoInput.dataset.cursorInicio = '1';
    montoEntregadoInput.addEventListener('focus', () => {
      const ponerCursorAlInicio = () => { montoEntregadoInput.setSelectionRange(0, 0); };
      requestAnimationFrame(() => {
        ponerCursorAlInicio();
        requestAnimationFrame(ponerCursorAlInicio);
      });
    });
  }

  const tiposOrdenCols = 'id, codigo, nombre, moneda_in, moneda_out, usa_intermediario, icono_modo, icono_url_publica';
  const promDatos = Promise.all([
    client.from('clientes').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
    tiposOperacionFetchConFallbackOrdenVisual(
      () => client.from('tipos_operacion').select(tiposOrdenCols + ', orden_visual').eq('activo', true).order('orden_visual', { ascending: true }).order('codigo').order('usa_intermediario').order('id'),
      () => client.from('tipos_operacion').select(tiposOrdenCols).eq('activo', true).order('codigo').order('usa_intermediario').order('id'),
    ),
    client.from('intermediarios').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
  ]);
  const promRegistro = registro
    ? Promise.resolve(registro)
    : Promise.resolve({
        fecha: new Date().toISOString().slice(0, 10),
        estado: 'pendiente_instrumentar',
        moneda_recibida: 'USD',
        moneda_entregada: 'USD',
        monto_recibido: 0,
        monto_entregado: 0,
      });

  Promise.all([promDatos, promRegistro])
    .then(([[rClientes, rTipos, rInt], registroActual]) => {
      const clientes = (rClientes.data || []);
      const tipos = ordenarTiposOperacionListaParaOrden(rTipos.data || []);
      const intermediarios = (rInt.data || []);
      if (rTipos.error) {
        showToast('Error al cargar tipos de operación: ' + (rTipos.error.message || ''), 'error');
      }

    const selCliente = document.getElementById('orden-cliente');
    const selTipo = document.getElementById('orden-tipo-operacion');
    const selInt = document.getElementById('orden-intermediario');
    if (selCliente) selCliente.innerHTML = '<option value="">Sin asignar</option>' + clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    if (selTipo) {
      const escUrl = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const escAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const im = (m) => (m === 'cheque' || m === 'custom' ? m : 'auto');
      selTipo.innerHTML = '<option value="">Elegir…</option>' + tipos.map((t) => {
        const modo = im((t.icono_modo || 'auto').toString().trim().toLowerCase());
        const baseNombre = t.nombre != null ? String(t.nombre).trim() : '';
        const etiqueta = nombreTipoOperacionOrdenUi(t);
        return `<option value="${t.id}" data-nombre-base="${escAttr(baseNombre)}" data-codigo="${escapeHtml(t.codigo || '')}" data-icono-modo="${escapeHtml(modo)}" data-icono-url="${escUrl(t.icono_url_publica || '')}" data-moneda-in="${escapeHtml((t.moneda_in || '').toUpperCase())}" data-moneda-out="${escapeHtml((t.moneda_out || '').toUpperCase())}" data-usa-intermediario="${t.usa_intermediario === true ? 'true' : 'false'}">${escapeHtml(etiqueta)}</option>`;
      }).join('');
    }
    syncOrdenTipoOperacionIconosPreview();
    rebuildOrdenTipoOperacionListbox();
    if (selInt) selInt.innerHTML = '<option value="">Sin asignar</option>' + intermediarios.map((i) => `<option value="${i.id}">${escapeHtml(i.nombre)}</option>`).join('');

    const selTipoEl = document.getElementById('orden-tipo-operacion');
    const selIntEl = document.getElementById('orden-intermediario');
    const wrapIntermediario = document.getElementById('orden-wrap-intermediario');
    const wrapSplit = document.getElementById('orden-wrap-comision-split');
    const pctPandyEl = document.getElementById('orden-comision-pandy-pct');
    const pctIntEl = document.getElementById('orden-comision-intermediario-pct');

    function showStep(which) {
      if (!wizard || !stepParticipantes || !stepDetalles) return;
      wizard.style.display = 'block';
      stepParticipantes.style.display = which === 'participantes' ? 'block' : 'none';
      stepDetalles.style.display = which === 'detalles' ? 'block' : 'none';
    }

    function toggleComisionSplit() {
      if (!wrapSplit || !selTipoEl) return;
      const opt = selTipoEl.selectedOptions && selTipoEl.selectedOptions[0];
      const codigo = opt ? (opt.getAttribute('data-codigo') || '') : '';
      const usaIntermediario = opt ? (opt.getAttribute('data-usa-intermediario') === 'true') : false;
      const isTipoConComision = codigo === 'USD-USD';
      const tieneIntermediario = !!(selIntEl && selIntEl.value && selIntEl.value.trim());
      wrapSplit.style.display = isTipoConComision && usaIntermediario && tieneIntermediario ? 'flex' : 'none';
      if (isTipoConComision) {
        if (!tieneIntermediario) {
          if (pctPandyEl) { pctPandyEl.value = '100'; pctPandyEl.disabled = true; }
          if (pctIntEl) { pctIntEl.value = '0'; pctIntEl.disabled = true; }
        } else {
          if (pctPandyEl) pctPandyEl.disabled = false;
          if (pctIntEl) pctIntEl.disabled = false;
        }
      }
      syncOrdenIntPatronInstrumentacionWrap();
    }

    function syncComisionPctOtro(campoCambiado) {
      if (!pctPandyEl || !pctIntEl || wrapSplit?.style?.display === 'none') return;
      const p = Number(parseImporteInput(pctPandyEl.value));
      const i = Number(parseImporteInput(pctIntEl.value));
      const clamp = (n) => Math.max(0, Math.min(100, isNaN(n) ? 0 : n));
      if (campoCambiado === 'pandy') {
        const otro = clamp(100 - (isNaN(p) ? 0 : p));
        pctIntEl.value = formatImporteDisplay(otro);
      } else {
        const otro = clamp(100 - (isNaN(i) ? 0 : i));
        pctPandyEl.value = formatImporteDisplay(otro);
      }
    }

    function onTipoChange() {
      const opt = selTipoEl && selTipoEl.selectedOptions && selTipoEl.selectedOptions[0];
      const codigo = opt ? (opt.getAttribute('data-codigo') || '') : '';
      const tipoId = selTipoEl ? (selTipoEl.value || '') : '';
      if (codigo) {
        if (wizard) wizard.style.display = 'block';
        if (selCliente) selCliente.disabled = false;
        adaptarFormularioOrden(codigo, tipos, tipoId);
        showStep('participantes');
        toggleComisionSplit();
      } else {
        if (wizard) wizard.style.display = 'none';
        if (selCliente) selCliente.disabled = true;
        if (wrapIntermediario) wrapIntermediario.style.display = 'none';
      }
      syncOrdenTipoOperacionIconosPreview();
      rebuildOrdenTipoOperacionListbox();
    }
    if (selTipoEl) selTipoEl.onchange = onTipoChange;
    if (selIntEl) {
      selIntEl.addEventListener('change', () => {
        toggleComisionSplit();
        syncOrdenIntPatronInstrumentacionWrap();
      });
    }
    if (pctPandyEl) pctPandyEl.addEventListener('change', () => syncComisionPctOtro('pandy'));
    if (pctPandyEl) pctPandyEl.addEventListener('input', () => syncComisionPctOtro('pandy'));
    if (pctIntEl) pctIntEl.addEventListener('change', () => syncComisionPctOtro('intermediario'));
    if (pctIntEl) pctIntEl.addEventListener('input', () => syncComisionPctOtro('intermediario'));
    if (btnNext) btnNext.onclick = () => {
      const optTipo = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
      const usaIntermediario = optTipo ? (optTipo.getAttribute('data-usa-intermediario') === 'true') : false;
      const valorIntermediario = document.getElementById('orden-intermediario')?.value?.trim() || '';
      if (usaIntermediario && !valorIntermediario) {
        showToast('Para este tipo de operación es obligatorio elegir un intermediario.', 'error');
        return;
      }
      showOrdenWizardStep('detalles');
      const opt = optTipo;
      const codigo = opt?.getAttribute('data-codigo') || '';
      const miN = (opt?.getAttribute('data-moneda-in') || '').trim().toUpperCase();
      const moN = (opt?.getAttribute('data-moneda-out') || '').trim().toUpperCase();
      const patronNext = patronTipoCambioOrden(miN, moN);
      if (esPatronCompraFiatConTc(patronNext)) {
        setTimeout(() => {
          const el = document.getElementById('orden-monto-entregado');
          if (el) {
            el.focus();
            setTimeout(() => { el.setSelectionRange(0, 0); }, 0);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 150);
      } else if (esPatronVendeFiatConTc(patronNext)) {
        setTimeout(() => {
          const el = document.getElementById('orden-monto-recibido');
          if (el) {
            const v = (el.value || '').trim();
            if (v === '0' || v === '0,00' || v === '0.00') el.value = '';
            el.focus();
            setTimeout(() => { el.setSelectionRange(0, 0); }, 0);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 150);
      } else if (esTipoOperacionChequeArs(codigo, opt?.getAttribute('data-moneda-in'), opt?.getAttribute('data-moneda-out')) || codigo === 'USD-USD') {
        setTimeout(() => {
          const el = document.getElementById('orden-importe-cheque');
          if (el) {
            el.focus();
            el.classList.add('orden-field-editing');
          }
        }, 150);
      }
    };
    if (btnBack) btnBack.onclick = () => showOrdenWizardStep('participantes');
    if (btnBackDetalles) btnBackDetalles.onclick = () => showOrdenWizardStep('detalles');
    // Listo/Cerrar del paso instrumentación se asignan en setupModalOrden para que respondan siempre
    if (btnIrInst) btnIrInst.onclick = () => {
      const loadingInstEl = document.getElementById('orden-inst-loading');
      const wrapInstEl = document.getElementById('orden-inst-tabla-wrap');
      guardarOrdenDesdeWizard().then((ordenId) => {
        if (!ordenId) return;
        showOrdenWizardStep('instrumentacion');
        if (loadingInstEl) {
          loadingInstEl.textContent = 'Cargando instrumentación…';
          loadingInstEl.style.display = 'block';
        }
        if (wrapInstEl) wrapInstEl.style.display = 'none';
        ensureInstrumentacionForOrden(ordenId).then((instId) => {
          if (!instId) return;
          ordenWizardInstrumentacionIdActual = instId;
          renderOrdenWizardInstrumentacion(instId);
          if (btnNuevaTr) {
            const canIngresarTr = userPermissions.includes('ingresar_transacciones');
            btnNuevaTr.style.display = canIngresarTr ? '' : 'none';
            btnNuevaTr.onclick = () => openModalTransaccion(null, instId);
          }
        });
      });
    };

    let promContinuar = Promise.resolve();
    if (registroActual && registroActual.id) {
      titulo.textContent = registroActual.numero != null ? 'Editar orden #' + registroActual.numero : 'Editar orden';
      idEl.value = registroActual.id;
      document.getElementById('orden-cliente').value = registroActual.cliente_id || '';
      document.getElementById('orden-fecha').value = (registroActual.fecha || '').toString().slice(0, 10);
      document.getElementById('orden-tipo-operacion').value = registroActual.tipo_operacion_id || '';
      document.getElementById('orden-intermediario').value = registroActual.intermediario_id || '';
      document.getElementById('orden-moneda-recibida').value = registroActual.moneda_recibida || 'USD';
      document.getElementById('orden-monto-recibido').value = formatImporteParaInput(registroActual.monto_recibido);
      document.getElementById('orden-moneda-entregada').value = registroActual.moneda_entregada || 'USD';
      document.getElementById('orden-monto-entregado').value = formatImporteParaInput(registroActual.monto_entregado);
      document.getElementById('orden-cotizacion').value = formatImporteParaInput(registroActual.cotizacion);
      const tasaIntEl = document.getElementById('orden-tasa-descuento-intermediario');
      if (tasaIntEl) tasaIntEl.value = (registroActual.tasa_descuento_intermediario != null && Number(registroActual.tasa_descuento_intermediario) > 0) ? formatImporteDisplay(Number(registroActual.tasa_descuento_intermediario) * 100) : '';
      const mr = registroActual.monto_recibido != null ? Number(registroActual.monto_recibido) : null;
      const me = registroActual.monto_entregado != null ? Number(registroActual.monto_entregado) : null;
      const tipoRowReg = tipos.find((t) => t.id === registroActual.tipo_operacion_id);
      const tipoCodigoReg = tipoRowReg?.codigo || '';
      const esChequeArsReg = esTipoOperacionChequeArs(tipoCodigoReg, tipoRowReg?.moneda_in, tipoRowReg?.moneda_out);
      if ((esChequeArsReg || tipoCodigoReg === 'USD-USD') && me != null && me > 0 && mr != null && mr > 0) {
        const importeChequeEl = document.getElementById('orden-importe-cheque');
        const tasaClienteEl = document.getElementById('orden-tasa-descuento-cliente');
        if (importeChequeEl) importeChequeEl.value = formatImporteDisplay(mr);
        if (tasaClienteEl) tasaClienteEl.value = formatImporteDisplay((1 - me / mr) * 100);
      }
      document.getElementById('orden-estado').value = (registroActual.estado && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'anulada'].includes(registroActual.estado)) ? registroActual.estado : 'pendiente_instrumentar';
      document.getElementById('orden-observaciones').value = registroActual.observaciones || '';
      onTipoChange();
      ordenWizardOrdenIdActual = registroActual.id;
      const btnAnular = document.getElementById('orden-btn-anular');
      if (btnAnular) {
        const puedeAnular = userPermissions.includes('anular_orden');
        if (registroActual.estado !== 'anulada' && registroActual.estado !== 'orden_ejecutada' && puedeAnular) {
          btnAnular.style.display = '';
          btnAnular.onclick = () => {
            showConfirm('¿Anular esta orden? El estado pasará a Anulada.', 'Anular', () => {
              document.getElementById('orden-estado').value = 'anulada';
              saveOrden();
            });
          };
        } else {
          btnAnular.style.display = 'none';
        }
      }
      promContinuar = client.from('comisiones_orden').select('beneficiario, monto').eq('orden_id', registroActual.id).then((rCom) => {
        const rows = rCom.data || [];
        let pandyMonto = 0, interMonto = 0;
        rows.forEach((row) => {
          if (row.beneficiario === 'pandy') pandyMonto += Number(row.monto) || 0;
          else if (row.beneficiario === 'intermediario') interMonto += Number(row.monto) || 0;
        });
        const total = pandyMonto + interMonto;
        if (total > 1e-6 && pctPandyEl && pctIntEl) {
          const pctP = (pandyMonto / total) * 100;
          const pctI = (interMonto / total) * 100;
          pctPandyEl.value = formatImporteDisplay(pctP);
          pctIntEl.value = formatImporteDisplay(pctI);
        }
      });
    } else {
      titulo.textContent = registroActual && registroActual.numero != null ? 'Orden #' + registroActual.numero : 'Nueva orden';
      idEl.value = (registroActual && registroActual.id) ? registroActual.id : '';
      if (!registroActual) form.reset();
      document.getElementById('orden-fecha').value = (registroActual && registroActual.fecha) ? (registroActual.fecha || '').toString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      document.getElementById('orden-estado').value = 'pendiente_instrumentar';
      if (registroActual) {
        document.getElementById('orden-moneda-recibida').value = registroActual.moneda_recibida || 'USD';
        document.getElementById('orden-moneda-entregada').value = registroActual.moneda_entregada || 'USD';
        document.getElementById('orden-monto-recibido').value = formatImporteParaInput(registroActual.monto_recibido);
        document.getElementById('orden-monto-entregado').value = formatImporteParaInput(registroActual.monto_entregado);
      }
      const esNuevaOrden = !registroActual || !registroActual.id;
      if (wizard) wizard.style.display = esNuevaOrden ? 'none' : 'block';
      if (selCliente) selCliente.disabled = esNuevaOrden;
      if (esNuevaOrden && wrapIntermediario) wrapIntermediario.style.display = 'none';
      ordenWizardOrdenIdActual = registroActual ? registroActual.id : null;
      const btnAnular = document.getElementById('orden-btn-anular');
      if (btnAnular) btnAnular.style.display = 'none';
    }
    promContinuar.then(() => {
      if (pctPandyEl && !pctPandyEl.value) pctPandyEl.value = '100';
      if (pctIntEl && !pctIntEl.value) pctIntEl.value = '0';
      setupOrdenIntPatronRadiosOnce();
      resetOrdenIntPatronUi();
      if (registroActual && registroActual.id) {
        syncPatronDesdeTransaccionesOrdenInt(registroActual.id).then(() => syncOrdenIntPatronInstrumentacionWrap());
      } else {
        syncOrdenIntPatronInstrumentacionWrap();
      }
      backdrop.classList.add('activo');
      document.body.classList.add('modal-orden-abierto');
      showOrdenWizardStep('participantes');
      if (wizard && wizard.style.display === 'none') {
        setTimeout(() => { document.getElementById('orden-tipo-operacion-combo-btn')?.focus(); }, 120);
      }
      closeOrdenTipoOperacionListbox();
      rebuildOrdenTipoOperacionListbox();
      syncOrdenTipoOperacionIconosPreview();
      setupInputImporte(document.getElementById('orden-monto-recibido'));
      setupInputImporte(document.getElementById('orden-monto-entregado'));
      setupInputImporte(document.getElementById('orden-tasa-descuento-intermediario'), 2, true);
      setupInputImporte(document.getElementById('orden-importe-cheque'));
      setupInputImporte(document.getElementById('orden-tasa-descuento-cliente'), 2, true);
      setupInputImporte(document.getElementById('orden-comision-pandy-pct'));
      setupInputImporte(document.getElementById('orden-comision-intermediario-pct'));
    });
  })
  .catch((err) => {
    if (!registro) showToast('Error al crear la orden: ' + (err && err.message ? err.message : ''), 'error');
  });
}

function adaptarFormularioOrden(codigo, tipos, tipoIdSeleccionado) {
  // Prioridad: moneda_in/moneda_out del tipo (tabla); fallback: parsear código (primera = recibida, segunda = entregada)
  let recibidaDesdeTipo = null;
  let entregadaDesdeTipo = null;
  const tipo = Array.isArray(tipos)
    ? (
      (tipoIdSeleccionado ? tipos.find((t) => String(t.id || '') === String(tipoIdSeleccionado)) : null)
      || (codigo ? tipos.find((t) => (t.codigo || '') === codigo) : null)
    )
    : null;
  const usaIntermediario = tipo && tipo.usa_intermediario === true;

  const wrapIntermediario = document.getElementById('orden-wrap-intermediario');
  const selIntermediario = document.getElementById('orden-intermediario');
  if (wrapIntermediario) wrapIntermediario.style.display = usaIntermediario ? 'block' : 'none';
  if (selIntermediario && !usaIntermediario) selIntermediario.value = '';

  if (tipo && (tipo.moneda_in || tipo.moneda_out)) {
    recibidaDesdeTipo = (tipo.moneda_in || '').trim().toUpperCase() || null;
    entregadaDesdeTipo = (tipo.moneda_out || '').trim().toUpperCase() || null;
  }
  if (recibidaDesdeTipo == null || entregadaDesdeTipo == null) {
    const partes = (codigo || '').split('-');
    const primera = (partes[0] || '').trim().toUpperCase();
    const segunda = (partes[1] || '').trim().toUpperCase();
    const normalizarMoneda = (s) => (s === 'DOLAR' ? 'USD' : s);
    if (recibidaDesdeTipo == null) recibidaDesdeTipo = primera && segunda ? normalizarMoneda(primera) : null;
    if (entregadaDesdeTipo == null) entregadaDesdeTipo = (segunda === 'CHEQUE' ? 'ARS' : (primera && segunda ? normalizarMoneda(segunda) : null));
  }

  const recNorm = monedaCatalogoParaOrden(recibidaDesdeTipo);
  const entNorm = monedaCatalogoParaOrden(entregadaDesdeTipo);
  const isUsdUsd = codigo === 'USD-USD';
  const isArsArs = esTipoOperacionChequeArs(codigo, tipo?.moneda_in, tipo?.moneda_out);
  const patronTcForm = patronTipoCambioOrden(recNorm, entNorm);
  const isTcCompraUsd = esPatronCompraFiatConTc(patronTcForm);
  const isTcVendeUsd = esPatronVendeFiatConTc(patronTcForm);
  const isTipoConTc = !!patronTcForm;
  const isTipoDosMonedas = !!(recNorm && entNorm && recNorm !== entNorm);
  const monedaRecibida = document.getElementById('orden-moneda-recibida');
  const monedaEntregada = document.getElementById('orden-moneda-entregada');
  const labelMontoRecibido = document.getElementById('orden-label-monto-recibido');
  const labelMontoEntregado = document.getElementById('orden-label-monto-entregado');
  const wrapComision = document.getElementById('orden-wrap-comision');
  const wrapCotizacion = document.getElementById('orden-wrap-cotizacion');
  const labelCotizacion = document.getElementById('orden-label-cotizacion');
  const inputCotizacion = document.getElementById('orden-cotizacion');
  const comisionDisplay = document.getElementById('orden-comision-display');
  const estadoSelect = document.getElementById('orden-estado');

  if (monedaRecibida) {
    if (recibidaDesdeTipo && ['USD', 'EUR', 'ARS', 'CHEQUE'].includes(recibidaDesdeTipo)) {
      monedaRecibida.value = monedaCatalogoParaOrden(recibidaDesdeTipo);
      monedaRecibida.disabled = true;
    } else {
      monedaRecibida.disabled = false;
    }
  }
  if (monedaEntregada) {
    if (entregadaDesdeTipo && ['USD', 'EUR', 'ARS', 'CHEQUE'].includes(entregadaDesdeTipo)) {
      monedaEntregada.value = monedaCatalogoParaOrden(entregadaDesdeTipo);
      monedaEntregada.disabled = true;
    } else {
      monedaEntregada.disabled = false;
    }
  }
  if (labelMontoRecibido) {
    if (isTipoDosMonedas) {
      if (isTcVendeUsd) labelMontoRecibido.textContent = 'El cliente vende ' + (recibidaDesdeTipo || '') + ' *';
      else labelMontoRecibido.innerHTML = 'El cliente <span class="orden-label-verb-destacado">entregará</span> ' + escapeHtml(recibidaDesdeTipo || '') + ' (calculado)';
    } else labelMontoRecibido.textContent = (isUsdUsd || isTipoConTc || isArsArs) ? 'Monto a Recibir *' : 'Monto recibido *';
  }
  if (labelMontoEntregado) {
    if (isTipoDosMonedas) {
      if (isTcVendeUsd) labelMontoEntregado.innerHTML = 'El cliente <span class="orden-label-verb-destacado">recibirá</span> ' + escapeHtml(entregadaDesdeTipo || '') + ' (calculado)';
      else labelMontoEntregado.textContent = 'El cliente compra ' + (entregadaDesdeTipo || '') + ' *';
    } else labelMontoEntregado.textContent = (isUsdUsd || isTipoConTc || isArsArs) ? 'Monto a Entregar *' : 'Monto entregado *';
  }
  const wrapTasaDescuentoInt = document.getElementById('orden-wrap-tasa-descuento-intermediario');
  const wrapComisionSplit = document.getElementById('orden-wrap-comision-split');
  const isTipoSinComision = isTipoConTc;
  if (wrapComision) wrapComision.style.display = (isUsdUsd || (isTipoConTc && !isTipoSinComision) || isArsArs) ? 'block' : 'none';
  if (wrapTasaDescuentoInt) wrapTasaDescuentoInt.style.display = (isArsArs && usaIntermediario) ? 'block' : 'none';
  if (wrapComisionSplit) {
    if (isArsArs || isTipoSinComision || !usaIntermediario) wrapComisionSplit.style.display = 'none';
    else if (isUsdUsd && document.getElementById('orden-intermediario')?.value?.trim())
      wrapComisionSplit.style.display = 'flex';
    else
      wrapComisionSplit.style.display = 'none';
  }
  const fechaOrdenEl = document.getElementById('orden-fecha');
  if (fechaOrdenEl) {
    if (isUsdUsd) {
      fechaOrdenEl.readOnly = true;
      fechaOrdenEl.value = new Date().toISOString().slice(0, 10);
    } else {
      fechaOrdenEl.readOnly = false;
    }
  }
  if (wrapCotizacion) {
    wrapCotizacion.style.display = (isUsdUsd || isArsArs) ? 'none' : 'block';
    if (labelCotizacion) labelCotizacion.textContent = isTipoDosMonedas ? 'Tipo de cambio *' : (isTipoConTc ? 'Tipo de cambio del acuerdo *' : 'Cotización (opcional)');
    if (inputCotizacion) inputCotizacion.required = !!isTipoConTc;
  }
  if (isTipoDosMonedas) {
    const formResto = document.getElementById('orden-form-resto');
    const wrapCotizacionEl = document.getElementById('orden-wrap-cotizacion');
    const rowEntregado = document.getElementById('orden-monto-entregado')?.closest('.form-row');
    const rowRecibido = document.getElementById('orden-monto-recibido')?.closest('.form-row');
    const fechaGroup = document.getElementById('orden-fecha')?.closest('.form-group');
    if (formResto && wrapCotizacionEl && rowEntregado && rowRecibido && fechaGroup) {
      if (isTcVendeUsd) {
        formResto.insertBefore(rowRecibido, wrapCotizacionEl);
        formResto.insertBefore(rowEntregado, fechaGroup);
      } else {
        formResto.insertBefore(rowEntregado, wrapCotizacionEl);
        formResto.insertBefore(rowRecibido, fechaGroup);
      }
    }
    [rowRecibido, rowEntregado].forEach((row) => {
      const firstGroup = row?.querySelector('.form-group:first-child');
      if (firstGroup) firstGroup.style.display = 'none';
    });
    const montoRecibidoElEarly = document.getElementById('orden-monto-recibido');
    if (montoRecibidoElEarly && !isTcVendeUsd) {
      montoRecibidoElEarly.readOnly = true;
      montoRecibidoElEarly.style.background = '#eee';
      montoRecibidoElEarly.style.color = '#555';
    }
    if (isTcVendeUsd && montoRecibidoElEarly) {
      const v = (montoRecibidoElEarly.value || '').trim();
      if (v === '0' || v === '0,00' || v === '0.00') montoRecibidoElEarly.value = '';
    }
  } else {
    const rowRecibidoRestore = document.getElementById('orden-monto-recibido')?.closest('.form-row');
    const rowEntregadoRestore = document.getElementById('orden-monto-entregado')?.closest('.form-row');
    [rowRecibidoRestore, rowEntregadoRestore].forEach((row) => {
      const firstGroup = row?.querySelector('.form-group:first-child');
      if (firstGroup) firstGroup.style.display = '';
    });
    const montoRecibidoRestore = document.getElementById('orden-monto-recibido');
    if (montoRecibidoRestore) {
      montoRecibidoRestore.readOnly = false;
      montoRecibidoRestore.style.background = '';
      montoRecibidoRestore.style.color = '';
    }
  }
  const labelComision = document.querySelector('#orden-wrap-comision label[for="orden-comision-display"]');
  if (labelComision) labelComision.textContent = isArsArs ? 'Beneficio del Acuerdo' : 'Comisión a Recibir';
  if (comisionDisplay) {
    comisionDisplay.value = '';
    if (isArsArs) comisionDisplay.classList.add('orden-beneficio-acuerdo');
    else comisionDisplay.classList.remove('orden-beneficio-acuerdo');
  }

  if (estadoSelect) {
    const optPI = estadoSelect.querySelector('option[value="pendiente_instrumentar"]');
    if (optPI) optPI.textContent = 'Pendiente Instrumentar';
  }

  function actualizarComisionUsdUsd() {
    if (!isUsdUsd || !comisionDisplay) return;
    const r = parseImporteInput(document.getElementById('orden-monto-recibido').value);
    const e = parseImporteInput(document.getElementById('orden-monto-entregado').value);
    const comision = (typeof r === 'number' && !isNaN(r) && typeof e === 'number' && !isNaN(e) && r > e) ? r - e : null;
    comisionDisplay.value = comision != null ? formatImporteDisplay(comision) : '';
  }
  function actualizarComisionUsdArs() {
    if (!isTcVendeUsd || !comisionDisplay) return;
    const r = parseImporteInput(document.getElementById('orden-monto-recibido').value);
    const e = parseImporteInput(document.getElementById('orden-monto-entregado').value);
    const tc = parseImporteInput(document.getElementById('orden-cotizacion').value);
    let comision = null;
    if (typeof r === 'number' && !isNaN(r) && r > 0 && typeof tc === 'number' && !isNaN(tc) && tc > 0 && typeof e === 'number' && !isNaN(e) && e >= 0) {
      const usdEquivEntregado = e / tc;
      if (r > usdEquivEntregado) comision = r - usdEquivEntregado;
    }
    comisionDisplay.value = comision != null ? formatImporteDisplay(comision) + ' USD' : '';
  }
  function actualizarComisionArsArs() {
    if (!isArsArs || !comisionDisplay) return;
    const r = parseImporteInput(document.getElementById('orden-monto-recibido').value);
    const e = parseImporteInput(document.getElementById('orden-monto-entregado').value);
    const comision = (typeof r === 'number' && !isNaN(r) && typeof e === 'number' && !isNaN(e) && r > e) ? r - e : null;
    comisionDisplay.value = comision != null ? formatImporteDisplay(comision) + ' ARS' : '';
  }
  const montoRecibidoEl = document.getElementById('orden-monto-recibido');
  const montoEntregadoEl = document.getElementById('orden-monto-entregado');
  if (montoRecibidoEl) {
    montoRecibidoEl.removeEventListener('input', actualizarComisionUsdUsd); montoRecibidoEl.removeEventListener('change', actualizarComisionUsdUsd);
    montoRecibidoEl.removeEventListener('input', actualizarComisionUsdArs); montoRecibidoEl.removeEventListener('change', actualizarComisionUsdArs);
    montoRecibidoEl.removeEventListener('input', actualizarComisionArsArs); montoRecibidoEl.removeEventListener('change', actualizarComisionArsArs);
  }
  if (montoEntregadoEl) {
    montoEntregadoEl.removeEventListener('input', actualizarComisionUsdUsd); montoEntregadoEl.removeEventListener('change', actualizarComisionUsdUsd);
    montoEntregadoEl.removeEventListener('input', actualizarComisionUsdArs); montoEntregadoEl.removeEventListener('change', actualizarComisionUsdArs);
    montoEntregadoEl.removeEventListener('input', actualizarComisionArsArs); montoEntregadoEl.removeEventListener('change', actualizarComisionArsArs);
  }
  if (inputCotizacion) {
    inputCotizacion.removeEventListener('input', actualizarComisionUsdArs); inputCotizacion.removeEventListener('change', actualizarComisionUsdArs);
  }
  let _actualizandoMontosTc = false;
  function actualizarMontosDesdeTc(origen) {
    if (_actualizandoMontosTc || !inputCotizacion || !montoRecibidoEl || !montoEntregadoEl) return;
    const tc = parseImporteInput(inputCotizacion.value);
    if (typeof tc !== 'number' || isNaN(tc) || tc <= 0) return;
    const r = parseImporteInput(montoRecibidoEl.value);
    const e = parseImporteInput(montoEntregadoEl.value);
    const tieneRecibir = typeof r === 'number' && !isNaN(r) && r > 0;
    const tieneEntregar = typeof e === 'number' && !isNaN(e) && e > 0;
    if (isTcCompraUsd) {
      if (origen === 'tc' || origen === 'entregar') {
        const baseEntregar = tieneEntregar ? e : 1;
        if (tieneEntregar || origen === 'tc') {
          _actualizandoMontosTc = true;
          if (!tieneEntregar) montoEntregadoEl.value = formatImporteDisplay(1);
          montoRecibidoEl.value = formatImporteDisplay(baseEntregar * tc);
          _actualizandoMontosTc = false;
        }
      } else if (origen === 'recibir' && tieneRecibir) {
        _actualizandoMontosTc = true;
        montoEntregadoEl.value = formatImporteDisplay(r / tc);
        _actualizandoMontosTc = false;
      }
    } else if (isTcVendeUsd) {
      if (origen === 'tc') {
        _actualizandoMontosTc = true;
        if (tieneRecibir) montoEntregadoEl.value = formatImporteDisplay(r * tc);
        else montoEntregadoEl.value = '';
        _actualizandoMontosTc = false;
      } else if (origen === 'entregar') {
        if (tieneEntregar) {
          _actualizandoMontosTc = true;
          montoRecibidoEl.value = (e / tc === 0 || !Number.isFinite(e / tc)) ? '' : formatImporteParaInput(e / tc);
          _actualizandoMontosTc = false;
        }
      } else if (origen === 'recibir' && tieneRecibir) {
        _actualizandoMontosTc = true;
        montoEntregadoEl.value = formatImporteDisplay(r * tc);
        _actualizandoMontosTc = false;
      }
    }
  }
  if (isUsdUsd) {
    if (montoRecibidoEl) { montoRecibidoEl.addEventListener('input', actualizarComisionUsdUsd); montoRecibidoEl.addEventListener('change', actualizarComisionUsdUsd); }
    if (montoEntregadoEl) { montoEntregadoEl.addEventListener('input', actualizarComisionUsdUsd); montoEntregadoEl.addEventListener('change', actualizarComisionUsdUsd); }
    actualizarComisionUsdUsd();
  } else if (isTipoConTc) {
    if (inputCotizacion) {
      inputCotizacion.addEventListener('input', () => actualizarMontosDesdeTc('tc'));
      inputCotizacion.addEventListener('change', () => actualizarMontosDesdeTc('tc'));
    }
    if (montoEntregadoEl) {
      montoEntregadoEl.addEventListener('input', () => actualizarMontosDesdeTc('entregar'));
      montoEntregadoEl.addEventListener('change', () => actualizarMontosDesdeTc('entregar'));
    }
    if (montoRecibidoEl) {
      montoRecibidoEl.addEventListener('input', () => actualizarMontosDesdeTc('recibir'));
      montoRecibidoEl.addEventListener('change', () => actualizarMontosDesdeTc('recibir'));
    }
    setTimeout(() => actualizarMontosDesdeTc('tc'), 0);
  } else if (isArsArs) {
    if (montoRecibidoEl) { montoRecibidoEl.addEventListener('input', actualizarComisionArsArs); montoRecibidoEl.addEventListener('change', actualizarComisionArsArs); }
    if (montoEntregadoEl) { montoEntregadoEl.addEventListener('input', actualizarComisionArsArs); montoEntregadoEl.addEventListener('change', actualizarComisionArsArs); }
    actualizarComisionArsArs();
  }

  // Flujo primeros datos ARS-ARS / USD-USD: Importe + Tasa descuento → solo Ir a instrumentación. Dos monedas (ARS-USD, etc.): también solo Instrumentación.
  const isTipoPrimerosDatos = isArsArs || isUsdUsd;
  const soloInstrumentacion = isTipoPrimerosDatos || isTipoDosMonedas;
  const wrapPrimerosDatos = document.getElementById('orden-wrap-primeros-datos');
  const labelImporteCheque = document.getElementById('orden-label-importe-cheque');
  const importeChequeEl = document.getElementById('orden-importe-cheque');
  const tasaDescuentoClienteEl = document.getElementById('orden-tasa-descuento-cliente');
  const wrapMontosCalculados = document.getElementById('orden-wrap-montos-calculados');
  const montoEntregadoDisplay = document.getElementById('orden-monto-entregado-display');
  const montoRecibidoDisplay = document.getElementById('orden-monto-recibido-display');
  const fechaEl = document.getElementById('orden-fecha');
  const observacionesEl = document.getElementById('orden-observaciones');
  const btnGuardar = document.getElementById('orden-btn-guardar');
  const btnIrInst = document.getElementById('orden-btn-ir-instrumentacion');

  if (wrapPrimerosDatos) wrapPrimerosDatos.style.display = isTipoPrimerosDatos ? 'block' : 'none';
  const rowMonedaMontoRec = document.getElementById('orden-row-moneda-monto-recibido');
  const rowMonedaMontoEnt = document.getElementById('orden-row-moneda-monto-entregado');
  if (rowMonedaMontoRec) rowMonedaMontoRec.style.display = isTipoPrimerosDatos ? 'none' : '';
  if (rowMonedaMontoEnt) rowMonedaMontoEnt.style.display = isTipoPrimerosDatos ? 'none' : '';
  if (labelImporteCheque) labelImporteCheque.textContent = isArsArs ? 'Importe en Cheque (ARS) *' : (isUsdUsd ? 'Importe (USD) *' : 'Importe *');
  if (btnGuardar) btnGuardar.style.display = soloInstrumentacion ? 'none' : '';
  const iconInstrumentacion = '<span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg></span>';
  if (btnIrInst) {
    btnIrInst.style.display = '';
    if (soloInstrumentacion) {
      btnIrInst.innerHTML = iconInstrumentacion + (isTipoPrimerosDatos ? 'Ir a instrumentación' : 'Instrumentación');
      btnIrInst.classList.remove('btn-secondary');
      btnIrInst.classList.add('btn-primary');
    } else {
      btnIrInst.innerHTML = iconInstrumentacion + 'Instrumentación';
      btnIrInst.classList.remove('btn-primary');
      btnIrInst.classList.add('btn-secondary');
    }
  }

  function setRestoOrdenEditable(editable) {
    const el = (id) => document.getElementById(id);
    const tieneIntermediario = !!(el('orden-intermediario')?.value?.trim());
    if (isUsdUsd) {
      // USD-USD: todo el resto es solo informativo (grisado) salvo la distribución de comisión si hay intermediario
      [fechaEl, estadoSelect, observacionesEl].forEach((e) => { if (e) e.disabled = true; });
      if (montoRecibidoEl) montoRecibidoEl.readOnly = true;
      if (montoEntregadoEl) montoEntregadoEl.readOnly = true;
      if (monedaRecibida) monedaRecibida.disabled = true;
      if (monedaEntregada) monedaEntregada.disabled = true;
      const comisionPandy = el('orden-comision-pandy-pct');
      const comisionInt = el('orden-comision-intermediario-pct');
      if (comisionPandy) comisionPandy.disabled = !(editable && tieneIntermediario);
      if (comisionInt) comisionInt.disabled = !(editable && tieneIntermediario);
    } else if (isArsArs) {
      // ARS-ARS: todo el resto es solo informativo (grisado) salvo tasa de descuento del intermediario si hay intermediario
      [fechaEl, estadoSelect, observacionesEl].forEach((e) => { if (e) e.disabled = true; });
      if (montoRecibidoEl) montoRecibidoEl.readOnly = true;
      if (montoEntregadoEl) montoEntregadoEl.readOnly = true;
      if (monedaRecibida) monedaRecibida.disabled = true;
      if (monedaEntregada) monedaEntregada.disabled = true;
      const tasaInt = el('orden-tasa-descuento-intermediario');
      if (tasaInt) tasaInt.disabled = !(editable && tieneIntermediario);
    } else if (isTipoDosMonedas) {
      // compra_usd: editable monto entregado (USD); vende_usd: editable monto recibido (USD); la otra moneda calculada con tc
      if (fechaEl) fechaEl.disabled = true;
      if (estadoSelect) estadoSelect.disabled = true;
      if (observacionesEl) observacionesEl.disabled = !editable;
      if (isTcVendeUsd) {
        if (montoRecibidoEl) {
          montoRecibidoEl.readOnly = !editable;
          montoRecibidoEl.style.background = '';
          montoRecibidoEl.style.color = '';
        }
        if (montoEntregadoEl) {
          montoEntregadoEl.readOnly = true;
          montoEntregadoEl.style.background = '#eee';
          montoEntregadoEl.style.color = '#555';
        }
      } else {
        if (montoRecibidoEl) {
          montoRecibidoEl.readOnly = true;
          montoRecibidoEl.style.background = '#eee';
          montoRecibidoEl.style.color = '#555';
        }
        if (montoEntregadoEl) {
          montoEntregadoEl.readOnly = !editable;
          montoEntregadoEl.style.background = '';
          montoEntregadoEl.style.color = '';
        }
      }
      const cotEl = el('orden-cotizacion');
      if (cotEl) cotEl.readOnly = !editable;
      if (monedaRecibida) monedaRecibida.disabled = true;
      if (monedaEntregada) monedaEntregada.disabled = true;
    } else {
      [fechaEl, estadoSelect, observacionesEl].forEach((e) => { if (e) e.disabled = !editable; });
      if (wrapTasaDescuentoInt && isArsArs) {
        const input = el('orden-tasa-descuento-intermediario');
        if (input) input.disabled = !editable;
      }
      if (montoRecibidoEl) montoRecibidoEl.readOnly = !editable;
      if (montoEntregadoEl) montoEntregadoEl.readOnly = !editable;
      if (monedaRecibida) monedaRecibida.disabled = !editable;
      if (monedaEntregada) monedaEntregada.disabled = !editable;
    }
  }

  function actualizarPrimerosDatos() {
    if (!isTipoPrimerosDatos || !importeChequeEl || !tasaDescuentoClienteEl) return;
    const importe = parseImporteInput(importeChequeEl.value);
    const tasaPct = parseImporteInput(tasaDescuentoClienteEl.value);
    const importeOk = typeof importe === 'number' && !isNaN(importe) && importe > 0;
    const tasaOk = typeof tasaPct === 'number' && !isNaN(tasaPct) && tasaPct > 0 && tasaPct < 100;
    if (!importeOk || !tasaOk) {
      setRestoOrdenEditable(false);
      if (wrapMontosCalculados) wrapMontosCalculados.style.display = 'none';
      if (montoRecibidoEl) montoRecibidoEl.value = '';
      if (montoEntregadoEl) montoEntregadoEl.value = '';
      return;
    }
    const montoRecibir = importe;
    const montoEntregar = importe * (1 - tasaPct / 100);
    if (montoRecibidoEl) { montoRecibidoEl.value = formatImporteDisplay(montoRecibir); montoRecibidoEl.readOnly = true; }
    if (montoEntregadoEl) { montoEntregadoEl.value = formatImporteDisplay(montoEntregar); montoEntregadoEl.readOnly = true; }
    if (montoRecibidoDisplay) montoRecibidoDisplay.value = formatImporteDisplay(montoRecibir);
    if (montoEntregadoDisplay) montoEntregadoDisplay.value = formatImporteDisplay(montoEntregar);
    if (wrapMontosCalculados) wrapMontosCalculados.style.display = 'flex';
    setRestoOrdenEditable(true);
    if (isUsdUsd) actualizarComisionUsdUsd();
    if (isArsArs) actualizarComisionArsArs();
    // No mover el foco aquí: el usuario puede estar escribiendo decimales en la tasa (ej. "1,5"). Solo habilitar el siguiente campo.
    if (isArsArs) {
      const tasaInt = document.getElementById('orden-tasa-descuento-intermediario');
      if (tasaInt) tasaInt.disabled = false;
    } else if (isUsdUsd) {
      const comisionPandy = document.getElementById('orden-comision-pandy-pct');
      if (comisionPandy) comisionPandy.disabled = false;
    }
  }

  if (isTipoPrimerosDatos) {
    setRestoOrdenEditable(false);
    if (wrapMontosCalculados) wrapMontosCalculados.style.display = 'none';
    if (importeChequeEl) {
      importeChequeEl.removeEventListener('input', actualizarPrimerosDatos);
      importeChequeEl.removeEventListener('change', actualizarPrimerosDatos);
      importeChequeEl.addEventListener('input', actualizarPrimerosDatos);
      importeChequeEl.addEventListener('change', actualizarPrimerosDatos);
    }
    if (tasaDescuentoClienteEl) {
      tasaDescuentoClienteEl.removeEventListener('input', actualizarPrimerosDatos);
      tasaDescuentoClienteEl.removeEventListener('change', actualizarPrimerosDatos);
      tasaDescuentoClienteEl.addEventListener('input', actualizarPrimerosDatos);
      tasaDescuentoClienteEl.addEventListener('change', actualizarPrimerosDatos);
    }
  } else {
    setRestoOrdenEditable(true);
    if (montoRecibidoEl) montoRecibidoEl.readOnly = false;
    if (montoEntregadoEl) montoEntregadoEl.readOnly = false;
  }
  if (isTipoPrimerosDatos) actualizarPrimerosDatos();
  const lblIntTxt = document.getElementById('orden-label-intermediario-texto');
  if (lblIntTxt) lblIntTxt.textContent = usaIntermediario ? 'Intermediario *' : 'Intermediario (opcional)';
  syncOrdenIntPatronInstrumentacionWrap();
}

/** Cierra el modal de orden (sin validar instrumentación). Usar solicitarCierreModalOrden desde la UI del wizard. */
function ejecutarCierreModalOrden() {
  const idBorrador = ordenIdBorradorParaEliminar;
  const instId = ordenWizardInstrumentacionIdActual;
  ordenIdBorradorParaEliminar = null;
  ordenWizardOrdenIdActual = null;
  ordenWizardInstrumentacionIdActual = null;
  const backdrop = document.getElementById('modal-orden-backdrop');
  function doClose() {
    closeOrdenTipoOperacionListbox();
    dismissAllToasts();
    document.body.classList.remove('modal-orden-abierto');
    if (backdrop) backdrop.classList.remove('activo');
    if (idBorrador) client.from('ordenes').delete().eq('id', idBorrador).then(() => loadOrdenes());
  }
  // Cerrar el modal de inmediato para que Listo/Cerrar respondan al instante.
  // Sincronizar montos editados en la tabla en segundo plano (sin bloquear).
  if (instId && backdrop && backdrop.classList.contains('activo')) {
    const inputs = backdrop.querySelectorAll('.input-monto-transaccion-tabla');
    const pendientes = [];
    inputs.forEach((input) => {
      const id = input.getAttribute('data-id');
      if (id) pendientes.push({ id, value: input.value });
    });
    doClose();
    if (pendientes.length > 0) {
      let prom = Promise.resolve();
      pendientes.forEach((p) => { prom = prom.then(() => guardarSoloMontoTransaccion(p.id, p.value)); });
      prom.catch(() => {});
    }
  } else {
    doClose();
  }
}

function closeModalOrden() {
  ejecutarCierreModalOrden();
}

function showOrdenWizardStep(which) {
  const stepParticipantes = document.getElementById('orden-step-participantes');
  const stepDetalles = document.getElementById('orden-step-detalles');
  const stepInst = document.getElementById('orden-step-instrumentacion');
  if (stepParticipantes) stepParticipantes.style.display = which === 'participantes' ? 'block' : 'none';
  if (stepDetalles) stepDetalles.style.display = which === 'detalles' ? 'block' : 'none';
  if (stepInst) stepInst.style.display = which === 'instrumentacion' ? 'block' : 'none';
  const modalOrden = document.querySelector('#modal-orden-backdrop .modal.modal-orden');
  if (modalOrden) {
    if (which === 'detalles' || which === 'instrumentacion') modalOrden.classList.add('modal-orden-con-instrumentacion');
    else modalOrden.classList.remove('modal-orden-con-instrumentacion');
  }
  // Al mostrar instrumentación: scroll a Listo/Cerrar y dar foco al botón Listo para que el modal no pierda foco
  if (which === 'instrumentacion') {
    const btnCerrar = document.getElementById('orden-btn-cerrar-wizard');
    if (btnCerrar) {
      requestAnimationFrame(() => {
        btnCerrar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        btnCerrar.focus({ preventScroll: true });
      });
    }
  }
}

/** Devuelve el próximo número de orden: MAX(numero)+1 (o 1 si no hay órdenes). Solo si ordenesTieneNumeroColumn. */
function getProximoNumeroOrden() {
  if (!ordenesTieneNumeroColumn) return Promise.resolve(1);
  return client.from('ordenes').select('numero').order('numero', { ascending: false }).limit(1).maybeSingle()
    .then((r) => {
      if (r.error) return 1;
      const max = r.data && r.data.numero != null ? Number(r.data.numero) : 0;
      return (typeof max === 'number' && !isNaN(max) ? max : 0) + 1;
    });
}

/** Inserta una orden con numero = MAX+1 atómico (función en DB con lock). Si la columna numero no existe o la RPC no está en Supabase, hace INSERT con getProximoNumeroOrden. */
function insertOrdenConProximoNumero(payload) {
  if (!ordenesTieneNumeroColumn) {
    return client.from('ordenes').insert(payload).select('id, numero');
  }
  return client.rpc('ordenes_insertar_con_proximo_numero', {
    p_cliente_id: payload.cliente_id,
    p_fecha: payload.fecha,
    p_estado: payload.estado,
    p_tipo_operacion_id: payload.tipo_operacion_id,
    p_operacion_directa: payload.operacion_directa,
    p_intermediario_id: payload.intermediario_id,
    p_moneda_recibida: payload.moneda_recibida,
    p_moneda_entregada: payload.moneda_entregada,
    p_monto_recibido: payload.monto_recibido,
    p_monto_entregado: payload.monto_entregado,
    p_cotizacion: payload.cotizacion,
    p_tasa_descuento_intermediario: payload.tasa_descuento_intermediario,
    p_observaciones: payload.observaciones,
    p_usuario_id: payload.usuario_id,
    p_updated_at: payload.updated_at,
  }).then((res) => {
    if (!res.error) {
      const row = res.data && (Array.isArray(res.data) ? res.data[0] : res.data);
      return { data: row ? [row] : [], error: null };
    }
    const msg = (res.error.message || '').toLowerCase();
    const rpcNoDisponible = msg.includes('could not find the function') || msg.includes('schema cache') || (msg.includes('function') && msg.includes('does not exist'));
    if (!rpcNoDisponible) return res;
    return getProximoNumeroOrden().then((nextNum) => {
      const p = { ...payload, numero: nextNum };
      return client.from('ordenes').insert(p).select('id, numero').then((insertRes) => {
        if (insertRes.error) return insertRes;
        showToast('Orden creada. Para asignación atómica de número, ejecutá sql/ordenes_insertar_con_proximo_numero.sql en Supabase.', 'info');
        return { data: insertRes.data, error: null };
      });
    });
  });
}

/** El split USD-USD/CHEQUE usa display:flex|none; no confundir style.display === '' con visible (rompe guardar e instrumentación). */
function ordenWrapComisionSplitEsVisible() {
  const wrapSplitEl = document.getElementById('orden-wrap-comision-split');
  if (!wrapSplitEl) return false;
  try {
    return typeof window !== 'undefined' && window.getComputedStyle
      ? window.getComputedStyle(wrapSplitEl).display !== 'none'
      : (wrapSplitEl.style.display !== 'none' && wrapSplitEl.style.display !== '');
  } catch (_) {
    return wrapSplitEl.style.display !== 'none' && wrapSplitEl.style.display !== '';
  }
}

/** Guarda la orden según el form, pero sin cerrar el modal. Devuelve Promise<ordenId>. */
function guardarOrdenDesdeWizard(opcionGuardarConComisionCero = false) {
  const idEl = document.getElementById('orden-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const clienteId = document.getElementById('orden-cliente').value.trim() || null;
  const fecha = document.getElementById('orden-fecha').value;
  const tipoOperacionId = document.getElementById('orden-tipo-operacion')?.value?.trim() || null;
  const selTipoOptGuardar = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const usaIntermediarioTipo = selTipoOptGuardar ? (selTipoOptGuardar.getAttribute('data-usa-intermediario') === 'true') : false;
  let intermediarioId = document.getElementById('orden-intermediario')?.value?.trim() || null;
  if (!usaIntermediarioTipo) intermediarioId = null;
  const operacionDirecta = !intermediarioId;
  const monedaRecibida = document.getElementById('orden-moneda-recibida').value;
  const monedaEntregada = document.getElementById('orden-moneda-entregada').value;
  const montoRecibido = parseImporteInput(document.getElementById('orden-monto-recibido').value);
  const montoEntregado = parseImporteInput(document.getElementById('orden-monto-entregado').value);
  const cotizacionRaw = document.getElementById('orden-cotizacion').value.trim();
  const cotizacion = cotizacionRaw ? parseImporteInput(cotizacionRaw) : null;
  const estado = document.getElementById('orden-estado').value;
  const observaciones = document.getElementById('orden-observaciones').value.trim() || null;

  if (!clienteId && !intermediarioId) {
    showToast('Definí participantes: elegí un cliente, un intermediario o ambos.', 'error');
    return Promise.resolve(null);
  }
  if (!tipoOperacionId) {
    showToast('Elegí un tipo de operación.', 'error');
    return Promise.resolve(null);
  }
  if (usaIntermediarioTipo && !intermediarioId) {
    showToast('Para este tipo de operación es obligatorio elegir un intermediario.', 'error');
    return Promise.resolve(null);
  }
  if (!fecha || isNaN(montoRecibido) || montoRecibido <= 0 || isNaN(montoEntregado) || montoEntregado <= 0) {
    showToast('Completá fecha, monto recibido y monto entregado (números positivos).', 'error');
    return Promise.resolve(null);
  }

  const selTipoOpt = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const tipoCodigo = selTipoOpt ? (selTipoOpt.getAttribute('data-codigo') || '') : '';
  const esChequeArsOrden = esChequeArsDesdeSelectOption(selTipoOpt);
  const patronTcGuardar = patronTipoCambioOrden(monedaRecibida, monedaEntregada);
  if (patronTcGuardar && (!cotizacion || !(cotizacion > 0))) {
    showToast('En operaciones con cruce con tipo de cambio (USD o EUR contra otra moneda) el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
    return Promise.resolve(null);
  }
  if (tipoCodigo === 'USD-USD' && montoRecibido <= montoEntregado) {
    showToast('En USD-USD el monto a recibir debe ser mayor al monto a entregar (la diferencia es la comisión).', 'error');
    return Promise.resolve(null);
  }
  if (esChequeArsOrden) {
    if (montoRecibido <= montoEntregado) {
      showToast('En operación con cheque (CHEQUE–ARS) el monto a recibir debe ser mayor al monto a entregar (descuento acuerdo).', 'error');
      return Promise.resolve(null);
    }
    const tasaPctRaw = document.getElementById('orden-tasa-descuento-intermediario')?.value?.trim() || '';
    const tasaPct = tasaPctRaw ? parseImporteInput(tasaPctRaw) : null;
    if (typeof tasaPct !== 'number' || isNaN(tasaPct) || tasaPct <= 0 || tasaPct >= 100) {
      showToast('En operación con cheque (CHEQUE–ARS) la tasa de descuento del intermediario es obligatoria (ej. 1 para 1%, entre 0 y 100).', 'error');
      return Promise.resolve(null);
    }
  }
  const comisionUsd = tipoCodigo === 'USD-USD' ? montoRecibido - montoEntregado
    : (esChequeArsOrden ? montoRecibido - montoEntregado
      : (esPatronCompraFiatConTc(patronTcGuardar) && cotizacion > 0 ? (montoRecibido / cotizacion) - montoEntregado
        : (esPatronVendeFiatConTc(patronTcGuardar) && cotizacion > 0 ? montoRecibido - (montoEntregado / cotizacion) : null)));
  const pctPandy = parseImporteInput(document.getElementById('orden-comision-pandy-pct')?.value || '100');
  const pctInt = parseImporteInput(document.getElementById('orden-comision-intermediario-pct')?.value || '0');
  const tieneSplitVisible = ordenWrapComisionSplitEsVisible();
  if ((tipoCodigo === 'USD-USD' || patronTcGuardar || esChequeArsOrden) && intermediarioId && tieneSplitVisible) {
    const a = Number(pctPandy);
    const b = Number(pctInt);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a > 100 || b > 100 || Math.abs((a + b) - 100) > 1e-6) {
      showToast('La distribución de comisión debe sumar 100% (Pandy + Intermediario).', 'error');
      return Promise.resolve(null);
    }
  }
  if (intermediarioId && tieneSplitVisible && (Number(pctInt) || 0) < 1e-6 && !opcionGuardarConComisionCero) {
    showConfirm('La comisión del intermediario es cero. ¿Deseás guardar la orden igual?', 'Sí, guardar', () => guardarOrdenDesdeWizard(true));
    return Promise.resolve(null);
  }

  const tasaDescuentoIntPct = document.getElementById('orden-tasa-descuento-intermediario')?.value?.trim();
  const tasaDescuentoIntermediario = (esChequeArsOrden && tasaDescuentoIntPct) ? (parseImporteInput(tasaDescuentoIntPct) / 100) : null;
  const estadoFinal = id ? estado : 'pendiente_instrumentar';
  const payload = {
    cliente_id: clienteId,
    fecha,
    estado: estadoFinal,
    tipo_operacion_id: tipoOperacionId || null,
    operacion_directa: operacionDirecta,
    intermediario_id: intermediarioId,
    moneda_recibida: monedaRecibida,
    moneda_entregada: monedaEntregada,
    monto_recibido: montoRecibido,
    monto_entregado: montoEntregado,
    cotizacion: cotizacion,
    tasa_descuento_intermediario: tasaDescuentoIntermediario,
    observaciones,
    usuario_id: currentUserId,
    updated_at: new Date().toISOString(),
  };

  function hacerUpdate(estadoPersistir) {
    const p = { ...payload, estado: estadoPersistir };
    return id ? client.from('ordenes').update(p).eq('id', id) : client.from('ordenes').insert(p).select('id');
  }

  const prom = id
    ? client.from('instrumentacion').select('id').eq('orden_id', id).maybeSingle().then((rInst) => {
        const instId = rInst.data && rInst.data.id;
        const promTr = instId ? client.from('transacciones').select('id, estado, tipo, moneda, monto, cobrador, pagador').eq('instrumentacion_id', instId) : Promise.resolve({ data: [] });
        return promTr.then((rTr) => {
          const list = rTr.data || [];
          const ordenParaCalc = { cliente_id: clienteId, moneda_recibida: monedaRecibida, monto_recibido: montoRecibido, moneda_entregada: monedaEntregada, monto_entregado: montoEntregado };
          const { estado: estadoCalculado } = calcularEstadoOrden(list, ordenParaCalc);
          return hacerUpdate(estadoCalculado);
        });
      })
    : insertOrdenConProximoNumero(payload);

  return prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return null;
    }
    const ordenId = id || (res.data && res.data[0] && res.data[0].id);
    if (!ordenId) return null;
    if (ordenIdBorradorParaEliminar === ordenId) ordenIdBorradorParaEliminar = null;
    if (!idEl.value) idEl.value = ordenId;
    ordenWizardOrdenIdActual = ordenId;
    function guardarComision() {
      const conceptoComision = tipoCodigo === 'USD-ARS' ? 'Comisión USD-ARS' : (esChequeArsOrden ? 'Comisión ARS-ARS' : 'Comisión USD-USD');
      const comisionMoneda = esChequeArsOrden ? 'ARS' : 'USD';
      if (!((tipoCodigo === 'USD-USD' || esChequeArsOrden) && comisionUsd != null && comisionUsd > 0)) return Promise.resolve();
      return client.from('comisiones_orden').delete().eq('orden_id', ordenId).then(() => {
        const a = intermediarioId ? Number(pctPandy) : 100;
        const b = intermediarioId ? Number(pctInt) : 0;
        const montoPandy = comisionUsd * (a / 100);
        const montoInter = comisionUsd * (b / 100);
        const rows = [
          { orden_id: ordenId, moneda: comisionMoneda, monto: montoPandy, concepto: conceptoComision, beneficiario: 'pandy', intermediario_id: null },
        ];
        if (intermediarioId && montoInter > 0) rows.push({ orden_id: ordenId, moneda: comisionMoneda, monto: montoInter, concepto: conceptoComision, beneficiario: 'intermediario', intermediario_id: intermediarioId });
        return client.from('comisiones_orden').insert(rows).then(() => {});
      });
    }
    if (esChequeArsOrden && intermediarioId && tasaDescuentoIntermediario != null) {
      return guardarComision().then(() =>
        actualizarTasaTransaccionIngresoIntermediarioCheque(ordenId, {
          monto_recibido: montoRecibido,
          tasa_descuento_intermediario: tasaDescuentoIntermediario,
          intermediario_id: intermediarioId,
        })
      ).then(() => ordenId);
    }
    return guardarComision().then(() => ordenId);
  });
}

function ensureInstrumentacionForOrden(ordenId) {
  if (!ordenId) return Promise.resolve(null);
  return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle().then((r) => {
    const instId = r.data && r.data.id;
    if (instId) return instId;
    return client.from('instrumentacion').insert({ orden_id: ordenId }).select('id').single().then((ins) => (ins.data ? ins.data.id : null));
  });
}

function renderOrdenWizardInstrumentacion(instId) {
  const loadingEl = document.getElementById('orden-inst-loading');
  const wrapEl = document.getElementById('orden-inst-tabla-wrap');
  const tbody = document.getElementById('orden-inst-tbody');
  const acuerdoTexto = document.getElementById('orden-inst-acuerdo-texto');
  const instrumentadoTexto = document.getElementById('orden-inst-instrumentado-texto');
  const acuerdoAviso = document.getElementById('orden-inst-acuerdo-aviso');
  if (!loadingEl || !wrapEl || !tbody || !instId) return;
  const msgActualizando = document.getElementById('orden-inst-actualizando-msg');
  if (msgActualizando) msgActualizando.style.display = 'none';
  loadingEl.textContent = 'Cargando instrumentación…';
  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';
  if (acuerdoTexto) acuerdoTexto.textContent = '…';
  if (instrumentadoTexto) instrumentadoTexto.textContent = '…';
  if (acuerdoAviso) acuerdoAviso.textContent = '';

  client.from('instrumentacion').select('orden_id').eq('id', instId).single().then((rInst) => {
    const ordenId = rInst.data && rInst.data.orden_id;
    if (!ordenId) {
      loadingEl.style.display = 'none';
      if (acuerdoTexto) acuerdoTexto.textContent = '–';
      if (instrumentadoTexto) instrumentadoTexto.textContent = '–';
      return;
    }
    Promise.all([
      client.from('ordenes').select('id, cliente_id, tipo_operacion_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, cotizacion, tasa_descuento_intermediario, estado, clientes(nombre), intermediarios(nombre), tipos_operacion(codigo)').eq('id', ordenId).single(),
      client.from('transacciones').select('id, numero, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instId).order('created_at', { ascending: true }),
      client.from('modos_pago').select('id, codigo, nombre'),
    ]).then(([rOrd, resTr, rModos]) => {
      loadingEl.style.display = 'none';
      wrapEl.style.display = 'block';
      const orden = rOrd.data || null;
      const participantesEl = document.getElementById('orden-inst-participantes-texto');
      if (participantesEl) {
        if (orden) {
          const nombreCliente = orden.clientes?.nombre ?? (orden.cliente_id ? '–' : null);
          const nombreIntermediario = orden.intermediarios?.nombre ?? (orden.intermediario_id ? '–' : null);
          const partes = [];
          if (nombreCliente) partes.push('Cliente: ' + (nombreCliente || '–'));
          else if (orden.intermediario_id) partes.push('Cliente: Sin asignar');
          if (nombreIntermediario) partes.push('Intermediario: ' + nombreIntermediario);
          else partes.push('Intermediario: Sin asignar');
          participantesEl.textContent = partes.join(' · ');
        } else {
          participantesEl.textContent = '–';
        }
      }
      if (orden) {
        const monR = orden.moneda_recibida || 'USD';
        const monE = orden.moneda_entregada || 'USD';
        const mr = Number(orden.monto_recibido) || 0;
        const me = Number(orden.monto_entregado) || 0;
        if (acuerdoTexto) acuerdoTexto.textContent = `Recibir ${formatImporteDisplay(mr)} ${monR} · Entregar ${formatImporteDisplay(me)} ${monE}.`;
      } else {
        if (acuerdoTexto) acuerdoTexto.textContent = '–';
      }

      if (resTr.error) {
        tbody.innerHTML = '<tr><td colspan="9">Error: ' + (resTr.error.message || '') + '</td></tr>';
        if (instrumentadoTexto) instrumentadoTexto.textContent = '–';
        return;
      }
      let list = resTr.data || [];

      function renderWizardList(lista) {
        const { totalRecibido, totalEntregado } = totalesInstrumentacion(lista, orden);
        const labelEl = document.getElementById('orden-inst-instrumentado-label');
        if (instrumentadoTexto && orden) {
          const monR = orden.moneda_recibida || 'USD';
          const monE = orden.moneda_entregada || 'USD';
          const ejecutada = orden.estado === 'orden_ejecutada';
          if (labelEl) labelEl.textContent = ejecutada ? 'Instrumentado:' : 'Instrumentación:';
          if (ejecutada) {
            instrumentadoTexto.textContent = `Recibido ${formatImporteDisplay(totalRecibido)} ${monR} · Entregado ${formatImporteDisplay(totalEntregado)} ${monE}.`;
          } else {
            const mr = Number(orden.monto_recibido) || 0;
            const me = Number(orden.monto_entregado) || 0;
            instrumentadoTexto.textContent = `A recibir ${formatImporteDisplay(mr)} ${monR} - A entregar ${formatImporteDisplay(me)} ${monE}.`;
          }
        } else {
          if (labelEl) labelEl.textContent = 'Instrumentado:';
          if (instrumentadoTexto) instrumentadoTexto.textContent = '–';
        }
        if (acuerdoAviso && orden) {
          const avisoInst = textoAvisoFaltaOExcesoInstrumentacion(orden, lista);
          acuerdoAviso.textContent = avisoInst ? ` (${avisoInst})` : '';
        }
        const modosMap = {};
        (rModos.data || []).forEach((m) => { modosMap[m.id] = m; });
        const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        const cobradorL = (t) => participantLabelHtml(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
        const pagadorL = (t) => participantLabelHtml(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
        const canEditarTr = userPermissions.includes('editar_transacciones');
        const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`; };
        const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
        const listaSorted = sortTransaccionesPorNumero(lista);
        if (listaSorted.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9">Todavía no hay transacciones.</td></tr>';
        } else {
          const montoCell = (t) => {
            if (!canEditarTr) return `<td>${formatImporteDisplay(t.monto)}</td>`;
            const val = formatImporteParaInput(t.monto);
            return `<td><input type="text" class="input-monto-transaccion-tabla" data-id="${esc(t.id)}" value="${esc(val)}" inputmode="decimal" aria-label="Monto ${esc(t.moneda)}"></td>`;
          };
          const modoPagoCell = (t) => {
            if (!canEditarTr) {
              const modo = modosMap[t.modo_pago_id];
              return `<td>${esc(modo ? modo.nombre : '–')}</td>`;
            }
            const opciones = (rModos.data || []).map((m) => `<option value="${m.id}"${t.modo_pago_id === m.id ? ' selected' : ''}>${esc(m.nombre)}</option>`).join('');
            return `<td><select class="combo-modo-pago-transaccion-tabla" data-id="${esc(t.id)}" aria-label="Modo de pago">${opciones}</select></td>`;
          };
          tbody.innerHTML = listaSorted.map((t) => {
            return `<tr data-id="${t.id}" data-numero="${t.numero != null ? esc(String(t.numero)) : ''}">
              <td>${t.numero != null ? esc(String(t.numero)) : '–'}</td>
              <td>${tipoTransaccionHtml(t.tipo)}</td>
              ${modoPagoCell(t)}
              <td>${esc(t.moneda)}</td>
              ${montoCell(t)}
              <td>${pagadorL(t)}</td>
              <td>${cobradorL(t)}</td>
              <td>${canEditarTr ? estadoTrxCombo(t) : estadoTexto(t)}</td>
              <td>${canEditarTr ? `<button type="button" class="btn-editar btn-editar-transaccion-ordenwizard" data-id="${t.id}" title="Editar concepto y demás campos">Editar</button>` : ''}</td>
            </tr>`;
          }).join('');
          if (canEditarTr) {
            tbody.querySelectorAll('.combo-estado-transaccion').forEach((sel) => {
              sel.addEventListener('change', function() { cambiarEstadoTransaccion(this.getAttribute('data-id'), this.value, instId, this); });
            });
                tbody.querySelectorAll('.combo-modo-pago-transaccion-tabla').forEach((sel) => {
                  sel.addEventListener('change', function() {
                    const id = this.getAttribute('data-id');
                    const prev = lista.find((r) => r.id === id);
                    if (!prev || this.value === prev.modo_pago_id) return;
                    const selEl = this;
                    guardarSoloModoPagoTransaccion(id, this.value, () => {
                      client.from('transacciones').select('id, numero, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instId).order('created_at', { ascending: true }).then((r2) => {
                    list = r2.data || [];
                    renderWizardList(list);
                  });
                }, () => { selEl.value = prev.modo_pago_id; });
              });
            });
            tbody.querySelectorAll('.input-monto-transaccion-tabla').forEach((input) => {
              input.addEventListener('blur', function() {
                const id = this.getAttribute('data-id');
                const prev = lista.find((r) => r.id === id);
                if (!prev || parseImporteInput(this.value) === Number(prev.monto)) return;
                guardarSoloMontoTransaccion(id, this.value, () => {
                  client.from('transacciones').select('id, numero, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instId).order('created_at', { ascending: true }).then((r2) => {
                    list = r2.data || [];
                    renderWizardList(list);
                  });
                });
              });
            });
            tbody.querySelectorAll('.btn-editar-transaccion-ordenwizard').forEach((btn) => {
              btn.addEventListener('click', () => {
                const row = lista.find((r) => r.id === btn.getAttribute('data-id'));
                if (row) openModalTransaccion(row, instId);
              });
            });
          }
        }
      }

      if (list.length === 0 && orden && orden.tipo_operacion_id) {
        client.from('tipos_operacion').select('codigo, moneda_in, moneda_out').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
          const row = rTipo.data || {};
          const codigo = row.codigo || '';
          const miW = (row.moneda_in || '').toString().toUpperCase().trim();
          const moW = (row.moneda_out || '').toString().toUpperCase().trim();
          const patronTcW = patronTipoCambioOrden(miW, moW);
          const esUsdUsdW = miW === 'USD' && moW === 'USD';
          if (esTipoOperacionChequeArs(codigo, row.moneda_in, row.moneda_out) && orden.intermediario_id) {
            return autoCompletarInstrumentacionChequeConIntermediario(ordenId, instId, orden);
          }
          const autoDosTxSinInt =
            !orden.intermediario_id &&
            (esUsdUsdW || patronTcW || esTipoOperacionChequeArs(codigo, row.moneda_in, row.moneda_out));
          if (autoDosTxSinInt) {
            return autoCompletarInstrumentacionSinIntermediario(ordenId, instId, orden);
          }
          if (orden.intermediario_id && (esUsdUsdW || patronTcW) && !esTipoOperacionChequeArs(codigo, row.moneda_in, row.moneda_out)) {
            return autoCompletarInstrumentacionUsdUsdConIntermediario(ordenId, instId, orden);
          }
          return Promise.resolve();
        }).then(() =>
          client.from('transacciones').select('id, numero, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instId).order('created_at', { ascending: true })
        ).then((r2) => {
          list = r2.data || [];
          renderWizardList(list);
        });
      } else {
        renderWizardList(list);
      }
    });
  });
}

function saveOrden(aceptaComisionCero = false) {
  const idEl = document.getElementById('orden-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const canIngresarOrden = userPermissions.includes('ingresar_orden');
  const canEditarOrden = userPermissions.includes('editar_orden');
  const canEditarEstadoOrden = userPermissions.includes('editar_estado_orden');
  if (id) {
    if (!canEditarOrden && !canEditarEstadoOrden) {
      showToast('No tenés permiso para editar órdenes.', 'error');
      return;
    }
  } else {
    if (!canIngresarOrden) {
      showToast('No tenés permiso para crear órdenes.', 'error');
      return;
    }
  }
  const clienteId = document.getElementById('orden-cliente').value.trim() || null;
  const fecha = document.getElementById('orden-fecha').value;
  const tipoOperacionId = document.getElementById('orden-tipo-operacion')?.value?.trim() || null;
  const selTipoOptSave = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const usaIntermediarioSave = selTipoOptSave ? (selTipoOptSave.getAttribute('data-usa-intermediario') === 'true') : false;
  let intermediarioId = document.getElementById('orden-intermediario')?.value?.trim() || null;
  if (!usaIntermediarioSave) intermediarioId = null;
  const operacionDirecta = !intermediarioId;
  const monedaRecibida = document.getElementById('orden-moneda-recibida').value;
  const monedaEntregada = document.getElementById('orden-moneda-entregada').value;
  const montoRecibido = parseImporteInput(document.getElementById('orden-monto-recibido').value);
  const montoEntregado = parseImporteInput(document.getElementById('orden-monto-entregado').value);
  const cotizacionRaw = document.getElementById('orden-cotizacion').value.trim();
  const cotizacion = cotizacionRaw ? parseImporteInput(cotizacionRaw) : null;
  const estado = document.getElementById('orden-estado').value;
  const observaciones = document.getElementById('orden-observaciones').value.trim() || null;

  if (!clienteId && !intermediarioId) {
    showToast('Definí participantes: elegí un cliente, un intermediario o ambos.', 'error');
    return;
  }
  if (!tipoOperacionId) {
    showToast('Elegí un tipo de operación.', 'error');
    return;
  }
  if (usaIntermediarioSave && !intermediarioId) {
    showToast('Para este tipo de operación es obligatorio elegir un intermediario.', 'error');
    return;
  }
  if (!fecha || isNaN(montoRecibido) || montoRecibido <= 0 || isNaN(montoEntregado) || montoEntregado <= 0) {
    showToast('Completá fecha, monto recibido y monto entregado (números positivos).', 'error');
    return;
  }

  const selTipoOpt = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const tipoCodigo = selTipoOpt ? (selTipoOpt.getAttribute('data-codigo') || '') : '';
  const esChequeArsSave = esChequeArsDesdeSelectOption(selTipoOpt);
  const patronTcSaveOrd = patronTipoCambioOrden(monedaRecibida, monedaEntregada);
  if (patronTcSaveOrd && (!cotizacion || !(cotizacion > 0))) {
    showToast('En operaciones con cruce contra USD el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
    return;
  }
  if (tipoCodigo === 'USD-USD' && montoRecibido <= montoEntregado) {
    showToast('En USD-USD el monto a recibir debe ser mayor al monto a entregar (la diferencia es la comisión).', 'error');
    return;
  }
  if (esChequeArsSave) {
    if (montoRecibido <= montoEntregado) {
      showToast('En operación con cheque (CHEQUE–ARS) el monto a recibir debe ser mayor al monto a entregar (descuento acuerdo).', 'error');
      return;
    }
    const tasaPctRaw = document.getElementById('orden-tasa-descuento-intermediario')?.value?.trim() || '';
    const tasaPct = tasaPctRaw ? parseImporteInput(tasaPctRaw) : null;
    if (typeof tasaPct !== 'number' || isNaN(tasaPct) || tasaPct <= 0 || tasaPct >= 100) {
      showToast('En operación con cheque (CHEQUE–ARS) la tasa de descuento del intermediario es obligatoria (ej. 1 para 1%, entre 0 y 100).', 'error');
      return;
    }
  }
  const comisionUsd = tipoCodigo === 'USD-USD' ? montoRecibido - montoEntregado : (esChequeArsSave ? montoRecibido - montoEntregado : (esPatronCompraFiatConTc(patronTcSaveOrd) && cotizacion > 0 ? (montoRecibido / cotizacion) - montoEntregado : (esPatronVendeFiatConTc(patronTcSaveOrd) && cotizacion > 0 ? montoRecibido - (montoEntregado / cotizacion) : null)));

  const pctPandy = parseImporteInput(document.getElementById('orden-comision-pandy-pct')?.value || '100');
  const pctInt = parseImporteInput(document.getElementById('orden-comision-intermediario-pct')?.value || '0');
  const tieneSplitVisible = ordenWrapComisionSplitEsVisible();
  if ((tipoCodigo === 'USD-USD' || patronTcSaveOrd || esChequeArsSave) && intermediarioId && tieneSplitVisible) {
    const a = Number(pctPandy);
    const b = Number(pctInt);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a > 100 || b > 100 || Math.abs((a + b) - 100) > 1e-6) {
      showToast('La distribución de comisión debe sumar 100% (Pandy + Intermediario).', 'error');
      return;
    }
  }
  if (intermediarioId && tieneSplitVisible && (Number(pctInt) || 0) < 1e-6 && !aceptaComisionCero) {
    showConfirm('La comisión del intermediario es cero. ¿Deseás guardar la orden igual?', 'Sí, guardar', () => saveOrden(true));
    return;
  }

  const tasaDescuentoIntPctSave = document.getElementById('orden-tasa-descuento-intermediario')?.value?.trim();
  const tasaDescuentoIntermediarioSave = (esChequeArsSave && tasaDescuentoIntPctSave) ? (parseImporteInput(tasaDescuentoIntPctSave) / 100) : null;
  const estadoFinal = id ? estado : 'pendiente_instrumentar';
  const payload = {
    cliente_id: clienteId,
    fecha,
    estado: estadoFinal,
    tipo_operacion_id: tipoOperacionId || null,
    operacion_directa: operacionDirecta,
    intermediario_id: intermediarioId,
    moneda_recibida: monedaRecibida,
    moneda_entregada: monedaEntregada,
    monto_recibido: montoRecibido,
    monto_entregado: montoEntregado,
    cotizacion: cotizacion,
    tasa_descuento_intermediario: tasaDescuentoIntermediarioSave,
    observaciones,
    usuario_id: currentUserId,
    updated_at: new Date().toISOString(),
  };

  function hacerUpdateOrden(estadoPersistir) {
    const p = { ...payload, estado: estadoPersistir };
    return id ? client.from('ordenes').update(p).eq('id', id) : client.from('ordenes').insert(p).select('id');
  }

  const prom = id
    ? client.from('instrumentacion').select('id').eq('orden_id', id).maybeSingle().then((rInst) => {
        const instId = rInst.data && rInst.data.id;
        const promTr = instId ? client.from('transacciones').select('id, estado, tipo, moneda, monto, cobrador, pagador').eq('instrumentacion_id', instId) : Promise.resolve({ data: [] });
        return promTr.then((rTr) => {
          const list = rTr.data || [];
          const ordenParaCalc = { cliente_id: clienteId, moneda_recibida: monedaRecibida, monto_recibido: montoRecibido, moneda_entregada: monedaEntregada, monto_entregado: montoEntregado };
          const { estado: estadoCalculado } = calcularEstadoOrden(list, ordenParaCalc);
          return hacerUpdateOrden(estadoCalculado);
        });
      })
    : insertOrdenConProximoNumero(payload);

  prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return;
    }
    const ordenId = id || (res.data && res.data[0] && res.data[0].id);
    if (!ordenId) {
      ejecutarCierreModalOrden();
      loadOrdenes();
      return;
    }
    if (ordenIdBorradorParaEliminar === ordenId) ordenIdBorradorParaEliminar = null;
    const conceptoComision = tipoCodigo === 'USD-ARS' ? 'Comisión USD-ARS' : (esChequeArsSave ? 'Comisión ARS-ARS' : 'Comisión USD-USD');
    const comisionMoneda = esChequeArsSave ? 'ARS' : 'USD';
    function guardarComisionYContinuar(continuar) {
      if ((tipoCodigo === 'USD-USD' || esChequeArsSave) && comisionUsd != null && comisionUsd > 0) {
        client.from('comisiones_orden').delete().eq('orden_id', ordenId).then(() => {
          const a = intermediarioId ? Number(pctPandy) : 100;
          const b = intermediarioId ? Number(pctInt) : 0;
          const montoPandy = comisionUsd * (a / 100);
          const montoInter = comisionUsd * (b / 100);
          const rows = [
            { orden_id: ordenId, moneda: comisionMoneda, monto: montoPandy, concepto: conceptoComision, beneficiario: 'pandy', intermediario_id: null },
          ];
          if (intermediarioId && montoInter > 0) {
            rows.push({ orden_id: ordenId, moneda: comisionMoneda, monto: montoInter, concepto: conceptoComision, beneficiario: 'intermediario', intermediario_id: intermediarioId });
          }
          client.from('comisiones_orden').insert(rows).then((rCom) => {
            if (rCom.error) console.warn('Comisión no guardada:', rCom.error.message);
            continuar();
          });
        });
      } else continuar();
    }

    // Orden nueva: crear instrumentación (1:1 con la orden)
    if (!id) {
      guardarComisionYContinuar(() => {
        client.from('instrumentacion').insert({ orden_id: ordenId }).then((rInst) => {
          if (rInst.error) console.warn('Instrumentación no creada:', rInst.error.message);
          ejecutarCierreModalOrden();
          loadOrdenes();
        });
      });
      return;
    }
    // Al editar, también guardar comisión; si es CHEQUE con intermediario, actualizar monto 4.ª transacción por tasa; luego flujo legacy
    guardarComisionYContinuar(() => {
      const promTasa = (esChequeArsSave && intermediarioId && tasaDescuentoIntermediarioSave != null)
        ? actualizarTasaTransaccionIngresoIntermediarioCheque(ordenId, { monto_recibido: montoRecibido, tasa_descuento_intermediario: tasaDescuentoIntermediarioSave, intermediario_id: intermediarioId })
        : Promise.resolve();
      promTasa.then(() => {
      if (estado !== 'concertada') {
        client.from('movimientos_caja').select('id').eq('orden_id', ordenId).eq('estado', 'cerrado').limit(1).then((r) => {
          const tieneMovimientosLegacy = r.data && r.data.length > 0;
          if (!tieneMovimientosLegacy) {
            ejecutarCierreModalOrden();
            loadOrdenes();
            return;
          }
          const ahora = new Date().toISOString();
          client.from('movimientos_cuenta_corriente').update({ estado: 'anulado', estado_fecha: ahora }).eq('orden_id', ordenId).then((rCc) => {
            if (rCc.error) showToast('Error al revertir cuenta corriente: ' + (rCc.error.message || ''), 'error');
            client.from('movimientos_caja').update({ estado: 'anulado', estado_fecha: ahora }).eq('orden_id', ordenId).then((rCaja) => {
              if (rCaja.error) showToast('Error al revertir caja: ' + (rCaja.error.message || ''), 'error');
              ejecutarCierreModalOrden();
              loadOrdenes();
              loadCajas();
              const vistaCc = document.getElementById('vista-cuenta-corriente');
              if (vistaCc && vistaCc.style.display !== 'none') loadCuentaCorriente();
            });
          });
        });
        return;
      }
      client.from('movimientos_caja').select('id').eq('orden_id', ordenId).eq('estado', 'cerrado').limit(1).then((r) => {
        if (r.data && r.data.length > 0) {
          ejecutarCierreModalOrden();
          loadOrdenes();
          return;
        }
        const ahora = new Date().toISOString();
        client.from('ordenes').select('numero').eq('id', ordenId).single().then((rOrd) => {
          const ordenNumero = rOrd.data && rOrd.data.numero != null ? rOrd.data.numero : null;
          const movCaja = [
            { moneda: monedaRecibida, monto: montoRecibido, orden_id: ordenId, orden_numero: ordenNumero, concepto: 'Orden concertada', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora },
            { moneda: monedaEntregada, monto: -montoEntregado, orden_id: ordenId, orden_numero: ordenNumero, concepto: 'Orden concertada', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora },
          ];
          client.from('movimientos_caja').insert(movCaja).then(() => {
            // Cuenta corriente solo se actualiza al ejecutar transacciones, nunca en concertada.
            ejecutarCierreModalOrden();
            loadOrdenes();
            loadCajas();
          });
        });
      });
    });
  });
});
}

function setupModalOrden() {
  const backdrop = document.getElementById('modal-orden-backdrop');
  const btnClose = document.getElementById('modal-orden-close');
  const btnCancel = document.getElementById('modal-orden-cancelar');
  const form = document.getElementById('form-orden');
  const btnNuevo = document.getElementById('btn-nueva-orden');
  if (btnClose) btnClose.addEventListener('click', () => solicitarCierreModalOrden({ modo: 'salir', refrescarOrdenes: true }));
  if (btnCancel) btnCancel.addEventListener('click', () => {
    const ordenId = (document.getElementById('orden-id') && document.getElementById('orden-id').value || '').trim();
    const instId = ordenWizardInstrumentacionIdActual;
    if (ordenId && instId) {
      solicitarCierreModalOrden({ modo: 'salir', refrescarOrdenes: true });
      return;
    }
    showConfirm('Los datos se perderán. ¿Continuar?', 'Sí, salir', () => {
      ejecutarCierreModalOrden();
      loadOrdenes();
    });
  });
  // Listo / Cerrar del paso instrumentación: solo delegación en document (evita doble disparo con addEventListener en el botón).
  // Delegación en document (capture): click y mousedown por si el click no llega (p. ej. en algunos entornos)
  function ordenWizardCerrar(btnId, back) {
    try {
      if (btnId === 'orden-btn-cerrar-wizard') solicitarCierreModalOrden({ modo: 'listo', refrescarOrdenes: true });
      else if (btnId === 'orden-btn-cancelar-wizard') solicitarCierreModalOrden({ modo: 'salir', refrescarOrdenes: true });
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('ordenWizardCerrar', err);
      if (back) { back.classList.remove('activo'); document.body.classList.remove('modal-orden-abierto'); }
    }
  }
  function ordenWizardCerrarHandler(evName) {
    return function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!btn || (btn.id !== 'orden-btn-cerrar-wizard' && btn.id !== 'orden-btn-cancelar-wizard')) return;
      const back = document.getElementById('modal-orden-backdrop');
      if (!back || !back.classList.contains('activo')) return;
      e.preventDefault();
      e.stopPropagation();
      ordenWizardCerrar(btn.id, back);
    };
  }
  document.addEventListener('click', ordenWizardCerrarHandler('click'), true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const back = document.getElementById('modal-orden-backdrop');
    if (!back || !back.classList.contains('activo')) return;
    const lb = document.getElementById('orden-tipo-operacion-listbox');
    if (lb && !lb.hidden) {
      e.preventDefault();
      e.stopPropagation();
      closeOrdenTipoOperacionListbox();
      return;
    }
    e.preventDefault();
    solicitarCierreModalOrden({ modo: 'salir', refrescarOrdenes: true });
  }, true);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, () => solicitarCierreModalOrden({ modo: 'salir', refrescarOrdenes: true }));
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveOrden(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalOrden(null));
  ['orden-cotizacion', 'orden-monto-recibido', 'orden-monto-entregado', 'orden-importe-cheque', 'orden-tasa-descuento-cliente', 'orden-tasa-descuento-intermediario', 'orden-comision-pandy-pct', 'orden-comision-intermediario-pct'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('focus', () => el.classList.add('orden-field-editing'));
      el.addEventListener('blur', () => el.classList.remove('orden-field-editing'));
    }
  });

  const comboUi = document.querySelector('.orden-tipo-operacion-combo-ui');
  const comboBtn = document.getElementById('orden-tipo-operacion-combo-btn');
  const comboList = document.getElementById('orden-tipo-operacion-listbox');
  const comboWrap = document.querySelector('.orden-tipo-operacion-combo-wrap');
  if (comboUi && comboBtn && comboList && comboWrap && comboUi.dataset.comboBound !== '1') {
    comboUi.dataset.comboBound = '1';
    function reposicionarListboxTipoOpSiAbierto() {
      if (!comboList || comboList.hidden) return;
      positionOrdenTipoOperacionListbox();
    }
    window.addEventListener('scroll', reposicionarListboxTipoOpSiAbierto, true);
    window.addEventListener('resize', reposicionarListboxTipoOpSiAbierto);
    comboBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!comboList.hidden) {
        closeOrdenTipoOperacionListbox();
        return;
      }
      rebuildOrdenTipoOperacionListbox();
      comboList.hidden = false;
      comboBtn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => {
        positionOrdenTipoOperacionListbox();
      });
    });
    comboList.addEventListener('click', (ev) => {
      const optBtn = ev.target && ev.target.closest ? ev.target.closest('.orden-tipo-operacion-option') : null;
      if (!optBtn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const val = optBtn.getAttribute('data-value');
      const sel = document.getElementById('orden-tipo-operacion');
      closeOrdenTipoOperacionListbox();
      if (sel && val != null) {
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      comboBtn.focus();
    });
    document.addEventListener(
      'mousedown',
      (ev) => {
        if (!comboList || comboList.hidden) return;
        if (comboWrap.contains(ev.target)) return;
        closeOrdenTipoOperacionListbox();
      },
      true
    );
  }
}

// --- Cargar orden por chat (solo local / MVP) ---
let chatOrdenClientes = [];
let chatOrdenTipos = [];
let chatOrdenUltimaInterpretacion = null;
let chatOrdenAbiertoDesdePanel = false;

function interpretarTextoOrden(texto, clientes, tipos) {
  const t = (texto || '').trim();
  if (!t) return { error: 'Escribí algo para interpretar.' };

  const normalizarMoneda = (s) => {
    if (!s) return null;
    const u = (s + '').toUpperCase().replace(/Ó/g, 'O');
    if (u.includes('ARS') || u.includes('PESO')) return 'ARS';
    if (u.includes('USD') || u.includes('DOLAR')) return 'USD';
    if (u.includes('EUR') || u.includes('EURO')) return 'EUR';
    return null;
  };

  const parseNum = (str) => {
    if (!str) return NaN;
    const s = (str + '').trim().replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s, 10);
    return isNaN(n) ? NaN : n;
  };

  // Tipo de cambio: "a tc 1500", "tc 1500", "a 1500", "cotización 1500" (evitar capturar el monto de "recibo 3000")
  let cotizacion = null;
  const reTc = /(?:a\s+tc\s+|tc\s+|tipo\s+(?:de\s+cambio\s+)?|cotización\s+|a\s+)(\d[\d.,]*)/gi;
  const matchTc = reTc.exec(t);
  if (matchTc && matchTc[1]) {
    const n = parseImporteInput(matchTc[1]);
    if (!isNaN(n) && n > 0) cotizacion = n;
  }

  // "recibo 3000 usd" / "recibimos 1500000 ars"
  const reRecibo = /\brecib(o|imos|í|en)?\s+(\d[\d.,]*)\s*(ARS|USD|EUR|pesos?|dólares?|dolares?|euros?)?/gi;
  const reciboMatch = reRecibo.exec(t);
  let montoRecibido = null, monedaRecibida = null;
  if (reciboMatch && reciboMatch[2]) {
    montoRecibido = parseNum(reciboMatch[2]);
    monedaRecibida = normalizarMoneda(reciboMatch[3] || '');
  }

  // "entrego 4500000 ars" / "entregamos ars" (sin número: se calcula con TC)
  const reEntregoMonto = /\bentreg(o|amos|á|an)?\s+(\d[\d.,]*)\s*(ARS|USD|EUR|pesos?|dólares?|dolares?|euros?)/gi;
  const reEntregoSoloMoneda = /\bentreg(o|amos|á|an)?\s+(ARS|USD|EUR|pesos?|dólares?|dolares?|euros?)\b/gi;
  let montoEntregado = null, monedaEntregada = null;
  const entregoMontoMatch = reEntregoMonto.exec(t);
  const entregoSoloMatch = reEntregoSoloMoneda.exec(t);
  if (entregoMontoMatch && entregoMontoMatch[2]) {
    montoEntregado = parseNum(entregoMontoMatch[2]);
    monedaEntregada = normalizarMoneda(entregoMontoMatch[3] || '');
  } else if (entregoSoloMatch && entregoSoloMatch[2]) {
    monedaEntregada = normalizarMoneda(entregoSoloMatch[2] || '');
  }

  // Si tenemos recibo + entrego (moneda) pero sin monto entregado, intentar con TC
  if (montoRecibido != null && montoRecibido > 0 && monedaRecibida && monedaEntregada && (montoEntregado == null || montoEntregado <= 0) && cotizacion != null && cotizacion > 0) {
    const pChat = patronTipoCambioOrden(monedaRecibida, monedaEntregada);
    if (esPatronVendeFiatConTc(pChat)) montoEntregado = montoRecibido * cotizacion;
    else if (esPatronCompraFiatConTc(pChat)) montoEntregado = montoRecibido / cotizacion;
  }

  // Fallback: dos números en el texto (primero = recibido, segundo = entregado)
  if ((montoRecibido == null || montoEntregado == null) || (!monedaRecibida || !monedaEntregada)) {
    const reMonto = /(\d[\d.,]*)\s*(ARS|USD|EUR|pesos?|dólares?|dolares?|euros?)?/gi;
    const montos = [];
    let match;
    while ((match = reMonto.exec(t)) !== null) {
      const n = parseNum(match[1]);
      if (!isNaN(n) && n > 0) {
        const moneda = normalizarMoneda(match[2] || '');
        montos.push({ monto: n, moneda: moneda || null });
      }
    }
    if (montos.length >= 2 && !monedaRecibida) {
      montoRecibido = montos[0].monto;
      monedaRecibida = montos[0].moneda;
      montoEntregado = montos[1].monto;
      monedaEntregada = montos[1].moneda;
    }
  }

  if (!montoRecibido || montoRecibido <= 0 || !montoEntregado || montoEntregado <= 0) {
    return { error: 'Indicá qué recibís y qué entregás (montos y monedas). Si ponés un solo monto y tipo de cambio (ej. "a tc 1500"), calculo el otro.' };
  }
  if (!monedaRecibida || !monedaEntregada) {
    return { error: 'Indicá las monedas (ARS, USD o EUR) para recibir y entregar.' };
  }

  const codigoTipo = monedaRecibida + '-' + monedaEntregada;
  const tipo = Array.isArray(tipos) && tipos.find((x) => (x.codigo || '') === codigoTipo);
  if (!tipo) {
    return { error: 'No hay tipo de operación ' + codigoTipo + '. Revisá las monedas.' };
  }

  const requiereCotizacion = !!patronTipoCambioOrden(monedaRecibida, monedaEntregada);
  if (requiereCotizacion && (!cotizacion || cotizacion <= 0)) {
    return { error: 'Para el cruce ' + codigoTipo + ' indicá el tipo de cambio (ej. "a tc 1500").' };
  }

  let cliente_id = null;
  let cliente_nombre = '';
  const paraMatch = t.match(/\bpara\s+([^,.\d]+?)(?=\s*,|\s+recib|\s+entrega|$)/i);
  const clienteMatch = t.match(/\bcliente\s+([^,.\d]+?)(?=\s*,|\s+recib|\s+entrega|$)/i);
  const nombreBuscar = (paraMatch && paraMatch[1].trim()) || (clienteMatch && clienteMatch[1].trim());
  if (nombreBuscar && Array.isArray(clientes) && clientes.length) {
    const nombreNorm = nombreBuscar.toLowerCase().trim();
    const encontrado = clientes.find((c) => (c.nombre || '').toLowerCase().trim() === nombreNorm ||
      (c.nombre || '').toLowerCase().includes(nombreNorm) ||
      nombreNorm.includes((c.nombre || '').toLowerCase().trim()));
    if (encontrado) {
      cliente_id = encontrado.id;
      cliente_nombre = encontrado.nombre || '';
    }
  }

  let fecha = new Date();
  if (/\bhoy\b/i.test(t)) fecha = new Date();
  else if (/\bmañana\b/i.test(t)) { fecha = new Date(); fecha.setDate(fecha.getDate() + 1); }
  const fechaStr = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');

  return {
    cliente_id,
    cliente_nombre,
    tipo_operacion_id: tipo.id,
    tipo_codigo: tipo.codigo,
    moneda_recibida: monedaRecibida,
    moneda_entregada: monedaEntregada,
    monto_recibido: montoRecibido,
    monto_entregado: montoEntregado,
    fecha: fechaStr,
    cotizacion: cotizacion,
  };
}

function openModalChatOrden() {
  const backdrop = document.getElementById('modal-chat-orden-backdrop');
  const logEl = document.getElementById('chat-orden-log');
  const previewEl = document.getElementById('chat-orden-preview');
  const confirmWrap = document.getElementById('chat-orden-confirmar-wrap');
  const inputEl = document.getElementById('chat-orden-input');
  if (!backdrop || !logEl) return;
  logEl.innerHTML = '';
  previewEl.style.display = 'none';
  previewEl.innerHTML = '';
  confirmWrap.style.display = 'none';
  chatOrdenUltimaInterpretacion = null;
  if (inputEl) inputEl.value = '';
  backdrop.classList.add('activo');
  if (inputEl) inputEl.focus();
  Promise.all([
    client.from('clientes').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
    tiposOperacionFetchConFallbackOrdenVisual(
      () => client.from('tipos_operacion').select('id, codigo, nombre, orden_visual').eq('activo', true).order('orden_visual', { ascending: true }).order('codigo').order('usa_intermediario').order('id'),
      () => client.from('tipos_operacion').select('id, codigo, nombre').eq('activo', true).order('codigo').order('usa_intermediario').order('id'),
    ),
  ]).then(([rC, rT]) => {
    chatOrdenClientes = rC.data || [];
    chatOrdenTipos = rT.data || [];
    if (rT.error) showToast('Error al cargar tipos de operación: ' + (rT.error.message || ''), 'error');
  });
}

function closeModalChatOrden() {
  const backdrop = document.getElementById('modal-chat-orden-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function setupModalChatOrden() {
  const backdrop = document.getElementById('modal-chat-orden-backdrop');
  const btnClose = document.getElementById('modal-chat-orden-close');
  const btnEnviar = document.getElementById('chat-orden-enviar');
  const inputEl = document.getElementById('chat-orden-input');
  const logEl = document.getElementById('chat-orden-log');
  const previewEl = document.getElementById('chat-orden-preview');
  const confirmWrap = document.getElementById('chat-orden-confirmar-wrap');
  const btnConfirmar = document.getElementById('chat-orden-confirmar');
  const btnAbrirChat = document.getElementById('btn-orden-por-chat');

  if (btnAbrirChat) btnAbrirChat.addEventListener('click', () => { chatOrdenAbiertoDesdePanel = false; openModalChatOrden(); });
  const btnChatInicio = document.getElementById('btn-orden-por-chat-inicio');
  if (btnChatInicio) btnChatInicio.addEventListener('click', () => { chatOrdenAbiertoDesdePanel = true; openModalChatOrden(); });
  if (btnClose) btnClose.addEventListener('click', closeModalChatOrden);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalChatOrden);

  function appendMsg(role, text, label) {
    if (!logEl) return;
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    if (label) {
      const l = document.createElement('div');
      l.className = 'chat-msg-label';
      l.textContent = label;
      div.appendChild(l);
    }
    div.appendChild(document.createTextNode(text));
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  if (btnEnviar && inputEl) {
    btnEnviar.addEventListener('click', () => {
      const texto = inputEl.value.trim();
      if (!texto) return;
      appendMsg('user', texto, 'Vos');
      inputEl.value = '';
      const result = interpretarTextoOrden(texto, chatOrdenClientes, chatOrdenTipos);
      if (result.error) {
        appendMsg('bot', result.error, 'Sistema');
        previewEl.style.display = 'none';
        confirmWrap.style.display = 'none';
        chatOrdenUltimaInterpretacion = null;
        return;
      }
      const clienteTexto = result.cliente_nombre || (result.cliente_id ? 'Cliente asignado' : 'Sin cliente');
      let previewTexto = 'Cliente: ' + clienteTexto + ' · Recibimos ' + result.moneda_recibida + ' ' + formatMonto(result.monto_recibido) + ' · Entregamos ' + result.moneda_entregada + ' ' + formatMonto(result.monto_entregado);
      if (result.cotizacion != null && result.cotizacion > 0) previewTexto += ' · TC: ' + formatMonto(result.cotizacion);
      previewTexto += ' · Fecha: ' + result.fecha;
      appendMsg('bot', previewTexto, 'Preview');
      previewEl.textContent = previewTexto;
      previewEl.style.display = 'block';
      confirmWrap.style.display = 'block';
      chatOrdenUltimaInterpretacion = result;
      logEl.scrollTop = logEl.scrollHeight;
    });
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (btnEnviar) btnEnviar.click();
      }
    });
  }

  if (btnConfirmar && confirmWrap) {
    btnConfirmar.addEventListener('click', () => {
      const r = chatOrdenUltimaInterpretacion;
      if (!r) return;
      if (!userPermissions.includes('ingresar_orden')) {
        showToast('No tenés permiso para crear órdenes.', 'error');
        return;
      }
      if (!r.cliente_id) {
        showToast('Indicá un cliente en el mensaje (ej. "para Adriana").', 'error');
        return;
      }
      if (!r.tipo_operacion_id) {
        showToast('No se pudo identificar el tipo de operación. Indicá en el mensaje (ej. "recibo USD y entrego ARS" o "ARS-USD").', 'error');
        return;
      }
      const requiereTc = !!patronTipoCambioOrden(r.moneda_recibida, r.moneda_entregada);
      if (requiereTc && (!r.cotizacion || r.cotizacion <= 0)) {
        showToast('Para este cruce con USD el tipo de cambio es obligatorio.', 'error');
        return;
      }
      const payload = {
        cliente_id: r.cliente_id || null,
        fecha: r.fecha,
        estado: 'pendiente_instrumentar',
        tipo_operacion_id: r.tipo_operacion_id,
        operacion_directa: true,
        intermediario_id: null,
        moneda_recibida: r.moneda_recibida,
        moneda_entregada: r.moneda_entregada,
        monto_recibido: r.monto_recibido,
        monto_entregado: r.monto_entregado,
        cotizacion: r.cotizacion || null,
        tasa_descuento_intermediario: null,
        observaciones: null,
        usuario_id: currentUserId,
        updated_at: new Date().toISOString(),
      };
      insertOrdenConProximoNumero(payload).then((res) => {
        if (res.error) {
          showToast('Error al crear la orden: ' + (res.error.message || ''), 'error');
          return;
        }
        const ordenId = res.data && res.data[0] && res.data[0].id;
        if (!ordenId) {
          showToast('Error: no se obtuvo el id de la orden.', 'error');
          return;
        }
        const ordenParaAuto = {
          intermediario_id: null,
          tipo_operacion_id: r.tipo_operacion_id,
          monto_recibido: r.monto_recibido,
          monto_entregado: r.monto_entregado,
          moneda_recibida: r.moneda_recibida,
          moneda_entregada: r.moneda_entregada,
          cotizacion: r.cotizacion || null,
        };
        client.from('instrumentacion').insert({ orden_id: ordenId }).select('id').then((rInst) => {
          function alFinalizar() {
            closeModalChatOrden();
            loadOrdenes();
            if (chatOrdenAbiertoDesdePanel) {
              chatOrdenAbiertoDesdePanel = false;
              showView('vista-ordenes', 'Órdenes');
            }
          }
          if (rInst.error) {
            showToast('Orden creada pero falló la instrumentación: ' + (rInst.error.message || ''), 'error');
            alFinalizar();
            return;
          }
          const instId = rInst.data && rInst.data[0] && rInst.data[0].id;
          if (!instId) {
            showToast('Orden e instrumentación creadas.', 'success');
            alFinalizar();
            return;
          }
          autoCompletarInstrumentacionSinIntermediario(ordenId, instId, ordenParaAuto).then(() => {
            showToast('Orden e instrumentación creadas (con transacciones).', 'success');
            alFinalizar();
          }).catch(() => {
            showToast('Orden e instrumentación creadas; no se pudieron generar las transacciones automáticas.', 'info');
            alFinalizar();
          });
        });
      });
    });
  }
}

// --- Transacciones (panel debajo de la orden) ---
let transaccionesOrdenIdActual = null;
/** Sólo el último openModalTransaccion aplica UI: si hay doble click o reentradas, un callback tardío no debe ejecutar form.reset() pisando el formulario ya cargado (E2E 03 USD-ARS E,P: modal quedaba en Ingreso + modo Ninguno). */
let openModalTransaccionSeq = 0;

/** Convierte monto a la moneda destino. tipo_cambio = unidades ARS por 1 unidad de la otra (ej. ARS por 1 USD). */
function convertirAMonedaOrden(monto, monedaOrigen, monedaDestino, tipoCambio) {
  if (monedaOrigen === monedaDestino) return Number(monto);
  const m = Number(monto);
  const tc = tipoCambio != null && !isNaN(tipoCambio) && tipoCambio > 0 ? Number(tipoCambio) : null;
  if (monedaOrigen === 'ARS' && monedaDestino !== 'ARS' && tc) return m / tc;
  if (monedaOrigen !== 'ARS' && monedaDestino === 'ARS' && tc) return m * tc;
  if (monedaOrigen === 'EUR' && monedaDestino === 'USD') return m;
  if (monedaOrigen === 'USD' && monedaDestino === 'EUR') return m;
  return m;
}

/** Totales de transacciones en moneda del acuerdo. orden: { moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, cotizacion? }. */
function totalesInstrumentacion(transacciones, orden) {
  if (!orden) return { totalRecibido: 0, totalEntregado: 0 };
  const requiereCliente = !!orden.cliente_id;
  const monedaRecibida = orden.moneda_recibida || 'USD';
  const monedaEntregada = orden.moneda_entregada || 'USD';
  const tcAcuerdo = orden.cotizacion != null && !isNaN(Number(orden.cotizacion)) && Number(orden.cotizacion) > 0 ? Number(orden.cotizacion) : null;
  let totalRecibido = 0;
  let totalEntregado = 0;
  (transacciones || []).forEach((t) => {
    // Para comparar con el acuerdo del cliente, solo cuentan transacciones donde participa el cliente.
    // Las transacciones Pandy ↔ Intermediario se permiten para conciliar cuentas, pero no deben bloquear el acuerdo.
    if (requiereCliente && !(t.cobrador === 'cliente' || t.pagador === 'cliente')) return;
    const monto = Number(t.monto);
    const tcTrx = t.tipo_cambio != null && !isNaN(t.tipo_cambio) ? Number(t.tipo_cambio) : null;
    const tc = (tcTrx != null && tcTrx > 0) ? tcTrx : tcAcuerdo;
    if (t.tipo === 'ingreso') {
      totalRecibido += convertirAMonedaOrden(monto, t.moneda, monedaRecibida, tc);
    } else {
      totalEntregado += convertirAMonedaOrden(monto, t.moneda, monedaEntregada, tc);
    }
  });
  return { totalRecibido, totalEntregado };
}

/** Valida que los totales no superen el acuerdo. Devuelve { ok, mensaje }. Si ya se completó el acuerdo, mensaje específico; si no, indica en cuánto se excede. */
function validarTotalesVsAcuerdo(transacciones, orden, transaccionExcluirId, transaccionAgregar) {
  const list = (transacciones || []).filter((t) => t.id !== transaccionExcluirId);
  const listConNueva = transaccionAgregar ? [...list, transaccionAgregar] : list;
  const { totalRecibido: totalRecSin, totalEntregado: totalEntSin } = totalesInstrumentacion(list, orden);
  const { totalRecibido: totalRecCon, totalEntregado: totalEntCon } = totalesInstrumentacion(listConNueva, orden);
  const montoRecibido = Number(orden.monto_recibido) || 0;
  const montoEntregado = Number(orden.monto_entregado) || 0;
  const monedaRecibida = (orden.moneda_recibida || 'USD').trim().toUpperCase();
  const monedaEntregada = (orden.moneda_entregada || 'USD').trim().toUpperCase();
  const tol = 1e-6;

  if (totalRecCon > montoRecibido + tol) {
    const yaCompleto = totalRecSin >= montoRecibido - tol;
    const mensaje = yaCompleto
      ? 'No se puede cargar una transacción de ingreso dado que ya se completó el acuerdo.'
      : `La transacción excede el acuerdo en ingresos en ${formatImporteDisplay(totalRecCon - montoRecibido)} ${monedaRecibida}. El máximo permitido es ${formatImporteDisplay(montoRecibido)} ${monedaRecibida}.`;
    return { ok: false, mensaje };
  }
  if (totalEntCon > montoEntregado + tol) {
    const yaCompleto = totalEntSin >= montoEntregado - tol;
    const mensaje = yaCompleto
      ? 'No se puede cargar una transacción de egreso dado que ya se completó el acuerdo.'
      : `La transacción excede el acuerdo en egresos en ${formatImporteDisplay(totalEntCon - montoEntregado)} ${monedaEntregada}. El máximo permitido es ${formatImporteDisplay(montoEntregado)} ${monedaEntregada}.`;
    return { ok: false, mensaje };
  }
  return { ok: true };
}

/** Indica si los totales de transacciones coinciden con el acuerdo (dentro de tolerancia). */
function estaConciliada(transacciones, orden) {
  if (!orden) return false;
  const { totalRecibido, totalEntregado } = totalesInstrumentacion(transacciones || [], orden);
  const montoRecibido = Number(orden.monto_recibido) || 0;
  const montoEntregado = Number(orden.monto_entregado) || 0;
  const tol = 1e-6;
  return Math.abs(totalRecibido - montoRecibido) <= tol && Math.abs(totalEntregado - montoEntregado) <= tol;
}

/** Texto corto para UI: faltan ingresos/egresos por N o exceso respecto del acuerdo. */
function textoAvisoFaltaOExcesoInstrumentacion(orden, transacciones) {
  if (!orden) return '';
  const { totalRecibido, totalEntregado } = totalesInstrumentacion(transacciones || [], orden);
  const mr = Number(orden.monto_recibido) || 0;
  const me = Number(orden.monto_entregado) || 0;
  const monR = (orden.moneda_recibida || 'USD').trim();
  const monE = (orden.moneda_entregada || 'USD').trim();
  const tol = 1e-6;
  if (estaConciliada(transacciones, orden)) return '';
  const partes = [];
  if (totalRecibido < mr - tol) partes.push(`Faltan ingresos por ${formatImporteDisplay(mr - totalRecibido)} ${monR}`);
  else if (totalRecibido > mr + tol) partes.push(`Los ingresos superan el acuerdo en ${formatImporteDisplay(totalRecibido - mr)} ${monR}`);
  if (totalEntregado < me - tol) partes.push(`Faltan egresos por ${formatImporteDisplay(me - totalEntregado)} ${monE}`);
  else if (totalEntregado > me + tol) partes.push(`Los egresos superan el acuerdo en ${formatImporteDisplay(totalEntregado - me)} ${monE}`);
  return partes.join(' · ');
}

function fetchOrdenYTransaccionesParaValidarCierreWizard(ordenId, instId) {
  if (!ordenId || !instId) return Promise.resolve({ orden: null, transacciones: [] });
  return client.from('ordenes').select('id, estado, cliente_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, cotizacion').eq('id', ordenId).single().then((rOrd) => {
    const orden = rOrd.data;
    if (!orden) return { orden: null, transacciones: [] };
    return client.from('transacciones').select('id, tipo, moneda, monto, cobrador, pagador, tipo_cambio').eq('instrumentacion_id', instId).order('created_at', { ascending: true }).then((rTr) => ({
      orden,
      transacciones: rTr.data || [],
    }));
  });
}

/** Aplica montos editados en la tabla del wizard (inputs sin blur) antes de validar cierre. */
function aplicarMontosDesdeInputsWizardInstrumentacion(transacciones, rootEl) {
  if (!rootEl || !transacciones || !transacciones.length) return transacciones || [];
  const map = {};
  rootEl.querySelectorAll('.input-monto-transaccion-tabla').forEach((input) => {
    const id = input.getAttribute('data-id');
    if (!id) return;
    const v = parseImporteInput(input.value);
    if (typeof v === 'number' && !isNaN(v)) map[id] = v;
  });
  return transacciones.map((t) => (map[t.id] != null ? { ...t, monto: map[t.id] } : t));
}

/**
 * Listo: no cierra hasta estar conciliada (toast + scroll al acuerdo).
 * Salir (X, Cerrar, Escape, backdrop, Cancelar con instrumentación abierta): confirmación si no está conciliada.
 */
function solicitarCierreModalOrden(options) {
  const modo = options && options.modo === 'listo' ? 'listo' : 'salir';
  const refrescarOrdenes = options && options.refrescarOrdenes !== false;
  const backdrop = document.getElementById('modal-orden-backdrop');
  if (!backdrop || !backdrop.classList.contains('activo')) return;

  const ordenId = (document.getElementById('orden-id') && document.getElementById('orden-id').value || '').trim();
  const instId = ordenWizardInstrumentacionIdActual;

  function finalizar() {
    ejecutarCierreModalOrden();
    if (refrescarOrdenes && typeof loadOrdenes === 'function') loadOrdenes();
  }

  if (!ordenId || !instId) {
    finalizar();
    return;
  }

  fetchOrdenYTransaccionesParaValidarCierreWizard(ordenId, instId).then(({ orden, transacciones }) => {
    const tx = aplicarMontosDesdeInputsWizardInstrumentacion(transacciones, backdrop);
    if (!orden) {
      finalizar();
      return;
    }
    if (orden.estado === 'anulada') {
      finalizar();
      return;
    }
    if (estaConciliada(tx, orden)) {
      finalizar();
      return;
    }
    const aviso = textoAvisoFaltaOExcesoInstrumentacion(orden, tx);
    if (modo === 'listo') {
      showToast(
        'Completá la instrumentación para cerrar con «Listo». ' + (aviso || 'Los totales no coinciden con el acuerdo.'),
        'error'
      );
      const blk = document.getElementById('orden-inst-acuerdo-block');
      const scrollRoot = document.querySelector('#orden-step-instrumentacion .orden-inst-contenido-scroll');
      if (blk) {
        if (scrollRoot && scrollRoot.contains(blk)) {
          const top = blk.offsetTop - 8;
          scrollRoot.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        } else {
          blk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      return;
    }
    const cuerpo = aviso
      ? `${aviso} ¿Salir igual? La orden quedará pendiente de instrumentar.`
      : 'La instrumentación no coincide con el acuerdo. ¿Salir igual? La orden quedará pendiente de instrumentar.';
    showConfirm(cuerpo, 'Sí, salir', () => finalizar());
  }).catch(() => {
    showToast('No se pudo verificar la instrumentación. Intentá de nuevo.', 'error');
  });
}

/** Calcula el estado de la orden según transacciones y acuerdo. Devuelve { estado, conciliada, todasEjecutadas }.
 * Orden Ejecutada solo cuando TODAS las transacciones (incl. compensaciones Pandy–Intermediario) están ejecutadas. */
function calcularEstadoOrden(transacciones, orden) {
  const requiereCliente = !!orden?.cliente_id;
  const listAll = transacciones || [];
  const listCliente = requiereCliente ? listAll.filter((t) => t.cobrador === 'cliente' || t.pagador === 'cliente') : listAll;
  const totalTodas = listAll.length;
  const ejecutadasTodas = listAll.filter((t) => t.estado === 'ejecutada').length;
  const todasEjecutadas = totalTodas > 0 && ejecutadasTodas === totalTodas;
  const conciliada = estaConciliada(listCliente, orden);

  let estado = 'pendiente_instrumentar';
  if (totalTodas === 0) estado = 'pendiente_instrumentar';
  else if (todasEjecutadas) estado = 'orden_ejecutada';
  else if (conciliada) estado = 'instrumentacion_cerrada_ejecucion';
  else estado = 'instrumentacion_parcial';

  return { estado, conciliada, todasEjecutadas };
}

/**
 * Si existiera ingreso instrumentado Intermediario→Pandy (legacy), actualizaría su monto por la tasa.
 * Con el modelo actual (solo Cliente↔Pandy en `transacciones`) no hay fila que actualizar.
 */
function actualizarTasaTransaccionIngresoIntermediarioCheque(ordenId, orden) {
  if (!ordenId || !orden || !orden.intermediario_id || orden.tasa_descuento_intermediario == null) return Promise.resolve();
  const mr = Number(orden.monto_recibido) || 0;
  const tasa = Number(orden.tasa_descuento_intermediario);
  const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;
  return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle().then((rInst) => {
    const instId = rInst.data && rInst.data.id;
    if (!instId) return Promise.resolve();
    return client.from('transacciones').select('id, tipo, modo_pago_id, cobrador, pagador').eq('instrumentacion_id', instId).then((rTr) => {
      const list = rTr.data || [];
      if (list.length === 0) return Promise.resolve();
      return client.from('modos_pago').select('id, codigo').then((rModos) => {
        const byId = {};
        (rModos.data || []).forEach((m) => { byId[m.id] = m.codigo; });
        const trx = list.find((t) => t.tipo === 'ingreso' && t.cobrador === 'pandy' && t.pagador === 'intermediario' && byId[t.modo_pago_id] === 'efectivo');
        if (!trx) return Promise.resolve();
        return client.from('transacciones').update({ monto: montoEfectivoInt, updated_at: new Date().toISOString() }).eq('id', trx.id);
      });
    });
  });
}

/**
 * Inserta movimientos en cuenta corriente (cliente e intermediario) para una transacción.
 * Regla: solo se impacta cuenta corriente con transacciones EJECUTADAS (no pendientes).
 * No hay cuenta corriente cliente-intermediario: los flujos entre cliente e intermediario se reflejan en Pandy-Intermediario.
 * orden: { cliente_id, intermediario_id }; t: { cobrador, pagador, moneda, monto }; estadoTransaccion: 'pendiente' | 'ejecutada'.
 */
function insertarMovimientosCcParaTransaccion(transaccionId, orden, t, estadoTransaccion) {
  if (!transaccionId || !currentUserId || estadoTransaccion !== 'ejecutada') return Promise.resolve();
  const ordenId = orden && orden.id;
  if (!ordenId) return Promise.resolve();
  const fecha = new Date().toISOString().slice(0, 10);
  const ahora = new Date().toISOString();
  const monto = Number(t.monto) || 0;
  const cob = t.cobrador;
  const pag = t.pagador;
  const mon = t.moneda || 'USD';
  const clienteId = orden.cliente_id || null;
  const intermediarioId = orden.intermediario_id || null;
  const monR = orden.moneda_recibida || 'USD';
  const monE = orden.moneda_entregada || 'USD';
  const mr = Number(orden.monto_recibido) || 0;
  const me = Number(orden.monto_entregado) || 0;
  // CC cliente: ingreso misma moneda → -me (Pandy debe el valor de su transacción). Egreso → +monto. Otras → -monto / +monto por transacción.
  const esIngresoMismaMoneda = (monR === monE && String(cob || '').toLowerCase() === 'pandy' && pag === 'cliente');
  const montoCobroCc = esIngresoMismaMoneda ? me : monto;
  const montosCobro = montosCcPorMoneda(mon, -montoCobroCc);
  const montosDeuda = montosCcPorMoneda(mon, monto);
  const inserts = [];
  const transNumero = t.numero != null ? t.numero : null;
  const ordenNumero = orden.numero != null ? orden.numero : null;
  if (pag === 'cliente' && cob !== 'intermediario' && clienteId) {
    inserts.push(client.from('movimientos_cuenta_corriente').insert({
      cliente_id: clienteId, moneda: mon, monto: -montoCobroCc, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transNumero,
      concepto: conceptoCcLeyenda('cobro_realizado', ordenNumero, transNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
      ...montosCobro,
    }));
  }
  if (cob === 'cliente' && pag !== 'intermediario' && clienteId) {
    inserts.push(client.from('movimientos_cuenta_corriente').insert({
      cliente_id: clienteId, moneda: mon, monto, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transNumero,
      concepto: conceptoCcLeyenda('compromiso_pago', ordenNumero, transNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
      ...montosDeuda,
    }));
  }
  // Pandy ↔ Intermediario: Cobro = intermediario pagó; Deuda = Pandy debe al intermediario.
  const esPandyInt = (cob === 'pandy' && pag === 'intermediario') || (cob === 'intermediario' && pag === 'pandy');
  if (esPandyInt && cob === 'pandy' && intermediarioId) {
    inserts.push(
      client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora })
        .eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).eq('estado', 'pendiente')
        .then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
          intermediario_id: intermediarioId, moneda: mon, monto, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transNumero,
          concepto: conceptoCcLeyenda('cobro_realizado', ordenNumero, transNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
          ...montosCcPorMoneda(mon, monto),
        }))
    );
  }
  if (esPandyInt && cob === 'intermediario' && intermediarioId) {
    const instrumentacionId = t.instrumentacion_id || null;
    const tasa = Number(orden.tasa_descuento_intermediario) || 0;
    const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;
    const monInt = orden.moneda_recibida || mon || 'ARS';
    inserts.push(
      client.from('movimientos_cuenta_corriente_intermediario').select('id').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).maybeSingle()
        .then((r) => {
          if (r.data && r.data.id) return client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora }).eq('id', r.data.id);
          return Promise.resolve();
        })
        .then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
          intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transNumero, moneda: monInt, monto: -montoEfectivoInt,
          concepto: conceptoCcLeyenda('compromiso_cobrar', ordenNumero, transNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
          ...montosCcPorMoneda(monInt, -montoEfectivoInt),
        }))
        .then(() => {
          if (!instrumentacionId) return Promise.resolve();
          return client.from('comisiones_orden').select('moneda, monto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario').maybeSingle()
            .then((rCom) => {
              const comMonto = rCom.data && (Number(rCom.data.monto) || 0);
              if (comMonto >= 1e-6) {
                const monCom = (rCom.data.moneda || 'ARS').toUpperCase();
                // Según Excel: comisión intermediario en CC con signo invertido (-3000).
                return client.from('movimientos_cuenta_corriente_intermediario').insert({
                  intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transNumero, moneda: monCom, monto: -comMonto,
                  concepto: conceptoCcLeyenda('comision_acuerdo', ordenNumero, transNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCcPorMoneda(monCom, -comMonto),
                }).then(() => asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, comMonto, monCom, ordenNumero, transNumero));
              }
              return Promise.resolve();
            });
        })
    );
  }
  // Cliente ↔ Intermediario: se refleja en Pandy-Intermediario
  if (cob === 'cliente' && pag === 'intermediario' && intermediarioId) {
    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
      intermediario_id: intermediarioId, moneda: mon, monto: -monto, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transNumero,
      concepto: conceptoCcLeyenda('compromiso_pago', ordenNumero, transNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
      ...montosCcPorMoneda(mon, -monto),
    }));
  }
  if (cob === 'intermediario' && pag === 'cliente' && intermediarioId) {
    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
      intermediario_id: intermediarioId, moneda: mon, monto: -monto, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transNumero,
      concepto: conceptoCcLeyenda('pago_realizado', ordenNumero, transNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
      ...montosCcPorMoneda(mon, -monto),
    }));
  }
  if (inserts.length === 0) return Promise.resolve();
  return Promise.all(inserts);
}

/**
 * Sincroniza CC (cliente e intermediario) y caja desde la orden y sus transacciones.
 * Regla única: orden + instrumentación son la fuente de verdad; CC y caja se recalculan por derivación.
 * Se borran todos los movimientos de esta orden y se vuelven a insertar según el estado actual de las transacciones.
 * @param {string} ordenId
 * @returns {Promise<void>}
 */
function sincronizarCcYCajaDesdeOrden(ordenId) {
  if (!ordenId || !currentUserId) return Promise.resolve();
  const fecha = new Date().toISOString().slice(0, 10);
  const ahora = new Date().toISOString();

  return client.from('ordenes').select('id, numero, cliente_id, intermediario_id, tipo_operacion_id, tipos_operacion(codigo, moneda_in, moneda_out, usa_intermediario), moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, tasa_descuento_intermediario').eq('id', ordenId).single()
    .then((rOrd) => {
      if (rOrd.error || !rOrd.data) return Promise.resolve();
      const orden = rOrd.data;
      const toJoin = orden.tipos_operacion && (Array.isArray(orden.tipos_operacion) ? orden.tipos_operacion[0] : orden.tipos_operacion);
      const codigoOrdenRaw = (toJoin && toJoin.codigo) || null;
      const codigoOrden = normalizarCodigoTipoOperacion(codigoOrdenRaw) || codigoOrdenRaw;
      // `usa_intermediario` del catálogo o orden con intermediario: debe coincidir con el fetch a `reglas_de_negocio`.
      const usaIntermediario =
        (toJoin && toJoin.usa_intermediario === true) || !!orden.intermediario_id;
      const codNorm = String(codigoOrden || '').toUpperCase();
      const miOrd = (toJoin && toJoin.moneda_in || '').toString().toUpperCase().trim();
      const moOrd = (toJoin && toJoin.moneda_out || '').toString().toUpperCase().trim();
      const patronCajaCruceUsd = patronTipoCambioOrden(miOrd, moOrd);
      return getReglasDeNegocio(codigoOrden, usaIntermediario).then((reglasDeNegocio) => {
        const tieneReglasNeg = Array.isArray(reglasDeNegocio) && reglasDeNegocio.length > 0;
        /** Una sola regla: si hay filas para este tipo + intermediario, el motor CC es solo `reglas_de_negocio` (sin cc_modelo_reglas). */
        const usarMotorReglasNegocio = tieneReglasNeg;
        return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle().then((rInst) => {
        if (!rInst.data || !rInst.data.id) return Promise.resolve();
        const instId = rInst.data.id;
        return Promise.all([
          client.from('transacciones').select('id, numero, tipo, monto, moneda, cobrador, pagador, estado, modo_pago_id, concepto, instrumentacion_id').eq('instrumentacion_id', instId),
          client.from('comisiones_orden').select('moneda, monto, beneficiario').eq('orden_id', ordenId),
          client.from('modos_pago').select('id, codigo'),
        ]).then(([rTr, rCom, rModos]) => {
          const transacciones = rTr.data || [];
          const comisiones = rCom.data || [];
          const modosMap = {};
          (rModos.data || []).forEach((m) => { modosMap[m.id] = m.codigo || 'efectivo'; });
          const ordenLabel = orden.numero != null ? 'nro orden ' + orden.numero : 'nro orden ' + (ordenId || '').toString().slice(0, 8);
          const clienteId = orden.cliente_id || null;
          const intermediarioId = orden.intermediario_id || null;
          const monR = (orden.moneda_recibida || 'USD').toUpperCase();
          const monE = (orden.moneda_entregada || 'USD').toUpperCase();
          const mr = Number(orden.monto_recibido) || 0;
          const me = Number(orden.monto_entregado) || 0;
          const tasa = Number(orden.tasa_descuento_intermediario);
          const comisionInt = comisiones.find((c) => c.beneficiario === 'intermediario');
          let comisionIntMonto = comisionInt ? Number(comisionInt.monto) || 0 : 0;
          let comisionIntMon = (comisionInt && comisionInt.moneda) ? comisionInt.moneda.toUpperCase() : 'ARS';
          // Si no hay comisión en comisiones_orden pero la orden tiene tasa_descuento_intermediario, derivar: mr * tasa (ej. 50.000 * 0,015 = 750).
          if (intermediarioId && comisionIntMonto < 1e-6 && typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1 && mr >= 1e-6) {
            comisionIntMonto = mr * tasa;
            comisionIntMon = monR;
          }
          const comisionPandy = comisiones.find((c) => (c.beneficiario || '').toString().toLowerCase() === 'pandy');
          const comisionPandyMonto = comisionPandy ? Number(comisionPandy.monto) || 0 : 0;
          const comisionPandyMon = (comisionPandy && comisionPandy.moneda) ? String(comisionPandy.moneda).toUpperCase() : (orden.moneda_recibida || 'ARS').toUpperCase();
          const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;

          const rowsCcCliente = [];
          const rowsCcInt = [];
          const rowsCaja = [];

          // Regla simple e infalible (docs/REGLA_CC_SIMPLE_INFALIBLE.md): solo transacciones ejecutadas; un movimiento por transacción por entidad; signo = pagador entidad → +monto, cobrador entidad → -monto. Caja: Pandy cobra +, Pandy paga -.
          transacciones.forEach((t) => {
            if (t.estado !== 'ejecutada') return;
            const transaccionId = t.id;
            const monto = Number(t.monto) || 0;
            const mon = (t.moneda || 'USD').toUpperCase();
            const cob = String(t.cobrador != null ? t.cobrador : (t.tipo === 'ingreso' ? 'pandy' : 'cliente')).toLowerCase();
            const pag = String(t.pagador != null ? t.pagador : (t.tipo === 'egreso' ? 'pandy' : 'cliente')).toLowerCase();
            const esGananciaTrx = (t.concepto || '').includes('Ganancia del acuerdo');

            // Caja solo se mueve cuando participa Pandy (pagador o cobrador).
            if (pag === 'pandy' || cob === 'pandy') {
              const codigoModo = modosMap[t.modo_pago_id] || 'efectivo';
              const cajaTipo = codigoCajaTipoDesdeCodigo(codigoModo);
              const signoCaja = cob === 'pandy' ? 1 : -1;
              const conceptoCaja = esGananciaTrx ? conceptoCajaTransaccionEspecial(t.concepto, mon, monto, orden.numero, t.numero) : conceptoCajaTransaccion(cob === 'pandy', mon, monto, orden.numero, t.numero);
              rowsCaja.push({
                moneda: mon,
                monto: signoCaja * monto,
                caja_tipo: cajaTipo,
                transaccion_id: transaccionId,
                orden_id: ordenId,
                orden_numero: orden.numero != null ? orden.numero : null,
                transaccion_numero: t.numero != null ? t.numero : null,
                concepto: conceptoCaja,
                fecha,
                usuario_id: currentUserId,
              });
            }
            // Egreso Intermediario→Cliente (cp_ic y cruces con int.): **no** movimiento de caja de Pandy.
            // El efectivo lo entrega el intermediario; la caja de la casa solo refleja transacciones donde participa Pandy
            // (ingreso Cliente→Pandy, egreso Pandy→Cliente, etc.). Ver docs/CORAZON_SISTEMA_CC_Y_CAJA.md y USD_USD_CON_INTERMEDIARIO.md.
            // Ingreso Cliente→Intermediario (ejecutado): no genera movimiento de caja de Pandy — el efectivo lo cobra el intermediario, no la caja de la casa.

            // CC: con motor `reglas_de_negocio` se arma después; si no hay filas, lógica legacy por transacción.
            const esComisionPandyTrx = comisionPandyMonto >= 1e-6 && (t.tipo || '').toLowerCase() === 'ingreso' && pag === 'cliente' && cob === 'pandy' && Math.abs(monto - comisionPandyMonto) < 1e-6;
            if (!usarMotorReglasNegocio && clienteId && !esGananciaTrx && !esComisionPandyTrx && incluirEnMovimientosCcClienteModelo(orden, t)) {
              if (pag === 'cliente' && cob !== 'intermediario') {
                const codigo = (toJoin && toJoin.codigo) || null;
                const esModeloCliente = esTipoOperacionChequeArs(codigo, toJoin?.moneda_in, toJoin?.moneda_out) && orden.intermediario_id;
                const esIngresoMismaMoneda = (t.tipo || '').toLowerCase() === 'ingreso' && monR === monE;
                const montoIngresoCc = esModeloCliente ? mr : (esIngresoMismaMoneda ? me : monto);
                rowsCcCliente.push({
                  cliente_id: clienteId,
                  orden_id: ordenId,
                  transaccion_id: transaccionId,
                  transaccion_numero: t.numero != null ? t.numero : null,
                  concepto: conceptoCcLeyenda('cobro_realizado', orden.numero, t.numero),
                  fecha,
                  usuario_id: currentUserId,
                  moneda: mon,
                  monto: -montoIngresoCc,
                  estado: 'cerrado',
                  estado_fecha: ahora,
                  ...montosCcPorMoneda(mon, -montoIngresoCc),
                });
              }
              if (cob === 'cliente' && pag !== 'intermediario') {
                rowsCcCliente.push({
                  cliente_id: clienteId,
                  orden_id: ordenId,
                  transaccion_id: transaccionId,
                  transaccion_numero: t.numero != null ? t.numero : null,
                  concepto: conceptoCcLeyenda('compromiso_pago', orden.numero, t.numero),
                  fecha,
                  usuario_id: currentUserId,
                  moneda: mon,
                  monto: monto,
                  estado: 'cerrado',
                  estado_fecha: ahora,
                  ...montosCcPorMoneda(mon, monto),
                });
              }
            }

            if (!usarMotorReglasNegocio && intermediarioId && incluirEnMovimientosCcIntermediarioModelo(orden, t)) {
              // Pandy→Int (egreso): solo -monto. La comisión se suma cuando se ejecuta Int→Pandy (ida y vuelta cerrada).
              // Según modelo (Excel): egreso Pandy→Int en CC intermediario = +200.000 (CC_INTERMEDIARIO positivo). Signo vital para reversa.
              if (cob === 'intermediario' && pag === 'pandy') {
                const monInt = orden.moneda_recibida || mon || 'ARS';
                rowsCcInt.push({
                  intermediario_id: intermediarioId,
                  orden_id: ordenId,
                  transaccion_id: transaccionId,
                  transaccion_numero: t.numero != null ? t.numero : null,
                  moneda: monInt,
                  monto,
                  concepto: conceptoCcLeyenda('pago_realizado', orden.numero, t.numero),
                  fecha,
                  usuario_id: currentUserId,
                  estado: 'cerrado',
                  estado_fecha: ahora,
                  ...montosCcPorMoneda(monInt, monto),
                });
              }
              // Int→Pandy (ingreso): +montoEfectivoInt. La comisión intermediario se agrega en el bloque único después del forEach (INCLUIR EN MOV DE CC INTERMEDIARIO = Y, celeste).
              if (cob === 'pandy' && pag === 'intermediario') {
                const monInt = orden.moneda_recibida || mon || 'ARS';
                rowsCcInt.push({
                  intermediario_id: intermediarioId,
                  orden_id: ordenId,
                  transaccion_id: transaccionId,
                  transaccion_numero: t.numero != null ? t.numero : null,
                  moneda: monInt,
                  monto: montoEfectivoInt,
                  concepto: conceptoCcLeyenda('cobro_realizado', orden.numero, t.numero),
                  fecha,
                  usuario_id: currentUserId,
                  estado: 'cerrado',
                  estado_fecha: ahora,
                  ...montosCcPorMoneda(monInt, montoEfectivoInt),
                });
              }
              if (cob === 'cliente' && pag === 'intermediario') {
                rowsCcInt.push({
                  intermediario_id: intermediarioId,
                  orden_id: ordenId,
                  transaccion_id: transaccionId,
                  transaccion_numero: t.numero != null ? t.numero : null,
                  moneda: mon,
                  monto: -monto,
                  concepto: conceptoCcLeyenda('compromiso_pago', orden.numero, t.numero),
                  fecha,
                  usuario_id: currentUserId,
                  estado: 'cerrado',
                  estado_fecha: ahora,
                  ...montosCcPorMoneda(mon, -monto),
                });
              }
              if (cob === 'intermediario' && pag === 'cliente') {
                rowsCcInt.push({
                  intermediario_id: intermediarioId,
                  orden_id: ordenId,
                  transaccion_id: transaccionId,
                  transaccion_numero: t.numero != null ? t.numero : null,
                  moneda: mon,
                  monto: -monto,
                  concepto: conceptoCcLeyenda('pago_realizado', orden.numero, t.numero),
                  fecha,
                  usuario_id: currentUserId,
                  estado: 'cerrado',
                  estado_fecha: ahora,
                  ...montosCcPorMoneda(mon, -monto),
                });
              }
            }
          });

          // Motor único: filas en `reglas_de_negocio` para (codigo, usa_intermediario).
          if (usarMotorReglasNegocio) {
            aplicarMotorCcDesdeReglasDeNegocio({
              tipoOperacionCodigo: codNorm,
              transacciones,
              reglasDeNegocio,
              orden,
              clienteId,
              intermediarioId,
              ordenId,
              rowsCcCliente,
              rowsCcInt,
              fecha,
              ahora,
              comisionPandyMonto,
              comisionPandyMon,
              comisionIntMonto,
              comisionIntMon,
              montoEfectivoInt,
            });
          } else if (esTipoOperacionChequeArs(codigoOrdenRaw, toJoin?.moneda_in, toJoin?.moneda_out) && orden.intermediario_id) {
            const tx1EjecutadaFb = transacciones.some((t) => (t.tipo || '').toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'cliente' && String(t.cobrador || '').toLowerCase() === 'pandy' && (t.estado || '').toLowerCase() === 'ejecutada');
            const tx2EjecutadaFb = transacciones.some((t) => (t.tipo || '').toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'cliente' && (t.estado || '').toLowerCase() === 'ejecutada');
            const parClienteCerradoFb = tx1EjecutadaFb && tx2EjecutadaFb;
            if (clienteId && comisionPandyMonto >= 1e-6 && !parClienteCerradoFb) {
              rowsCcCliente.push({ cliente_id: clienteId, orden_id: ordenId, transaccion_id: null, transaccion_numero: null, concepto: conceptoCcLeyenda('comision_acuerdo', orden.numero, null), fecha, usuario_id: currentUserId, moneda: comisionPandyMon, monto: comisionPandyMonto, estado: 'cerrado', estado_fecha: ahora, ...montosCcPorMoneda(comisionPandyMon, comisionPandyMonto) });
            }
            const hayTx3Ejecutada = transacciones.some((t) => (t.tipo || '').toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario' && (t.estado || '').toLowerCase() === 'ejecutada');
            const hayTx4Ejecutada = transacciones.some((t) => (t.tipo || '').toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'intermediario' && String(t.cobrador || '').toLowerCase() === 'pandy' && (t.estado || '').toLowerCase() === 'ejecutada');
            if (intermediarioId && comisionIntMonto >= 1e-6 && (hayTx3Ejecutada || hayTx4Ejecutada || parClienteCerradoFb)) {
              rowsCcInt.push({ intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: null, transaccion_numero: null, concepto: conceptoCcLeyenda('comision_acuerdo', orden.numero, null), fecha, usuario_id: currentUserId, moneda: comisionIntMon, monto: -comisionIntMonto, estado: 'cerrado', estado_fecha: ahora, ...montosCcPorMoneda(comisionIntMon, -comisionIntMonto) });
            }
            if (intermediarioId && comisionIntMonto >= 1e-6 && parClienteCerradoFb) {
              const monComCajaFb = (comisionIntMon || 'ARS').toUpperCase();
              rowsCaja.push({
                orden_id: ordenId,
                transaccion_id: null,
                moneda: monComCajaFb,
                monto: -comisionIntMonto,
                caja_tipo: 'efectivo',
                orden_numero: orden.numero != null ? orden.numero : null,
                transaccion_numero: null,
                concepto: conceptoCajaTransaccionEspecial('Comisión del acuerdo', monComCajaFb, comisionIntMonto, orden.numero, null),
                fecha,
                usuario_id: currentUserId,
              });
            }
          }

          // Cierre sintético dos monedas: solo si no corre el motor `reglas_de_negocio` (evita duplicar cierre ya modelado en reglas).
          if (clienteId && monR !== monE && !usarMotorReglasNegocio) {
            const ingresosCli = transacciones.filter((t) => (t.tipo || '').toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'cliente' && String(t.cobrador || '').toLowerCase() === 'pandy' && t.estado === 'ejecutada');
            const egresosCli = transacciones.filter((t) => (t.tipo || '').toLowerCase() === 'egreso' && String(t.cobrador || '').toLowerCase() === 'cliente' && String(t.pagador || '').toLowerCase() === 'pandy' && t.estado === 'ejecutada');
            const montoRecibido = ingresosCli.reduce((s, t) => s + (Number(t.monto) || 0), 0);
            const montoEntregado = egresosCli.reduce((s, t) => s + (Number(t.monto) || 0), 0);
            const egresoRef = egresosCli.slice().sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0)).pop() || null;
            if (montoRecibido >= 1e-6 && montoEntregado >= 1e-6) {
              const conceptoCierre = 'Cierre orden ' + (orden.numero != null ? orden.numero : ordenId);
              // Saldo real = -montoRecibido + montoEntregado. Cierre: +montoRecibido y -montoEntregado para total 0.
              // Varios ingresos/egresos parciales (ej. 5k efectivo + 5k transferencia): se suman todos; ref. de nro. trans. = último egreso.
              rowsCcCliente.push({
                cliente_id: clienteId,
                orden_id: ordenId,
                transaccion_id: egresoRef != null ? egresoRef.id : null,
                transaccion_numero: egresoRef && egresoRef.numero != null ? egresoRef.numero : null,
                concepto: conceptoCierre,
                fecha,
                usuario_id: currentUserId,
                moneda: monR,
                monto: montoRecibido,
                estado: 'cerrado',
                estado_fecha: ahora,
                ...montosCcPorMoneda(monR, montoRecibido),
              });
              rowsCcCliente.push({
                cliente_id: clienteId,
                orden_id: ordenId,
                transaccion_id: egresoRef != null ? egresoRef.id : null,
                transaccion_numero: egresoRef && egresoRef.numero != null ? egresoRef.numero : null,
                concepto: conceptoCierre,
                fecha,
                usuario_id: currentUserId,
                moneda: monE,
                monto: -montoEntregado,
                estado: 'cerrado',
                estado_fecha: ahora,
                ...montosCcPorMoneda(monE, -montoEntregado),
              });
            }
          }

          // Misma moneda con comisión implícita (mr > me): el ingreso ya aportó -me y el egreso +me, saldo = 0. No se añade movimiento extra en CC.
          // La caja ya tiene +mr (ingreso) y -me (egreso); la diferencia es la comisión. Opcional: movimiento caja explícito por comisión si se desea desglose.

          // Evitar duplicados: clave debe distinguir dos líneas válidas con mismo monto (p. ej. ARS-USD inversa P,E: +me USD en Tx1 pendiente y en Tx2 ejecutada).
          const seenCli = new Set();
          const rowsCcClienteUnicos = (rowsCcCliente || []).filter((r) => {
            const key = [
              r.cliente_id,
              r.orden_id,
              r.transaccion_id || '',
              r.transaccion_numero != null && r.transaccion_numero !== '' ? String(r.transaccion_numero) : '',
              (r.moneda || '').toUpperCase(),
              r.monto,
              (r.concepto || '').slice(0, 72),
            ].join('\t');
            if (seenCli.has(key)) return false;
            seenCli.add(key);
            return true;
          });
          const seenInt = new Set();
          const rowsCcIntUnicos = (rowsCcInt || []).filter((r) => {
            const key = [
              r.intermediario_id,
              r.orden_id,
              r.transaccion_id || '',
              r.transaccion_numero != null && r.transaccion_numero !== '' ? String(r.transaccion_numero) : '',
              (r.moneda || '').toUpperCase(),
              r.monto,
              (r.concepto || '').slice(0, 72),
            ].join('\t');
            if (seenInt.has(key)) return false;
            seenInt.add(key);
            return true;
          });
          const idsTrx = transacciones.map((t) => t.id).filter(Boolean);
          return client.rpc('sync_cc_caja_orden', {
            p_orden_id: ordenId,
            p_usuario_id: currentUserId,
            p_rows_cc_cliente: rowsCcClienteUnicos,
            p_rows_cc_int: rowsCcIntUnicos,
            p_rows_caja: rowsCaja,
          }).then((rRpc) => {
            if (rRpc.error) {
              console.warn('sync_cc_caja_orden:', rRpc.error.message || rRpc.error);
              return fallbackSyncCcCaja(ordenId, idsTrx, rowsCcClienteUnicos, rowsCcIntUnicos, rowsCaja)
                .catch((e) => {
                  showToast('Error al guardar movimientos de CC (orden ' + (orden.numero || ordenId) + '): ' + (e && (e.message || e.details) || String(e)), 'error', 8000);
                  throw e;
                });
            }
            return Promise.resolve();
          });
        });
      });
    });
    })
    .catch((err) => {
      console.warn('sincronizarCcYCajaDesdeOrden:', err && (err.message || err.code));
      showToast('Error al sincronizar CC para una orden: ' + (err && (err.message || err.details) || String(err)), 'error', 6000);
      return Promise.resolve();
    });
}

/** Fallback cuando la RPC sync_cc_caja_orden no existe o falla: delete + insert desde el cliente (mismo resultado, sin atomicidad en una transacción). */
function fallbackSyncCcCaja(ordenId, idsTrx, rowsCcCliente, rowsCcInt, rowsCaja) {
  const promDelCc = client.from('movimientos_cuenta_corriente').delete().eq('orden_id', ordenId);
  const promDelCcInt = client.from('movimientos_cuenta_corriente_intermediario').delete().eq('orden_id', ordenId);
  const promDelCajaTrx = (idsTrx && idsTrx.length > 0)
    ? client.from('movimientos_caja').delete().in('transaccion_id', idsTrx)
    : Promise.resolve();
  const promDelCajaComision = client.from('movimientos_caja').delete().eq('orden_id', ordenId).is('transaccion_id', null);
  return Promise.all([promDelCc, promDelCcInt, promDelCajaTrx, promDelCajaComision]).then(() => {
    const inserts = [];
    (rowsCcCliente || []).forEach((row) => inserts.push(client.from('movimientos_cuenta_corriente').insert(row)));
    (rowsCcInt || []).forEach((row) => inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert(row)));
    (rowsCaja || []).forEach((row) => inserts.push(client.from('movimientos_caja').insert(row)));
    if (inserts.length === 0) return Promise.resolve();
    return Promise.all(inserts);
  });
}

/** Tabla orden_comisiones_generadas: una fila por (orden_id, tipo) evita duplicar Ganancia Pandy y Comisión intermediario al re-ejecutar. */

function asegurarGananciaPandy(ordenId, instrumentacionId, orden, clienteId, comisionPandyMonto, listTrx) {
  if (!ordenId || !instrumentacionId || !clienteId || !comisionPandyMonto || comisionPandyMonto < 1e-6) return Promise.resolve();
  return client.from('orden_comisiones_generadas').select('id').eq('orden_id', ordenId).eq('tipo', 'ganancia_pandy').maybeSingle()
    .then((r) => {
      if (r.data && r.data.id) return Promise.resolve();
      const ahora = new Date().toISOString();
      const fecha = ahora.slice(0, 10);
      const monedaCom = orden.moneda_recibida || 'ARS';
      return client.from('modos_pago').select('id').eq('codigo', 'efectivo').maybeSingle()
        .then((rModo) => {
          const modoId = (rModo.data && rModo.data.id) || null;
          return client.from('transacciones').insert({
            instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoId, moneda: monedaCom, monto: comisionPandyMonto,
            cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'ejecutada', concepto: 'Ganancia del acuerdo',
            tipo_cambio: null, fecha_ejecucion: fecha, usuario_id: currentUserId, updated_at: ahora,
          }).select('id, numero').single();
        })
        .then((rNew) => {
          const trId = rNew.data && rNew.data.id;
          const trNumero = rNew.data && rNew.data.numero;
          if (!trId) return Promise.resolve();
          const candidatos = (listTrx || []).filter((tr) => tr.tipo === 'ingreso' && tr.pagador === 'cliente' && tr.cobrador === 'pandy' && tr.estado === 'ejecutada' && !(tr.concepto || '').includes('Ganancia'));
          const trToReduce = candidatos.reduce((best, tr) => {
            const m = Number(tr.monto) || 0;
            if (m <= comisionPandyMonto + 1e-6) return best;
            if (!best || m > Number(best.monto || 0)) return tr;
            return best;
          }, null);
          const transaccionIdReducida = trToReduce && trToReduce.id ? trToReduce.id : null;
          const conceptoGanancia = conceptoCajaTransaccionEspecial('Ganancia del acuerdo', monedaCom, comisionPandyMonto, orden.numero, trNumero);
          return client.from('movimientos_caja').insert({
            moneda: monedaCom, monto: comisionPandyMonto, caja_tipo: 'efectivo', transaccion_id: trId,
            orden_numero: orden.numero != null ? orden.numero : null, transaccion_numero: trNumero != null ? trNumero : null,
            concepto: conceptoGanancia, fecha, usuario_id: currentUserId,
          }).then(() => {
            const monR = (orden.moneda_recibida || 'USD').toUpperCase();
            const monE = (orden.moneda_entregada || 'USD').toUpperCase();
            const montosPos = montosCcPorMoneda(monedaCom, comisionPandyMonto);
            const montosNeg = montosCcPorMoneda(monedaCom, -comisionPandyMonto);
            if (monR === monE) {
              return client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, orden_id: ordenId, transaccion_id: trId, transaccion_numero: trNumero != null ? trNumero : null,
                concepto: 'Ganancia del acuerdo',
                moneda: monedaCom, monto: comisionPandyMonto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                monto_usd: montosPos.monto_usd, monto_ars: montosPos.monto_ars, monto_eur: montosPos.monto_eur,
              }).then(() => client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, orden_id: ordenId, transaccion_id: trId, transaccion_numero: trNumero != null ? trNumero : null,
                concepto: conceptoCcLeyenda('comision_acuerdo', orden.numero, trNumero),
                moneda: monedaCom, monto: -comisionPandyMonto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                monto_usd: montosNeg.monto_usd, monto_ars: montosNeg.monto_ars, monto_eur: montosNeg.monto_eur,
              }));
            }
            return client.from('movimientos_cuenta_corriente').insert({
              cliente_id: clienteId, orden_id: ordenId, transaccion_id: trId, transaccion_numero: trNumero != null ? trNumero : null,
              concepto: 'Ganancia del acuerdo',
              moneda: monedaCom, monto: comisionPandyMonto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
              monto_usd: montosPos.monto_usd, monto_ars: montosPos.monto_ars, monto_eur: montosPos.monto_eur,
            });
          }).then(() => client.from('orden_comisiones_generadas').insert({
            orden_id: ordenId, tipo: 'ganancia_pandy', transaccion_id: trId, transaccion_id_reducida: transaccionIdReducida || null,
          })).then(() => {
            if (!trToReduce || !transaccionIdReducida) return Promise.resolve();
            const nuevoMonto = Math.max(0, Number(trToReduce.monto) - comisionPandyMonto);
            if (nuevoMonto < 1e-6) return Promise.resolve();
            return client.from('transacciones').update({ monto: nuevoMonto, updated_at: ahora }).eq('id', trToReduce.id)
              .then(() => client.from('movimientos_caja').select('id, monto').eq('transaccion_id', trToReduce.id).limit(1).maybeSingle())
              .then((rC) => {
                if (rC.data) {
                  const signo = (Number(rC.data.monto) || 0) >= 0 ? 1 : -1;
                  return client.from('movimientos_caja').update({ monto: signo * Math.max(0, Math.abs(Number(rC.data.monto) || 0) - comisionPandyMonto) }).eq('id', rC.data.id);
                }
                return Promise.resolve();
              })
              .then(() => {
                return client.from('movimientos_cuenta_corriente').select('id, monto_usd, monto_ars, monto_eur').eq('orden_id', ordenId).eq('cliente_id', clienteId).eq('transaccion_id', trToReduce.id).limit(1).maybeSingle()
                  .then((rCc) => {
                    if (!rCc.data) return Promise.resolve();
                    const monR = (orden.moneda_recibida || 'USD').toUpperCase();
                    const monE = (orden.moneda_entregada || 'USD').toUpperCase();
                    const restar = comisionPandyMonto;
                    const updates = {};
                    if (monR === 'USD' && (rCc.data.monto_usd != null || rCc.data.monto_usd === 0)) updates.monto_usd = Math.max(-1e9, (Number(rCc.data.monto_usd) || 0) - restar);
                    if (monR === 'ARS' && (rCc.data.monto_ars != null || rCc.data.monto_ars === 0)) updates.monto_ars = Math.max(-1e9, (Number(rCc.data.monto_ars) || 0) - restar);
                    if (monR === 'EUR' && (rCc.data.monto_eur != null || rCc.data.monto_eur === 0)) updates.monto_eur = Math.max(-1e9, (Number(rCc.data.monto_eur) || 0) - restar);
                    if (Object.keys(updates).length === 0) return Promise.resolve();
                    return client.from('movimientos_cuenta_corriente').update(updates).eq('id', rCc.data.id);
                  });
              });
          });
        });
    });
}

function revertirGananciaPandy(ordenId, orden, clienteId, comisionPandyMonto) {
  if (!ordenId) return Promise.resolve();
  return client.from('orden_comisiones_generadas').select('transaccion_id, transaccion_id_reducida').eq('orden_id', ordenId).eq('tipo', 'ganancia_pandy').maybeSingle()
    .then((r) => {
      if (!r.data || !r.data.transaccion_id) return Promise.resolve();
      const trId = r.data.transaccion_id;
      const trReducidaId = r.data.transaccion_id_reducida || null;
      const monR = orden && (orden.moneda_recibida || 'USD').toUpperCase();
      const monE = orden && (orden.moneda_entregada || 'USD').toUpperCase();
      const restaurar = trReducidaId && orden && clienteId && comisionPandyMonto >= 1e-6
        ? client.from('transacciones').select('monto').eq('id', trReducidaId).maybeSingle()
            .then((rTr) => {
              if (!rTr.data) return Promise.resolve();
              const montoActual = Number(rTr.data.monto) || 0;
              return client.from('transacciones').update({ monto: montoActual + comisionPandyMonto, updated_at: new Date().toISOString() }).eq('id', trReducidaId)
                .then(() => client.from('movimientos_caja').select('id, monto').eq('transaccion_id', trReducidaId).limit(1).maybeSingle())
                .then((rC) => {
                  if (rC.data) {
                    const signo = (Number(rC.data.monto) || 0) >= 0 ? 1 : -1;
                    return client.from('movimientos_caja').update({ monto: signo * (Math.abs(Number(rC.data.monto) || 0) + comisionPandyMonto) }).eq('id', rC.data.id);
                  }
                  return Promise.resolve();
                })
                .then(() => {
                  return client.from('movimientos_cuenta_corriente').select('id, monto_usd, monto_ars, monto_eur').eq('orden_id', ordenId).eq('cliente_id', clienteId).eq('transaccion_id', trReducidaId).limit(1).maybeSingle()
                    .then((rCc) => {
                      if (!rCc.data) return Promise.resolve();
                      const monR = orden && (orden.moneda_recibida || 'USD').toUpperCase();
                      const sumar = comisionPandyMonto;
                      const updates = {};
                      if (monR === 'USD' && (rCc.data.monto_usd != null || rCc.data.monto_usd === 0)) updates.monto_usd = (Number(rCc.data.monto_usd) || 0) + sumar;
                      if (monR === 'ARS' && (rCc.data.monto_ars != null || rCc.data.monto_ars === 0)) updates.monto_ars = (Number(rCc.data.monto_ars) || 0) + sumar;
                      if (monR === 'EUR' && (rCc.data.monto_eur != null || rCc.data.monto_eur === 0)) updates.monto_eur = (Number(rCc.data.monto_eur) || 0) + sumar;
                      if (Object.keys(updates).length === 0) return Promise.resolve();
                      return client.from('movimientos_cuenta_corriente').update(updates).eq('id', rCc.data.id);
                    });
                });
            })
        : Promise.resolve();
      return restaurar.then(() => client.from('movimientos_cuenta_corriente').delete().eq('transaccion_id', trId))
        .then(() => client.from('movimientos_caja').delete().eq('transaccion_id', trId))
        .then(() => client.from('transacciones').delete().eq('id', trId))
        .then(() => client.from('orden_comisiones_generadas').delete().eq('orden_id', ordenId).eq('tipo', 'ganancia_pandy'));
    });
}

/** Comisión intermediario: solo caja (sin fila en `transacciones`). La CC de comisión ya la inserta el flujo que ejecuta la transacción cliente↔Pandy. Requiere migración `sql/migracion_orden_comisiones_movimiento_caja.sql` para `movimiento_caja_id` y `transaccion_id` nullable. */
function asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, montoCom, monCom, ordenNumero, transaccionNumeroRef) {
  void instrumentacionId;
  if (!ordenId || !intermediarioId || !montoCom || montoCom < 1e-6) return Promise.resolve();
  const ordNum = ordenNumero != null ? ordenNumero : null;
  const nroRef = transaccionNumeroRef != null ? transaccionNumeroRef : null;
  return client.from('orden_comisiones_generadas').select('id').eq('orden_id', ordenId).eq('tipo', 'comision_intermediario').maybeSingle()
    .then((r) => {
      if (r.data && r.data.id) return Promise.resolve();
      const fecha = new Date().toISOString().slice(0, 10);
      const conceptoCom = conceptoCajaTransaccionEspecial('Comisión del acuerdo', monCom, montoCom, ordNum, nroRef);
      return client.from('movimientos_caja').insert({
        orden_id: ordenId,
        moneda: monCom,
        monto: -montoCom,
        caja_tipo: 'efectivo',
        transaccion_id: null,
        orden_numero: ordNum,
        transaccion_numero: nroRef,
        concepto: conceptoCom,
        fecha,
        usuario_id: currentUserId,
      }).select('id').single()
        .then((rCaja) => {
          const mcId = rCaja.data && rCaja.data.id;
          const row = { orden_id: ordenId, tipo: 'comision_intermediario', transaccion_id: null };
          if (mcId) row.movimiento_caja_id = mcId;
          return client.from('orden_comisiones_generadas').insert(row);
        });
    });
}

function revertirComisionIntermediario(ordenId) {
  if (!ordenId) return Promise.resolve();
  return client.from('orden_comisiones_generadas').select('transaccion_id, movimiento_caja_id').eq('orden_id', ordenId).eq('tipo', 'comision_intermediario').maybeSingle()
    .then((r) => {
      if (!r.data) return Promise.resolve();
      const trId = r.data.transaccion_id;
      const mcId = r.data.movimiento_caja_id;
      const delRow = () => client.from('orden_comisiones_generadas').delete().eq('orden_id', ordenId).eq('tipo', 'comision_intermediario');
      if (trId) {
        return client.from('movimientos_cuenta_corriente_intermediario').delete().eq('transaccion_id', trId)
          .then(() => client.from('movimientos_caja').delete().eq('transaccion_id', trId))
          .then(() => client.from('transacciones').delete().eq('id', trId))
          .then(() => delRow());
      }
      if (mcId) {
        return client.from('movimientos_caja').delete().eq('id', mcId).then(() => delRow());
      }
      return delRow();
    });
}

/**
 * Momento cero CC intermediario (CHEQUE + int.): referencia transacciones Cliente↔Pandy (Tx1/Tx2) para conceptos;
 * el circuito Pandy↔Intermediario (Tx3/Tx4) se instrumenta aparte.
 * transIngresoClienteId = ingreso cheque Cliente→Pandy; transEgresoClienteId = egreso efectivo Pandy→Cliente.
 */
function insertarMovimientosCcMomentoCeroIntermediario(ordenId, orden, transIngresoClienteId, transEgresoClienteId) {
  const intermediarioId = orden.intermediario_id;
  if (!intermediarioId || !ordenId || !currentUserId || !transIngresoClienteId || !transEgresoClienteId) return Promise.resolve();
  const mr = Number(orden.monto_recibido) || 0;
  const monR = orden.moneda_recibida || 'ARS';
  if (mr < 1e-6) return Promise.resolve();
  const fecha = new Date().toISOString().slice(0, 10);
  return client.from('ordenes').select('numero').eq('id', ordenId).single()
    .then((rOrd) => rOrd.data?.numero)
    .then((ordenNum) =>
      client.from('transacciones').select('id, numero').in('id', [transIngresoClienteId, transEgresoClienteId]).then((rTr) => {
        const trs = rTr.data || [];
        const nroIngresoCli = trs.find((x) => x.id === transIngresoClienteId)?.numero;
        const nroEgresoCli = trs.find((x) => x.id === transEgresoClienteId)?.numero;
        const conceptoDebe = conceptoCcLeyenda('compromiso_pago', ordenNum, nroIngresoCli);
        const conceptoComp = conceptoCcLeyenda('compromiso_cobrar', ordenNum, nroEgresoCli);
      const row1 = {
        intermediario_id: intermediarioId,
        orden_id: ordenId,
        transaccion_id: transIngresoClienteId,
        transaccion_numero: nroIngresoCli != null ? nroIngresoCli : null,
        concepto: conceptoDebe,
        moneda: monR,
        monto: -mr,
        monto_usd: numCc(monR === 'USD' ? -mr : 0),
        monto_ars: numCc(monR === 'ARS' ? -mr : 0),
        monto_eur: numCc(monR === 'EUR' ? -mr : 0),
        fecha,
        usuario_id: currentUserId,
        estado: 'pendiente',
      };
      const row2 = {
        intermediario_id: intermediarioId,
        orden_id: ordenId,
        transaccion_id: transEgresoClienteId,
        transaccion_numero: nroEgresoCli != null ? nroEgresoCli : null,
        concepto: conceptoComp,
        moneda: monR,
        monto: mr,
        monto_usd: numCc(monR === 'USD' ? mr : 0),
        monto_ars: numCc(monR === 'ARS' ? mr : 0),
        monto_eur: numCc(monR === 'EUR' ? mr : 0),
        fecha,
        usuario_id: currentUserId,
        estado: 'pendiente',
      };
      return Promise.all([
        client.from('movimientos_cuenta_corriente_intermediario').insert(row1),
        client.from('movimientos_cuenta_corriente_intermediario').insert(row2),
      ]);
    })
  ).then(() => {}).catch((err) => {
    console.warn('insertarMovimientosCcMomentoCeroIntermediario:', err && (err.message || err.code));
    throw err;
  });
}

/**
 * Operación CHEQUE (ARS) con intermediario: 4 transacciones por defecto (instrumentación explícita).
 * 1) Ingreso cheque Cliente→Pandy · 2) Egreso efectivo Pandy→Cliente · 3) Egreso cheque Pandy→Intermediario ·
 * 4) Ingreso efectivo Intermediario→Pandy (monto neto con tasa). No son compensatorias automáticas al editar.
 * Momento cero CC cliente e intermediario anclado a Tx1/Tx2.
 */
function autoCompletarInstrumentacionChequeConIntermediario(ordenId, instrumentacionId, orden) {
  if (!ordenId || !instrumentacionId || !orden || !orden.intermediario_id || !orden.tipo_operacion_id) return Promise.resolve();
  const mr = Number(orden.monto_recibido) || 0;
  const me = Number(orden.monto_entregado) || 0;
  const tasa = Number(orden.tasa_descuento_intermediario);
  const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;
  return client.from('modos_pago').select('id, codigo').in('codigo', ['efectivo', 'cheque']).then((rModos) => {
    const byCodigo = {};
    (rModos.data || []).forEach((m) => { byCodigo[m.codigo] = m.id; });
    const modoEfectivoId = byCodigo.efectivo;
    const modoChequeId = byCodigo.cheque;
    if (!modoEfectivoId || !modoChequeId) return Promise.resolve();
    const ahora = new Date().toISOString();
    const row1 = { instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoChequeId, moneda: 'ARS', monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora };
    const row2 = { instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoEfectivoId, moneda: 'ARS', monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora };
    const row3 = { instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoChequeId, moneda: 'ARS', monto: mr, cobrador: 'intermediario', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora };
    const row4 = { instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoEfectivoId, moneda: 'ARS', monto: montoEfectivoInt, cobrador: 'pandy', pagador: 'intermediario', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora };
    const rows = [row1, row2, row3, row4];
    return rows.reduce((prom, row) => prom.then((ids) =>
      client.from('transacciones').insert(row).select('id').single().then((rIns) => {
        const id = rIns.data && rIns.data.id;
        return id ? ids.concat([id]) : ids;
      })
    ), Promise.resolve([])).then((ids) => {
      const id1 = ids[0];
      const id2 = ids[1];
      if (!id1 || !id2 || ids.length < 4) return actualizarEstadoOrden(ordenId);
      return insertarMovimientosCcMomentoCero(ordenId, orden, id1, id2)
        .then(() => insertarMovimientosCcMomentoCeroIntermediario(ordenId, orden, id1, id2))
        .then(() => actualizarEstadoOrden(ordenId));
    });
  });
}

/**
 * Inserta en movimientos_cuenta_corriente los registros "momento cero" (regla simple):
 * un registro por moneda del compromiso, concepto "Compromiso - Orden Nro X y Trans Nro Y".
 * Cada fila impacta solo una moneda. orden: { cliente_id, numero, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado }.
 */
function insertarMovimientosCcMomentoCero(ordenId, orden, ingresoId, egresoId) {
  const clienteId = orden.cliente_id;
  if (!clienteId || !ordenId || !currentUserId) return Promise.resolve();
  const monR = orden.moneda_recibida || 'USD';
  const monE = orden.moneda_entregada || 'USD';
  const mr = Number(orden.monto_recibido) || 0;
  const me = Number(orden.monto_entregado) || 0;
  const fecha = new Date().toISOString().slice(0, 10);
  const ahora = new Date().toISOString();

  return client.from('transacciones').select('id, numero').in('id', [ingresoId, egresoId]).then((rTr) => {
      const trs = rTr.data || [];
      const nroIngreso = trs.find((x) => x.id === ingresoId)?.numero;
      const nroEgreso = trs.find((x) => x.id === egresoId)?.numero;
      const ordenNum = orden.numero != null ? orden.numero : null;
      const conceptoMonR = conceptoCcLeyenda('compromiso_pago', ordenNum, nroIngreso);
      const conceptoMonE = conceptoCcLeyenda('compromiso_cobrar', ordenNum, nroEgreso);
      // Una fila por moneda: solo esa moneda con valor; el resto 0.
      const rowMonR = {
        cliente_id: clienteId,
        orden_id: ordenId,
        transaccion_id: ingresoId,
        transaccion_numero: nroIngreso != null ? nroIngreso : null,
        concepto: conceptoMonR,
        fecha,
        usuario_id: currentUserId,
        moneda: monR,
        monto: -mr,
        monto_usd: numCc(monR === 'USD' ? -mr : 0),
        monto_ars: numCc(monR === 'ARS' ? -mr : 0),
        monto_eur: numCc(monR === 'EUR' ? -mr : 0),
      };
      const rowMonE = {
        cliente_id: clienteId,
        orden_id: ordenId,
        transaccion_id: egresoId,
        transaccion_numero: nroEgreso != null ? nroEgreso : null,
        concepto: conceptoMonE,
        fecha,
        usuario_id: currentUserId,
        moneda: monE,
        monto: -me,
        monto_usd: numCc(monE === 'USD' ? -me : 0),
        monto_ars: numCc(monE === 'ARS' ? -me : 0),
        monto_eur: numCc(monE === 'EUR' ? -me : 0),
      };
      return Promise.all([
        client.from('movimientos_cuenta_corriente').insert(rowMonR),
        client.from('movimientos_cuenta_corriente').insert(rowMonE),
      ]);
    }).catch((err) => {
    console.warn('insertarMovimientosCcMomentoCero:', err && (err.message || err.code));
    return Promise.resolve();
  });
}

/**
 * Si la orden es sin intermediario y la instrumentación está vacía, crea dos transacciones por defecto
 * (ingreso moneda recibida, egreso moneda entregada). Por **monedas del tipo** (IN/OUT), no solo por código:
 * USD-USD, cualquier cruce fiat+USD (ARS, EUR, … vía patronTipoCambioOrden) y CHEQUE-ARS (ARS/ARS vía cheque).
 * Modo de pago efectivo, estado pendiente.
 */
function autoCompletarInstrumentacionSinIntermediario(ordenId, instrumentacionId, orden) {
  if (!ordenId || !instrumentacionId || !orden || !orden.tipo_operacion_id) return Promise.resolve();
  return client.from('tipos_operacion').select('codigo, moneda_in, moneda_out').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
    const row = rTipo.data || {};
    const codigo = row.codigo || '';
    // Con intermediario no entra aquí (par+USD+int → autoCompletarInstrumentacionUsdUsdConIntermediario; CHEQUE-ARS+int → cheque 4 tx).
    if (orden.intermediario_id) return Promise.resolve();
    const mi = (row.moneda_in || '').toString().toUpperCase().trim();
    const mo = (row.moneda_out || '').toString().toUpperCase().trim();
    const patronTc = patronTipoCambioOrden(mi, mo);
    const esUsdUsd = mi === 'USD' && mo === 'USD';
    const esArsArs = esTipoOperacionChequeArs(codigo, row.moneda_in, row.moneda_out);
    if (!esUsdUsd && !esArsArs && !patronTc) return Promise.resolve();
    if (patronTc && !(Number(orden.cotizacion) > 0)) return Promise.resolve();
    return client.from('modos_pago').select('id').eq('codigo', 'efectivo').maybeSingle().then((rModo) => {
      const modoPagoEfectivoId = (rModo.data && rModo.data.id) || null;
      if (!modoPagoEfectivoId) return Promise.resolve();
      const mr = Number(orden.monto_recibido) || 0;
      const me = Number(orden.monto_entregado) || 0;
      const monR = orden.moneda_recibida || 'USD';
      const monE = orden.moneda_entregada || 'USD';
      const cotizacion = Number(orden.cotizacion) || null;
      const ahora = new Date().toISOString();
      const rows = [];
      if (esUsdUsd) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
      } else if (esArsArs) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: 'ARS', monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: 'ARS', monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
      } else if (esPatronCompraFiatConTc(patronTc)) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: cotizacion, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
      } else if (esPatronVendeFiatConTc(patronTc)) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: cotizacion, updated_at: ahora });
      }
      // Orden por pagador (Cliente, Pandy). Insertar en secuencia para que numero quede 1, 2.
      return rows.reduce((prom, row) => prom.then(() => client.from('transacciones').insert(row).select('id').single()), Promise.resolve()).then(() => {
        return actualizarEstadoOrden(ordenId);
      });
    });
  });
}

/**
 * Patrón de instrumentación con intermediario elegido en el wizard (`cp_ic` | `ci_pc`). Fuera del wizard (panel) se fuerza `cp_ic` al autocompletar.
 */
function getOrdenPatronInstrumentacionInt() {
  const hid = document.getElementById('orden-int-patron');
  const v = hid && String(hid.value || '').trim().toLowerCase();
  return v === 'ci_pc' ? 'ci_pc' : 'cp_ic';
}

/**
 * Par cliente con intermediario: 2 transacciones (mismo patrón que USD-USD+int) para USD-USD o cualquier cruce fiat+USD según moneda_in/out.
 * - `cp_ic` (defecto): ingreso Cliente→Pandy (mr), egreso Intermediario→Cliente (me).
 * - `ci_pc`: ingreso Cliente→Intermediario (mr), egreso Pandy→Cliente (me).
 * Cruce con USD: `tipo_cambio` en la pata que corresponde (compra_usd / vende_usd). No aplica a CHEQUE-ARS.
 * @param {string} [patron] Si no se pasa, se usa `getOrdenPatronInstrumentacionInt()` en contexto wizard.
 */
function autoCompletarInstrumentacionUsdUsdConIntermediario(ordenId, instrumentacionId, orden, patron) {
  if (!ordenId || !instrumentacionId || !orden || !orden.intermediario_id || !orden.tipo_operacion_id) return Promise.resolve();
  const pat = patron || (typeof document !== 'undefined' ? getOrdenPatronInstrumentacionInt() : 'cp_ic');
  return client.from('tipos_operacion').select('codigo, moneda_in, moneda_out').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
    const rowTipo = rTipo.data || {};
    const codigoTipo = rowTipo.codigo || '';
    if (esTipoOperacionChequeArs(codigoTipo, rowTipo.moneda_in, rowTipo.moneda_out)) return Promise.resolve();
    const mi = (rowTipo.moneda_in || '').toString().toUpperCase().trim();
    const mo = (rowTipo.moneda_out || '').toString().toUpperCase().trim();
    const patronTc = patronTipoCambioOrden(mi, mo);
    const esUsdUsd = mi === 'USD' && mo === 'USD';
    if (!esUsdUsd && !patronTc) return Promise.resolve();
    const cotizacion = Number(orden.cotizacion) || null;
    if (patronTc && !(cotizacion > 0)) return Promise.resolve();
    let tcIngreso = null;
    let tcEgreso = null;
    if (esPatronCompraFiatConTc(patronTc)) tcIngreso = cotizacion;
    else if (esPatronVendeFiatConTc(patronTc)) tcEgreso = cotizacion;
    return client.from('modos_pago').select('id').eq('codigo', 'efectivo').maybeSingle().then((rModo) => {
      const modoPagoEfectivoId = (rModo.data && rModo.data.id) || null;
      if (!modoPagoEfectivoId) return Promise.resolve();
      const mr = Number(orden.monto_recibido) || 0;
      const me = Number(orden.monto_entregado) || 0;
      const monR = orden.moneda_recibida || 'USD';
      const monE = orden.moneda_entregada || 'USD';
      const ahora = new Date().toISOString();
      const rows = pat === 'ci_pc'
        ? [
            { instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'intermediario', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: tcIngreso, updated_at: ahora },
            { instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: tcEgreso, updated_at: ahora },
          ]
        : [
            { instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: tcIngreso, updated_at: ahora },
            { instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'intermediario', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: tcEgreso, updated_at: ahora },
          ];
      return rows.reduce((prom, row) => prom.then(() => client.from('transacciones').insert(row).select('id').single()), Promise.resolve()).then(() => actualizarEstadoOrden(ordenId));
    });
  });
}

function expandOrdenTransacciones(ordenId, orden) {
  const detailRow = document.getElementById('orden-detalle-' + ordenId);
  if (!detailRow) return;
  const wasOpen = detailRow.style.display !== 'none';
  document.querySelectorAll('.orden-detalle-tr').forEach((tr) => { tr.style.display = 'none'; });
  if (wasOpen) {
    transaccionesOrdenIdActual = null;
    return;
  }
  transaccionesOrdenIdActual = ordenId;
  detailRow.style.display = 'table-row';
  const panel = document.getElementById('panel-orden-' + ordenId);
  const encabezado = panel.querySelector('.orden-detalle-encabezado');
  const loadingEl = panel.querySelector('.orden-detalle-loading');
  const contentEl = panel.querySelector('.orden-detalle-content');
  const tbody = panel.querySelector('.orden-detalle-tbody');
  if (!encabezado || !loadingEl || !contentEl || !tbody) return;
  const canIngresarTr = userPermissions.includes('ingresar_transacciones');
  const canEditarTr = userPermissions.includes('editar_transacciones');
  const canEliminarTr = userPermissions.includes('eliminar_transacciones');
  const btnNuevaTr = panel.querySelector('.btn-nueva-transaccion-panel');
  if (btnNuevaTr) btnNuevaTr.style.display = canIngresarTr ? '' : 'none';

  const estadoLabelOrd = (e) => ({ pendiente_instrumentar: 'Pendiente Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada', anulada: 'Anulada' }[e] || (e || '–'));
  const estadoBadgeOrd = (e) => (e && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'anulada'].includes(e) ? `<span class="badge badge-estado-${e.replace(/_/g, '-')}">${estadoLabelOrd(e)}</span>` : estadoLabelOrd(e));
  encabezado.innerHTML = orden
    ? `<div class="orden-detalle-resumen"><strong>Orden ${orden.numero != null ? '#' + orden.numero : ''}</strong> ${(orden.fecha || '').toString().slice(0, 10)} · Estado: ${estadoBadgeOrd(orden.estado)} · ${orden.moneda_recibida} ${formatImporteDisplay(orden.monto_recibido)} → ${orden.moneda_entregada} ${formatImporteDisplay(orden.monto_entregado)}</div>`
    : '';
  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';
  tbody.innerHTML = '';

  client
    .from('instrumentacion')
    .select('id')
    .eq('orden_id', ordenId)
    .maybeSingle()
    .then((r) => {
      let instId = r.data && r.data.id;
      if (!instId) {
        return client.from('instrumentacion').insert({ orden_id: ordenId }).select('id').single().then((ins) => (ins.data ? ins.data.id : null));
      }
      return instId;
    })
    .then((instrumentacionId) => {
      if (!instrumentacionId) {
        loadingEl.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="9">No se pudo cargar la instrumentación.</td></tr>';
        contentEl.style.display = 'block';
        return;
      }
      panel.dataset.instrumentacionId = instrumentacionId;

      client
        .from('transacciones')
        .select('id, numero, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio')
        .eq('instrumentacion_id', instrumentacionId)
        .order('created_at', { ascending: true })
        .then((res) => {
          loadingEl.style.display = 'none';
          contentEl.style.display = 'block';
          if (res.error) {
            tbody.innerHTML = '<tr><td colspan="9">Error: ' + (res.error.message || '') + '</td></tr>';
            return;
          }
          let list = res.data || [];

          function renderTransaccionesList(lista) {
            const { totalRecibido, totalEntregado } = totalesInstrumentacion(lista, orden);
            const totalesEl = panel.querySelector('.orden-detalle-totales');
            if (totalesEl && orden) {
              const mr = Number(orden.monto_recibido) || 0;
              const me = Number(orden.monto_entregado) || 0;
              const monR = orden.moneda_recibida || 'USD';
              const monE = orden.moneda_entregada || 'USD';
              const okRec = totalRecibido <= mr + 1e-6;
              const okEnt = totalEntregado <= me + 1e-6;
              const ejecutada = orden.estado === 'orden_ejecutada';
              const textoInst = ejecutada
                ? `Recibido ${formatImporteDisplay(totalRecibido)} ${monR} · Entregado ${formatImporteDisplay(totalEntregado)} ${monE}.`
                : `Instrumentación: A recibir ${formatImporteDisplay(mr)} ${monR} - A entregar ${formatImporteDisplay(me)} ${monE}.`;
              totalesEl.innerHTML = `<strong>Acuerdo:</strong> Recibir ${formatImporteDisplay(mr)} ${monR} · Entregar ${formatImporteDisplay(me)} ${monE}. &nbsp; <strong>${textoInst}</strong>${(!okRec || !okEnt) ? ' <span style="color:#b91c1c;">(Supera acuerdo)</span>' : ''}`;
            }
            return client.from('modos_pago').select('id, codigo, nombre').then((rModos) => {
        const modosMap = {};
            (rModos.data || []).forEach((m) => { modosMap[m.id] = m; });
            const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
            const esOrdenChequeWiz = esOrdenChequeArsDesdeOrden(orden);
            const ingresoChequeCliPandy = lista.find((tr) => (tr.tipo || '').toLowerCase() === 'ingreso' && String(tr.pagador || '').toLowerCase() === 'cliente' && String(tr.cobrador || '').toLowerCase() === 'pandy' && modosMap[tr.modo_pago_id]?.codigo === 'cheque');
            const bloquearEjecutadaEgresoCheque = (t) => orden?.intermediario_id && (t.tipo || '').toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario' && modosMap[t.modo_pago_id]?.codigo === 'cheque' && ingresoChequeCliPandy && (ingresoChequeCliPandy.estado || '').toLowerCase() !== 'ejecutada';
            const cobradorL = (t) => participantLabelHtml(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
            const pagadorL = (t) => participantLabelHtml(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
            const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; const bloquear = bloquearEjecutadaEgresoCheque(t); const title = bloquear ? 'No se puede marcar ejecutada hasta que el ingreso del cheque (Cliente→Pandy) esté ejecutado.' : ''; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado" title="${esc(title)}"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}${bloquear ? ' disabled' : ''}>Ejecutada</option></select>`; };
            const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
            const montoCell = (t) => {
              if (!canEditarTr) return `<td>${formatImporteDisplay(t.monto)}</td>`;
              const val = formatImporteParaInput(t.monto);
              return `<td><input type="text" class="input-monto-transaccion-tabla" data-id="${esc(t.id)}" value="${esc(val)}" inputmode="decimal" aria-label="Monto ${esc(t.moneda)}"></td>`;
            };
            const modoPagoCell = (t) => {
              const modo = modosMap[t.modo_pago_id];
              const modoChequeBloqueado = esOrdenChequeWiz && modo?.codigo === 'cheque';
              if (!canEditarTr || modoChequeBloqueado) {
                return `<td>${esc(modo ? modo.nombre : '–')}</td>`;
              }
            const opciones = (rModos.data || []).map((m) => `<option value="${m.id}"${t.modo_pago_id === m.id ? ' selected' : ''}>${esc(m.nombre)}</option>`).join('');
            return `<td><select class="combo-modo-pago-transaccion-tabla" data-id="${esc(t.id)}" aria-label="Modo de pago">${opciones}</select></td>`;
          };
              const listaSorted = sortTransaccionesIngresosPrimero(lista);
              tbody.innerHTML = listaSorted
                .map(
                  (t) => {
                    return `<tr data-id="${t.id}">
                      <td>${t.numero != null ? esc(String(t.numero)) : '–'}</td>
                      <td>${tipoTransaccionHtml(t.tipo)}</td>
                      ${modoPagoCell(t)}
                      <td>${esc(t.moneda)}</td>
                      ${montoCell(t)}
                      <td>${pagadorL(t)}</td>
                      <td>${cobradorL(t)}</td>
                      <td>${canEditarTr ? estadoTrxCombo(t) : estadoTexto(t)}</td>
                      <td>${canEditarTr ? `<button type="button" class="btn-editar btn-editar-transaccion-panel" data-id="${t.id}" title="Editar concepto y demás campos">Editar</button>` : ''}${canEliminarTr ? ` <button type="button" class="btn-secondary btn-eliminar-transaccion-panel" data-id="${t.id}" title="Dar de baja">Eliminar</button>` : ''}</td>
                    </tr>`;
                  }
                )
                .join('');
              if (canEditarTr) {
                tbody.querySelectorAll('.combo-estado-transaccion').forEach((sel) => {
                  sel.addEventListener('change', function() { cambiarEstadoTransaccion(this.getAttribute('data-id'), this.value, instrumentacionId, this); });
                });
                tbody.querySelectorAll('.combo-modo-pago-transaccion-tabla').forEach((sel) => {
                  sel.addEventListener('change', function() {
                    const id = this.getAttribute('data-id');
                    const prev = lista.find((r) => r.id === id);
                    if (!prev || this.value === prev.modo_pago_id) return;
                    guardarSoloModoPagoTransaccion(id, this.value, () => refreshTransaccionesPanel(ordenId), () => { this.value = prev.modo_pago_id; });
                  });
                });
                tbody.querySelectorAll('.input-monto-transaccion-tabla').forEach((input) => {
                  input.addEventListener('blur', function() {
                    const id = this.getAttribute('data-id');
                    const prev = lista.find((r) => r.id === id);
                    if (!prev || parseImporteInput(this.value) === Number(prev.monto)) return;
                    guardarSoloMontoTransaccion(id, this.value, () => refreshTransaccionesPanel(ordenId));
                  });
                });
                tbody.querySelectorAll('.btn-editar-transaccion-panel').forEach((btn) => {
                  btn.addEventListener('click', () => {
                    const row = lista.find((r) => r.id === btn.getAttribute('data-id'));
                    if (row) openModalTransaccion(row, instrumentacionId);
                  });
                });
              }
              tbody.querySelectorAll('.btn-eliminar-transaccion-panel').forEach((btn) => {
                btn.addEventListener('click', () => { eliminarTransaccion(btn.getAttribute('data-id'), ordenId); });
              });
            });
          }

          if (list.length === 0 && orden && orden.tipo_operacion_id) {
            return client.from('tipos_operacion').select('codigo, moneda_in, moneda_out').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
              const row = rTipo.data || {};
              const codigo = row.codigo || '';
              const miP = (row.moneda_in || '').toString().toUpperCase().trim();
              const moP = (row.moneda_out || '').toString().toUpperCase().trim();
              const patronTcP = patronTipoCambioOrden(miP, moP);
              const esUsdUsdP = miP === 'USD' && moP === 'USD';
              if (esTipoOperacionChequeArs(codigo, row.moneda_in, row.moneda_out) && orden.intermediario_id) {
                return autoCompletarInstrumentacionChequeConIntermediario(ordenId, instrumentacionId, orden);
              }
              // USD-USD+int: cp_ic por defecto en panel. Cruce fiat+USD+int: ci_pc (misma lógica que ARS-USD/USD-ARS+int; motor CC reglas_de_negocio).
              if (orden.intermediario_id && (esUsdUsdP || patronTcP) && !esTipoOperacionChequeArs(codigo, row.moneda_in, row.moneda_out)) {
                const patronPanelPar = patronTcP ? 'ci_pc' : 'cp_ic';
                return autoCompletarInstrumentacionUsdUsdConIntermediario(ordenId, instrumentacionId, orden, patronPanelPar);
              }
              if (!orden.intermediario_id && (esUsdUsdP || patronTcP || esTipoOperacionChequeArs(codigo, row.moneda_in, row.moneda_out))) {
                return autoCompletarInstrumentacionSinIntermediario(ordenId, instrumentacionId, orden);
              }
              return Promise.resolve();
            }).then(() =>
              client.from('transacciones').select('id, numero, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instrumentacionId).order('created_at', { ascending: true })
            ).then((r2) => {
              list = (r2.data || []);
              return renderTransaccionesList(list);
            });
          }
          return renderTransaccionesList(list);
        })
        .then(() => {
          const btnNueva = panel.querySelector('.btn-nueva-transaccion-panel');
          if (btnNueva) btnNueva.onclick = () => openModalTransaccion(null, instrumentacionId);
        });
    });
}

function refreshTransaccionesPanel(ordenId) {
  if (!ordenId) return;
  const panel = document.getElementById('panel-orden-' + ordenId);
  const tbody = panel?.querySelector('.orden-detalle-tbody');
  const instrumentacionId = panel?.dataset?.instrumentacionId;
  if (!panel || !tbody || !instrumentacionId) return;
  tbody.innerHTML = '';
  Promise.all([
    client.from('transacciones').select('id, numero, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instrumentacionId).order('created_at', { ascending: true }),
    client.from('ordenes').select('id, cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, estado, tipo_operacion_id, tipos_operacion(codigo, moneda_in, moneda_out)').eq('id', ordenId).single(),
  ]).then(([resTr, resOrd]) => {
    const orden = resOrd?.data || null;
    if (resTr.error) {
      tbody.innerHTML = '<tr><td colspan="9">Error: ' + (resTr.error.message || '') + '</td></tr>';
      return;
    }
    const list = resTr.data || [];
    const { totalRecibido, totalEntregado } = totalesInstrumentacion(list, orden);
    const totalesEl = panel.querySelector('.orden-detalle-totales');
    if (totalesEl && orden) {
      const mr = Number(orden.monto_recibido) || 0;
      const me = Number(orden.monto_entregado) || 0;
      const monR = orden.moneda_recibida || 'USD';
      const monE = orden.moneda_entregada || 'USD';
      const okRec = totalRecibido <= mr + 1e-6;
      const okEnt = totalEntregado <= me + 1e-6;
      const ejecutada = orden.estado === 'orden_ejecutada';
      const textoInst = ejecutada
        ? `Recibido ${formatImporteDisplay(totalRecibido)} ${monR} · Entregado ${formatImporteDisplay(totalEntregado)} ${monE}.`
        : `Instrumentación: A recibir ${formatImporteDisplay(mr)} ${monR} - A entregar ${formatImporteDisplay(me)} ${monE}.`;
      totalesEl.innerHTML = `<strong>Acuerdo:</strong> Recibir ${formatImporteDisplay(mr)} ${monR} · Entregar ${formatImporteDisplay(me)} ${monE}. &nbsp; <strong>${textoInst}</strong>${(!okRec || !okEnt) ? ' <span style="color:#b91c1c;">(Supera acuerdo)</span>' : ''}`;
    }
    const canEditarTr = userPermissions.includes('editar_transacciones');
    const canEliminarTr = userPermissions.includes('eliminar_transacciones');
    client.from('modos_pago').select('id, codigo, nombre').then((rModos) => {
        const modosMap = {};
        (rModos.data || []).forEach((m) => { modosMap[m.id] = m; });
        const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
        const esOrdenCheque = esOrdenChequeArsDesdeOrden(orden);
        const ingresoChequeCliPandy = list.find((tr) => (tr.tipo || '').toLowerCase() === 'ingreso' && String(tr.pagador || '').toLowerCase() === 'cliente' && String(tr.cobrador || '').toLowerCase() === 'pandy' && modosMap[tr.modo_pago_id]?.codigo === 'cheque');
        const bloquearEjecutadaEgresoCheque = (t) => orden?.intermediario_id && (t.tipo || '').toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario' && modosMap[t.modo_pago_id]?.codigo === 'cheque' && ingresoChequeCliPandy && (ingresoChequeCliPandy.estado || '').toLowerCase() !== 'ejecutada';
        const cobradorL = (t) => participantLabelHtml(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
        const pagadorL = (t) => participantLabelHtml(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
        const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; const bloquear = bloquearEjecutadaEgresoCheque(t); const title = bloquear ? 'No se puede marcar ejecutada hasta que el ingreso del cheque (Cliente→Pandy) esté ejecutado.' : ''; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado" title="${esc(title)}"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}${bloquear ? ' disabled' : ''}>Ejecutada</option></select>`; };
        const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
        const montoCell = (t) => {
          if (!canEditarTr) return `<td>${formatImporteDisplay(t.monto)}</td>`;
          const val = formatImporteParaInput(t.monto);
          return `<td><input type="text" class="input-monto-transaccion-tabla" data-id="${esc(t.id)}" value="${esc(val)}" inputmode="decimal" aria-label="Monto ${esc(t.moneda)}"></td>`;
        };
        const modoPagoCell = (t) => {
          const modo = modosMap[t.modo_pago_id];
          const modoChequeBloqueado = esOrdenCheque && modo?.codigo === 'cheque';
          if (!canEditarTr || modoChequeBloqueado) {
            return `<td>${esc(modo ? modo.nombre : '–')}</td>`;
          }
          const opciones = (rModos.data || []).map((m) => `<option value="${m.id}"${t.modo_pago_id === m.id ? ' selected' : ''}>${esc(m.nombre)}</option>`).join('');
          return `<td><select class="combo-modo-pago-transaccion-tabla" data-id="${esc(t.id)}" aria-label="Modo de pago">${opciones}</select></td>`;
        };
        const listSorted = sortTransaccionesIngresosPrimero(list);
        tbody.innerHTML = listSorted
          .map(
            (t) => {
              return `<tr data-id="${t.id}">
                <td>${t.numero != null ? esc(String(t.numero)) : '–'}</td>
                <td>${tipoTransaccionHtml(t.tipo)}</td>
                ${modoPagoCell(t)}
                <td>${esc(t.moneda)}</td>
                ${montoCell(t)}
                <td>${pagadorL(t)}</td>
                <td>${cobradorL(t)}</td>
                <td>${canEditarTr ? estadoTrxCombo(t) : estadoTexto(t)}</td>
                <td>${canEditarTr ? `<button type="button" class="btn-editar btn-editar-transaccion-panel" data-id="${t.id}" title="Editar concepto y demás campos">Editar</button>` : ''}${canEliminarTr ? ` <button type="button" class="btn-secondary btn-eliminar-transaccion-panel" data-id="${t.id}" title="Dar de baja">Eliminar</button>` : ''}</td>
              </tr>`;
            }
          )
          .join('');
        if (canEditarTr) {
          tbody.querySelectorAll('.combo-estado-transaccion').forEach((sel) => {
            sel.addEventListener('change', function() { cambiarEstadoTransaccion(this.getAttribute('data-id'), this.value, instrumentacionId, this); });
          });
          tbody.querySelectorAll('.combo-modo-pago-transaccion-tabla').forEach((sel) => {
            sel.addEventListener('change', function() {
              const id = this.getAttribute('data-id');
              const prev = list.find((r) => r.id === id);
              if (!prev || this.value === prev.modo_pago_id) return;
              const selEl = this;
              guardarSoloModoPagoTransaccion(id, this.value, () => refreshTransaccionesPanel(ordenId), () => { selEl.value = prev.modo_pago_id; });
            });
          });
          tbody.querySelectorAll('.input-monto-transaccion-tabla').forEach((input) => {
            input.addEventListener('blur', function() {
              const id = this.getAttribute('data-id');
              const prev = list.find((r) => r.id === id);
              if (!prev || parseImporteInput(this.value) === Number(prev.monto)) return;
              guardarSoloMontoTransaccion(id, this.value, () => refreshTransaccionesPanel(ordenId));
            });
          });
          tbody.querySelectorAll('.btn-editar-transaccion-panel').forEach((btn) => {
            btn.addEventListener('click', () => {
              const row = list.find((r) => r.id === btn.getAttribute('data-id'));
              if (row) openModalTransaccion(row, instrumentacionId);
            });
          });
        }
        tbody.querySelectorAll('.btn-eliminar-transaccion-panel').forEach((btn) => {
          btn.addEventListener('click', () => { eliminarTransaccion(btn.getAttribute('data-id'), ordenId); });
        });
      });
  });
}

/** Conversión inversa: si moneda es ARS → calculado = monto/TC (otra moneda); si moneda es USD/EUR → calculado = monto*TC (ARS). */
function actualizarMontoCalculado() {
  const backdrop = document.getElementById('modal-transaccion-backdrop');
  const selMoneda = document.getElementById('transaccion-moneda');
  const selTipo = document.getElementById('transaccion-tipo');
  const wrapConversion = document.getElementById('transaccion-wrap-conversion');
  if (!wrapConversion || wrapConversion.style.display !== 'block') return;
  const monedaRecibida = (backdrop?.dataset.monedaRecibida || '').toUpperCase();
  const monedaEntregada = (backdrop?.dataset.monedaEntregada || '').toUpperCase();
  const moneda = (selMoneda?.value || '').toUpperCase();
  const tipo = selTipo?.value || 'ingreso';
  const otraMoneda = moneda === 'ARS' ? (tipo === 'ingreso' ? monedaEntregada : monedaRecibida) : 'ARS';
  const lblCalculado = document.getElementById('transaccion-monto-calculado-currency-label');
  const display = document.getElementById('transaccion-monto-calculado-display');
  if (lblCalculado) lblCalculado.textContent = otraMoneda || 'USD';
  const montoRaw = document.getElementById('transaccion-monto')?.value?.trim() || '';
  const tcRaw = document.getElementById('transaccion-tipo-cambio')?.value?.trim() || '';
  const monto = parseImporteInput(montoRaw);
  const tc = parseImporteInput(tcRaw);
  let calculado = null;
  if (typeof monto === 'number' && !isNaN(monto) && typeof tc === 'number' && !isNaN(tc) && tc > 0) {
    calculado = moneda === 'ARS' ? monto / tc : monto * tc;
  }
  if (display) display.value = calculado != null ? formatImporteDisplay(calculado) : '';
}

function toggleTransaccionMonedaArs() {
  const selMoneda = document.getElementById('transaccion-moneda');
  const selTipo = document.getElementById('transaccion-tipo');
  const backdrop = document.getElementById('modal-transaccion-backdrop');
  const wrapConversion = document.getElementById('transaccion-wrap-conversion');
  const lblMonto = document.getElementById('transaccion-monto-currency-label');
  const esOrdenCheque = document.getElementById('transaccion-es-orden-cheque')?.value === '1';
  if (esOrdenCheque) {
    if (selMoneda) { selMoneda.value = 'ARS'; selMoneda.disabled = true; }
    if (wrapConversion) wrapConversion.style.display = 'none';
    if (lblMonto) lblMonto.textContent = 'ARS';
    return;
  }
  if (selMoneda) selMoneda.disabled = false;
  const moneda = (selMoneda?.value || 'USD').toUpperCase();
  const monedaRecibida = (backdrop?.dataset.monedaRecibida || '').toUpperCase();
  const monedaEntregada = (backdrop?.dataset.monedaEntregada || '').toUpperCase();
  const tipo = selTipo?.value || 'ingreso';
  const monedaTransaccion = tipo === 'ingreso' ? monedaRecibida : monedaEntregada;
  if (lblMonto) lblMonto.textContent = monedaTransaccion || moneda;
  const hayDosMonedas = monedaRecibida && monedaEntregada && monedaRecibida !== monedaEntregada;
  if (wrapConversion) wrapConversion.style.display = hayDosMonedas ? 'block' : 'none';
  if (hayDosMonedas) {
    const lblCalculado = document.getElementById('transaccion-monto-calculado-currency-label');
    const otraMoneda = moneda === 'ARS' ? (tipo === 'ingreso' ? monedaEntregada : monedaRecibida) : 'ARS';
    if (lblCalculado) lblCalculado.textContent = otraMoneda || 'USD';
    actualizarMontoCalculado();
  } else {
    const d = document.getElementById('transaccion-monto-calculado-display');
    if (d) d.value = '';
  }
}

/** Según tipo de operación: Ingreso solo permite moneda recibida; Egreso solo moneda entregada. Grisa opciones no permitidas. */
function adaptarTransaccionTipoYMoneda() {
  const backdrop = document.getElementById('modal-transaccion-backdrop');
  const selTipo = document.getElementById('transaccion-tipo');
  const selMoneda = document.getElementById('transaccion-moneda');
  if (!backdrop || !selTipo || !selMoneda) return;
  const monedaRecibida = (backdrop.dataset.monedaRecibida || '').toUpperCase();
  const monedaEntregada = (backdrop.dataset.monedaEntregada || '').toUpperCase();
  const tipo = selTipo.value;
  const opciones = Array.from(selMoneda.options);
  const monedasValidas = ['USD', 'EUR', 'ARS'];
  const restringir = monedasValidas.includes(monedaRecibida) && monedasValidas.includes(monedaEntregada);
  if (!restringir) {
    opciones.forEach((opt) => { opt.disabled = false; });
    return;
  }
  const monedaPermitida = tipo === 'ingreso' ? monedaRecibida : monedaEntregada;
  opciones.forEach((opt) => {
    opt.disabled = opt.value !== monedaPermitida;
  });
  const valorActual = selMoneda.value;
  if (valorActual !== monedaPermitida) {
    selMoneda.value = monedaPermitida;
    toggleTransaccionMonedaArs();
  }
}

function openModalTransaccion(registro, instrumentacionId) {
  const backdrop = document.getElementById('modal-transaccion-backdrop');
  const titulo = document.getElementById('modal-transaccion-titulo');
  const idEl = document.getElementById('transaccion-id');
  const instIdEl = document.getElementById('transaccion-instrumentacion-id');
  const selMoneda = document.getElementById('transaccion-moneda');
  if (!backdrop || !titulo || !idEl || !instIdEl) return;

  const seq = ++openModalTransaccionSeq;

  function cargarParticipantesYOrden() {
    const vacio = { cliente: false, intermediario: false, cotizacion: null, esCheque: false, monedaRecibida: '', monedaEntregada: '', clienteNombre: '', montoRecibido: null, montoEntregado: null };
    if (!instrumentacionId) return Promise.resolve(vacio);
    return client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rInst) => {
      const ordenId = rInst.data && rInst.data.orden_id;
      if (!ordenId) return vacio;
      return client.from('ordenes').select('cliente_id, intermediario_id, cotizacion, tipo_operacion_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, clientes(nombre)').eq('id', ordenId).single().then((rOrd) => {
        const o = rOrd.data || {};
        const cot = o.cotizacion != null && Number(o.cotizacion) > 0 ? Number(o.cotizacion) : null;
        const tipoOpId = o.tipo_operacion_id;
        const monedaRecibida = (o.moneda_recibida || '').trim().toUpperCase() || '';
        const monedaEntregada = (o.moneda_entregada || '').trim().toUpperCase() || '';
        const clientesRef = o.clientes;
        const clienteNombre = (clientesRef && (typeof clientesRef === 'object' && !Array.isArray(clientesRef) ? clientesRef.nombre : (Array.isArray(clientesRef) ? clientesRef[0]?.nombre : null))) || '';
        const montoRecibido = o.monto_recibido != null && !isNaN(Number(o.monto_recibido)) ? Number(o.monto_recibido) : null;
        const montoEntregado = o.monto_entregado != null && !isNaN(Number(o.monto_entregado)) ? Number(o.monto_entregado) : null;
        const base = {
          cliente: !!o.cliente_id,
          intermediario: !!o.intermediario_id,
          cotizacion: cot,
          monedaRecibida,
          monedaEntregada,
          clienteNombre,
          montoRecibido,
          montoEntregado,
        };
        if (!tipoOpId) return { ...base, esCheque: false };
        return client.from('tipos_operacion').select('codigo, moneda_in, moneda_out').eq('id', tipoOpId).single().then((rTipo) => {
          const row = rTipo.data || {};
          return { ...base, esCheque: esTipoOperacionChequeArs(row.codigo, row.moneda_in, row.moneda_out) };
        }).catch(() => ({ ...base, esCheque: false }));
      });
    }).catch(() => vacio);
  }

  Promise.all([
    client.from('modos_pago').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    cargarParticipantesYOrden(),
  ]).then(([r, participantes]) => {
    if (seq !== openModalTransaccionSeq) return;
    const sel = document.getElementById('transaccion-modo-pago');
    if (sel) sel.innerHTML = '<option value="">Ninguno</option>' + (r.data || []).map((m) => `<option value="${m.id}" data-codigo="${escapeHtml(m.codigo)}">${escapeHtml(m.nombre)}</option>`).join('');

    const mapLabel = { pandy: 'Pandy', cliente: 'Cliente', intermediario: 'Intermediario' };
    const allowed = ['pandy'].concat(participantes?.cliente ? ['cliente'] : []).concat(participantes?.intermediario ? ['intermediario'] : []);
    const selCob = document.getElementById('transaccion-cobrador');
    const selPag = document.getElementById('transaccion-pagador');
    const extra = [];
    if (registro?.cobrador && !allowed.includes(registro.cobrador)) extra.push(registro.cobrador);
    if (registro?.pagador && !allowed.includes(registro.pagador)) extra.push(registro.pagador);
    const all = allowed.concat(extra.filter((x) => x && !allowed.includes(x)));
    const optsHtml = all.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(mapLabel[v] || v)}</option>`).join('');
    if (selCob) selCob.innerHTML = optsHtml;
    if (selPag) selPag.innerHTML = optsHtml;

    const esCheque = !!participantes?.esCheque;
    const elEsCheque = document.getElementById('transaccion-es-orden-cheque');
    if (elEsCheque) elEsCheque.value = esCheque ? '1' : '0';

    if (sel) sel.disabled = false;

    if (registro) {
      titulo.textContent = 'Editar transacción';
      idEl.value = registro.id;
      document.getElementById('transaccion-tipo').value = registro.tipo || 'ingreso';
      document.getElementById('transaccion-modo-pago').value = registro.modo_pago_id ? String(registro.modo_pago_id) : '';
      const modoRegistro = (r.data || []).find((m) => m.id === registro.modo_pago_id);
      if (esCheque && modoRegistro?.codigo === 'cheque' && sel) sel.disabled = true;
      document.getElementById('transaccion-moneda').value = esCheque ? 'ARS' : (registro.moneda || 'USD');
      document.getElementById('transaccion-monto').value = formatImporteParaInput(registro.monto);
      document.getElementById('transaccion-cobrador').value = registro.cobrador || 'pandy';
      document.getElementById('transaccion-pagador').value = registro.pagador || 'pandy';
      document.getElementById('transaccion-estado').value = registro.estado || 'pendiente';
      document.getElementById('transaccion-concepto').value = registro.concepto || '';
      if (!esCheque) {
        const tc = registro.tipo_cambio != null && Number(registro.tipo_cambio) > 0 ? Number(registro.tipo_cambio) : null;
        document.getElementById('transaccion-tipo-cambio').value = tc != null ? formatImporteDisplay(tc) : '';
      } else {
        document.getElementById('transaccion-tipo-cambio').value = '';
      }
    } else {
      titulo.textContent = 'Nueva transacción';
      idEl.value = '';
      document.getElementById('form-transaccion').reset();
      if (elEsCheque) elEsCheque.value = esCheque ? '1' : '0';
      if (sel) sel.disabled = false;
      const pagIng = participantes?.cliente ? 'cliente' : (participantes?.intermediario ? 'intermediario' : 'pandy');
      document.getElementById('transaccion-tipo').value = 'ingreso';
      document.getElementById('transaccion-moneda').value = esCheque ? 'ARS' : 'USD';
      document.getElementById('transaccion-modo-pago').value = '';
      document.getElementById('transaccion-cobrador').value = 'pandy';
      document.getElementById('transaccion-pagador').value = pagIng;
      document.getElementById('transaccion-estado').value = 'pendiente';
      document.getElementById('transaccion-monto').value = '';
      if (!esCheque) {
        const tcAcuerdo = participantes?.cotizacion;
        document.getElementById('transaccion-tipo-cambio').value = tcAcuerdo != null ? formatImporteDisplay(tcAcuerdo) : '';
      } else document.getElementById('transaccion-tipo-cambio').value = '';
    }
    if (backdrop) {
      backdrop.dataset.monedaRecibida = participantes?.monedaRecibida || '';
      backdrop.dataset.monedaEntregada = participantes?.monedaEntregada || '';
    }
    const elCliente = document.getElementById('transaccion-acuerdo-cliente');
    const elMontoRec = document.getElementById('transaccion-acuerdo-monto-recibido');
    const elMonRec = document.getElementById('transaccion-acuerdo-moneda-recibida');
    const elMontoEnt = document.getElementById('transaccion-acuerdo-monto-entregado');
    const elMonEnt = document.getElementById('transaccion-acuerdo-moneda-entregada');
    if (elCliente) elCliente.textContent = participantes?.clienteNombre?.trim() || '–';
    if (elMontoRec) elMontoRec.textContent = participantes?.montoRecibido != null ? formatImporteDisplay(participantes.montoRecibido) : '–';
    if (elMonRec) elMonRec.textContent = participantes?.monedaRecibida ? String(participantes.monedaRecibida) : '';
    if (elMontoEnt) elMontoEnt.textContent = participantes?.montoEntregado != null ? formatImporteDisplay(participantes.montoEntregado) : '–';
    if (elMonEnt) elMonEnt.textContent = participantes?.monedaEntregada ? String(participantes.monedaEntregada) : '';
    // form.reset() (rama "Nueva transacción") restaura el valor por defecto del hidden y borraba instrumentacion_id → segundo guardado fallaba / modal no cerraba.
    instIdEl.value = instrumentacionId || '';
    adaptarTransaccionTipoYMoneda();
    toggleTransaccionMonedaArs();
    // Nueva transacción: sugerir monto completo del acuerdo según tipo + moneda (sin “restante” ni lógica automática vs otras trx).
    if (!registro) {
      const montoEl = document.getElementById('transaccion-monto');
      const tipoSel = document.getElementById('transaccion-tipo')?.value;
      const monSel = (document.getElementById('transaccion-moneda')?.value || '').toString().toUpperCase().trim();
      const monR = (participantes?.monedaRecibida || '').toString().toUpperCase().trim();
      const monE = (participantes?.monedaEntregada || '').toString().toUpperCase().trim();
      const mRec = participantes?.montoRecibido;
      const mEnt = participantes?.montoEntregado;
      let sugg = null;
      if (tipoSel === 'ingreso' && monSel && monSel === monR && mRec != null && !isNaN(Number(mRec))) {
        sugg = Number(mRec);
      }
      if (tipoSel === 'egreso' && monSel && monSel === monE && mEnt != null && !isNaN(Number(mEnt))) {
        sugg = Number(mEnt);
      }
      if (montoEl && sugg != null) {
        montoEl.value = formatImporteParaInput(sugg);
      }
    }
    const montoFinal = document.getElementById('transaccion-monto');
    if (montoFinal) {
      const raw = (montoFinal.value || '').trim();
      if (raw !== '') {
        const n = parseImporteInput(raw);
        if (!isNaN(n)) montoFinal.value = formatImporteParaInput(n);
      }
      montoFinal._importeValorPrevio = montoFinal.value;
    }
    backdrop.classList.add('activo');
    setupInputImporte(montoFinal);
    actualizarMontoCalculado();
  });
}

function closeModalTransaccion() {
  dismissAllToasts();
  const backdrop = document.getElementById('modal-transaccion-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function codigoCajaTipo(modoPagoId) {
  const sel = document.getElementById('transaccion-modo-pago');
  if (!sel || !sel.selectedOptions.length) return 'efectivo';
  const opt = sel.selectedOptions[0];
  const codigo = opt.getAttribute('data-codigo') || '';
  if (codigo === 'transferencia') return 'banco';
  if (codigo === 'cheque') return 'cheque';
  return 'efectivo';
}

function codigoCajaTipoDesdeCodigo(codigo) {
  if (codigo === 'transferencia') return 'banco';
  if (codigo === 'cheque') return 'cheque';
  return 'efectivo';
}

/**
 * Cambia el estado de una transacción (pendiente ↔ ejecutada) desde el combo en la tabla.
 * Actualiza CC y caja si pasa a ejecutada; luego actualiza estado de la orden y refresca la vista.
 * selectEl: opcional, el <select> que disparó el cambio; se usa para mostrar "Actualizando…" y deshabilitar combos.
 */
function cambiarEstadoTransaccion(transaccionId, nuevoEstado, instrumentacionId, selectEl) {
  if (!transaccionId || !instrumentacionId || !currentUserId) return Promise.resolve();

  function showLoadingEstado() {
    if (!selectEl) return;
    const table = selectEl.closest('table');
    if (table) table.querySelectorAll('.combo-estado-transaccion').forEach((s) => { s.disabled = true; });
    const enWizard = selectEl.closest('#orden-inst-tabla-wrap');
    if (enWizard) {
      const msg = document.getElementById('orden-inst-actualizando-msg');
      if (msg) msg.style.display = 'inline';
    } else {
      showToast('Actualizando estado…', 'info');
    }
  }
  function hideLoadingEstado() {
    const msg = document.getElementById('orden-inst-actualizando-msg');
    if (msg) msg.style.display = 'none';
    if (selectEl) {
      const table = selectEl.closest('table');
      if (table) table.querySelectorAll('.combo-estado-transaccion').forEach((s) => { s.disabled = false; });
    }
  }

  showLoadingEstado();
  const promCambioEstado = (async () => {
    const rInst = await client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single();
    const ordenId = rInst.data && rInst.data.orden_id;
    if (!ordenId) return Promise.resolve();
    const rTr = await client.from('transacciones').select('tipo, numero, modo_pago_id, moneda, monto, cobrador, pagador, owner, concepto, estado, revertida_una_vez').eq('id', transaccionId).single();
    const t = rTr.data;
    if (!t) return Promise.resolve();

    // Validación: no se puede marcar ejecutada el egreso de cheque (Pandy→Intermediario) si el ingreso de cheque (Cliente→Pandy) sigue pendiente. No podés entregar lo que no tenés.
    if (nuevoEstado === 'ejecutada') {
      const esEgresoPandyInt = (t.tipo || '').toLowerCase() === 'egreso' && String(t.pagador || '').toLowerCase() === 'pandy' && String(t.cobrador || '').toLowerCase() === 'intermediario';
      if (esEgresoPandyInt) {
        const [rModos, rOrden, rLista] = await Promise.all([
          client.from('modos_pago').select('id, codigo'),
          client.from('ordenes').select('id, intermediario_id, tipo_operacion_id').eq('id', ordenId).single(),
          client.from('transacciones').select('id, tipo, modo_pago_id, cobrador, pagador, estado').eq('instrumentacion_id', instrumentacionId),
        ]);
        const modosMap = Object.fromEntries((rModos.data || []).map((m) => [m.id, m]));
        const orden = rOrden?.data;
        const lista = rLista.data || [];
        const esCheque = (modosMap[t.modo_pago_id] && modosMap[t.modo_pago_id].codigo === 'cheque');
        const tieneIntermediario = orden && orden.intermediario_id;
        if (esCheque && tieneIntermediario) {
          const ingresoChequeCliPandy = lista.find((tr) => (tr.tipo || '').toLowerCase() === 'ingreso' && String(tr.pagador || '').toLowerCase() === 'cliente' && String(tr.cobrador || '').toLowerCase() === 'pandy' && modosMap[tr.modo_pago_id] && modosMap[tr.modo_pago_id].codigo === 'cheque');
          if (ingresoChequeCliPandy && (ingresoChequeCliPandy.estado || '').toLowerCase() !== 'ejecutada') {
            hideLoadingEstado();
            if (selectEl) selectEl.value = 'pendiente';
            showToast('No se puede marcar ejecutada la entrega del cheque al intermediario si el ingreso del cheque (Cliente→Pandy) sigue pendiente.', 'error');
            return Promise.resolve();
          }
        }
      }
    }

      // Reversión (ejecutada → pendiente): sin límite de veces. Siempre pedir confirmación.
      if (nuevoEstado === 'pendiente' && t.estado === 'ejecutada') {
        const montoTrx = Number(t.monto) || 0;
        const monedaTrx = (t.moneda || 'ARS').toUpperCase();
        const esIngreso = (t.tipo || '').toLowerCase() === 'ingreso';
        const cobTrx = String(t.cobrador || '').toLowerCase();
        const pagTrx = String(t.pagador || '').toLowerCase();
        const textoImplicancia = montoTrx >= 1e-6
          ? (esIngreso && cobTrx === 'pandy'
            ? 'Reversar indica que no se recibieron los ' + formatMonto(montoTrx, monedaTrx) + ' (del cliente). '
            : (pagTrx === 'pandy'
              ? 'Reversar indica que no se entregaron los ' + formatMonto(montoTrx, monedaTrx) + '. '
              : ''))
          : '';
        return new Promise((resolve) => {
          showConfirm(
            textoImplicancia + '¿Reversar esta operación a pendiente? La cuenta corriente y la caja se actualizarán.',
            'Sí, reversar',
            () => { continuarCambioEstado().then(resolve).catch(() => resolve()); },
            () => { hideLoadingEstado(); if (selectEl) selectEl.value = 'ejecutada'; resolve(); },
            'Cancelar',
            'Confirmar reversión'
          );
        });
      }
      return continuarCambioEstado();

      function continuarCambioEstado() {
      const montoActual = Number(t.monto) || 0;
      // Si el usuario cambió el monto en la tabla pero no hizo blur, sincronizar antes de ejecutar para que el split use el monto correcto.
      if (selectEl && nuevoEstado === 'ejecutada') {
        const row = selectEl.closest('tr');
        const inputMonto = row && row.querySelector('.input-monto-transaccion-tabla[data-id="' + transaccionId + '"]');
        if (inputMonto) {
          const val = parseImporteInput(inputMonto.value);
          if (!isNaN(val) && val > 0 && Math.abs(val - montoActual) > 1e-6) {
            return guardarSoloMontoTransaccion(transaccionId, inputMonto.value).then(() => cambiarEstadoTransaccion(transaccionId, nuevoEstado, instrumentacionId, selectEl));
          }
        }
      }
      return client.from('ordenes').select('cliente_id, intermediario_id, monto_recibido, monto_entregado, moneda_recibida, moneda_entregada, cotizacion, numero, tasa_descuento_intermediario, tipos_operacion(codigo)').eq('id', ordenId).single().then((rOrd) => {
        const orden = rOrd.data || {};
        const clienteId = orden.cliente_id || null;
        const intermediarioId = orden.intermediario_id || null;
        const tipoCodigo = orden.tipos_operacion?.codigo || '';
        const cob = t.cobrador || (t.tipo === 'ingreso' ? (t.owner || 'pandy') : 'pandy');
        const pag = t.pagador || (t.tipo === 'egreso' ? (t.owner || 'pandy') : 'pandy');
        const montoRecibido = Number(orden.monto_recibido) || 0;
        const montoEntregado = Number(orden.monto_entregado) || 0;
        const monR = orden.moneda_recibida;
        const monE = orden.moneda_entregada;
        // No dividir la transacción: la comisión se trata en CC desde los datos del acuerdo (como en CC intermediario).
        const debeDividir = false;
        const comision = 0;

        const payload = { estado: nuevoEstado, updated_at: new Date().toISOString() };
        if (nuevoEstado === 'ejecutada') {
          payload.fecha_ejecucion = new Date().toISOString().slice(0, 10);
          payload.usuario_id = currentUserId;
        }
        if (nuevoEstado === 'pendiente') payload.revertida_una_vez = true;
        if (debeDividir) payload.monto = montoEntregado;

        const hacerUpdate = () => client.from('transacciones').update(payload).eq('id', transaccionId);
        const promUpdate = client.rpc('transacciones_cambiar_estado', {
          p_transaccion_id: transaccionId,
          p_estado: nuevoEstado,
          p_fecha_ejecucion: nuevoEstado === 'ejecutada' ? payload.fecha_ejecucion : null,
          p_usuario_id: nuevoEstado === 'ejecutada' ? currentUserId : null,
          p_revertida_una_vez: nuevoEstado === 'pendiente' ? true : null,
        }).then((rRpc) => {
          if (rRpc.error) {
            console.warn('transacciones_cambiar_estado:', rRpc.error.message || rRpc.error);
            return hacerUpdate();
          }
          return { data: null, error: null };
        });

        return promUpdate.then((rUp) => {
          if (rUp && rUp.error) {
            showToast('Error al actualizar estado: ' + (rUp.error.message || ''), 'error');
            return;
          }
          let promesaSiguiente = Promise.resolve(null);
          if (debeDividir) {
            promesaSiguiente = client.from('transacciones').insert({
              instrumentacion_id: instrumentacionId,
              tipo: 'ingreso',
              modo_pago_id: t.modo_pago_id,
              moneda: t.moneda,
              monto: comision,
              cobrador: 'pandy',
              pagador: 'cliente',
              owner: 'pandy',
              estado: 'ejecutada',
              concepto: 'Ganancia del acuerdo',
              tipo_cambio: null,
              fecha_ejecucion: payload.fecha_ejecucion,
              usuario_id: currentUserId,
              updated_at: new Date().toISOString(),
            }).select('id, numero').single();
          }
          return promesaSiguiente.then((rNew) => {
            const nuevaTrxId = rNew && rNew.data && rNew.data.id;
            const nuevaTrxNumero = rNew && rNew.data && rNew.data.numero;
            const fecha = new Date().toISOString().slice(0, 10);
            const ahora = new Date().toISOString();
            const monR = orden.moneda_recibida || 'USD';
            const monE = orden.moneda_entregada || 'USD';
            const mr = Number(orden.monto_recibido) || 0;
            const me = Number(orden.monto_entregado) || 0;
            const listaTrx = debeDividir
              ? [
                  { id: transaccionId, numero: t.numero, monto: montoEntregado, moneda: t.moneda, modo_pago_id: t.modo_pago_id, concepto: conceptoCcMovimiento(t.moneda, montoEntregado, 'deuda'), cobrador: cob, pagador: pag },
                  { id: nuevaTrxId, numero: nuevaTrxNumero, monto: comision, moneda: t.moneda, modo_pago_id: t.modo_pago_id, concepto: conceptoCcMovimiento(t.moneda, comision, 'comision'), cobrador: 'pandy', pagador: 'cliente' },
                ]
              : [{ id: transaccionId, numero: t.numero, monto: montoActual, moneda: t.moneda, modo_pago_id: t.modo_pago_id, concepto: conceptoCcMovimiento(t.moneda, montoActual, pag === 'cliente' ? 'cobro' : 'deuda'), cobrador: cob, pagador: pag }];

            const idsTrx = listaTrx.map((i) => i.id).filter(Boolean);
            const estadoCc = nuevoEstado === 'ejecutada' ? 'cerrado' : 'pendiente';
            const deletes = [];
            if (nuevoEstado === 'pendiente') deletes.push(client.from('movimientos_caja').delete().eq('transaccion_id', transaccionId));
            // Con instrumentación, derivar siempre CC y caja desde orden + transacciones (cualquier movimiento parcial se refleja).
            if (instrumentacionId && !debeDividir) {
              const esIngresoClientePandy = (t.tipo || '').toLowerCase() === 'ingreso' && String(pag || '').toLowerCase() === 'cliente' && String(cob || '').toLowerCase() === 'pandy';
              const comisionPandyMonto = (monR === monE && montoRecibido > montoEntregado) ? montoRecibido - montoEntregado : 0;
              const promRevertirGanancia = (nuevoEstado === 'pendiente' && esIngresoClientePandy && clienteId && comisionPandyMonto >= 1e-6)
                ? revertirGananciaPandy(ordenId, orden, clienteId, comisionPandyMonto)
                : Promise.resolve();
              // Regla simple: tras cambiar estado, siempre sync (recalcula CC y caja solo desde transacciones ejecutadas).
              const promRevertirComision = (nuevoEstado === 'pendiente' && cob === 'pandy' && pag === 'intermediario' && intermediarioId) ? revertirComisionIntermediario(ordenId) : Promise.resolve();
              return Promise.all(deletes).then(() => promRevertirGanancia).then(() => promRevertirComision).then(() => sincronizarCcYCajaDesdeOrden(ordenId)).then(() => actualizarEstadoOrden(ordenId)).then(() => ({ ordenId, instrumentacionId }));
            }
            const ordenLabel = orden.numero != null ? 'nro orden ' + orden.numero : 'nro orden ' + (ordenId || '').toString().slice(0, 8);
            /** Cancelación: por el monto de esta transacción (item.monto). En misma moneda (monR === monE) solo ese monto en la moneda participante. */
            function montosCancelacion(item) {
              const montoTrx = Number(item.monto) || 0;
              const esIngreso = item.pagador === 'cliente';
              if (monR === monE) {
                const signo = esIngreso ? 1 : -1;
                return {
                  monto_usd: numCc(monR === 'USD' ? signo * montoTrx : 0),
                  monto_ars: numCc(monR === 'ARS' ? signo * montoTrx : 0),
                  monto_eur: numCc(monR === 'EUR' ? signo * montoTrx : 0),
                };
              }
              if (esIngreso) {
                const enMonE = ratioCc(montoTrx * me, mr, montoTrx);
                return {
                  monto_usd: numCc(monR === 'USD' ? montoTrx : (monE === 'USD' ? enMonE : 0)),
                  monto_ars: numCc(monR === 'ARS' ? montoTrx : (monE === 'ARS' ? enMonE : 0)),
                  monto_eur: numCc(monR === 'EUR' ? montoTrx : (monE === 'EUR' ? enMonE : 0)),
                };
              }
              const enMonR = ratioCc(montoTrx * mr, me, montoTrx);
              return {
                monto_usd: numCc(monR === 'USD' ? -enMonR : (monE === 'USD' ? -montoTrx : 0)),
                monto_ars: numCc(monR === 'ARS' ? -enMonR : (monE === 'ARS' ? -montoTrx : 0)),
                monto_eur: numCc(monR === 'EUR' ? -enMonR : (monE === 'EUR' ? -montoTrx : 0)),
              };
            }
            return Promise.all(deletes).then(() => {
              let promCcCliente = Promise.resolve({ data: [], idsTrxMomentoCero: [] });
              if (clienteId) {
                promCcCliente = client.from('movimientos_cuenta_corriente').select('id, transaccion_id, concepto, estado, monto_usd, monto_ars, monto_eur').eq('orden_id', ordenId).eq('cliente_id', clienteId).then((rRows) => {
                  const rows = rRows.data || [];
                  const idsTrxMomentoCero = rows.filter((r) => r.monto_usd != null || r.monto_ars != null || r.monto_eur != null).map((r) => r.transaccion_id);
                  const updates = rows.map((row) => {
                    const esDeEstaTrx = idsTrx.includes(row.transaccion_id);
                    const payload = {
                      estado_fecha: ahora,
                      estado: esDeEstaTrx ? estadoCc : (row.estado || 'pendiente'),
                    };
                    return client.from('movimientos_cuenta_corriente').update(payload).eq('id', row.id);
                  });
                  return Promise.all(updates).then(() => ({ data: rows, idsTrxMomentoCero }));
                });
              }
              let promCcInt = Promise.resolve({ data: [] });
              if (intermediarioId && nuevoEstado === 'pendiente' && idsTrx.length > 0) {
                // Misma regla que cliente: Debe (momento cero: tiene monto_usd/ars/eur) → solo estado pendiente; cobro (monto > 0) → borrar.
                promCcInt = client.from('movimientos_cuenta_corriente_intermediario').select('id, transaccion_id, monto, monto_usd, monto_ars, monto_eur').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).in('transaccion_id', idsTrx).then((rRows) => {
                  const rows = rRows.data || [];
                  if (rows.length === 0) return Promise.resolve({ data: [] });
                  const promises = rows.map((row) => {
                    const esMomentoCero = row.monto_usd != null || row.monto_ars != null || row.monto_eur != null;
                    if (esMomentoCero) return client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'pendiente', estado_fecha: ahora }).eq('id', row.id);
                    if (Number(row.monto) > 0) return client.from('movimientos_cuenta_corriente_intermediario').delete().eq('id', row.id);
                    return Promise.resolve();
                  });
                  return Promise.all(promises).then(() => ({ data: rows }));
                });
              }
              const promComisionPandy = client.from('comisiones_orden').select('monto').eq('orden_id', ordenId).eq('beneficiario', 'pandy').maybeSingle();
              // Cargar transacciones después del update para que la suma ejecutada incluya esta transacción ya como ejecutada (evita crear resto erróneo al ejecutar el 10k).
              const promTrxList = client.from('transacciones').select('id, tipo, monto, estado, cobrador, pagador').eq('instrumentacion_id', instrumentacionId);
              return Promise.all([promCcCliente, promCcInt, promComisionPandy]).then(([rCc, rCcInt, rCom]) =>
                promTrxList.then((rTrxList) => [rCc, rCcInt, rCom, rTrxList])
              ).then(([rCc, rCcInt, rCom, rTrxList]) => {
                const comisionPandyMonto = rCom.data != null ? Number(rCom.data.monto) : null;
                  const listTrx = rTrxList.data || [];
                  const sumIngresosClienteEjecutados = listTrx.filter((tr) => tr.tipo === 'ingreso' && tr.pagador === 'cliente' && tr.estado === 'ejecutada').reduce((s, tr) => s + Number(tr.monto), 0);
                  const sumEgresosClienteEjecutados = listTrx.filter((tr) => tr.tipo === 'egreso' && tr.cobrador === 'cliente' && tr.estado === 'ejecutada').reduce((s, tr) => s + Number(tr.monto), 0);
                  const idsTrxMomentoCero = rCc.idsTrxMomentoCero || [];
                  const rowsCc = rCc.data || [];
                  const rowDebe = rowsCc.find((r) => { const c = (r.concepto || '').toUpperCase(); return c.includes('DEBE') || c.includes('COMPROMISO DE PAGO'); });
                  const rowComp = rowsCc.find((r) => { const c = (r.concepto || '').normalize('NFD').replace(/\u0301/g, '').toUpperCase(); return c.includes('COMPENSACION') || c.includes('COMPROMISO A COBRAR'); });
                  const tieneMomentoCero = !!(rowDebe && rowComp && (rowDebe.monto_usd != null || rowDebe.monto_ars != null || rowDebe.monto_eur != null) && (rowComp.monto_usd != null || rowComp.monto_ars != null || rowComp.monto_eur != null));
                  const ingresoId = rowDebe && rowDebe.transaccion_id;
                  const egresoId = rowComp && rowComp.transaccion_id;
                  const esIngresoEjecutada = t.tipo === 'ingreso' && nuevoEstado === 'ejecutada' && idsTrxMomentoCero.includes(transaccionId);
                  const esEgresoEjecutada = t.tipo === 'egreso' && nuevoEstado === 'ejecutada' && idsTrxMomentoCero.includes(transaccionId);
                  // Solo hacer split cuando la fila CC (Debe/Compensación) representa MÁS que este monto: así no duplicamos al ejecutar la transacción "diferencia" creada por un split anterior.
                  const amountDebeMonR = rowDebe && (monR === 'USD' ? rowDebe.monto_usd : (monR === 'ARS' ? rowDebe.monto_ars : rowDebe.monto_eur));
                  const amountCompMonE = rowComp && (monE === 'USD' ? rowComp.monto_usd : (monE === 'ARS' ? rowComp.monto_ars : rowComp.monto_eur));
                  const splitIngreso = esIngresoEjecutada && mr > 1e-6 && montoActual > 1e-6 && (mr - montoActual) > 1e-6 && (Math.abs(Number(amountDebeMonR) || 0) - montoActual) > 1e-6;
                  const splitEgreso = esEgresoEjecutada && me > 1e-6 && montoActual > 1e-6 && (me - montoActual) > 1e-6 && (Math.abs(Number(amountCompMonE) || 0) - montoActual) > 1e-6;
                  const split = (splitIngreso || splitEgreso) && rowDebe && rowComp && clienteId;
                  // Split sin momento cero: solo crear "resto" si tras esta ejecución el cliente aún no completó (suma ejecutada < mr/me). Así no se genera un resto erróneo al ejecutar la transacción de 10k que ya era el resto de un split anterior.
                  const faltaIngreso = mr - sumIngresosClienteEjecutados > 1e-6;
                  const faltaEgreso = me - sumEgresosClienteEjecutados > 1e-6;
                  const splitSinMomentoCero = !tieneMomentoCero && nuevoEstado === 'ejecutada' && clienteId && (
                    (t.tipo === 'ingreso' && pag === 'cliente' && mr > 1e-6 && montoActual > 1e-6 && faltaIngreso) ||
                    (t.tipo === 'egreso' && cob === 'cliente' && me > 1e-6 && montoActual > 1e-6 && faltaEgreso)
                  );
                  let promSplitSinMc = Promise.resolve(null);
                  if (splitSinMomentoCero) {
                    const diferencia = t.tipo === 'ingreso' ? (mr - sumIngresosClienteEjecutados) : (me - sumEgresosClienteEjecutados);
                    if (diferencia < 1e-6) { /* no crear resto si ya no hay diferencia */ } else {
                    promSplitSinMc = client.from('transacciones').insert({
                      instrumentacion_id: instrumentacionId,
                      tipo: t.tipo,
                      modo_pago_id: t.modo_pago_id,
                      moneda: t.moneda || (t.tipo === 'ingreso' ? monR : monE),
                      monto: diferencia,
                      cobrador: cob,
                      pagador: pag,
                      owner: t.owner || 'pandy',
                      estado: 'pendiente',
                      concepto: t.concepto || '',
                      tipo_cambio: t.tipo_cambio || null,
                      updated_at: ahora,
                    }).select('id').single().then((r) => r.data && r.data.id);
                    }
                  }
                  let promSplit = Promise.resolve(null);
                  if (split && splitIngreso) {
                    const restoEnFila = Math.abs(Number(amountDebeMonR) || 0);
                    const diferencia = restoEnFila - montoActual;
                    if (diferencia >= 1e-6) {
                      promSplit = client.from('transacciones').insert({
                        instrumentacion_id: instrumentacionId,
                        tipo: 'ingreso',
                        modo_pago_id: t.modo_pago_id,
                        moneda: t.moneda || monR,
                        monto: diferencia,
                        cobrador: cob,
                        pagador: pag,
                        owner: t.owner || 'pandy',
                        estado: 'pendiente',
                        concepto: t.concepto || '',
                        tipo_cambio: t.tipo_cambio || null,
                        updated_at: ahora,
                      }).select('id').single().then((r) => r.data && r.data.id);
                    }
                  } else if (split && splitEgreso) {
                    const restoEnFila = Math.abs(Number(amountCompMonE) || 0);
                    const diferencia = restoEnFila - montoActual;
                    if (diferencia >= 1e-6) {
                      promSplit = client.from('transacciones').insert({
                        instrumentacion_id: instrumentacionId,
                        tipo: 'egreso',
                        modo_pago_id: t.modo_pago_id,
                        moneda: t.moneda || monE,
                        monto: diferencia,
                        cobrador: cob,
                        pagador: pag,
                        owner: t.owner || 'pandy',
                        estado: 'pendiente',
                        concepto: t.concepto || '',
                        tipo_cambio: t.tipo_cambio || null,
                        updated_at: ahora,
                      }).select('id').single().then((r) => r.data && r.data.id);
                    }
                  }
                  const insertsCc = [];
                  const updatesCc = [];
                  let promBorrarCancelacion = Promise.resolve();
                  if (nuevoEstado === 'pendiente' && clienteId && idsTrx.length > 0) {
                    promBorrarCancelacion = client.from('movimientos_cuenta_corriente').select('id, concepto').eq('orden_id', ordenId).eq('cliente_id', clienteId).in('transaccion_id', idsTrx).then((rDel) => {
                      const rows = rDel.data || [];
                      const idsCancel = rows.filter((r) => (r.concepto || '').includes('Cancelación de deuda') || (r.concepto || '').includes('Contraparte cancelación')).map((x) => x.id);
                      if (idsCancel.length > 0) return Promise.all(idsCancel.map((id) => client.from('movimientos_cuenta_corriente').delete().eq('id', id)));
                    });
                  }
                  return promBorrarCancelacion.then(() => Promise.all([promSplit, promSplitSinMc])).then(([newTrxId]) => {
                    if (nuevoEstado === 'ejecutada' && split && newTrxId != null) {
                      if (splitIngreso) {
                        const restoEnFilaIng = Math.abs(Number(amountDebeMonR) || 0);
                        const diferencia = restoEnFilaIng - montoActual;
                        const ejecutadoMr = montoActual;
                        const ejecutadoMe = monR === monE ? montoActual : ratioCc(montoActual * me, mr, montoActual);
                        const montoUsdCancel = numCc(monR === 'USD' ? ejecutadoMr : (monE === 'USD' ? ejecutadoMe : 0));
                        const montoArsCancel = numCc(monR === 'ARS' ? ejecutadoMr : (monE === 'ARS' ? ejecutadoMe : 0));
                        const montoEurCancel = numCc(monR === 'EUR' ? ejecutadoMr : (monE === 'EUR' ? ejecutadoMe : 0));
                        const difUsd = monR === 'USD' ? -diferencia : (monE === 'USD' ? -ratioCc(me * diferencia, mr, diferencia) : 0);
                        const difArs = monR === 'ARS' ? -diferencia : (monE === 'ARS' ? -ratioCc(me * diferencia, mr, diferencia) : 0);
                        const difEur = monR === 'EUR' ? -diferencia : (monE === 'EUR' ? -ratioCc(me * diferencia, mr, diferencia) : 0);
                        const remUsd = monR === 'USD' ? diferencia : (monE === 'USD' ? ratioCc(me * diferencia, mr, diferencia) : 0);
                        const remArs = monR === 'ARS' ? diferencia : (monE === 'ARS' ? ratioCc(me * diferencia, mr, diferencia) : 0);
                        const remEur = monR === 'EUR' ? diferencia : (monE === 'EUR' ? ratioCc(me * diferencia, mr, diferencia) : 0);
                        insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                          cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId,
                          concepto: 'Cancelación de deuda ' + ordenLabel,
                          fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                          monto_usd: montoUsdCancel, monto_ars: montoArsCancel, monto_eur: montoEurCancel,
                          moneda: monR, monto: 0,
                        }));
                        updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                          transaccion_id: newTrxId,
                          monto_usd: difUsd, monto_ars: difArs, monto_eur: difEur,
                          estado_fecha: ahora,
                        }).eq('id', rowDebe.id));
                        updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                          monto_usd: remUsd, monto_ars: remArs, monto_eur: remEur,
                          estado_fecha: ahora,
                        }).eq('id', rowComp.id));
                      } else {
                        const restoEnFilaEgr = Math.abs(Number(amountCompMonE) || 0);
                        const diferencia = restoEnFilaEgr - montoActual;
                        const ejecutadoMe = montoActual;
                        const ejecutadoMr = monR === monE ? montoActual : ratioCc(montoActual * mr, me, montoActual);
                        const montoUsdCancel = numCc(monR === 'USD' ? -ejecutadoMr : (monE === 'USD' ? -ejecutadoMe : 0));
                        const montoArsCancel = numCc(monR === 'ARS' ? -ejecutadoMr : (monE === 'ARS' ? -ejecutadoMe : 0));
                        const montoEurCancel = numCc(monR === 'EUR' ? -ejecutadoMr : (monE === 'EUR' ? -ejecutadoMe : 0));
                        // Egreso: diferencia está en monE; Debe (monR) debe llevar equivalente mr*diferencia/me
                        const difUsd = numCc(monR === 'USD' ? -ratioCc(mr * diferencia, me, diferencia) : (monE === 'USD' ? -diferencia : 0));
                        const difArs = numCc(monR === 'ARS' ? -ratioCc(mr * diferencia, me, diferencia) : (monE === 'ARS' ? -diferencia : 0));
                        const difEur = numCc(monR === 'EUR' ? -ratioCc(mr * diferencia, me, diferencia) : (monE === 'EUR' ? -diferencia : 0));
                        const remUsd = numCc(monR === 'USD' ? ratioCc(mr * diferencia, me, diferencia) : (monE === 'USD' ? diferencia : 0));
                        const remArs = numCc(monR === 'ARS' ? ratioCc(mr * diferencia, me, diferencia) : (monE === 'ARS' ? diferencia : 0));
                        const remEur = numCc(monR === 'EUR' ? ratioCc(mr * diferencia, me, diferencia) : (monE === 'EUR' ? diferencia : 0));
                        insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                          cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId,
                          concepto: 'Cancelación de deuda ' + ordenLabel,
                          fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                          monto_usd: montoUsdCancel, monto_ars: montoArsCancel, monto_eur: montoEurCancel,
                          moneda: monE, monto: 0,
                        }));
                        updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                          transaccion_id: newTrxId,
                          monto_usd: remUsd, monto_ars: remArs, monto_eur: remEur,
                          estado_fecha: ahora,
                        }).eq('id', rowComp.id));
                        updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                          monto_usd: difUsd, monto_ars: difArs, monto_eur: difEur,
                          estado_fecha: ahora,
                        }).eq('id', rowDebe.id));
                      }
                    } else if (nuevoEstado === 'ejecutada') {
                      listaTrx.forEach((item) => {
                        if (!item.id) return;
                        if (idsTrxMomentoCero.includes(item.id) && clienteId && !split) {
                          if (monR !== monE && item.pagador === 'cliente') {
                            const montoTrx = Number(item.monto) || 0;
                            const enMonEVal = ratioCc(montoTrx * me, mr, montoTrx);
                            const cancelacion = { monto_usd: numCc(monR === 'USD' ? montoTrx : 0), monto_ars: numCc(monR === 'ARS' ? montoTrx : 0), monto_eur: numCc(monR === 'EUR' ? montoTrx : 0) };
                            const contraparte = { monto_usd: numCc(monR === 'USD' ? -montoTrx : (monE === 'USD' ? -enMonEVal : 0)), monto_ars: numCc(monR === 'ARS' ? -montoTrx : (monE === 'ARS' ? -enMonEVal : 0)), monto_eur: numCc(monR === 'EUR' ? -montoTrx : (monE === 'EUR' ? -enMonEVal : 0)) };
                            insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                              cliente_id: clienteId, orden_id: ordenId, transaccion_id: item.id,
                              concepto: 'Cancelación de deuda ' + ordenLabel,
                              fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                              monto_usd: cancelacion.monto_usd, monto_ars: cancelacion.monto_ars, monto_eur: cancelacion.monto_eur,
                              moneda: item.moneda || 'USD', monto: 0,
                            }));
                            insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                              cliente_id: clienteId, orden_id: ordenId, transaccion_id: item.id,
                              concepto: 'Contraparte cancelación ' + ordenLabel,
                              fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                              monto_usd: contraparte.monto_usd, monto_ars: contraparte.monto_ars, monto_eur: contraparte.monto_eur,
                              moneda: item.moneda || 'USD', monto: 0,
                            }));
                          } else {
                            const montos = montosCancelacion(item);
                            insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                              cliente_id: clienteId, orden_id: ordenId, transaccion_id: item.id,
                              concepto: 'Cancelación de deuda ' + ordenLabel,
                              fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                              monto_usd: montos.monto_usd, monto_ars: montos.monto_ars, monto_eur: montos.monto_eur,
                              moneda: item.moneda || 'USD', monto: 0,
                            }));
                          }
                        }
                      });
                      const esPandyInt = (cob === 'pandy' && pag === 'intermediario') || (cob === 'intermediario' && pag === 'pandy');
                      listaTrx.forEach((item) => {
                        if (!item.id) return;
                        const needLegacyCc = !idsTrxMomentoCero.includes(item.id);
                        const montoItem = Number(item.monto) || 0;
                        const conceptoCc = item.concepto || conceptoCcMovimiento(item.moneda, item.monto, item.pagador === 'cliente' ? 'cobro' : 'deuda');
                        const montosCobroItem = montosCcPorMoneda(item.moneda || 'USD', montoItem);
                        const montosDeudaItem = montosCcPorMoneda(item.moneda || 'USD', -montoItem);
                        const esComisionPandyItem = item.pagador === 'cliente' && item.cobrador === 'pandy' && intermediarioId && comisionPandyMonto != null && Math.abs(montoItem - comisionPandyMonto) < 1e-6;
                        if (needLegacyCc && item.pagador === 'cliente' && item.cobrador !== 'intermediario' && clienteId && !esComisionPandyItem) {
                          insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                            cliente_id: clienteId, moneda: item.moneda, monto: montoItem, orden_id: ordenId, transaccion_id: item.id,
                            concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                            ...montosCobroItem,
                          }));
                        }
                        if (needLegacyCc && cob === 'cliente' && pag !== 'intermediario' && clienteId) {
                          insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                            cliente_id: clienteId, moneda: item.moneda, monto: -montoItem, orden_id: ordenId, transaccion_id: item.id,
                            concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                            ...montosDeudaItem,
                          }));
                        }
                        if (esPandyInt && pag === 'intermediario' && intermediarioId) {
                          // Momento cero: ya existe fila Debe (-mr); solo actualizar a cerrado. No insertar para no duplicar.
                          insertsCc.push(
                            client.from('movimientos_cuenta_corriente_intermediario').select('id, concepto, monto').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', item.id).then((rRows) => {
                              const rows = rRows.data || [];
                              const esMomentoCeroDebe = rows.some((r) => (Number(r.monto) || 0) < 0 && ((r.concepto || '').includes('Compromiso de Pago') || (r.concepto || '').includes('Debe')));
                              const promUpdate = client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora })
                                .eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', item.id).eq('estado', 'pendiente');
                              if (esMomentoCeroDebe) return promUpdate;
                              return promUpdate.then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
                                intermediario_id: intermediarioId, moneda: item.moneda, monto: montoItem, orden_id: ordenId, transaccion_id: item.id,
                                concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                                ...montosCcPorMoneda(item.moneda || 'USD', montoItem),
                              }));
                            })
                          );
                        }
                        if (esPandyInt && cob === 'intermediario' && intermediarioId) {
                          const tasa = Number(orden.tasa_descuento_intermediario) || 0;
                          const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;
                          const monInt = orden.moneda_recibida || item.moneda || 'ARS';
                          // Momento cero: ya existe fila Compensación (+mr); solo actualizar a cerrado. Si no, insertar Cobro Realizado +montoEfectivoInt.
                          insertsCc.push(
                            client.from('movimientos_cuenta_corriente_intermediario').select('id, concepto, monto').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', item.id).then((rRows) => {
                              const rows = rRows.data || [];
                              const esMomentoCeroComp = rows.some((r) => (Number(r.monto) || 0) > 0 && ((r.concepto || '').includes('Compromiso a Cobrar') || (r.concepto || '').includes('Compensación')));
                              const promUpdate = rows.length > 0
                                ? client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora }).eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', item.id).eq('estado', 'pendiente')
                                : Promise.resolve();
                              if (esMomentoCeroComp) return promUpdate;
                              return promUpdate.then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
                                intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: item.id, transaccion_numero: item.numero != null ? item.numero : null,
                                moneda: monInt, monto: montoEfectivoInt,
                                concepto: conceptoCcLeyenda('cobro_realizado', orden && orden.numero != null ? orden.numero : null, item.numero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                                ...montosCcPorMoneda(monInt, montoEfectivoInt),
                              })).then(() => client.from('comisiones_orden').select('moneda, monto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario').maybeSingle())
                                .then((rCom) => {
                                  const comMonto = rCom.data && (Number(rCom.data.monto) || 0);
                                  if (comMonto >= 1e-6) {
                                    const monCom = (rCom.data.moneda || 'ARS').toUpperCase();
                                    return client.from('movimientos_cuenta_corriente_intermediario').insert({
                                      intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: item.id, transaccion_numero: item.numero != null ? item.numero : null,
                                      moneda: monCom, monto: -comMonto,
                                      concepto: conceptoCcLeyenda('comision_acuerdo', orden && orden.numero != null ? orden.numero : null, item.numero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                                      ...montosCcPorMoneda(monCom, -comMonto),
                                    }).then(() => asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, comMonto, monCom, orden && orden.numero != null ? orden.numero : null, item.numero != null ? item.numero : null));
                                  }
                                  return Promise.resolve();
                                });
                            })
                          );
                        }
                        if (cob === 'cliente' && pag === 'intermediario' && intermediarioId) {
                          insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                            intermediario_id: intermediarioId, moneda: item.moneda, monto: -montoItem, orden_id: ordenId, transaccion_id: item.id,
                            transaccion_numero: item.numero != null ? item.numero : null,
                            concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                            ...montosCcPorMoneda(item.moneda || 'USD', -montoItem),
                          }));
                        }
                        if (cob === 'intermediario' && pag === 'cliente' && intermediarioId) {
                          insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                            intermediario_id: intermediarioId, moneda: item.moneda, monto: -montoItem, orden_id: ordenId, transaccion_id: item.id,
                            transaccion_numero: item.numero != null ? item.numero : null,
                            concepto: conceptoCcLeyenda('pago_realizado', orden && orden.numero != null ? orden.numero : null, item.numero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                            ...montosCcPorMoneda(item.moneda || 'USD', -montoItem),
                          }));
                        }
                      });
                    }
                    const promUpdatesCc = updatesCc.length > 0 ? Promise.all(updatesCc) : Promise.resolve();
                    function actualizarEstadoYConversion() {
                      return actualizarEstadoOrden(ordenId).then((res) => {
                        return res;
                      }).then(() => ({ ordenId, instrumentacionId }));
                    }
                    function actualizarEstadoSinSync() {
                      return actualizarEstadoOrden(ordenId).then(() => actualizarEstadoYConversion());
                    }
                    return Promise.all(insertsCc).then(() => promUpdatesCc).then(() => {
                        if (nuevoEstado !== 'ejecutada') {
                        let promReversa = Promise.resolve();
                        if (cob === 'pandy' && pag === 'intermediario' && intermediarioId) {
                          promReversa = promReversa.then(() => revertirComisionIntermediario(ordenId)).then(() =>
                            client.from('movimientos_cuenta_corriente_intermediario').select('id, concepto').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).then((rRows) => {
                              const rows = rRows.data || [];
                              const idsBorrar = rows.filter((r) => (r.concepto || '').includes('Compromiso a Cobrar') || (r.concepto || '').includes('Comisión del acuerdo')).map((r) => r.id);
                              const rowDebe = rows.find((r) => (r.concepto || '').toLowerCase().includes('compromiso a cobrar'));
                              const del = idsBorrar.length > 0 ? Promise.all(idsBorrar.map((id) => client.from('movimientos_cuenta_corriente_intermediario').delete().eq('id', id))) : Promise.resolve();
                              const monR = orden.moneda_recibida || 'ARS';
                              const montoUsd = monR === 'USD' ? -mr : 0;
                              const montoArs = monR === 'ARS' ? -mr : 0;
                              const montoEur = monR === 'EUR' ? -mr : 0;
                              const upd = rowDebe && rowDebe.id ? client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'pendiente', estado_fecha: ahora, monto_usd: montoUsd, monto_ars: montoArs, monto_eur: montoEur }).eq('id', rowDebe.id) : Promise.resolve();
                              return del.then(() => upd);
                            })
                          );
                        }
                        if (cob === 'intermediario' && pag === 'pandy' && intermediarioId) {
                          promReversa = promReversa.then(() =>
                            client.from('movimientos_cuenta_corriente_intermediario').select('id, concepto').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).then((rRows) => {
                              const rows = rRows.data || [];
                              const idsBorrar = rows.filter((r) => (r.concepto || '').includes('Cobro') || (r.concepto || '').includes('Descuento')).map((r) => r.id);
                              const idCompensacion = rows.find((r) => (r.concepto || '').toLowerCase().includes('compensacion'));
                              const del = idsBorrar.length > 0 ? Promise.all(idsBorrar.map((id) => client.from('movimientos_cuenta_corriente_intermediario').delete().eq('id', id))) : Promise.resolve();
                              const upd = idCompensacion ? client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'pendiente', estado_fecha: ahora }).eq('id', idCompensacion.id) : Promise.resolve();
                              return del.then(() => upd);
                            })
                          );
                        }
                        // Revertir Ganancia del acuerdo si esta transacción es ingreso cliente→Pandy y había comisión.
                        const esIngresoClientePandyLegacy = (t.tipo || '').toLowerCase() === 'ingreso' && pag === 'cliente' && cob === 'pandy';
                        const comisionPandyLegacy = (monR === monE && mr > me) ? mr - me : 0;
                        if (esIngresoClientePandyLegacy && clienteId && comisionPandyLegacy >= 1e-6) {
                          promReversa = promReversa.then(() => revertirGananciaPandy(ordenId, orden, clienteId, comisionPandyLegacy));
                        }
                        return promReversa.then(() => actualizarEstadoSinSync());
                      }
                      const pandyParticipa = cob === 'pandy' || pag === 'pandy';
                      if (!pandyParticipa) return actualizarEstadoSinSync();
                      let promCaja = Promise.resolve();
                      listaTrx.forEach((item) => {
                        if (!item.id || !item.modo_pago_id) return;
                        promCaja = promCaja.then(() =>
                          client.from('movimientos_caja').select('id').eq('transaccion_id', item.id).limit(1).then((rCaja) => {
                            if (rCaja.data && rCaja.data.length > 0) return;
                            return client.from('modos_pago').select('codigo').eq('id', item.modo_pago_id).single().then((rModo) => {
                              const codigo = (rModo.data && rModo.data.codigo) || '';
                              const cajaTipo = codigoCajaTipoDesdeCodigo(codigo);
                              const signoCaja = (item.cobrador || '') === 'pandy' ? 1 : -1;
                              const concepto = conceptoCajaTransaccion((item.cobrador || '') === 'pandy', item.moneda, Number(item.monto) || 0, orden.numero, item.numero);
                              return client.from('movimientos_caja').insert({
                                moneda: item.moneda, monto: signoCaja * Number(item.monto), caja_tipo: cajaTipo, transaccion_id: item.id,
                                orden_numero: orden.numero != null ? orden.numero : null, transaccion_numero: item.numero != null ? item.numero : null,
                                concepto, fecha, usuario_id: currentUserId,
                              });
                            });
                          })
                        );
                      });
                      return promCaja.then(() => actualizarEstadoSinSync()).then(() => {
                        if (ordenWizardInstrumentacionIdActual && instrumentacionId && ordenWizardInstrumentacionIdActual === instrumentacionId) renderOrdenWizardInstrumentacion(instrumentacionId);
                        refreshCcView();
                      });
    });
    });
  });
  });
  });
  });
  });
  } } )();
  return promCambioEstado.then((ctx) => {
    hideLoadingEstado();
    if (ctx && ctx.ordenId) {
      if (ordenWizardInstrumentacionIdActual === instrumentacionId) {
        renderOrdenWizardInstrumentacion(instrumentacionId);
        // No llamar loadOrdenes() con el modal abierto: la vista Órdenes cargando atrás hace que el modal pierda el foco.
      } else {
        refreshTransaccionesPanel(ctx.ordenId);
        // No llamar loadOrdenes() para no colapsar la fila de transacciones expandida.
      }
      const vistaCc = document.getElementById('vista-cuenta-corriente');
      if (vistaCc && vistaCc.style.display !== 'none') loadCuentaCorriente();
      showToast('Estado de la transacción actualizado.', 'success');
    }
  }).catch((err) => {
    hideLoadingEstado();
    if (err && err.message) showToast('Error: ' + err.message, 'error');
    if (ordenWizardInstrumentacionIdActual === instrumentacionId && instrumentacionId) {
      renderOrdenWizardInstrumentacion(instrumentacionId);
    }
  });
}

function saveTransaccion() {
  const idEl = document.getElementById('transaccion-id');
  const instIdEl = document.getElementById('transaccion-instrumentacion-id');
  const id = idEl?.value?.trim() || '';
  const instrumentacionId = instIdEl?.value?.trim();
  if (!instrumentacionId) {
    showToast('Falta instrumentación.', 'error');
    return;
  }
  const esOrdenCheque = document.getElementById('transaccion-es-orden-cheque')?.value === '1';
  const tipo = document.getElementById('transaccion-tipo').value;
  const modoPagoId = (document.getElementById('transaccion-modo-pago').value || '').trim();
  if (!modoPagoId) {
    showToast('Elegí un modo de pago.', 'error');
    return;
  }
  const moneda = esOrdenCheque ? 'ARS' : document.getElementById('transaccion-moneda').value;
  const monto = parseImporteInput(document.getElementById('transaccion-monto').value);
  const cobrador = document.getElementById('transaccion-cobrador').value;
  const pagador = document.getElementById('transaccion-pagador').value;
  if (cobrador === pagador) {
    showToast('El cobrador y el pagador deben ser distintos.', 'error');
    return;
  }
  const estado = document.getElementById('transaccion-estado').value;
  const conceptoRaw = document.getElementById('transaccion-concepto').value.trim();
  const concepto = conceptoRaw || null;
  const tipoCambioRaw = document.getElementById('transaccion-tipo-cambio').value.trim();
  const tipoCambio = esOrdenCheque ? null : (tipoCambioRaw ? parseImporteInput(tipoCambioRaw) : null);

  if (isNaN(monto) || monto <= 0) {
    showToast(esOrdenCheque || moneda !== 'ARS' ? 'Monto debe ser un número positivo.' : 'Completá el monto en la moneda indicada; el tipo de cambio se toma del acuerdo.', 'error');
    return;
  }

  const transaccionProyectada = { tipo, moneda, monto, tipo_cambio: tipoCambio, cobrador, pagador };

  client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rInst) => {
    const ordenId = rInst.data?.orden_id;
    if (!ordenId) {
      showToast('No se encontró la orden de esta instrumentación.', 'error');
      return;
    }
    client.from('ordenes').select('id, cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, cotizacion').eq('id', ordenId).single().then((rOrd) => {
      const orden = rOrd.data;
      if (!orden) {
        showToast('No se encontró la orden.', 'error');
        return;
      }
      client.from('transacciones').select('id, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instrumentacionId).then((rTr) => {
        const list = rTr.data || [];
        const validacion = validarTotalesVsAcuerdo(list, orden, id || null, transaccionProyectada);
        if (!validacion.ok) {
          showToast(validacion.mensaje, 'error');
          return;
        }
        const trActual = id ? list.find((t) => t.id === id) : null;
        const oldMonto = trActual != null && !isNaN(Number(trActual.monto)) ? Number(trActual.monto) : null;
        const bajandoImporte = id && oldMonto != null && monto < oldMonto - 1e-6;
        const diferenciaComp = bajandoImporte ? oldMonto - monto : null;
        const esParPandyIntermediario =
          (cobrador === 'pandy' && pagador === 'intermediario') || (cobrador === 'intermediario' && pagador === 'pandy');
        if (bajandoImporte && diferenciaComp > 0) {
          // Si es momento cero + guardamos ejecutada + monto menor: el split crea la diferencia; no ofrecer "compensatoria" para no duplicar.
          return client.from('movimientos_cuenta_corriente').select('id, monto_usd, monto_ars, monto_eur').eq('transaccion_id', id).then((rMov) => {
            const filas = rMov.data || [];
            const tieneMomentoCero = filas.some((m) => m.monto_usd != null || m.monto_ars != null || m.monto_eur != null);
            const mr = Number(orden.monto_recibido) || 0;
            const me = Number(orden.monto_entregado) || 0;
            const esSplit = tieneMomentoCero && estado === 'ejecutada' && (
              (tipo === 'ingreso' && mr > 1e-6 && monto > 1e-6 && (mr - monto) > 1e-6) ||
              (tipo === 'egreso' && me > 1e-6 && monto > 1e-6 && (me - monto) > 1e-6)
            );
            if (esSplit || esParPandyIntermediario) {
              guardarTransaccionPayload();
            } else {
              showConfirm(
                `Estás bajando el importe. ¿Querés que el sistema genere una transacción compensatoria con los mismos datos por ${formatImporteDisplay(diferenciaComp)} ${moneda} para cerrar el acuerdo?`,
                'Sí, generar compensatoria',
                () => guardarTransaccionPayload(diferenciaComp),
                () => guardarTransaccionPayload()
              );
            }
          });
        }
        guardarTransaccionPayload();
      });
    });
  });

  function guardarTransaccionPayload(montoCompensatorio) {
  const payload = {
    instrumentacion_id: instrumentacionId,
    tipo,
    modo_pago_id: modoPagoId,
    moneda,
    monto,
    cobrador,
    pagador,
    owner: cobrador,
    estado,
    concepto,
    tipo_cambio: tipoCambio,
    updated_at: new Date().toISOString(),
  };
  if (estado === 'ejecutada') payload.fecha_ejecucion = new Date().toISOString().slice(0, 10);
  if (estado === 'ejecutada') payload.usuario_id = currentUserId;

  const prom = id
    ? client.from('transacciones').update(payload).eq('id', id)
    : client.from('transacciones').insert(payload).select('id, numero').single();

  function insertarCompensatoria() {
    if (!montoCompensatorio || montoCompensatorio <= 0) return Promise.resolve();
    const payloadComp = {
      instrumentacion_id: instrumentacionId,
      tipo,
      modo_pago_id: modoPagoId,
      moneda,
      monto: montoCompensatorio,
      cobrador,
      pagador,
      owner: cobrador,
      estado: 'pendiente',
      concepto: 'Compensación por reducción de importe',
      tipo_cambio: tipoCambio,
      updated_at: new Date().toISOString(),
    };
    return client.from('transacciones').insert(payloadComp).then((r) => {
      if (r.error) showToast('Error al crear la transacción compensatoria: ' + (r.error.message || ''), 'error');
      else showToast('Transacción compensatoria creada por ' + formatImporteDisplay(montoCompensatorio) + ' ' + moneda + '.', 'success');
    });
  }

  prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return;
    }
    const transaccionId = id || (res.data && (res.data.id || (res.data[0] && res.data[0].id)));
    const transaccionNumero = id ? null : (res.data && (res.data.numero != null ? res.data.numero : (res.data[0] && res.data[0].numero)));
    if (!transaccionId) {
      closeModalTransaccion();
      refreshTransaccionesModal();
      return;
    }
    function continuarFlujo() {
    const fecha = new Date().toISOString().slice(0, 10);
    const ahora = new Date().toISOString();

    function refreshCcView() {
      const vistaCc = document.getElementById('vista-cuenta-corriente');
      if (vistaCc && vistaCc.style.display !== 'none') loadCuentaCorriente();
      if (ccDetalleId && ccDetalleTipo) {
        fetchMovimientosCcPorEntidad(ccDetalleTipo, ccDetalleId).then(({ movimientos, saldos, ordenes }) => {
          ccDetalleMovimientosList = ccDetalleRowsConTipoOpDesdeOrdenes(movimientos, ordenes);
          ccDetalleOrdenesList = ordenes || [];
          renderCcDetalleTable();
          const saldosWrap = document.getElementById('modal-cc-detalle-saldos');
          if (saldosWrap && saldos) {
            saldosWrap.innerHTML = htmlCcModalSaldosCards(saldos);
            reaplicarVisibilidadMonedasCuentaCorrienteDom();
          }
          renderCcDetalleOperaciones();
          const operacionesWrap = document.getElementById('modal-cc-detalle-operaciones-wrap');
          if (operacionesWrap) operacionesWrap.style.display = (ccDetalleOrdenesList.length > 0) ? 'block' : 'none';
        });
      }
    }

    function hacerCierre(ordenIdFromSave) {
      closeModalTransaccion();
      refreshTransaccionesModal();
      const ordenId = ordenIdFromSave || transaccionesOrdenIdActual;
      if (ordenWizardInstrumentacionIdActual && instrumentacionId && ordenWizardInstrumentacionIdActual === instrumentacionId) {
        renderOrdenWizardInstrumentacion(instrumentacionId);
      }
      if (ordenId) {
        actualizarEstadoOrden(ordenId)
          .then((res) => {
            mostrarMensajeSiInstrumentacionCerrada(res);
            return res;
          })
          .then((res) => {
            if (res && res.estado === 'instrumentacion_cerrada_ejecucion') {
              return client.from('ordenes').select('intermediario_id, tipos_operacion(codigo, moneda_in, moneda_out, usa_intermediario)').eq('id', ordenId).single().then((rOrd) => {
                const orden = rOrd.data || {};
                const toSt = orden.tipos_operacion && (Array.isArray(orden.tipos_operacion) ? orden.tipos_operacion[0] : orden.tipos_operacion);
                const usaIntermediarioTipo = !!(toSt && toSt.usa_intermediario);
                const miSt = (toSt && toSt.moneda_in || '').toString().toUpperCase().trim();
                const moSt = (toSt && toSt.moneda_out || '').toString().toUpperCase().trim();
                const esDosMonedasConIntermediario = !!patronTipoCambioOrden(miSt, moSt) && usaIntermediarioTipo;
                if (esDosMonedasConIntermediario) return res;
                // No generar transacciones automáticas Pandy↔Intermediario (compensación/comisiones en instrumentación): va por CC y carga manual si aplica.
                return res;
              });
            }
            return res;
          })
          .then((res) => {
            // Con la lógica nueva de CC no se generan movimientos "Conversión de moneda"
            return res;
          })
          .then(() => {
            if (ordenWizardInstrumentacionIdActual && instrumentacionId && ordenWizardInstrumentacionIdActual === instrumentacionId) renderOrdenWizardInstrumentacion(instrumentacionId);
            refreshCcView();
          });
      } else {
        refreshCcView();
      }
    } // continuarCambioEstado

    client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rOrd) => {
      const ordenId = rOrd.data && rOrd.data.orden_id;
      if (!ordenId) {
        hacerCierre();
        return;
      }
      client.from('ordenes').select('cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, numero, tasa_descuento_intermediario, tipos_operacion(codigo, moneda_in, moneda_out)').eq('id', ordenId).single().then((rO) => {
        const orden = rO.data || {};
        const clienteId = orden.cliente_id || null;
        const intermediarioId = orden.intermediario_id || null;
        const mr = Number(orden.monto_recibido) || 0;
        const me = Number(orden.monto_entregado) || 0;
        const monR = orden.moneda_recibida || 'USD';
        const monE = orden.moneda_entregada || 'USD';
        const ordenLabel = orden.numero != null ? 'nro orden ' + orden.numero : 'nro orden ' + (ordenId || '').toString().slice(0, 8);
        return client.from('comisiones_orden').select('monto').eq('orden_id', ordenId).eq('beneficiario', 'pandy').maybeSingle().then((rCom) => {
          const comisionPandyMonto = rCom.data != null ? Number(rCom.data.monto) : null;
          return { orden, clienteId, intermediarioId, mr, me, monR, monE, ordenLabel, ordenId, comisionPandyMonto };
        });
      }).then(({ orden, clienteId, intermediarioId, mr, me, monR, monE, ordenLabel, ordenId, comisionPandyMonto }) => {
        const esOrdenCheque = esTipoOperacionChequeArsDesdeJoin(orden.tipos_operacion);
        // Cuenta corriente: si estamos editando (id), revertir Cancelación y caja de esta transacción para re-aplicar con los nuevos valores.
        let promRevert = Promise.resolve();
        if (id && clienteId) {
          promRevert = Promise.all([
            client.from('movimientos_cuenta_corriente').select('id').eq('orden_id', ordenId).eq('cliente_id', clienteId).eq('transaccion_id', transaccionId).like('concepto', 'Cancelación%'),
            client.from('movimientos_cuenta_corriente').select('id').eq('orden_id', ordenId).eq('cliente_id', clienteId).eq('transaccion_id', transaccionId).like('concepto', 'Contraparte cancelación%'),
          ]).then(([rDel1, rDel2]) => {
            const ids = [...(rDel1.data || []), ...(rDel2.data || [])].map((x) => x.id);
            const delCc = ids.length > 0 ? Promise.all(ids.map((idDel) => client.from('movimientos_cuenta_corriente').delete().eq('id', idDel))) : Promise.resolve();
            return delCc.then(() => client.from('movimientos_caja').delete().eq('transaccion_id', transaccionId));
          });
        }
        promRevert.then(() => Promise.all([
          client.from('movimientos_cuenta_corriente').select('id, transaccion_id, concepto, monto_usd, monto_ars, monto_eur').eq('orden_id', ordenId).eq('cliente_id', clienteId),
          client.from('transacciones').select('id, tipo, monto, estado, cobrador, pagador').eq('instrumentacion_id', instrumentacionId),
        ])).then(([rMov, rTrxList]) => {
          const filasCc = rMov.data || [];
          const listTrx = rTrxList.data || [];
          const sumIngresosOthers = listTrx.filter((tr) => tr.tipo === 'ingreso' && tr.pagador === 'cliente' && tr.estado === 'ejecutada' && tr.id !== transaccionId).reduce((s, tr) => s + Number(tr.monto), 0);
          const sumEgresosOthers = listTrx.filter((tr) => tr.tipo === 'egreso' && tr.cobrador === 'cliente' && tr.estado === 'ejecutada' && tr.id !== transaccionId).reduce((s, tr) => s + Number(tr.monto), 0);
          const sumIngresosClienteEjecutados = sumIngresosOthers + (tipo === 'ingreso' && pagador === 'cliente' && estado === 'ejecutada' ? monto : 0);
          const sumEgresosClienteEjecutados = sumEgresosOthers + (tipo === 'egreso' && cobrador === 'cliente' && estado === 'ejecutada' ? monto : 0);
          const filasDeEstaTrx = filasCc.filter((m) => m.transaccion_id === transaccionId);
          const rowDebe = filasCc.find((r) => { const c = (r.concepto || '').toUpperCase(); return c.includes('DEBE') || c.includes('COMPROMISO DE PAGO'); });
          const rowComp = filasCc.find((r) => { const c = (r.concepto || '').normalize('NFD').replace(/\u0301/g, '').toUpperCase(); return c.includes('COMPENSACION') || c.includes('COMPROMISO A COBRAR'); });
          const tieneMomentoCero = !!(rowDebe && rowComp && (rowDebe.monto_usd != null || rowDebe.monto_ars != null || rowDebe.monto_eur != null) && (rowComp.monto_usd != null || rowComp.monto_ars != null || rowComp.monto_eur != null));
          const idsLegacy = filasDeEstaTrx.filter((m) => m.monto_usd == null && m.monto_ars == null && m.monto_eur == null).map((m) => m.id);
          const amountDebeMonR = rowDebe && (monR === 'USD' ? rowDebe.monto_usd : (monR === 'ARS' ? rowDebe.monto_ars : rowDebe.monto_eur));
          const amountCompMonE = rowComp && (monE === 'USD' ? rowComp.monto_usd : (monE === 'ARS' ? rowComp.monto_ars : rowComp.monto_eur));
          const splitIngreso = tieneMomentoCero && estado === 'ejecutada' && id && tipo === 'ingreso' && mr > 1e-6 && monto > 1e-6 && (mr - monto) > 1e-6 && (Math.abs(Number(amountDebeMonR) || 0) - monto) > 1e-6;
          const splitEgreso = tieneMomentoCero && estado === 'ejecutada' && id && tipo === 'egreso' && me > 1e-6 && monto > 1e-6 && (me - monto) > 1e-6 && (Math.abs(Number(amountCompMonE) || 0) - monto) > 1e-6;
          const split = (splitIngreso || splitEgreso) && rowDebe && rowComp && clienteId;
          const faltaIngreso = mr - sumIngresosClienteEjecutados > 1e-6;
          const faltaEgreso = me - sumEgresosClienteEjecutados > 1e-6;
          const splitSinMomentoCero = !tieneMomentoCero && estado === 'ejecutada' && clienteId && (
            (tipo === 'ingreso' && pagador === 'cliente' && mr > 1e-6 && monto > 1e-6 && faltaIngreso) ||
            (tipo === 'egreso' && cobrador === 'cliente' && me > 1e-6 && monto > 1e-6 && faltaEgreso)
          );
          let promSplitSinMc = Promise.resolve(null);
          if (splitSinMomentoCero) {
            const diferencia = tipo === 'ingreso' ? (mr - sumIngresosClienteEjecutados) : (me - sumEgresosClienteEjecutados);
            if (diferencia >= 1e-6) {
              const ahoraIns = new Date().toISOString();
              promSplitSinMc = client.from('transacciones').insert({
              instrumentacion_id: instrumentacionId,
              tipo,
              modo_pago_id: modoPagoId,
              moneda: moneda || (tipo === 'ingreso' ? monR : monE),
              monto: diferencia,
              cobrador,
              pagador,
              owner: cobrador,
              estado: 'pendiente',
              concepto: concepto || '',
              tipo_cambio: tipoCambio || null,
              updated_at: ahoraIns,
            }).select('id').single().then((r) => r.data && r.data.id);
            }
          }

          let promSplit = Promise.resolve(null);
          if (split && splitIngreso) {
            const restoEnFila = Math.abs(Number(amountDebeMonR) || 0);
            const diferencia = restoEnFila - monto;
            const restoTrxId = rowDebe.transaccion_id && rowDebe.transaccion_id !== id ? rowDebe.transaccion_id : null;
            if (restoTrxId && diferencia >= 1e-6) {
              promSplit = client.from('transacciones').update({ monto: diferencia, updated_at: new Date().toISOString() }).eq('id', restoTrxId).then(() => restoTrxId);
            } else if (!restoTrxId && diferencia >= 1e-6) {
              promSplit = client.from('transacciones').insert({
                instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoId, moneda, monto: diferencia,
                cobrador, pagador, owner: cobrador, estado: 'pendiente', concepto: concepto || '', tipo_cambio: tipoCambio, updated_at: new Date().toISOString(),
              }).select('id').single().then((r) => r.data && r.data.id);
            }
          } else if (split && splitEgreso) {
            const restoEnFila = Math.abs(Number(amountCompMonE) || 0);
            const diferencia = restoEnFila - monto;
            const restoTrxIdEgr = rowComp.transaccion_id && rowComp.transaccion_id !== id ? rowComp.transaccion_id : null;
            if (restoTrxIdEgr && diferencia >= 1e-6) {
              promSplit = client.from('transacciones').update({ monto: diferencia, updated_at: new Date().toISOString() }).eq('id', restoTrxIdEgr).then(() => restoTrxIdEgr);
            } else if (!restoTrxIdEgr && diferencia >= 1e-6) {
              promSplit = client.from('transacciones').insert({
                instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoId, moneda, monto: diferencia,
                cobrador, pagador, owner: cobrador, estado: 'pendiente', concepto: concepto || '', tipo_cambio: tipoCambio, updated_at: new Date().toISOString(),
              }).select('id').single().then((r) => r.data && r.data.id);
            }
          }

          const deleteCliente = idsLegacy.length > 0
            ? Promise.all(idsLegacy.map((idDel) => client.from('movimientos_cuenta_corriente').delete().eq('id', idDel)))
            : Promise.resolve();
          // CC intermediario: misma regla que reversa. No borrar la fila momento cero (Debe); poner estado pendiente. Borrar solo cobros (monto > 0).
          const ahoraRev = new Date().toISOString();
          const revertCcInt = intermediarioId
            ? client.from('movimientos_cuenta_corriente_intermediario').select('id, monto, monto_usd, monto_ars, monto_eur').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).then((rRows) => {
                const rows = rRows.data || [];
                const promises = rows.map((row) => {
                  const esMomentoCero = row.monto_usd != null || row.monto_ars != null || row.monto_eur != null;
                  if (esMomentoCero) return client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'pendiente', estado_fecha: ahoraRev }).eq('id', row.id);
                  if (Number(row.monto) > 0) return client.from('movimientos_cuenta_corriente_intermediario').delete().eq('id', row.id);
                  return Promise.resolve();
                });
                return Promise.all(promises);
              })
            : Promise.resolve();
          return Promise.all([
            deleteCliente,
            revertCcInt,
          ]).then(() => Promise.all([promSplit, promSplitSinMc])).then(([newTrxId]) => ({ tieneMomentoCero, split, splitIngreso, splitEgreso, rowDebe, rowComp, newTrxId, comisionPandyMonto }));
        }).then(({ tieneMomentoCero, split, splitIngreso, splitEgreso, rowDebe, rowComp, newTrxId, comisionPandyMonto }) => {
          const insertsCc = [];
          const updatesCc = [];
          if (split && newTrxId != null) {
            if (splitIngreso) {
              const amountDebeMonRLocal = rowDebe && (monR === 'USD' ? rowDebe.monto_usd : (monR === 'ARS' ? rowDebe.monto_ars : rowDebe.monto_eur));
              const restoEnFilaIng = Math.abs(Number(amountDebeMonRLocal) || 0);
              const diferencia = restoEnFilaIng - monto;
              const ejecutadoMr = monto;
              const ejecutadoMe = monR === monE ? monto : ratioCc(monto * me, mr, monto);
              const montoUsdCancel = numCc(monR === 'USD' ? ejecutadoMr : (monE === 'USD' ? ejecutadoMe : 0));
              const montoArsCancel = numCc(monR === 'ARS' ? ejecutadoMr : (monE === 'ARS' ? ejecutadoMe : 0));
              const montoEurCancel = numCc(monR === 'EUR' ? ejecutadoMr : (monE === 'EUR' ? ejecutadoMe : 0));
              const difUsd = monR === 'USD' ? -diferencia : (monE === 'USD' ? -ratioCc(me * diferencia, mr, diferencia) : 0);
              const difArs = monR === 'ARS' ? -diferencia : (monE === 'ARS' ? -ratioCc(me * diferencia, mr, diferencia) : 0);
              const difEur = monR === 'EUR' ? -diferencia : (monE === 'EUR' ? -ratioCc(me * diferencia, mr, diferencia) : 0);
              const remUsd = monR === 'USD' ? diferencia : (monE === 'USD' ? ratioCc(me * diferencia, mr, diferencia) : 0);
              const remArs = monR === 'ARS' ? diferencia : (monE === 'ARS' ? ratioCc(me * diferencia, mr, diferencia) : 0);
              const remEur = monR === 'EUR' ? diferencia : (monE === 'EUR' ? ratioCc(me * diferencia, mr, diferencia) : 0);
              insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId,
                concepto: 'Cancelación de deuda ' + ordenLabel,
                fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                monto_usd: montoUsdCancel, monto_ars: montoArsCancel, monto_eur: montoEurCancel,
                moneda: monR, monto: 0,
              }));
              updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                transaccion_id: newTrxId,
                monto_usd: difUsd, monto_ars: difArs, monto_eur: difEur,
                estado_fecha: ahora,
              }).eq('id', rowDebe.id));
              updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                monto_usd: remUsd, monto_ars: remArs, monto_eur: remEur,
                estado_fecha: ahora,
              }).eq('id', rowComp.id));
            } else {
              const amountCompMonELocal = rowComp && (monE === 'USD' ? rowComp.monto_usd : (monE === 'ARS' ? rowComp.monto_ars : rowComp.monto_eur));
              const restoEnFilaEgr = Math.abs(Number(amountCompMonELocal) || 0);
              const diferencia = restoEnFilaEgr - monto;
              const ejecutadoMe = monto;
              const ejecutadoMr = monR === monE ? monto : ratioCc(monto * mr, me, monto);
              const montoUsdCancel = numCc(monR === 'USD' ? -ejecutadoMr : (monE === 'USD' ? -ejecutadoMe : 0));
              const montoArsCancel = numCc(monR === 'ARS' ? -ejecutadoMr : (monE === 'ARS' ? -ejecutadoMe : 0));
              const montoEurCancel = numCc(monR === 'EUR' ? -ejecutadoMr : (monE === 'EUR' ? -ejecutadoMe : 0));
              // Egreso: diferencia está en monE; Debe (monR) debe llevar equivalente mr*diferencia/me
              const difUsd = numCc(monR === 'USD' ? -ratioCc(mr * diferencia, me, diferencia) : (monE === 'USD' ? -diferencia : 0));
              const difArs = numCc(monR === 'ARS' ? -ratioCc(mr * diferencia, me, diferencia) : (monE === 'ARS' ? -diferencia : 0));
              const difEur = numCc(monR === 'EUR' ? -ratioCc(mr * diferencia, me, diferencia) : (monE === 'EUR' ? -diferencia : 0));
              const remUsd = numCc(monR === 'USD' ? ratioCc(mr * diferencia, me, diferencia) : (monE === 'USD' ? diferencia : 0));
              const remArs = numCc(monR === 'ARS' ? ratioCc(mr * diferencia, me, diferencia) : (monE === 'ARS' ? diferencia : 0));
              const remEur = numCc(monR === 'EUR' ? ratioCc(mr * diferencia, me, diferencia) : (monE === 'EUR' ? diferencia : 0));
              insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId,
                concepto: 'Cancelación de deuda ' + ordenLabel,
                fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                monto_usd: montoUsdCancel, monto_ars: montoArsCancel, monto_eur: montoEurCancel,
                moneda: monE, monto: 0,
              }));
              updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                transaccion_id: newTrxId,
                monto_usd: remUsd, monto_ars: remArs, monto_eur: remEur,
                estado_fecha: ahora,
              }).eq('id', rowComp.id));
              updatesCc.push(client.from('movimientos_cuenta_corriente').update({
                monto_usd: difUsd, monto_ars: difArs, monto_eur: difEur,
                estado_fecha: ahora,
              }).eq('id', rowDebe.id));
            }
          } else if (!tieneMomentoCero) {
            const montosCobro = montosCcPorMoneda(moneda || 'USD', monto);
            const montosDeuda = montosCcPorMoneda(moneda || 'USD', -monto);
            // No registrar "Cobro por" en CC cliente cuando es la comisión/ganancia de Pandy (ej. ARS-ARS CHEQUE): el cliente ya la pagó, no es deuda.
            const esComisionPandy = pagador === 'cliente' && cobrador === 'pandy' && intermediarioId && comisionPandyMonto != null && Math.abs(monto - comisionPandyMonto) < 1e-6;
            if (pagador === 'cliente' && clienteId && !esComisionPandy) {
              if (monR !== monE && (tipo || '').toLowerCase() === 'ingreso') {
                const enMonEVal = ratioCc(monto * me, mr, monto);
                const cancelacion = { monto_usd: numCc(monR === 'USD' ? monto : 0), monto_ars: numCc(monR === 'ARS' ? monto : 0), monto_eur: numCc(monR === 'EUR' ? monto : 0) };
                const contraparte = { monto_usd: numCc(monR === 'USD' ? -monto : (monE === 'USD' ? -enMonEVal : 0)), monto_ars: numCc(monR === 'ARS' ? -monto : (monE === 'ARS' ? -enMonEVal : 0)), monto_eur: numCc(monR === 'EUR' ? -monto : (monE === 'EUR' ? -enMonEVal : 0)) };
                insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId,
                  concepto: 'Cancelación de deuda ' + ordenLabel,
                  fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  monto_usd: cancelacion.monto_usd, monto_ars: cancelacion.monto_ars, monto_eur: cancelacion.monto_eur, moneda: monR, monto: 0,
                }));
                insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, orden_id: ordenId, transaccion_id: transaccionId,
                  concepto: 'Contraparte cancelación ' + ordenLabel,
                  fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  monto_usd: contraparte.monto_usd, monto_ars: contraparte.monto_ars, monto_eur: contraparte.monto_eur, moneda: monE, monto: 0,
                }));
              } else {
                insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, moneda, monto, orden_id: ordenId, transaccion_id: transaccionId,
                  concepto: conceptoCcMovimiento(moneda, monto, 'cobro'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCobro,
                }));
              }
            }
            if (cobrador === 'cliente' && clienteId) {
              insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, moneda, monto: -monto, orden_id: ordenId, transaccion_id: transaccionId,
                concepto: conceptoCcMovimiento(moneda, monto, 'deuda'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                ...montosDeuda,
              }));
            }
          }
          const esPandyIntermediario = (cobrador === 'pandy' && pagador === 'intermediario') || (cobrador === 'intermediario' && pagador === 'pandy');
          if (esPandyIntermediario && pagador === 'intermediario' && intermediarioId) {
            insertsCc.push(
              client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora })
                .eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).eq('estado', 'pendiente')
                .then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
                  intermediario_id: intermediarioId, moneda, monto, orden_id: ordenId, transaccion_id: transaccionId,
                  concepto: conceptoCcMovimiento(moneda, monto, 'cobro'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCcPorMoneda(moneda || 'USD', monto),
                }))
            );
          }
          if (esPandyIntermediario && cobrador === 'intermediario' && intermediarioId) {
            const tasa = Number(orden.tasa_descuento_intermediario) || 0;
            const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;
            const monInt = orden.moneda_recibida || moneda || 'ARS';
            insertsCc.push(
              client.from('movimientos_cuenta_corriente_intermediario').select('id').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).maybeSingle()
                .then((r) => {
                  if (r.data && r.data.id)
                    return client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora }).eq('id', r.data.id);
                  return Promise.resolve();
                })
                .then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
                  intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transaccionNumero != null ? transaccionNumero : null,
                  moneda: monInt, monto: -montoEfectivoInt,
                  concepto: conceptoCcLeyenda('compromiso_cobrar', orden && orden.numero != null ? orden.numero : null, transaccionNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCcPorMoneda(monInt, -montoEfectivoInt),
                }))
                .then(() => client.from('comisiones_orden').select('moneda, monto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario').maybeSingle())
                .then((rCom) => {
                  const comMonto = rCom.data && (Number(rCom.data.monto) || 0);
                  if (comMonto >= 1e-6) {
                    const monCom = (rCom.data.moneda || 'ARS').toUpperCase();
                    return client.from('movimientos_cuenta_corriente_intermediario').insert({
                      intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, transaccion_numero: transaccionNumero != null ? transaccionNumero : null,
                      moneda: monCom, monto: -comMonto,
                      concepto: conceptoCcLeyenda('comision_acuerdo', orden && orden.numero != null ? orden.numero : null, transaccionNumero), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                      ...montosCcPorMoneda(monCom, -comMonto),
                    }).then(() => asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, comMonto, monCom, orden && orden.numero != null ? orden.numero : null, transaccionNumero != null ? transaccionNumero : null));
                  }
                  return Promise.resolve();
                })
            );
          }
          const promUpdatesCc = (updatesCc && updatesCc.length > 0) ? Promise.all(updatesCc) : Promise.resolve();
          Promise.all(insertsCc).then(() => promUpdatesCc).then(() => {
            if (estado !== 'ejecutada') {
              let promReversa = Promise.resolve();
              if (cobrador === 'pandy' && pagador === 'intermediario' && intermediarioId) {
                promReversa = revertirComisionIntermediario(ordenId).then(() =>
                  client.from('movimientos_cuenta_corriente_intermediario').select('id, concepto').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).then((rRows) => {
                    const rows = rRows.data || [];
                    const idsBorrar = rows.filter((r) => (r.concepto || '').includes('Compromiso a Cobrar') || (r.concepto || '').includes('Comisión del acuerdo')).map((r) => r.id);
                    const rowDebe = rows.find((r) => (r.concepto || '').toLowerCase().includes('debe'));
                    const del = idsBorrar.length > 0 ? Promise.all(idsBorrar.map((id) => client.from('movimientos_cuenta_corriente_intermediario').delete().eq('id', id))) : Promise.resolve();
                    const monR = orden.moneda_recibida || 'ARS';
                    const montoUsd = monR === 'USD' ? -mr : 0;
                    const montoArs = monR === 'ARS' ? -mr : 0;
                    const montoEur = monR === 'EUR' ? -mr : 0;
                    const upd = rowDebe && rowDebe.id ? client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'pendiente', estado_fecha: ahora, monto_usd: montoUsd, monto_ars: montoArs, monto_eur: montoEur }).eq('id', rowDebe.id) : Promise.resolve();
                    return del.then(() => upd);
                  })
                );
              }
              if (cobrador === 'intermediario' && pagador === 'pandy' && intermediarioId) {
                promReversa = promReversa.then(() =>
                  client.from('movimientos_cuenta_corriente_intermediario').select('id, concepto').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).then((rRows) => {
                    const rows = rRows.data || [];
                    const idsBorrar = rows.filter((r) => (r.concepto || '').includes('Cobro') || (r.concepto || '').includes('Descuento')).map((r) => r.id);
                    const idCompensacion = rows.find((r) => (r.concepto || '').toLowerCase().includes('compensacion'));
                    const del = idsBorrar.length > 0 ? Promise.all(idsBorrar.map((id) => client.from('movimientos_cuenta_corriente_intermediario').delete().eq('id', id))) : Promise.resolve();
                    const upd = idCompensacion ? client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'pendiente', estado_fecha: ahora }).eq('id', idCompensacion.id) : Promise.resolve();
                    return del.then(() => upd);
                  })
                );
              }
              // Revertir Ganancia del acuerdo si esta transacción es ingreso cliente→Pandy y había comisión (misma moneda mr > me o comisiones_orden).
              const esIngresoClientePandy = (tipo || '').toLowerCase() === 'ingreso' && pagador === 'cliente' && cobrador === 'pandy';
              const comisionPandyReversa = (monR === monE && mr > me) ? mr - me : (comisionPandyMonto || 0);
              if (esIngresoClientePandy && clienteId && comisionPandyReversa >= 1e-6) {
                promReversa = promReversa.then(() => revertirGananciaPandy(ordenId, orden, clienteId, comisionPandyReversa));
              }
              promReversa.then(() => { hacerCierre(ordenId); });
              return;
            }
            // La caja es siempre la de Pandy: solo impactamos caja cuando Pandy es cobrador o pagador.
            const pandyParticipa = cobrador === 'pandy' || pagador === 'pandy';
            if (!pandyParticipa) {
              hacerCierre(ordenId);
              loadCajas();
              return;
            }
            client.from('movimientos_caja').select('id').eq('transaccion_id', transaccionId).limit(1).then((r) => {
              if (r.data && r.data.length > 0) {
                hacerCierre(ordenId);
                loadCajas();
                return;
              }
              const promNroTrx = transaccionNumero != null ? Promise.resolve(transaccionNumero) : client.from('transacciones').select('numero').eq('id', transaccionId).single().then((rr) => rr.data && rr.data.numero);
              promNroTrx.then((nroTrx) => {
                const cajaTipo = codigoCajaTipo(modoPagoId);
                const signo = cobrador === 'pandy' ? 1 : -1; // Pandy cobra = ingreso; Pandy paga = egreso
                const conceptoMov = conceptoCajaTransaccion(cobrador === 'pandy', moneda, monto, orden.numero, nroTrx);
                const movCaja = {
                  moneda, monto: signo * monto, caja_tipo: cajaTipo, transaccion_id: transaccionId,
                  orden_numero: orden.numero != null ? orden.numero : null, transaccion_numero: nroTrx != null ? nroTrx : null,
                  concepto: conceptoMov, fecha, usuario_id: currentUserId,
                };
                client.from('movimientos_caja').insert(movCaja).then((rCaja) => {
                if (rCaja.error) {
                  showToast('Error al crear movimiento de caja: ' + (rCaja.error.message || ''), 'error');
                  hacerCierre(ordenId);
                  loadCajas();
                  return;
                }
                if (!esOrdenCheque || !intermediarioId || !comisionPandyMonto || comisionPandyMonto < 1e-6) {
                  hacerCierre(ordenId);
                  loadCajas();
                  return;
                }
                client.from('transacciones').select('id, tipo, monto, estado, cobrador, pagador, concepto').eq('instrumentacion_id', instrumentacionId).then((rList) => {
                  const list = rList.data || [];
                  const sumIngCli = list.filter((tr) => tr.tipo === 'ingreso' && tr.pagador === 'cliente' && tr.estado === 'ejecutada').reduce((s, tr) => s + Number(tr.monto), 0);
                  const sumEgrCli = list.filter((tr) => tr.tipo === 'egreso' && tr.cobrador === 'cliente' && tr.estado === 'ejecutada').reduce((s, tr) => s + Number(tr.monto), 0);
                  if (sumIngCli < mr - 1e-6 || sumEgrCli < me - 1e-6) {
                    hacerCierre(ordenId);
                    loadCajas();
                    return;
                  }
                  // Comisión en CC desde el acuerdo (no asegurarGananciaPandy).
                  hacerCierre(ordenId);
                  loadCajas();
                });
              });
              });
            });
          });
        });
      });
    });
    }
    (montoCompensatorio ? insertarCompensatoria() : Promise.resolve()).then(continuarFlujo);
  });
  }
}

function refreshTransaccionesModal() {
  const ordenId = transaccionesOrdenIdActual;
  if (ordenId) refreshTransaccionesPanel(ordenId);
}

function closeModalTransacciones() {
  const backdrop = document.getElementById('modal-transacciones-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
  transaccionesOrdenIdActual = null;
}

function mostrarMensajeSiInstrumentacionCerrada(res) {
  if (res && (res.estado === 'orden_ejecutada' || res.estado === 'instrumentacion_cerrada_ejecucion')) {
    if (res.estado === 'orden_ejecutada') showToast('La orden ha quedado ejecutada.', 'success');
    else showToast('La instrumentación ha quedado cerrada. Orden en ejecución. Quedan transacciones por ejecutar.', 'info');
  }
}

/**
 * Calcula el neto por moneda que el intermediario desembolsó al cliente (egresos inter→cliente menos ingresos inter←cliente).
 * Solo considera transacciones donde participa el cliente. Si el neto es positivo, Pandy debe compensar al intermediario.
 */
function netoIntermediarioClientePorMoneda(transacciones) {
  const neto = {};
  (transacciones || []).forEach((t) => {
    if (t.cobrador !== 'cliente' && t.pagador !== 'cliente') return;
    const monto = Number(t.monto) || 0;
    const moneda = t.moneda || 'USD';
    if (!neto[moneda]) neto[moneda] = 0;
    if (t.tipo === 'egreso' && t.cobrador === 'cliente' && t.pagador === 'intermediario') neto[moneda] += monto;
    else if (t.tipo === 'ingreso' && t.cobrador === 'intermediario' && t.pagador === 'cliente') neto[moneda] -= monto;
  });
  return neto;
}

/**
 * Desactivado: no se crean transacciones automáticas de compensación Pandy↔Intermediario.
 * El acuerdo instrumentado es con el cliente; la relación con el intermediario se lleva en cuenta corriente.
 */
function generarTransaccionesCompensacionPandyIntermediario(ordenId, instrumentacionId) {
  void ordenId;
  void instrumentacionId;
  return Promise.resolve();
}

/**
 * Genera movimientos en la cuenta corriente del cliente para que totalicen el acuerdo y queden en cero.
 * - En la moneda del acuerdo (ej. USD): conversión de moneda por el faltante hasta monto_recibido (ej. 25.000 USD) + movimiento Comisión del acuerdo (Haber) por (monto_recibido - monto_entregado) para saldar.
 * - En otras monedas: conversión de moneda por -saldo para anular.
 * Se ejecuta una sola vez por orden (comprueba si ya existe movimiento de conversión).
 */
function generarMovimientoConversionCc(ordenId) {
  if (!ordenId || !currentUserId) return Promise.resolve();
  return client.from('ordenes').select('id, cliente_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, cotizacion').eq('id', ordenId).single().then((rOrd) => {
    const orden = rOrd.data;
    if (!orden || !orden.cliente_id) return;
    const clienteId = orden.cliente_id;
    const monedaRecibida = orden.moneda_recibida || 'USD';
    const monedaEntregada = orden.moneda_entregada || 'USD';
    const montoRecibidoOrden = Number(orden.monto_recibido) || 0;
    const montoEntregadoOrden = Number(orden.monto_entregado) || 0;
    const cotizacion = Number(orden.cotizacion) || 0;
    const mismaMoneda = monedaRecibida === monedaEntregada;
    const comisionOrden = mismaMoneda ? montoRecibidoOrden - montoEntregadoOrden : 0;
    let comisionUsd = null;
    if (!mismaMoneda && cotizacion > 1e-6) {
      if (monedaRecibida === 'ARS' && monedaEntregada === 'USD') comisionUsd = (montoRecibidoOrden / cotizacion) - montoEntregadoOrden;
      else if (monedaRecibida === 'USD' && monedaEntregada === 'ARS') comisionUsd = montoRecibidoOrden - (montoEntregadoOrden / cotizacion);
    }
    return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle().then((rInst) => {
      const instId = rInst.data && rInst.data.id;
      if (!instId) return;
      return client.from('movimientos_cuenta_corriente').select('id, concepto').eq('orden_id', ordenId).in('concepto', CONCEPTOS_CC_AUTOGENERADOS).then((rExist) => {
        const existentes = rExist.data || [];
        const tieneComision = existentes.some((m) => CONCEPTOS_CC_COMISION_TODOS.includes(m.concepto));
        if (tieneComision && existentes.length > 0) return;
        const idsBorrar = existentes.map((m) => m.id);
        const promBorrar = idsBorrar.length > 0 ? client.from('movimientos_cuenta_corriente').delete().in('id', idsBorrar) : Promise.resolve();
        return promBorrar.then(() => client.from('transacciones').select('id').eq('instrumentacion_id', instId).eq('estado', 'ejecutada').then((rTr) => {
          const trIds = (rTr.data || []).map((t) => t.id);
          if (trIds.length === 0) return;
          return client.from('movimientos_cuenta_corriente').select('moneda, monto').eq('cliente_id', clienteId).in('transaccion_id', trIds).then((rMov) => {
            const totalDebe = { USD: 0, EUR: 0, ARS: 0 };
            const totalHaber = { USD: 0, EUR: 0, ARS: 0 };
            (rMov.data || []).forEach((m) => {
              const mon = m.moneda;
              const n = Number(m.monto);
              if (totalDebe[mon] != null) {
                if (n > 0) totalDebe[mon] += n;
                else totalHaber[mon] += -n;
              }
            });
            const inserts = [];
            const fecha = new Date().toISOString().slice(0, 10);
            const ahora = new Date().toISOString();

            if (montoRecibidoOrden > 0 && monedaRecibida) {
              const recibidoEnMoneda = totalDebe[monedaRecibida] || 0;
              const conversion = montoRecibidoOrden - recibidoEnMoneda;
              if (conversion > 1e-6) {
                inserts.push(client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, moneda: monedaRecibida, monto: conversion, orden_id: ordenId, transaccion_id: null,
                  concepto: CONCEPTO_CC_CONVERSION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCcPorMoneda(monedaRecibida, conversion),
                }));
              }
              // Comisión en CC cliente para que la cuenta cierre: ARS-USD / USD-ARS / USD-USD en moneda correspondiente (Haber)
              if (comisionUsd != null && comisionUsd > 1e-6) {
                if (!mismaMoneda && monedaRecibida === 'ARS' && monedaEntregada === 'USD') {
                  inserts.push(client.from('movimientos_cuenta_corriente').insert({
                    cliente_id: clienteId, moneda: 'USD', monto: -comisionUsd, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                    ...montosCcPorMoneda('USD', -comisionUsd),
                  }));
                } else if (!mismaMoneda && monedaRecibida === 'USD' && monedaEntregada === 'ARS' && cotizacion > 1e-6) {
                  // USD-ARS: comisión en ARS (Haber) para que cierre el saldo ARS: Debe = recibido*TC, Haber = entregado + comisión
                  const comisionArs = comisionUsd * cotizacion;
                  inserts.push(client.from('movimientos_cuenta_corriente').insert({
                    cliente_id: clienteId, moneda: 'ARS', monto: -comisionArs, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                    ...montosCcPorMoneda('ARS', -comisionArs),
                  }));
                } else {
                  inserts.push(client.from('movimientos_cuenta_corriente').insert({
                    cliente_id: clienteId, moneda: 'USD', monto: -comisionUsd, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                    ...montosCcPorMoneda('USD', -comisionUsd),
                  }));
                }
              } else if (comisionOrden > 1e-6) {
                inserts.push(client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, moneda: monedaRecibida, monto: -comisionOrden, orden_id: ordenId, transaccion_id: null,
                  concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCcPorMoneda(monedaRecibida, -comisionOrden),
                }));
              }
            }

            ['USD', 'EUR', 'ARS'].forEach((moneda) => {
              const saldo = (totalDebe[moneda] || 0) - (totalHaber[moneda] || 0);
              let montoConversion = null;
              if (moneda === monedaRecibida) {
                // USD-ARS: en moneda recibida (USD) falta el Haber que compense el Debe; agregamos Conversión -montoRecibidoOrden
                if (!mismaMoneda && montoRecibidoOrden > 1e-6) {
                  montoConversion = -montoRecibidoOrden;
                } else {
                  return;
                }
              } else {
                montoConversion = -saldo;
                // En órdenes mixtas, en la moneda entregada usamos el equivalente de lo recibido para saldar
                if (moneda === monedaEntregada && !mismaMoneda && cotizacion > 1e-6) {
                  if (monedaRecibida === 'ARS' && monedaEntregada === 'USD') montoConversion = montoRecibidoOrden / cotizacion;
                  else if (monedaRecibida === 'USD' && monedaEntregada === 'ARS') montoConversion = montoRecibidoOrden * cotizacion;
                }
              }
              if (montoConversion == null || Math.abs(montoConversion) < 1e-6) return;
              inserts.push(client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, moneda, monto: montoConversion, orden_id: ordenId, transaccion_id: null,
                concepto: CONCEPTO_CC_CONVERSION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                ...montosCcPorMoneda(moneda, montoConversion),
              }));
            });

            if (inserts.length === 0) return;
            return Promise.all(inserts).then(() => {});
          });
        }));
      });
    });
  });
}

/**
 * Genera movimientos en la cuenta corriente del intermediario para saldar por orden ejecutada:
 * - "Conversión de moneda" por monto_entregado (Debe).
 * - "Comisión del acuerdo" por la comisión con beneficiario=intermediario (Debe), para que el pago de comisión (Haber) quede saldado.
 * Si no hay comisiones_orden para intermediario, se usa un solo movimiento Conversión por el total (-saldo).
 * Siempre se recalculan y se reemplazan los movimientos existentes de esta orden para incluir transacciones nuevas (ej. comisión).
 */
function generarMovimientoConversionCcIntermediario(ordenId) {
  if (!ordenId || !currentUserId) return Promise.resolve();
  return client.from('ordenes').select('id, intermediario_id, moneda_entregada, monto_entregado').eq('id', ordenId).single().then((rOrd) => {
    const orden = rOrd.data;
    if (!orden || !orden.intermediario_id) return Promise.resolve();
    const intermediarioId = orden.intermediario_id;
    const monedaEntregada = orden.moneda_entregada || 'USD';
    const montoEntregado = Number(orden.monto_entregado) || 0;
    return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle().then((rInst) => {
      const instId = rInst.data && rInst.data.id;
      if (!instId) return Promise.resolve();
      const idsBorrar = client.from('movimientos_cuenta_corriente_intermediario').select('id').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).in('concepto', CONCEPTOS_CC_AUTOGENERADOS);
      return idsBorrar.then((rDel) => {
        const ids = (rDel.data || []).map((m) => m.id);
        const promBorrar = ids.length > 0 ? client.from('movimientos_cuenta_corriente_intermediario').delete().in('id', ids) : Promise.resolve();
        return promBorrar.then(() => client.from('transacciones').select('id, cobrador, pagador').eq('instrumentacion_id', instId).eq('estado', 'ejecutada').then((rTr) => {
          const list = (rTr.data || []).filter((t) => (t.cobrador === 'pandy' && t.pagador === 'intermediario') || (t.cobrador === 'intermediario' && t.pagador === 'pandy'));
          const trIds = list.map((t) => t.id);
          if (trIds.length === 0) return Promise.resolve();
          return Promise.all([
            client.from('movimientos_cuenta_corriente_intermediario').select('moneda, monto').eq('intermediario_id', intermediarioId).in('transaccion_id', trIds),
            client.from('comisiones_orden').select('moneda, monto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario'),
          ]).then(([rMov, rCom]) => {
            const saldos = { USD: 0, EUR: 0, ARS: 0 };
            (rMov.data || []).forEach((m) => {
              if (saldos[m.moneda] != null) saldos[m.moneda] += Number(m.monto);
            });
            const comisionPorMoneda = { USD: 0, EUR: 0, ARS: 0 };
            (rCom.data || []).forEach((c) => {
              if (comisionPorMoneda[c.moneda] != null) comisionPorMoneda[c.moneda] += Number(c.monto) || 0;
            });
            const fecha = new Date().toISOString().slice(0, 10);
            const ahora = new Date().toISOString();
            const inserts = [];
            const tieneComisionInter = ['USD', 'EUR', 'ARS'].some((mon) => comisionPorMoneda[mon] > 1e-6);
            if (tieneComisionInter && montoEntregado > 1e-6 && monedaEntregada) {
              const haberEnMonedaEntregada = Math.max(0, -(saldos[monedaEntregada] || 0));
              const totalDebePlaneado = montoEntregado + (comisionPorMoneda[monedaEntregada] || 0);
              const totalDebeACrear = totalDebePlaneado <= 1e-6 ? 0 : Math.min(totalDebePlaneado, haberEnMonedaEntregada);
              if (totalDebeACrear > 1e-6) {
                const estamosCap = totalDebeACrear < totalDebePlaneado - 1e-6;
                if (estamosCap) {
                  // Un solo movimiento: comisión a cobrar (Debe) concilia con comisión cobrada (Haber)
                  inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                    intermediario_id: intermediarioId, moneda: monedaEntregada, monto: totalDebeACrear, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  }));
                } else {
                  const convMonto = Math.round(montoEntregado * 1e4) / 1e4;
                  const comMonto = Math.round((comisionPorMoneda[monedaEntregada] || 0) * 1e4) / 1e4;
                  if (convMonto > 1e-6) {
                    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                      intermediario_id: intermediarioId, moneda: monedaEntregada, monto: convMonto, orden_id: ordenId, transaccion_id: null,
                      concepto: CONCEPTO_CC_CONVERSION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                    }));
                  }
                  if (comMonto > 1e-6) {
                    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                      intermediario_id: intermediarioId, moneda: monedaEntregada, monto: comMonto, orden_id: ordenId, transaccion_id: null,
                      concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                    }));
                  }
                }
              }
              // Otras monedas: limitar Debe al Haber; si hay tope, un solo movimiento "Comisión del acuerdo"
              ['USD', 'EUR', 'ARS'].forEach((moneda) => {
                if (moneda === monedaEntregada) return;
                const saldo = saldos[moneda];
                const haberEnMoneda = Math.max(0, -(saldo || 0));
                if (haberEnMoneda <= 1e-6) return;
                const convPlaneado = saldo < 0 ? -saldo : 0;
                const comPlaneado = comisionPorMoneda[moneda] || 0;
                const totalPlaneado = convPlaneado + comPlaneado;
                const totalACrear = totalPlaneado <= 1e-6 ? 0 : Math.min(totalPlaneado, haberEnMoneda);
                if (totalACrear <= 1e-6) return;
                const estamosCap = totalACrear < totalPlaneado - 1e-6;
                if (estamosCap) {
                  inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                    intermediario_id: intermediarioId, moneda, monto: totalACrear, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  }));
                } else {
                  if (convPlaneado > 1e-6) {
                    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                      intermediario_id: intermediarioId, moneda, monto: convPlaneado, orden_id: ordenId, transaccion_id: null,
                      concepto: CONCEPTO_CC_CONVERSION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                    }));
                  }
                  if (comPlaneado > 1e-6) {
                    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                      intermediario_id: intermediarioId, moneda, monto: comPlaneado, orden_id: ordenId, transaccion_id: null,
                      concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                    }));
                  }
                }
              });
            } else {
              ['USD', 'EUR', 'ARS'].forEach((moneda) => {
                const saldo = saldos[moneda];
                if (saldo === 0) return;
                inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                  intermediario_id: intermediarioId, moneda, monto: -saldo, orden_id: ordenId, transaccion_id: null,
                  concepto: CONCEPTO_CC_CONVERSION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                }));
              });
            }
            if (inserts.length === 0) return Promise.resolve();
            return Promise.all(inserts).then(() => {});
          });
        }));
      });
    });
  });
}

/** Baja (elimina) una transacción: borra movimientos asociados, la transacción y recalcula estado de la orden.
 * No se permite dar de baja una transacción que tiene movimientos de momento cero (Debe/Compensación) en CC cliente o CC intermediario, para no desbalancear. */
function eliminarTransaccion(transaccionId, ordenId) {
  if (!transaccionId || !ordenId) return Promise.resolve();
  const canEliminarTr = userPermissions.includes('eliminar_transacciones');
  if (!canEliminarTr) {
    showToast('No tenés permiso para dar de baja transacciones.', 'error');
    return Promise.resolve();
  }
  Promise.all([
    client.from('movimientos_cuenta_corriente').select('id, monto_usd, monto_ars, monto_eur').eq('transaccion_id', transaccionId),
    client.from('movimientos_cuenta_corriente_intermediario').select('id, monto_usd, monto_ars, monto_eur').eq('transaccion_id', transaccionId),
  ]).then(([rMov, rMovInt]) => {
    const movs = rMov.data || [];
    const movsInt = rMovInt.data || [];
    const tieneMomentoCeroCliente = movs.some((m) => m.monto_usd != null || m.monto_ars != null || m.monto_eur != null);
    const tieneMomentoCeroInt = movsInt.some((m) => m.monto_usd != null || m.monto_ars != null || m.monto_eur != null);
    if (tieneMomentoCeroCliente || tieneMomentoCeroInt) {
      showToast('No se puede dar de baja esta transacción: forma parte del momento cero de la orden. Para deshacer los movimientos de la orden, usá "Anular orden".', 'error');
      return;
    }
    showConfirm('¿Dar de baja esta transacción? Se eliminarán también los movimientos de caja y cuenta corriente asociados.', 'Dar de baja', () => {
      const deletes = [
        client.from('movimientos_cuenta_corriente').delete().eq('transaccion_id', transaccionId),
        client.from('movimientos_cuenta_corriente_intermediario').delete().eq('transaccion_id', transaccionId),
        client.from('movimientos_caja').delete().eq('transaccion_id', transaccionId),
      ];
      Promise.all(deletes)
        .then(() => client.from('transacciones').delete().eq('id', transaccionId))
        .then((rDel) => {
          if (rDel.error) {
            showToast('Error al eliminar: ' + (rDel.error?.message || ''), 'error');
            return;
          }
          showToast('Transacción dada de baja.', 'success');
          return actualizarEstadoOrden(ordenId);
        })
        .then(() => {
          const vistaCc = document.getElementById('vista-cuenta-corriente');
          if (vistaCc && vistaCc.style.display !== 'none') loadCuentaCorriente();
        });
    });
  });
}

/** Actualiza el estado de la orden según transacciones y acuerdo. Devuelve promesa con { estado, conciliada, todasEjecutadas } o undefined. */
function actualizarEstadoOrden(ordenId) {
  if (!ordenId) return Promise.resolve();
  return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle().then((r) => {
    const instId = r.data && r.data.id;
    if (!instId) return;
    return client.from('ordenes').select('id, cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado').eq('id', ordenId).single().then((rOrd) => {
      const orden = rOrd.data;
      if (!orden) return;
      return client.from('transacciones').select('id, tipo, moneda, monto, estado, tipo_cambio, cobrador, pagador').eq('instrumentacion_id', instId).then((res) => {
        const list = res.data || [];
        const { estado, conciliada, todasEjecutadas } = calcularEstadoOrden(list, orden);
        return client.from('ordenes').update({ estado, updated_at: new Date().toISOString() }).eq('id', ordenId).then(() => {
          const ordenIdAbierto = transaccionesOrdenIdActual;
          const prom = loadOrdenes();
          if (prom && ordenIdAbierto) {
            prom.then(() => {
              client.from('ordenes').select('id, cliente_id, fecha, estado, tipo_operacion_id, operacion_directa, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, cotizacion, observaciones').eq('id', ordenIdAbierto).single().then((rOrd2) => {
                if (rOrd2.data) expandOrdenTransacciones(ordenIdAbierto, rOrd2.data);
              });
            });
          }
          return { estado, conciliada, todasEjecutadas };
        });
      });
    });
  });
}

function setupModalTransacciones() {
  const backdrop = document.getElementById('modal-transacciones-backdrop');
  const btnClose = document.getElementById('modal-transacciones-close');
  if (btnClose) btnClose.addEventListener('click', closeModalTransacciones);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalTransacciones);
}

function setupModalTransaccion() {
  const backdrop = document.getElementById('modal-transaccion-backdrop');
  const btnClose = document.getElementById('modal-transaccion-close');
  const btnCancel = document.getElementById('modal-transaccion-cancelar');
  const form = document.getElementById('form-transaccion');
  const selMoneda = document.getElementById('transaccion-moneda');
  const montoEl = document.getElementById('transaccion-monto');
  if (btnClose) btnClose.addEventListener('click', closeModalTransaccion);
  if (btnCancel) btnCancel.addEventListener('click', closeModalTransaccion);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalTransaccion);
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveTransaccion(); });
  const selTipo = document.getElementById('transaccion-tipo');
  if (selTipo) selTipo.addEventListener('change', adaptarTransaccionTipoYMoneda);
  if (selMoneda) selMoneda.addEventListener('change', toggleTransaccionMonedaArs);
  if (montoEl) { montoEl.addEventListener('input', actualizarMontoCalculado); montoEl.addEventListener('change', actualizarMontoCalculado); }
}

// --- Clientes ABM ---
function loadClientes() {
  const loadingEl = document.getElementById('clientes-loading');
  const wrapEl = document.getElementById('clientes-tabla-wrap');
  const tbody = document.getElementById('clientes-tbody');
  const btnNuevo = document.getElementById('btn-nuevo-cliente');
  if (!loadingEl || !wrapEl || !tbody) return;

  const canAbm = userPermissions.includes('abm_clientes');
  if (btnNuevo) btnNuevo.style.display = canAbm ? '' : 'none';

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';

  client
    .from('clientes')
    .select('id, nombre, documento, email, telefono, direccion, activo')
    .order('nombre', { ascending: true })
    .then((res) => {
      loadingEl.style.display = 'none';
      if (res.error) {
        tbody.innerHTML = '<tr><td colspan="6">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      const list = res.data || [];
      const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      const switchCellCliente = (id, checked) =>
        `<div class="tipo-op-toggle-cell"><span class="toggle-switch"><input type="checkbox" class="cliente-activo-toggle" data-id="${id}"${checked ? ' checked' : ''}${canAbm ? '' : ' disabled'} /><span class="slider"></span></span></div>`;
      tbody.innerHTML = list
        .map(
          (c) =>
            `<tr data-id="${c.id}">
              <td>${esc(c.nombre)}</td>
              <td>${esc(c.documento)}</td>
              <td>${esc(c.email)}</td>
              <td>${esc(c.telefono)}</td>
              <td>${switchCellCliente(c.id, c.activo !== false)}</td>
              <td>${canAbm ? `<button type="button" class="btn-editar btn-editar-cliente" data-id="${c.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
            </tr>`
        )
        .join('');
      tbody.querySelectorAll('.cliente-activo-toggle').forEach((chk) => {
        if (chk.disabled) return;
        chk.addEventListener('change', function () {
          const id = this.getAttribute('data-id');
          const newVal = this.checked;
          client.from('clientes').update({ activo: newVal, updated_at: new Date().toISOString() }).eq('id', id).then((res) => {
            if (res.error) showToast('Error: ' + (res.error.message || 'No se pudo actualizar.'), 'error');
            else showToast('Actualizado.');
          });
        });
      });
      tbody.querySelectorAll('.btn-editar-cliente').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const row = list.find((r) => r.id === id);
          if (row) openModalCliente(row);
        });
      });
      wrapEl.style.display = 'block';
    });
}

function openModalCliente(registro) {
  const backdrop = document.getElementById('modal-cliente-backdrop');
  const titulo = document.getElementById('modal-cliente-titulo');
  const idEl = document.getElementById('cliente-id');
  const form = document.getElementById('form-cliente');
  if (!backdrop || !titulo || !idEl || !form) return;

  if (registro) {
    titulo.textContent = 'Editar cliente';
    idEl.value = registro.id;
    document.getElementById('cliente-nombre').value = registro.nombre || '';
    document.getElementById('cliente-documento').value = registro.documento || '';
    document.getElementById('cliente-email').value = registro.email || '';
    document.getElementById('cliente-telefono').value = registro.telefono || '';
    document.getElementById('cliente-direccion').value = registro.direccion || '';
    document.getElementById('cliente-activo').checked = registro.activo !== false;
  } else {
    titulo.textContent = 'Nuevo cliente';
    idEl.value = '';
    form.reset();
    document.getElementById('cliente-activo').checked = true;
  }
  backdrop.classList.add('activo');
}

function closeModalCliente() {
  const backdrop = document.getElementById('modal-cliente-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function saveCliente() {
  const idEl = document.getElementById('cliente-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const nombre = document.getElementById('cliente-nombre').value.trim();
  if (!nombre) {
    showToast('El nombre es obligatorio.', 'error');
    return;
  }
  const payload = {
    nombre,
    documento: document.getElementById('cliente-documento').value.trim() || null,
    email: document.getElementById('cliente-email').value.trim() || null,
    telefono: document.getElementById('cliente-telefono').value.trim() || null,
    direccion: document.getElementById('cliente-direccion').value.trim() || null,
    activo: document.getElementById('cliente-activo').checked,
  };
  const prom = id
    ? client.from('clientes').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)
    : client.from('clientes').insert(payload);
  prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return;
    }
    closeModalCliente();
    loadClientes();
  });
}

function setupModalCliente() {
  const backdrop = document.getElementById('modal-cliente-backdrop');
  const btnClose = document.getElementById('modal-cliente-close');
  const btnCancel = document.getElementById('modal-cliente-cancelar');
  const form = document.getElementById('form-cliente');
  const btnNuevo = document.getElementById('btn-nuevo-cliente');

  if (btnClose) btnClose.addEventListener('click', closeModalCliente);
  if (btnCancel) btnCancel.addEventListener('click', closeModalCliente);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalCliente);
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveCliente();
    });
  }
  if (btnNuevo) {
    btnNuevo.addEventListener('click', () => openModalCliente(null));
  }
}

// --- Intermediarios ABM ---
function loadIntermediarios() {
  const loadingEl = document.getElementById('intermediarios-loading');
  const wrapEl = document.getElementById('intermediarios-tabla-wrap');
  const tbody = document.getElementById('intermediarios-tbody');
  const btnNuevo = document.getElementById('btn-nuevo-intermediario');
  if (!loadingEl || !wrapEl || !tbody) return;

  const canAbm = userPermissions.includes('abm_intermediarios');
  if (btnNuevo) btnNuevo.style.display = canAbm ? '' : 'none';

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';

  client
    .from('intermediarios')
    .select('id, nombre, documento, email, telefono, direccion, activo')
    .order('nombre', { ascending: true })
    .then((res) => {
      loadingEl.style.display = 'none';
      if (res.error) {
        tbody.innerHTML = '<tr><td colspan="6">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      const list = res.data || [];
      const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      const switchCellInt = (id, checked) =>
        `<div class="tipo-op-toggle-cell"><span class="toggle-switch"><input type="checkbox" class="intermediario-activo-toggle" data-id="${id}"${checked ? ' checked' : ''}${canAbm ? '' : ' disabled'} /><span class="slider"></span></span></div>`;
      tbody.innerHTML = list
        .map(
          (i) =>
            `<tr data-id="${i.id}">
              <td>${esc(i.nombre)}</td>
              <td>${esc(i.documento)}</td>
              <td>${esc(i.email)}</td>
              <td>${esc(i.telefono)}</td>
              <td>${switchCellInt(i.id, i.activo !== false)}</td>
              <td>${canAbm ? `<button type="button" class="btn-editar btn-editar-intermediario" data-id="${i.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
            </tr>`
        )
        .join('');
      tbody.querySelectorAll('.intermediario-activo-toggle').forEach((chk) => {
        if (chk.disabled) return;
        chk.addEventListener('change', function () {
          const id = this.getAttribute('data-id');
          const newVal = this.checked;
          client.from('intermediarios').update({ activo: newVal, updated_at: new Date().toISOString() }).eq('id', id).then((res) => {
            if (res.error) showToast('Error: ' + (res.error.message || 'No se pudo actualizar.'), 'error');
            else showToast('Actualizado.');
          });
        });
      });
      tbody.querySelectorAll('.btn-editar-intermediario').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const row = list.find((r) => r.id === id);
          if (row) openModalIntermediario(row);
        });
      });
      wrapEl.style.display = 'block';
    });
}

function openModalIntermediario(registro) {
  const backdrop = document.getElementById('modal-intermediario-backdrop');
  const titulo = document.getElementById('modal-intermediario-titulo');
  const idEl = document.getElementById('intermediario-id');
  const form = document.getElementById('form-intermediario');
  if (!backdrop || !titulo || !idEl || !form) return;

  if (registro) {
    titulo.textContent = 'Editar intermediario';
    idEl.value = registro.id;
    document.getElementById('intermediario-nombre').value = registro.nombre || '';
    document.getElementById('intermediario-documento').value = registro.documento || '';
    document.getElementById('intermediario-email').value = registro.email || '';
    document.getElementById('intermediario-telefono').value = registro.telefono || '';
    document.getElementById('intermediario-direccion').value = registro.direccion || '';
    document.getElementById('intermediario-activo').checked = registro.activo !== false;
  } else {
    titulo.textContent = 'Nuevo intermediario';
    idEl.value = '';
    form.reset();
    document.getElementById('intermediario-activo').checked = true;
  }
  backdrop.classList.add('activo');
}

function closeModalIntermediario() {
  const backdrop = document.getElementById('modal-intermediario-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function saveIntermediario() {
  const idEl = document.getElementById('intermediario-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const nombre = document.getElementById('intermediario-nombre').value.trim();
  if (!nombre) {
    showToast('El nombre es obligatorio.', 'error');
    return;
  }
  const payload = {
    nombre,
    documento: document.getElementById('intermediario-documento').value.trim() || null,
    email: document.getElementById('intermediario-email').value.trim() || null,
    telefono: document.getElementById('intermediario-telefono').value.trim() || null,
    direccion: document.getElementById('intermediario-direccion').value.trim() || null,
    activo: document.getElementById('intermediario-activo').checked,
    updated_at: new Date().toISOString(),
  };
  const prom = id
    ? client.from('intermediarios').update(payload).eq('id', id)
    : client.from('intermediarios').insert(payload);
  prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return;
    }
    closeModalIntermediario();
    loadIntermediarios();
  });
}

function setupModalIntermediario() {
  const backdrop = document.getElementById('modal-intermediario-backdrop');
  const btnClose = document.getElementById('modal-intermediario-close');
  const btnCancel = document.getElementById('modal-intermediario-cancelar');
  const form = document.getElementById('form-intermediario');
  const btnNuevo = document.getElementById('btn-nuevo-intermediario');

  if (btnClose) btnClose.addEventListener('click', closeModalIntermediario);
  if (btnCancel) btnCancel.addEventListener('click', closeModalIntermediario);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalIntermediario);
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveIntermediario(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalIntermediario(null));
}

// --- Tipos de operación (ABM)
async function subirIconoTipoOperacionStorage(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Elegí un archivo de imagen.', 'error');
    return null;
  }
  const safe = (file.name || 'img').replace(/[^\w.\-]/g, '_').slice(0, 64);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safe}`;
  const { data, error } = await client.storage.from(STORAGE_BUCKET_TIPO_OP_ICONOS).upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: '3600' });
  if (error) {
    showToast('No se pudo subir: ' + (error.message || 'revisá bucket y permisos en Supabase.'), 'error');
    return null;
  }
  const { data: pub } = client.storage.from(STORAGE_BUCKET_TIPO_OP_ICONOS).getPublicUrl(data.path);
  return pub && pub.publicUrl ? pub.publicUrl : null;
}

function updateTipoOperacionModalIconoCustomWrap() {
  const wrap = document.getElementById('tipo-operacion-icono-custom-wrap');
  const rad = document.querySelector('input[name="tipo-operacion-icono-modo"]:checked');
  const v = rad ? rad.value : 'auto';
  if (wrap) wrap.style.display = v === 'custom' ? 'block' : 'none';
}

function syncTipoOperacionModalIconoPreview() {
  const wrap = document.getElementById('tipo-operacion-icono-preview');
  if (!wrap) return;
  const codEl = document.getElementById('tipo-operacion-codigo');
  const nomEl = document.getElementById('tipo-operacion-nombre');
  const urlEl = document.getElementById('tipo-operacion-icono-url');
  const codigo = (codEl && codEl.value || '').trim();
  const nombre = (nomEl && nomEl.value || '').trim();
  const rad = document.querySelector('input[name="tipo-operacion-icono-modo"]:checked');
  const modoRaw = rad ? rad.value : 'auto';
  const modo = modoRaw === 'cheque' || modoRaw === 'custom' ? modoRaw : 'auto';
  const url = (urlEl && urlEl.value || '').trim();
  const usaIntEl = document.getElementById('tipo-operacion-usa-intermediario');
  const usaInt = !!(usaIntEl && usaIntEl.checked);
  wrap.innerHTML = htmlTipoOperacionIconos(codigo || '–', nombre, { iconoModo: modo, iconoUrlPublica: url, usaIntermediario: usaInt });
}

/** True si el error de PostgREST/Postgres es por columna orden_visual inexistente (migración no ejecutada). */
function supabaseErrorFaltaColumnaOrdenVisualTiposOperacion(err) {
  if (!err) return false;
  if (String(err.code) === '42703') return true;
  const msg = String(err.message || err.details || '');
  return /orden_visual/i.test(msg) && (/does not exist|no existe|undefined column/i.test(msg));
}

/** Texto plano en <option> SR: variante con intermediario lleva sufijo ` - Int.`. */
function nombreTipoOperacionOrdenUi(t) {
  const n = t && t.nombre != null ? String(t.nombre).trim() : '';
  if (t && t.usa_intermediario === true) return n ? `${n} - Int.` : '- Int.';
  return n || '—';
}

/** Etiqueta en combo custom (HTML): nombre base + ` - Int.` en azul negrita si aplica. */
function htmlOrdenTipoOperacionEtiquetaVisible(nombreBase, usaInt) {
  const b = (nombreBase || '').trim();
  if (usaInt) {
    if (b) return `${escapeHtml(b)}<span class="tipo-op-sufijo-int"> - Int.</span>`;
    return '<span class="tipo-op-sufijo-int">- Int.</span>';
  }
  return escapeHtml(b || '—');
}

/**
 * Orden estable igual que en Supabase: orden_visual (null al final), codigo, usa_intermediario, id.
 * Refuerzo en cliente por si la respuesta llegara desordenada.
 */
function ordenarTiposOperacionListaParaOrden(arr) {
  const list = (arr || []).slice();
  const tieneOv = list.some(
    (t) => t && t.orden_visual != null && String(t.orden_visual).trim() !== '' && Number.isFinite(Number(t.orden_visual)),
  );
  function claveOv(t) {
    const n = Number(t && t.orden_visual);
    if (Number.isFinite(n)) return n;
    return tieneOv ? 1e9 : 0;
  }
  list.sort((a, b) => {
    const da = claveOv(a);
    const db = claveOv(b);
    if (da !== db) return da - db;
    const sc = String((a && a.codigo) || '').localeCompare(String((b && b.codigo) || ''));
    if (sc !== 0) return sc;
    const ia = a && a.usa_intermediario === true ? 1 : 0;
    const ib = b && b.usa_intermediario === true ? 1 : 0;
    if (ia !== ib) return ia - ib;
    return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
  });
  return list;
}

/**
 * Ejecuta consulta tipos_operacion con orden_visual; si la columna no existe, repite sin ella y avisa una vez por sesión (toast).
 * executeFull y executeLegacy deben devolver la promesa del .select()... (mismo client.from).
 */
function tiposOperacionFetchConFallbackOrdenVisual(executeFull, executeLegacy) {
  return executeFull().then((res) => {
    if (!res.error || !supabaseErrorFaltaColumnaOrdenVisualTiposOperacion(res.error)) return res;
    if (typeof window !== 'undefined' && !window.__pandiOrdenVisualMigracionToastHecho) {
      window.__pandiOrdenVisualMigracionToastHecho = true;
      showToast('Falta la columna orden_visual en tipos_operacion. Ejecutá en Supabase: sql/migracion_tipos_operacion_orden_visual.sql. Hasta entonces se usa orden por código.', 'info');
    }
    return executeLegacy();
  });
}

/** Intercambia orden_visual con el vecino en la lista ya ordenada (delta -1 = subir, +1 = bajar). */
function intercambiarOrdenVisualTiposOperacion(listOrdenada, indiceActual, delta) {
  if (!userPermissions.includes('abm_tipos_operacion')) return;
  const j = indiceActual + delta;
  if (j < 0 || j >= listOrdenada.length) return;
  const a = listOrdenada[indiceActual];
  const b = listOrdenada[j];
  const oa = Number(a.orden_visual);
  const ob = Number(b.orden_visual);
  Promise.all([
    client.from('tipos_operacion').update({ orden_visual: ob }).eq('id', a.id),
    client.from('tipos_operacion').update({ orden_visual: oa }).eq('id', b.id),
  ]).then(([r1, r2]) => {
    if (r1.error || r2.error) {
      const e1 = r1.error;
      const e2 = r2.error;
      if (supabaseErrorFaltaColumnaOrdenVisualTiposOperacion(e1) || supabaseErrorFaltaColumnaOrdenVisualTiposOperacion(e2)) {
        showToast('No se puede reordenar: falta la columna orden_visual. Ejecutá sql/migracion_tipos_operacion_orden_visual.sql en Supabase.', 'error');
      } else {
        showToast('Error: ' + ((e1 && e1.message) || (e2 && e2.message) || 'No se pudo reordenar.'), 'error');
      }
      return;
    }
    showToast('Orden actualizado.', 'success');
    loadTiposOperacion();
  });
}

function loadTiposOperacion() {
  const loadingEl = document.getElementById('tipos-operacion-loading');
  const wrapEl = document.getElementById('tipos-operacion-tabla-wrap');
  const tbody = document.getElementById('tipos-operacion-tbody');
  const btnNuevo = document.getElementById('btn-nuevo-tipo-operacion');
  if (!loadingEl || !wrapEl || !tbody) return;

  const canAbm = userPermissions.includes('abm_tipos_operacion');
  if (btnNuevo) btnNuevo.style.display = canAbm ? '' : 'none';

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';

  const colsBase = 'id, codigo, nombre, moneda_in, moneda_out, usa_intermediario, activo, icono_modo, icono_url_publica';
  tiposOperacionFetchConFallbackOrdenVisual(
    () => client.from('tipos_operacion').select(colsBase + ', orden_visual').order('orden_visual', { ascending: true }).order('codigo').order('usa_intermediario').order('id'),
    () => client.from('tipos_operacion').select(colsBase).order('codigo').order('usa_intermediario').order('id'),
  ).then((res) => {
    loadingEl.style.display = 'none';
    if (res.error) {
      const msg = res.error.message || 'No se pudieron cargar los tipos.';
      showToast('Error: ' + msg, 'error');
      tbody.innerHTML = '<tr><td colspan="9">Error: ' + escapeHtml(msg) + '</td></tr>';
      wrapEl.style.display = 'block';
      return;
    }
    const list = res.data || [];
    const tieneOrdenVisual = list.length === 0 || (list[0] && Object.prototype.hasOwnProperty.call(list[0], 'orden_visual'));
    const switchCell = (id, field, checked) =>
      `<div class="tipo-op-toggle-cell"><span class="toggle-switch"><input type="checkbox" class="tipo-op-toggle" data-id="${id}" data-field="${field}"${checked ? ' checked' : ''}${canAbm ? '' : ' disabled'} /><span class="slider"></span></span></div>`;
    tbody.innerHTML = list.map((t, idx) => {
      const monIn = (t.moneda_in || '').toUpperCase();
      const monOut = (t.moneda_out || '').toUpperCase();
      const ordenCelda = !tieneOrdenVisual
        ? (canAbm
          ? '<span style="font-size:0.8rem;color:#92400e;text-align:center;display:block;">Migración SQL pendiente</span>'
          : '<span style="color:#666;font-size:0.85rem;">–</span>')
        : (canAbm
          ? `<div class="tipo-op-orden-botones" style="display:flex;gap:0.25rem;justify-content:center;align-items:center;flex-wrap:wrap;">
            <button type="button" class="btn-secondary btn-icon-only btn-tipo-op-orden-mover" data-id="${t.id}" data-dir="-1" title="Subir en el listado" aria-label="Subir en el listado"${idx === 0 ? ' disabled' : ''}><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg></span></button>
            <button type="button" class="btn-secondary btn-icon-only btn-tipo-op-orden-mover" data-id="${t.id}" data-dir="1" title="Bajar en el listado" aria-label="Bajar en el listado"${idx === list.length - 1 ? ' disabled' : ''}><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></button>
          </div>`
          : `<span style="color:#666;font-size:0.85rem;">${escapeHtml(String(Number.isFinite(Number(t.orden_visual)) ? t.orden_visual : '–'))}</span>`);
      return `<tr data-id="${t.id}">
        <td class="tipo-op-orden-celda">${ordenCelda}</td>
        <td class="td-tipo-op-iconos">${htmlTipoOperacionIconos(t.codigo || '', t.nombre || '', { iconoModo: t.icono_modo, iconoUrlPublica: t.icono_url_publica, usaIntermediario: t.usa_intermediario === true })}</td>
        <td>${escapeHtml(t.nombre || '')}</td>
        <td><code style="font-size:0.85rem;">${escapeHtml(t.codigo || '')}</code>${t.usa_intermediario === true ? ' <span style="color:#666;font-size:0.8rem;">(int.)</span>' : ''}</td>
        <td><span class="tipo-op-moneda-celda">${htmlIconoMonedaTipoOp(monIn, 18)} <span class="tipo-op-moneda-codigo">${escapeHtml(monIn)}</span></span></td>
        <td><span class="tipo-op-moneda-celda">${htmlIconoMonedaTipoOp(monOut, 18)} <span class="tipo-op-moneda-codigo">${escapeHtml(monOut)}</span></span></td>
        <td>${switchCell(t.id, 'usa_intermediario', t.usa_intermediario === true)}</td>
        <td>${switchCell(t.id, 'activo', t.activo !== false)}</td>
        <td>${canAbm ? `<button type="button" class="btn-editar btn-editar-tipo-operacion" data-id="${t.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.btn-tipo-op-orden-mover').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const id = btn.getAttribute('data-id');
        const dir = Number(btn.getAttribute('data-dir'));
        const idx = list.findIndex((x) => String(x.id) === String(id));
        if (idx < 0 || !Number.isFinite(dir)) return;
        intercambiarOrdenVisualTiposOperacion(list, idx, dir);
      });
    });
    tbody.querySelectorAll('.tipo-op-toggle').forEach((chk) => {
      if (chk.disabled) return;
      chk.addEventListener('change', function () {
        const id = this.getAttribute('data-id');
        const field = this.getAttribute('data-field');
        const newVal = this.checked;
        const row = list.find((r) => String(r.id) === String(id));
        const aplicar = () => {
          client.from('tipos_operacion').update({ [field]: newVal }).eq('id', id).then((resU) => {
            if (resU.error) showToast('Error: ' + (resU.error.message || 'No se pudo actualizar.'), 'error');
            else showToast('Actualizado.');
          });
        };
        if (field !== 'usa_intermediario' || !row || !row.codigo) {
          aplicar();
          return;
        }
        client.from('tipos_operacion').select('id').eq('codigo', row.codigo).eq('usa_intermediario', newVal).neq('id', id).limit(1).then((rDup) => {
          if (rDup.error) {
            showToast('Error: ' + (rDup.error.message || 'No se pudo validar.'), 'error');
            this.checked = !newVal;
            return;
          }
          if (rDup.data && rDup.data.length) {
            this.checked = !newVal;
            showToast('Ya existe un tipo con el mismo código y la misma opción Intermediario.', 'error');
            return;
          }
          aplicar();
        });
      });
    });
    tbody.querySelectorAll('.btn-editar-tipo-operacion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const row = list.find((r) => String(r.id) === String(id));
        if (row) openModalTipoOperacion(row);
      });
    });
    wrapEl.style.display = 'block';
  });
}

function openModalTipoOperacion(registro) {
  const backdrop = document.getElementById('modal-tipo-operacion-backdrop');
  const titulo = document.getElementById('modal-tipo-operacion-titulo');
  const idEl = document.getElementById('tipo-operacion-id');
  const form = document.getElementById('form-tipo-operacion');
  if (!backdrop || !titulo || !idEl || !form) return;

  if (registro) {
    titulo.textContent = 'Editar tipo de operación';
    idEl.value = registro.id;
    document.getElementById('tipo-operacion-codigo').value = registro.codigo || '';
    document.getElementById('tipo-operacion-nombre').value = registro.nombre || '';
    document.getElementById('tipo-operacion-moneda-in').value = (registro.moneda_in || 'USD').toUpperCase();
    document.getElementById('tipo-operacion-moneda-out').value = (registro.moneda_out || 'USD').toUpperCase();
    document.getElementById('tipo-operacion-usa-intermediario').checked = registro.usa_intermediario === true;
    document.getElementById('tipo-operacion-activo').checked = registro.activo !== false;
    const im = (registro.icono_modo || 'auto').toString().trim().toLowerCase();
    const modoVal = im === 'cheque' || im === 'custom' ? im : 'auto';
    document.querySelectorAll('input[name="tipo-operacion-icono-modo"]').forEach((inp) => { inp.checked = inp.value === modoVal; });
    const urlI = document.getElementById('tipo-operacion-icono-url');
    if (urlI) urlI.value = registro.icono_url_publica || '';
    updateTipoOperacionModalIconoCustomWrap();
    syncTipoOperacionModalIconoPreview();
  } else {
    titulo.textContent = 'Nuevo tipo de operación';
    idEl.value = '';
    form.reset();
    document.getElementById('tipo-operacion-moneda-in').value = 'USD';
    document.getElementById('tipo-operacion-moneda-out').value = 'USD';
    document.getElementById('tipo-operacion-usa-intermediario').checked = false;
    document.getElementById('tipo-operacion-activo').checked = true;
    document.querySelectorAll('input[name="tipo-operacion-icono-modo"]').forEach((inp) => { inp.checked = inp.value === 'auto'; });
    const urlN = document.getElementById('tipo-operacion-icono-url');
    if (urlN) urlN.value = '';
    updateTipoOperacionModalIconoCustomWrap();
    syncTipoOperacionModalIconoPreview();
  }
  backdrop.classList.add('activo');
}

function closeModalTipoOperacion() {
  const backdrop = document.getElementById('modal-tipo-operacion-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
}

function saveTipoOperacion() {
  const idEl = document.getElementById('tipo-operacion-id');
  const id = idEl?.value?.trim() || '';
  const codigo = document.getElementById('tipo-operacion-codigo').value.trim();
  const nombre = document.getElementById('tipo-operacion-nombre').value.trim();
  if (!codigo || !nombre) {
    showToast('Código y nombre son obligatorios.', 'error');
    return;
  }
  const monedaIn = (document.getElementById('tipo-operacion-moneda-in').value || 'USD').toUpperCase();
  const monedaOut = (document.getElementById('tipo-operacion-moneda-out').value || 'USD').toUpperCase();
  const monedasPermitidas = ['USD', 'EUR', 'ARS', 'CHEQUE'];
  if (!monedasPermitidas.includes(monedaIn) || !monedasPermitidas.includes(monedaOut)) {
    showToast('Moneda IN y OUT deben ser USD, EUR, ARS o Cheque.', 'error');
    return;
  }
  if (monedaIn === 'CHEQUE' && monedaOut !== 'ARS' || monedaOut === 'CHEQUE' && monedaIn !== 'ARS') {
    showToast('Cheque solo puede combinarse con ARS (el otro lado debe ser ARS).', 'error');
    return;
  }
  const radIcono = document.querySelector('input[name="tipo-operacion-icono-modo"]:checked');
  const modoRaw = radIcono ? radIcono.value : 'auto';
  const iconoModo = modoRaw === 'cheque' || modoRaw === 'custom' ? modoRaw : 'auto';
  const urlIcono = (document.getElementById('tipo-operacion-icono-url') && document.getElementById('tipo-operacion-icono-url').value || '').trim();
  if (iconoModo === 'custom' && !isHttpsUrlSegura(urlIcono)) {
    showToast('En modo personalizado indicá una URL https válida o subí una imagen al Storage.', 'error');
    return;
  }
  const payload = {
    codigo,
    nombre,
    moneda_in: monedaIn,
    moneda_out: monedaOut,
    usa_intermediario: document.getElementById('tipo-operacion-usa-intermediario').checked,
    activo: document.getElementById('tipo-operacion-activo').checked,
    icono_modo: iconoModo,
    icono_url_publica: iconoModo === 'custom' ? urlIcono : null,
  };
  let dupQ = client.from('tipos_operacion').select('id').eq('codigo', codigo).eq('usa_intermediario', payload.usa_intermediario).limit(1);
  if (id) dupQ = dupQ.neq('id', id);
  dupQ.then((rDup) => {
    if (rDup.error) {
      showToast('Error: ' + (rDup.error.message || 'No se pudo validar.'), 'error');
      return;
    }
    if (rDup.data && rDup.data.length) {
      showToast('Ya existe un tipo con el mismo código y la misma opción Intermediario. Usá otro código o cambiá el toggle Intermediario.', 'error');
      return;
    }
    const ejecutarGuardado = (payloadFinal) => {
      const prom = id
        ? client.from('tipos_operacion').update(payloadFinal).eq('id', id)
        : client.from('tipos_operacion').insert(payloadFinal);
      return prom.then((res) => {
        if (res.error) {
          showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
          return;
        }
        closeModalTipoOperacion();
        loadTiposOperacion();
        showToast(id ? 'Tipo de operación actualizado.' : 'Tipo de operación creado.', 'success');
      });
    };
    if (id) {
      ejecutarGuardado(payload);
      return;
    }
    client.from('tipos_operacion').select('orden_visual').order('orden_visual', { ascending: false }).limit(1).maybeSingle().then((rMax) => {
      if (rMax.error && supabaseErrorFaltaColumnaOrdenVisualTiposOperacion(rMax.error)) {
        ejecutarGuardado(payload);
        return;
      }
      if (rMax.error) {
        showToast('Error: ' + (rMax.error.message || 'No se pudo obtener el orden. Ejecutá en Supabase sql/migracion_tipos_operacion_orden_visual.sql'), 'error');
        return;
      }
      const max = Number(rMax.data?.orden_visual);
      payload.orden_visual = (Number.isFinite(max) ? max : 0) + 10;
      ejecutarGuardado(payload);
    });
  });
}

function setupModalTipoOperacion() {
  const backdrop = document.getElementById('modal-tipo-operacion-backdrop');
  const btnClose = document.getElementById('modal-tipo-operacion-close');
  const btnCancel = document.getElementById('modal-tipo-operacion-cancelar');
  const form = document.getElementById('form-tipo-operacion');
  const btnNuevo = document.getElementById('btn-nuevo-tipo-operacion');

  if (btnClose) btnClose.addEventListener('click', closeModalTipoOperacion);
  if (btnCancel) btnCancel.addEventListener('click', closeModalTipoOperacion);
  if (backdrop) setupBackdropCloseOnlyOnRealClick(backdrop, closeModalTipoOperacion);
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveTipoOperacion(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalTipoOperacion(null));

  document.querySelectorAll('input[name="tipo-operacion-icono-modo"]').forEach((r) => {
    r.addEventListener('change', () => {
      updateTipoOperacionModalIconoCustomWrap();
      syncTipoOperacionModalIconoPreview();
    });
  });
  const urlIconoEl = document.getElementById('tipo-operacion-icono-url');
  if (urlIconoEl) urlIconoEl.addEventListener('input', syncTipoOperacionModalIconoPreview);
  ['tipo-operacion-codigo', 'tipo-operacion-nombre'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', syncTipoOperacionModalIconoPreview);
  });
  const chkUsaInt = document.getElementById('tipo-operacion-usa-intermediario');
  if (chkUsaInt) chkUsaInt.addEventListener('change', syncTipoOperacionModalIconoPreview);
  const fileIconoEl = document.getElementById('tipo-operacion-icono-file');
  const btnSubirIcono = document.getElementById('tipo-operacion-icono-subir');
  if (btnSubirIcono && fileIconoEl) {
    btnSubirIcono.addEventListener('click', () => fileIconoEl.click());
    fileIconoEl.addEventListener('change', () => {
      const f = fileIconoEl.files && fileIconoEl.files[0];
      fileIconoEl.value = '';
      if (!f) return;
      subirIconoTipoOperacionStorage(f).then((url) => {
        if (!url) return;
        document.querySelectorAll('input[name="tipo-operacion-icono-modo"]').forEach((inp) => { inp.checked = inp.value === 'custom'; });
        updateTipoOperacionModalIconoCustomWrap();
        const u = document.getElementById('tipo-operacion-icono-url');
        if (u) u.value = url;
        syncTipoOperacionModalIconoPreview();
        showToast('Imagen subida; URL cargada en el campo.', 'success');
      });
    });
  }
}

// ========== Reglas de negocio CC (menú crítico, permiso abm_reglas_negocio) ==========
let reglasNegocioCacheList = [];
let tiposOperacionReglasCache = [];

function normalizarCodigoReglaNegocio(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.replace(/\s*-\s*/g, '-').replace(/\s+/g, '').trim().toUpperCase();
}

const REG_NEG_MONTO_ORIGEN_OK = new Set([
  'mr', 'me', 'monto_transaccion', 'me_prorrateado', 'mr_prorrateado',
  'mr_menos_me', 'monto_efectivo_intermediario', 'comision_intermediario',
]);

function reglasNegocioClaveUnicaRow(r) {
  return [
    String(r.tipo_operacion_codigo || '').toUpperCase(),
    r.usa_intermediario === true ? '1' : '0',
    String(r.entidad_cc || 'cliente').toLowerCase(),
    String(r.pagador || '').toLowerCase(),
    String(r.cobrador || '').toLowerCase(),
    String(r.tipo_transaccion || '').toLowerCase(),
    coercePgBooleanStrict(r.es_comision) ? '1' : '0',
    String(r.estado_transaccion || '').toLowerCase(),
    coercePgBooleanStrict(r.contrapartida_ejecutada) ? '1' : '0',
    String(Number(r.linea) || 0),
  ].join('\t');
}

function reglasNegocioBuscarDuplicado(payload, excluirId) {
  const k = reglasNegocioClaveUnicaRow(payload);
  return reglasNegocioCacheList.find((r) => {
    if (excluirId && String(r.id) === String(excluirId)) return false;
    return reglasNegocioClaveUnicaRow(r) === k;
  });
}

function validarReglaNegocioNegocio(payload, tiposRows) {
  const errores = [];
  const advertencias = [];
  const cod = normalizarCodigoReglaNegocio(payload.tipo_operacion_codigo);
  if (!cod) errores.push('Código de tipo de operación obligatorio.');
  if (!['cliente', 'intermediario'].includes(String(payload.entidad_cc || '').toLowerCase())) {
    errores.push('entidad_cc debe ser cliente o intermediario.');
  }
  ['pagador', 'cobrador'].forEach((campo) => {
    const v = String(payload[campo] || '').toLowerCase();
    if (!['cliente', 'pandy', 'intermediario'].includes(v)) errores.push(campo + ' inválido.');
  });
  const tipoTrx = String(payload.tipo_transaccion || '').toLowerCase();
  if (!['ingreso', 'egreso'].includes(tipoTrx)) errores.push('tipo_transaccion debe ser ingreso o egreso.');
  const est = String(payload.estado_transaccion || '').toLowerCase();
  if (!['pendiente', 'ejecutada'].includes(est)) errores.push('estado_transaccion inválido.');
  const mo = String(payload.monto_origen || '').toLowerCase();
  if (!REG_NEG_MONTO_ORIGEN_OK.has(mo)) errores.push('monto_origen no permitido en el modelo.');
  const mon = String(payload.moneda || '').toUpperCase();
  if (!['USD', 'ARS', 'EUR'].includes(mon)) errores.push('moneda debe ser USD, ARS o EUR.');
  const sig = Number(payload.signo);
  if (sig !== 1 && sig !== -1) errores.push('signo debe ser 1 o −1.');
  const linea = Number(payload.linea);
  if (!Number.isInteger(linea) || linea < 0 || linea > 32767) errores.push('línea debe ser entero 0…32767.');
  const conc = (payload.condicion_estado_comision != null && String(payload.condicion_estado_comision).trim() !== '')
    ? String(payload.condicion_estado_comision).trim()
    : '';
  if (conc && !['par_cliente', 'par_pandy_int'].includes(conc)) {
    errores.push('condicion_estado_comision debe ser vacío, par_cliente o par_pandy_int.');
  }
  if (coercePgBooleanStrict(payload.es_comision) && !conc) {
    advertencias.push('Es comisión sin condicion_estado_comision: el motor puede no aplicar la fila como esperás (revisá docs).');
  }
  if (!coercePgBooleanStrict(payload.es_comision) && conc) {
    advertencias.push('condicion_estado_comision suele usarse solo con es_comision = true.');
  }
  if (mo === 'monto_efectivo_intermediario' && String(payload.entidad_cc).toLowerCase() !== 'intermediario') {
    advertencias.push('monto_efectivo_intermediario suele ir con entidad_cc = intermediario (p. ej. CHEQUE-ARS).');
  }
  if (mo === 'comision_intermediario' && !payload.usa_intermediario) {
    advertencias.push('comision_intermediario suele usarse con usa_intermediario = true.');
  }
  const tipoCat = (tiposRows || []).find(
    (t) => String(t.codigo || '').toUpperCase() === cod && !!t.usa_intermediario === !!payload.usa_intermediario
  );
  if (!tipoCat) {
    advertencias.push('No hay fila en Tipos de operación para (código + intermediario). Creá el tipo antes de usar estas reglas en órdenes.');
  } else {
    const min = (tipoCat.moneda_in || '').toString().toUpperCase().replace('CHEQUE', 'ARS');
    const mout = (tipoCat.moneda_out || '').toString().toUpperCase().replace('CHEQUE', 'ARS');
    const setMon = new Set([min, mout].filter((x) => x && x !== 'CHEQUE'));
    if (mon && setMon.size && !setMon.has(mon) && mon !== 'ARS') {
      advertencias.push('La moneda de la regla (' + mon + ') no coincide con IN/OUT del tipo en catálogo (' + [...setMon].join(', ') + '). Revisá si es intencional.');
    }
  }
  return { errores, advertencias, codigoNorm: cod };
}

function reglasNegocioRowToForm(r) {
  return {
    id: r.id,
    tipo_operacion_codigo: r.tipo_operacion_codigo,
    usa_intermediario: r.usa_intermediario === true,
    entidad_cc: r.entidad_cc || 'cliente',
    pagador: r.pagador,
    cobrador: r.cobrador,
    tipo_transaccion: r.tipo_transaccion,
    es_comision: coercePgBooleanStrict(r.es_comision),
    estado_transaccion: r.estado_transaccion,
    contrapartida_ejecutada: coercePgBooleanStrict(r.contrapartida_ejecutada),
    linea: Number(r.linea) || 0,
    moneda: (r.moneda || 'USD').toUpperCase(),
    signo: Number(r.signo) === -1 ? -1 : 1,
    monto_origen: r.monto_origen,
    incluir_en_detalle: r.incluir_en_detalle !== false,
    concepto_leyenda: r.concepto_leyenda || '',
    condicion_estado_comision: r.condicion_estado_comision || '',
  };
}

function reglasNegocioLeerFormulario() {
  const id = (document.getElementById('regla-negocio-id') && document.getElementById('regla-negocio-id').value || '').trim();
  return {
    id: id || null,
    tipo_operacion_codigo: (document.getElementById('regla-negocio-codigo') && document.getElementById('regla-negocio-codigo').value) || '',
    usa_intermediario: !!(document.getElementById('regla-negocio-usa-intermediario') && document.getElementById('regla-negocio-usa-intermediario').checked),
    entidad_cc: (document.getElementById('regla-negocio-entidad-cc') && document.getElementById('regla-negocio-entidad-cc').value) || 'cliente',
    pagador: (document.getElementById('regla-negocio-pagador') && document.getElementById('regla-negocio-pagador').value) || '',
    cobrador: (document.getElementById('regla-negocio-cobrador') && document.getElementById('regla-negocio-cobrador').value) || '',
    tipo_transaccion: (document.getElementById('regla-negocio-tipo-transaccion') && document.getElementById('regla-negocio-tipo-transaccion').value) || '',
    es_comision: !!(document.getElementById('regla-negocio-es-comision') && document.getElementById('regla-negocio-es-comision').checked),
    estado_transaccion: (document.getElementById('regla-negocio-estado-transaccion') && document.getElementById('regla-negocio-estado-transaccion').value) || '',
    contrapartida_ejecutada: !!(document.getElementById('regla-negocio-contrapartida') && document.getElementById('regla-negocio-contrapartida').checked),
    linea: parseInt(document.getElementById('regla-negocio-linea') && document.getElementById('regla-negocio-linea').value, 10),
    moneda: (document.getElementById('regla-negocio-moneda') && document.getElementById('regla-negocio-moneda').value) || 'USD',
    signo: parseInt(document.getElementById('regla-negocio-signo') && document.getElementById('regla-negocio-signo').value, 10),
    monto_origen: (document.getElementById('regla-negocio-monto-origen') && document.getElementById('regla-negocio-monto-origen').value) || '',
    incluir_en_detalle: !!(document.getElementById('regla-negocio-incluir-detalle') && document.getElementById('regla-negocio-incluir-detalle').checked),
    concepto_leyenda: (document.getElementById('regla-negocio-concepto') && document.getElementById('regla-negocio-concepto').value.trim()) || '',
    condicion_estado_comision: (document.getElementById('regla-negocio-condicion-comision') && document.getElementById('regla-negocio-condicion-comision').value) || '',
  };
}

function reglasNegocioRellenarFormulario(r) {
  const d = reglasNegocioRowToForm(r);
  const idEl = document.getElementById('regla-negocio-id');
  if (idEl) idEl.value = d.id || '';
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
  };
  set('regla-negocio-codigo', d.tipo_operacion_codigo);
  const usa = document.getElementById('regla-negocio-usa-intermediario');
  if (usa) usa.checked = d.usa_intermediario;
  set('regla-negocio-entidad-cc', d.entidad_cc);
  set('regla-negocio-pagador', d.pagador);
  set('regla-negocio-cobrador', d.cobrador);
  set('regla-negocio-tipo-transaccion', d.tipo_transaccion);
  const esC = document.getElementById('regla-negocio-es-comision');
  if (esC) esC.checked = d.es_comision;
  set('regla-negocio-estado-transaccion', d.estado_transaccion);
  const ct = document.getElementById('regla-negocio-contrapartida');
  if (ct) ct.checked = d.contrapartida_ejecutada;
  set('regla-negocio-linea', String(d.linea));
  set('regla-negocio-moneda', d.moneda);
  set('regla-negocio-signo', String(d.signo));
  set('regla-negocio-monto-origen', d.monto_origen);
  const inc = document.getElementById('regla-negocio-incluir-detalle');
  if (inc) inc.checked = d.incluir_en_detalle;
  set('regla-negocio-concepto', d.concepto_leyenda);
  set('regla-negocio-condicion-comision', d.condicion_estado_comision || '');
  const codEl = document.getElementById('regla-negocio-codigo');
  const usaEl = document.getElementById('regla-negocio-usa-intermediario');
  const isEdit = !!d.id;
  if (codEl) {
    codEl.readOnly = isEdit;
    codEl.title = isEdit ? 'No se puede cambiar el tipo en una fila existente (evita duplicados). Creá una fila nueva o replicá matriz.' : '';
  }
  if (usaEl) {
    usaEl.disabled = isEdit;
    usaEl.title = isEdit ? 'Creá una fila nueva para otro valor de intermediario.' : '';
  }
}

function cerrarModalReglaNegocio() {
  const b = document.getElementById('modal-regla-negocio-backdrop');
  if (b) b.classList.remove('activo');
}

function abrirModalReglaNegocio(row, defaults) {
  const backdrop = document.getElementById('modal-regla-negocio-backdrop');
  const titulo = document.getElementById('modal-regla-negocio-titulo');
  if (!backdrop || !titulo) return;
  if (row) {
    titulo.textContent = 'Editar regla de negocio';
    reglasNegocioRellenarFormulario(row);
  } else {
    titulo.textContent = 'Nueva regla de negocio';
    const fCod = document.getElementById('reglas-negocio-filtro-codigo');
    const fUsa = document.getElementById('reglas-negocio-filtro-usa-int');
    const defCod = (defaults && defaults.codigo) || (fCod && fCod.value) || '';
    const defUsa = defaults && typeof defaults.usaIntermediario === 'boolean'
      ? defaults.usaIntermediario
      : (fUsa && fUsa.value === 'true' ? true : fUsa && fUsa.value === 'false' ? false : false);
    reglasNegocioRellenarFormulario({
      tipo_operacion_codigo: defCod,
      usa_intermediario: defUsa,
      entidad_cc: 'cliente',
      pagador: 'cliente',
      cobrador: 'pandy',
      tipo_transaccion: 'ingreso',
      es_comision: false,
      estado_transaccion: 'ejecutada',
      contrapartida_ejecutada: false,
      linea: 0,
      moneda: 'USD',
      signo: 1,
      monto_origen: 'monto_transaccion',
      incluir_en_detalle: true,
      concepto_leyenda: 'cobro_realizado',
      condicion_estado_comision: '',
    });
    const idEl = document.getElementById('regla-negocio-id');
    if (idEl) idEl.value = '';
    const codEl = document.getElementById('regla-negocio-codigo');
    const usaEl = document.getElementById('regla-negocio-usa-intermediario');
    if (codEl) codEl.readOnly = false;
    if (usaEl) usaEl.disabled = false;
  }
  backdrop.classList.add('activo');
}

function reglasNegocioPayloadParaDb(form) {
  return {
    tipo_operacion_codigo: normalizarCodigoReglaNegocio(form.tipo_operacion_codigo),
    usa_intermediario: !!form.usa_intermediario,
    entidad_cc: String(form.entidad_cc || 'cliente').toLowerCase(),
    pagador: String(form.pagador || '').toLowerCase(),
    cobrador: String(form.cobrador || '').toLowerCase(),
    tipo_transaccion: String(form.tipo_transaccion || '').toLowerCase(),
    es_comision: !!form.es_comision,
    estado_transaccion: String(form.estado_transaccion || '').toLowerCase(),
    contrapartida_ejecutada: !!form.contrapartida_ejecutada,
    linea: Number(form.linea) || 0,
    moneda: String(form.moneda || 'USD').toUpperCase(),
    signo: Number(form.signo) === -1 ? -1 : 1,
    monto_origen: String(form.monto_origen || '').toLowerCase(),
    incluir_en_detalle: !!form.incluir_en_detalle,
    concepto_leyenda: String(form.concepto_leyenda || '').trim(),
    condicion_estado_comision: (form.condicion_estado_comision && String(form.condicion_estado_comision).trim())
      ? String(form.condicion_estado_comision).trim()
      : null,
  };
}

function ejecutarGuardarReglaNegocio(form) {
  const payload = reglasNegocioPayloadParaDb(form);
  const id = form.id;
  const dup = reglasNegocioBuscarDuplicado(payload, id);
  if (dup) {
    showToast('Ya existe otra fila con la misma clave (tipo, int., entidad, pagador/cobrador, comisión, estado, contrapartida, línea).', 'error');
    return;
  }
  const prom = id
    ? client.from('reglas_de_negocio').update(payload).eq('id', id)
    : client.from('reglas_de_negocio').insert(payload);
  prom.then((res) => {
    if (res.error) {
      showToast('Error al guardar: ' + (res.error.message || '') + (res.error.code === '23505' ? ' (clave duplicada)' : ''), 'error');
      return;
    }
    cerrarModalReglaNegocio();
    showToast(id ? 'Regla actualizada.' : 'Regla creada.', 'success');
    loadReglasNegocioVista();
  });
}

function intentarGuardarReglaNegocioFormulario() {
  const form = reglasNegocioLeerFormulario();
  if (!form.concepto_leyenda) {
    showToast('Concepto leyenda obligatorio.', 'error');
    return;
  }
  const payload = reglasNegocioPayloadParaDb(form);
  const v = validarReglaNegocioNegocio(payload, tiposOperacionReglasCache);
  if (v.errores.length) {
    showToast(v.errores[0], 'error');
    return;
  }
  const run = () => ejecutarGuardarReglaNegocio(form);
  if (v.advertencias.length) {
    showConfirm(
      v.advertencias.join('\n') + '\n\n¿Guardar de todas formas?',
      'Sí, guardar',
      run,
      () => {}
    );
    return;
  }
  run();
}

function eliminarReglaNegocio(id) {
  if (!id) return;
  showConfirm(
    '¿Eliminar esta fila de reglas? Las órdenes existentes seguirán en base; al sincronizar CC el motor puede comportarse distinto o usar fallbacks.',
    'Sí, eliminar',
    () => {
      client.from('reglas_de_negocio').delete().eq('id', id).then((res) => {
        if (res.error) showToast('Error: ' + (res.error.message || ''), 'error');
        else {
          showToast('Fila eliminada.', 'success');
          loadReglasNegocioVista();
        }
      });
    },
    () => {}
  );
}

function reglasNegocioFiltrarLista() {
  const selCod = document.getElementById('reglas-negocio-filtro-codigo');
  const selUsa = document.getElementById('reglas-negocio-filtro-usa-int');
  const cod = selCod && selCod.value ? String(selCod.value).toUpperCase() : '';
  const usaVal = selUsa ? selUsa.value : 'all';
  return reglasNegocioCacheList.filter((r) => {
    if (cod && String(r.tipo_operacion_codigo || '').toUpperCase() !== cod) return false;
    if (usaVal === 'true' && r.usa_intermediario !== true) return false;
    if (usaVal === 'false' && r.usa_intermediario === true) return false;
    return true;
  });
}

function renderReglasNegocioTabla() {
  const tbody = document.getElementById('reglas-negocio-tbody');
  if (!tbody) return;
  const list = reglasNegocioFiltrarLista().slice().sort((a, b) => {
    const ca = String(a.tipo_operacion_codigo || '').localeCompare(String(b.tipo_operacion_codigo || ''));
    if (ca !== 0) return ca;
    if (!!a.usa_intermediario !== !!b.usa_intermediario) return a.usa_intermediario ? 1 : -1;
    return reglasNegocioClaveUnicaRow(a).localeCompare(reglasNegocioClaveUnicaRow(b));
  });
  const canAbm = userPermissions.includes('abm_reglas_negocio');
  tbody.innerHTML = list.map((r) => {
    const intLabel = r.usa_intermediario ? 'Sí' : 'No';
    const com = coercePgBooleanStrict(r.es_comision) ? 'Sí' : 'No';
    const det = r.incluir_en_detalle !== false ? 'Sí' : 'No';
    const cont = coercePgBooleanStrict(r.contrapartida_ejecutada) ? 'Sí' : 'No';
    const btnEdit = canAbm
      ? `<button type="button" class="btn-editar btn-regla-negocio-editar" data-id="${escapeHtml(String(r.id))}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>`
      : '';
    const btnDel = canAbm
      ? `<button type="button" class="btn-secondary btn-regla-negocio-eliminar" data-id="${escapeHtml(String(r.id))}" title="Eliminar fila"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span></button>`
      : '';
    return `<tr data-id="${escapeHtml(String(r.id))}">
      <td><code>${escapeHtml(String(r.tipo_operacion_codigo || ''))}</code></td>
      <td>${escapeHtml(intLabel)}</td>
      <td>${escapeHtml(String(r.entidad_cc || ''))}</td>
      <td>${escapeHtml(String(r.pagador || ''))}</td>
      <td>${escapeHtml(String(r.cobrador || ''))}</td>
      <td>${escapeHtml(String(r.tipo_transaccion || ''))}</td>
      <td>${escapeHtml(com)}</td>
      <td>${escapeHtml(String(r.estado_transaccion || ''))}</td>
      <td>${escapeHtml(cont)}</td>
      <td>${escapeHtml(String(r.linea != null ? r.linea : ''))}</td>
      <td>${escapeHtml(String(r.moneda || ''))}</td>
      <td>${escapeHtml(String(r.signo != null ? r.signo : ''))}</td>
      <td><code style="font-size:0.75rem;">${escapeHtml(String(r.monto_origen || ''))}</code></td>
      <td>${escapeHtml(String(r.concepto_leyenda || ''))}</td>
      <td>${escapeHtml(det)}</td>
      <td><code style="font-size:0.75rem;">${escapeHtml(String(r.condicion_estado_comision || '–'))}</code></td>
      <td style="white-space:nowrap;">${btnEdit}${btnDel}</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.btn-regla-negocio-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rid = btn.getAttribute('data-id');
      const row = reglasNegocioCacheList.find((x) => String(x.id) === String(rid));
      if (row) abrirModalReglaNegocio(row);
    });
  });
  tbody.querySelectorAll('.btn-regla-negocio-eliminar').forEach((btn) => {
    btn.addEventListener('click', () => eliminarReglaNegocio(btn.getAttribute('data-id')));
  });
}

function reglasNegocioRellenarFiltroCodigos() {
  const sel = document.getElementById('reglas-negocio-filtro-codigo');
  if (!sel) return;
  const prev = sel.value;
  const set = new Set();
  reglasNegocioCacheList.forEach((r) => {
    if (r.tipo_operacion_codigo) set.add(String(r.tipo_operacion_codigo).toUpperCase());
  });
  const sorted = [...set].sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Todos</option>' + sorted.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (prev && sorted.includes(prev)) sel.value = prev;
}

function reglasNegocioRellenarSelectOrigenReplica() {
  const sel = document.getElementById('replicar-reglas-origen');
  if (!sel) return;
  const pairs = new Map();
  reglasNegocioCacheList.forEach((r) => {
    const cod = String(r.tipo_operacion_codigo || '').toUpperCase();
    const k = cod + '\t' + (r.usa_intermediario === true ? '1' : '0');
    if (!pairs.has(k)) pairs.set(k, { codigo: cod, usa: r.usa_intermediario === true });
  });
  const list = [...pairs.values()].sort((a, b) => {
    const c = a.codigo.localeCompare(b.codigo);
    return c !== 0 ? c : (a.usa === b.usa ? 0 : a.usa ? 1 : -1);
  });
  sel.innerHTML = list.map((p) => {
    const val = p.codigo + '|' + (p.usa ? '1' : '0');
    const lab = p.codigo + (p.usa ? ' · con intermediario' : ' · sin intermediario');
    return `<option value="${escapeHtml(val)}">${escapeHtml(lab)}</option>`;
  }).join('');
}

function cerrarModalReplicarReglas() {
  const b = document.getElementById('modal-replicar-reglas-backdrop');
  if (b) b.classList.remove('activo');
}

function ejecutarReplicarReglasNegocio() {
  const sel = document.getElementById('replicar-reglas-origen');
  const inpDest = document.getElementById('replicar-reglas-destino-codigo');
  const chkDest = document.getElementById('replicar-reglas-destino-usa-int');
  if (!sel || !inpDest || !chkDest) return;
  const raw = sel.value || '';
  const parts = raw.split('|');
  const srcCod = (parts[0] || '').trim().toUpperCase();
  const srcUsa = parts[1] === '1';
  const destCod = normalizarCodigoReglaNegocio(inpDest.value);
  const destUsa = !!chkDest.checked;
  if (!srcCod) {
    showToast('Elegí un origen.', 'error');
    return;
  }
  if (!destCod) {
    showToast('Indicá el código destino (ej. EUR-USD).', 'error');
    return;
  }
  if (destCod === srcCod && destUsa === srcUsa) {
    showToast('Origen y destino no pueden ser idénticos.', 'error');
    return;
  }
  const srcRows = reglasNegocioCacheList.filter(
    (r) => String(r.tipo_operacion_codigo || '').toUpperCase() === srcCod && !!r.usa_intermediario === srcUsa
  );
  if (!srcRows.length) {
    showToast('No hay filas en caché para el origen elegido.', 'error');
    return;
  }
  const yaDest = reglasNegocioCacheList.some(
    (r) => String(r.tipo_operacion_codigo || '').toUpperCase() === destCod && !!r.usa_intermediario === destUsa
  );
  if (yaDest) {
    showToast('El destino ya tiene reglas. Eliminá o editá manualmente antes de replicar (evitamos sobrescribir sin control).', 'error');
    return;
  }
  const tipoOk = tiposOperacionReglasCache.some(
    (t) => String(t.codigo || '').toUpperCase() === destCod && !!t.usa_intermediario === destUsa
  );
  if (!tipoOk) {
    showConfirm(
      'No hay un tipo de operación en el catálogo para (código + intermediario) destino. Creá el tipo primero en "Tipos de operación".\n\n¿Ir igual con la réplica de reglas?',
      'Sí, replicar igual',
      () => reglasNegocioInsertarReplicaBatch(srcRows, destCod, destUsa),
      () => {}
    );
    return;
  }
  showConfirm(
    'Se insertarán ' + srcRows.length + ' filas para ' + destCod + (destUsa ? ' (con intermediario).' : ' (sin intermediario).') + ' Revisá monedas/signos después.',
    'Replicar',
    () => reglasNegocioInsertarReplicaBatch(srcRows, destCod, destUsa),
    () => {}
  );
}

function reglasNegocioInsertarReplicaBatch(srcRows, destCod, destUsa) {
  const batch = srcRows.map((r) => ({
    tipo_operacion_codigo: destCod,
    usa_intermediario: destUsa,
    entidad_cc: r.entidad_cc || 'cliente',
    pagador: r.pagador,
    cobrador: r.cobrador,
    tipo_transaccion: r.tipo_transaccion,
    es_comision: r.es_comision,
    estado_transaccion: r.estado_transaccion,
    contrapartida_ejecutada: r.contrapartida_ejecutada,
    linea: r.linea,
    moneda: r.moneda,
    signo: r.signo,
    monto_origen: r.monto_origen,
    incluir_en_detalle: r.incluir_en_detalle !== false,
    concepto_leyenda: r.concepto_leyenda,
    condicion_estado_comision: r.condicion_estado_comision || null,
  }));
  const chunk = 80;
  function send(i) {
    if (i >= batch.length) {
      cerrarModalReplicarReglas();
      showToast('Replicación completada (' + batch.length + ' filas).', 'success');
      loadReglasNegocioVista();
      return;
    }
    const slice = batch.slice(i, i + chunk);
    client.from('reglas_de_negocio').insert(slice).then((res) => {
      if (res.error) {
        showToast('Error al replicar: ' + (res.error.message || ''), 'error');
        return;
      }
      send(i + chunk);
    });
  }
  send(0);
}

function loadReglasNegocioVista() {
  const loadingEl = document.getElementById('reglas-negocio-loading');
  const wrapEl = document.getElementById('reglas-negocio-tabla-wrap');
  const tbody = document.getElementById('reglas-negocio-tbody');
  const btnNueva = document.getElementById('reglas-negocio-btn-nueva');
  const btnRep = document.getElementById('reglas-negocio-btn-replicar');
  if (!loadingEl || !wrapEl || !tbody) return;
  const canAbm = userPermissions.includes('abm_reglas_negocio');
  if (btnNueva) btnNueva.style.display = canAbm ? '' : 'none';
  if (btnRep) btnRep.style.display = canAbm ? '' : 'none';
  if (!canAbm) {
    loadingEl.style.display = 'none';
    wrapEl.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="17">No tenés permiso <code>abm_reglas_negocio</code>. Un administrador puede otorgarlo en Seguridad → permisos por rol.</td></tr>';
    return;
  }
  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';
  client.from('reglas_de_negocio').select('*').order('tipo_operacion_codigo').order('usa_intermediario').then((rR) => {
    if (rR.error) {
      loadingEl.style.display = 'none';
      wrapEl.style.display = 'block';
      const msg = rR.error.message || '';
      showToast('Error: ' + msg, 'error');
      tbody.innerHTML = '<tr><td colspan="17">Error: ' + escapeHtml(msg) + '</td></tr>';
      return;
    }
    reglasNegocioCacheList = rR.data || [];
    tiposOperacionFetchConFallbackOrdenVisual(
      () => client.from('tipos_operacion').select('codigo, usa_intermediario, moneda_in, moneda_out, orden_visual').order('orden_visual', { ascending: true }).order('codigo').order('usa_intermediario').order('id'),
      () => client.from('tipos_operacion').select('codigo, usa_intermediario, moneda_in, moneda_out').order('codigo').order('usa_intermediario').order('id'),
    ).then((rT) => {
      loadingEl.style.display = 'none';
      wrapEl.style.display = 'block';
      if (rT.error) {
        const msg = rT.error.message || '';
        showToast('Error: ' + msg, 'error');
        tbody.innerHTML = '<tr><td colspan="17">Error: ' + escapeHtml(msg) + '</td></tr>';
        return;
      }
      tiposOperacionReglasCache = rT.data || [];
      reglasNegocioRellenarFiltroCodigos();
      renderReglasNegocioTabla();
    });
  });
}

function setupModalReglasNegocio() {
  const back = document.getElementById('modal-regla-negocio-backdrop');
  const backRep = document.getElementById('modal-replicar-reglas-backdrop');
  const form = document.getElementById('form-regla-negocio');
  if (back) {
    const c = document.getElementById('modal-regla-negocio-close');
    const ca = document.getElementById('modal-regla-negocio-cancelar');
    if (c) c.addEventListener('click', cerrarModalReglaNegocio);
    if (ca) ca.addEventListener('click', cerrarModalReglaNegocio);
    setupBackdropCloseOnlyOnRealClick(back, cerrarModalReglaNegocio);
  }
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); intentarGuardarReglaNegocioFormulario(); });
  const btnRef = document.getElementById('reglas-negocio-btn-refrescar');
  if (btnRef) btnRef.addEventListener('click', () => loadReglasNegocioVista());
  const btnNueva = document.getElementById('reglas-negocio-btn-nueva');
  if (btnNueva) btnNueva.addEventListener('click', () => abrirModalReglaNegocio(null));
  const selCod = document.getElementById('reglas-negocio-filtro-codigo');
  const selUsa = document.getElementById('reglas-negocio-filtro-usa-int');
  if (selCod) selCod.addEventListener('change', () => renderReglasNegocioTabla());
  if (selUsa) selUsa.addEventListener('change', () => renderReglasNegocioTabla());
  const btnRep = document.getElementById('reglas-negocio-btn-replicar');
  if (btnRep) {
    btnRep.addEventListener('click', () => {
      reglasNegocioRellenarSelectOrigenReplica();
      const inp = document.getElementById('replicar-reglas-destino-codigo');
      if (inp) inp.value = '';
      const chk = document.getElementById('replicar-reglas-destino-usa-int');
      if (chk) chk.checked = false;
      if (backRep) backRep.classList.add('activo');
    });
  }
  if (backRep) {
    const cr = document.getElementById('modal-replicar-reglas-close');
    const cc = document.getElementById('modal-replicar-reglas-cancelar');
    const bex = document.getElementById('replicar-reglas-btn-ejecutar');
    if (cr) cr.addEventListener('click', cerrarModalReplicarReglas);
    if (cc) cc.addEventListener('click', cerrarModalReplicarReglas);
    setupBackdropCloseOnlyOnRealClick(backRep, cerrarModalReplicarReglas);
    if (bex) bex.addEventListener('click', () => ejecutarReplicarReglasNegocio());
  }
}


/** Configuración de vistas: [menuId, vistaId, título, permiso de vista]. Orden del menú. */
const VIEWS_CONFIG = [
  ['menu-inicio', 'vista-inicio', 'Panel de Control', 'ver_inicio'],
  ['menu-ordenes', 'vista-ordenes', 'Órdenes', 'ver_ordenes'],
  ['menu-cajas', 'vista-cajas', 'Cajas', 'ver_cajas'],
  ['menu-clientes', 'vista-clientes', 'Clientes', 'ver_clientes'],
  ['menu-intermediarios', 'vista-intermediarios', 'Intermediarios', 'ver_intermediarios'],
  ['menu-tipos-operacion', 'vista-tipos-operacion', 'Tipos de operación', 'abm_tipos_operacion'],
  ['menu-cuenta-corriente', 'vista-cuenta-corriente', 'Cuenta corriente', 'ver_cuenta_corriente'],
  ['menu-reglas-negocio', 'vista-reglas-negocio', 'Reglas de negocio (CC)', 'abm_reglas_negocio'],
  ['menu-seguridad', 'vista-seguridad', 'Seguridad', 'ver_seguridad'],
];

function hasAnyViewPermission() {
  return VIEWS_CONFIG.some((r) => userPermissions.includes(r[3]));
}

function canViewVista(vistaId) {
  if (!hasAnyViewPermission()) return true; // Sin migración de vistas: ver todo
  const row = VIEWS_CONFIG.find((r) => r[1] === vistaId);
  if (!row) return true;
  return userPermissions.includes(row[3]);
}

function getFirstAllowedView() {
  const row = VIEWS_CONFIG.find((r) => userPermissions.includes(r[3]));
  return row ? [row[1], row[2]] : ['vista-inicio', 'Panel de Control'];
}

function applyVistasMenuVisibility() {
  const useVistasPermisos = hasAnyViewPermission();
  VIEWS_CONFIG.forEach(([menuId, , , perm]) => {
    const menuEl = document.getElementById(menuId);
    if (!menuEl) return;
    menuEl.style.display = !useVistasPermisos || userPermissions.includes(perm) ? '' : 'none';
  });
}

function setupVistasMenu() {
  VIEWS_CONFIG.forEach(([menuId, vistaId, title]) => {
    const menuEl = document.getElementById(menuId);
    if (!menuEl) return;
    menuEl.addEventListener('click', (e) => {
      e.preventDefault();
      showView(vistaId, title);
    });
  });
}

function updateSessionActivity() {
  const now = Date.now();
  if (now - lastActivityUpdate < SESSION_ACTIVITY_THROTTLE_MS) return;
  lastActivityUpdate = now;
  lastActivityTime = now;
}

/** Indica si la vista actual tiene alguna sección expandible abierta (detalle de orden, menú/rol en Seguridad, etc.). Si es true, no conviene refrescar porque se colapsaría. */
function hasExpandedSectionInCurrentView() {
  if (currentVistaId === 'vista-ordenes' && transaccionesOrdenIdActual) return true;
  const vistaSeguridad = document.getElementById('vista-seguridad');
  if (vistaSeguridad && vistaSeguridad.style.display === 'block') {
    if (vistaSeguridad.querySelector('.seguridad-permisos-menu-colapsable:not(.collapsed)')) return true;
    if (vistaSeguridad.querySelector('.seguridad-permisos-rol.expanded')) return true;
  }
  return false;
}

/** Refresco suave de la vista actual cada REFRESH_DATA_INTERVAL_MS. No recarga la página; solo vuelve a pedir los datos de la vista. No se ejecuta si hay un modal abierto ni si hay una sección expandida (para no colapsar). */
function refreshCurrentViewData() {
  if (document.querySelector('.modal-backdrop.activo')) return;
  if (hasExpandedSectionInCurrentView()) return;
  const loaders = {
    'vista-inicio': loadInicio,
    'vista-ordenes': loadOrdenes,
    'vista-cajas': loadCajas,
    'vista-clientes': loadClientes,
    'vista-intermediarios': loadIntermediarios,
    'vista-tipos-operacion': loadTiposOperacion,
    'vista-cuenta-corriente': loadCuentaCorriente,
    'vista-reglas-negocio': loadReglasNegocioVista,
    'vista-seguridad': loadSeguridad,
  };
  const fn = loaders[currentVistaId];
  if (typeof fn === 'function') fn();
}

function startSessionTimeoutCheck() {
  if (sessionCheckIntervalId) clearInterval(sessionCheckIntervalId);
  lastActivityTime = Date.now();
  lastActivityUpdate = lastActivityTime;
  const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
  events.forEach((ev) => document.addEventListener(ev, updateSessionActivity));
  sessionCheckIntervalId = setInterval(() => {
    if (sessionTimeoutMinutes <= 0) return;
    const inactiveMin = (Date.now() - lastActivityTime) / 60000;
    if (inactiveMin >= sessionTimeoutMinutes) {
      clearInterval(sessionCheckIntervalId);
      sessionCheckIntervalId = null;
      if (refreshDataIntervalId) clearInterval(refreshDataIntervalId);
      refreshDataIntervalId = null;
      events.forEach((ev) => document.removeEventListener(ev, updateSessionActivity));
      client.auth.signOut().then(() => {
        showLogin();
        showToast('Sesión cerrada por inactividad.', 'info');
      });
    }
  }, 60000);
}

/** Emails que ven una broma al entrar (una sola vez por navegador, localStorage). */
const LOGIN_BROMA_EMAILS = new Set(['patriciocarbajal@gmail.com', 'lucas.bustos@hotmail.com']);
const LOGIN_BROMA_TEXTO = 'Por fin vas a probar la app hijo de una gran puta 😂😂😂';

function loginBromaStorageKey() {
  const norm = (currentUserEmail || '').trim().toLowerCase();
  return 'pandi_login_broma_ok_' + norm.replace(/[^a-z0-9@._-]/g, '_');
}

function closeLoginBromaModal() {
  const backdrop = document.getElementById('modal-login-broma-backdrop');
  try {
    localStorage.setItem(loginBromaStorageKey(), '1');
  } catch (err) {
    /* ignore quota / private mode */
  }
  if (backdrop) {
    backdrop.classList.remove('activo');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

function maybeShowLoginBromaModal() {
  const norm = (currentUserEmail || '').trim().toLowerCase();
  if (!LOGIN_BROMA_EMAILS.has(norm)) return;
  try {
    if (localStorage.getItem(loginBromaStorageKey()) === '1') return;
  } catch (err) {
    return;
  }
  const backdrop = document.getElementById('modal-login-broma-backdrop');
  const textoEl = document.getElementById('modal-login-broma-texto');
  if (!backdrop || !textoEl) return;
  textoEl.textContent = LOGIN_BROMA_TEXTO;
  backdrop.classList.add('activo');
  backdrop.setAttribute('aria-hidden', 'false');
}

function setupLoginBromaModal() {
  const backdrop = document.getElementById('modal-login-broma-backdrop');
  const btnCerrar = document.getElementById('modal-login-broma-cerrar');
  const btnOk = document.getElementById('modal-login-broma-btn-ok');
  if (!backdrop || backdrop.dataset.bromaBound === '1') return;
  backdrop.dataset.bromaBound = '1';
  const onClose = () => closeLoginBromaModal();
  if (btnCerrar) btnCerrar.addEventListener('click', onClose);
  if (btnOk) btnOk.addEventListener('click', onClose);
  setupBackdropCloseOnlyOnRealClick(backdrop, onClose);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!backdrop.classList.contains('activo')) return;
    onClose();
  });
}

function onSessionReady(session) {
  currentUserEmail = session.user.email || '';
  currentUserId = session.user.id;
  lastActivityTime = Date.now();
  ensureProfile(session)
    .then(() => client.rpc('get_my_permissions'))
    .then((res) => {
      if (res.error) {
        document.getElementById('login-error').textContent = res.error.message || 'Error al cargar permisos.';
        return Promise.reject(res.error);
      }
      userPermissions = res.data || [];
      return client.from('app_config').select('value').eq('key', 'session_timeout_minutes').maybeSingle();
    })
    .then((configRes) => {
      if (!configRes || configRes.error) {
        configRes = { data: null };
      }
      if (configRes && !configRes.error && configRes.data && configRes.data.value) {
        const n = parseInt(configRes.data.value, 10);
        if (n > 0 && n <= 1440) sessionTimeoutMinutes = n;
      }
      startSessionTimeoutCheck();
      showAppContent();
      // Recalcular CC y caja desde orden + transacciones (modelo autónomo); en segundo plano para no bloquear la UI.
      sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion().catch(() => {});
      const userEmailEl = document.getElementById('user-email');
      if (userEmailEl) userEmailEl.textContent = currentUserEmail;

      document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
        if (sessionCheckIntervalId) clearInterval(sessionCheckIntervalId);
        sessionCheckIntervalId = null;
        if (refreshDataIntervalId) clearInterval(refreshDataIntervalId);
        refreshDataIntervalId = null;
        ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach((ev) => document.removeEventListener(ev, updateSessionActivity));
        client.auth.signOut().then(() => showLogin());
      });

      const btnRefresh = document.getElementById('btn-refresh');
      if (btnRefresh) btnRefresh.addEventListener('click', () => refreshPermisosYVista());

      const sidebar = document.getElementById('sidebar');
      const toggle = document.getElementById('sidebar-toggle');
      if (localStorage.getItem(SIDEBAR_KEY) === '1') sidebar.classList.add('expanded');
      function updateSidebarToggleLabel() {
        if (!toggle) return;
        const expanded = sidebar.classList.contains('expanded');
        toggle.setAttribute('aria-label', expanded ? 'Contraer menú' : 'Expandir menú');
        toggle.setAttribute('title', expanded ? 'Contraer menú' : 'Expandir menú');
      }
      updateSidebarToggleLabel();
      pandiSyncSidebarBackdrop();
      const sidebarBackdrop = document.getElementById('sidebar-backdrop');
      if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => {
          if (!pandiIsMobileNavLayout() || !sidebar.classList.contains('expanded')) return;
          sidebar.classList.remove('expanded');
          localStorage.setItem(SIDEBAR_KEY, '0');
          updateSidebarToggleLabel();
          pandiSyncSidebarBackdrop();
        });
      }
      if (toggle) {
        toggle.addEventListener('click', () => {
          sidebar.classList.toggle('expanded');
          localStorage.setItem(SIDEBAR_KEY, sidebar.classList.contains('expanded') ? '1' : '0');
          updateSidebarToggleLabel();
          pandiSyncSidebarBackdrop();
        });
      }
      let pandiResizeSidebarTid;
      window.addEventListener('resize', () => {
        clearTimeout(pandiResizeSidebarTid);
        pandiResizeSidebarTid = setTimeout(() => pandiSyncSidebarBackdrop(), 150);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.querySelectorAll('.modal-backdrop.activo').length > 0) return;
        if (!pandiIsMobileNavLayout() || !sidebar.classList.contains('expanded')) return;
        sidebar.classList.remove('expanded');
        try {
          localStorage.setItem(SIDEBAR_KEY, '0');
        } catch (err) {
          /* ignore */
        }
        updateSidebarToggleLabel();
        pandiSyncSidebarBackdrop();
      });

      setupVistasMenu();
      applyVistasMenuVisibility();
      setupPanelControl();
      setupModalCliente();
      setupModalIntermediario();
      setupModalTipoOperacion();
      setupModalReglasNegocio();
      setupModalOrden();
      if (typeof window !== 'undefined') {
        window.__closeModalOrden = function () { solicitarCierreModalOrden({ modo: 'listo', refrescarOrdenes: true }); };
        window.__closeModalOrdenSolo = function () { solicitarCierreModalOrden({ modo: 'salir', refrescarOrdenes: true }); };
      }
      setupModalChatOrden();
      setupModalTransacciones();
      setupModalTransaccion();
      setupModalMovimientoCaja();
      setupModalTipoMovimientoCaja();
      setupCajasToggle();
      setupCajasMovFiltrosYTabs();
      setupCuentaCorriente();
      setupModalMovimientoCc();
      setupModalesDraggable();
      setupHelpPopovers();
      const [defaultVistaId, defaultTitle] = getFirstAllowedView();
      showView(defaultVistaId, defaultTitle);
      if (refreshDataIntervalId) clearInterval(refreshDataIntervalId);
      refreshDataIntervalId = setInterval(refreshCurrentViewData, REFRESH_DATA_INTERVAL_MS);
      setTimeout(() => maybeShowLoginBromaModal(), 200);
    })
    .catch(() => {});
}

/** Ayudas (help): al hacer clic en .help-icon-btn se abre un modal con el contenido del .help-popover asociado. */
function setupHelpPopovers() {
  const backdrop = document.getElementById('modal-help-backdrop');
  const btnCerrar = document.getElementById('modal-help-cerrar');
  const tituloEl = document.getElementById('modal-help-titulo');
  const contenidoEl = document.getElementById('modal-help-contenido');
  if (!backdrop || !btnCerrar || !contenidoEl || !tituloEl) return;

  function closeHelpModal() {
    backdrop.classList.remove('activo');
    backdrop.setAttribute('aria-hidden', 'true');
  }

  function openHelpModal(html, title) {
    tituloEl.textContent = title || 'Ayuda';
    contenidoEl.innerHTML = html || '';
    backdrop.classList.add('activo');
    backdrop.setAttribute('aria-hidden', 'false');
  }

  btnCerrar.addEventListener('click', closeHelpModal);
  setupBackdropCloseOnlyOnRealClick(backdrop, closeHelpModal);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.help-icon-btn');
    if (!btn) return;
    e.preventDefault();
    const wrap = btn.closest('.help-inline');
    const popover = wrap?.querySelector('.help-popover');
    const html = popover ? popover.innerHTML : '';
    openHelpModal(html, 'Ayuda');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!backdrop.classList.contains('activo')) return;
    closeHelpModal();
  });
}

setupLoginBromaModal();

// Inicio: getSession puede resolver *después* de un login rápido (autocompletar + Enter); sin guarda, el callback tardío llamaba showLogin() otra vez y duplicaba listeners.
client.auth.getSession().then(({ data: { session } }) => {
  if (authBootstrapFromGetSessionDone) return;
  authBootstrapFromGetSessionDone = true;
  if (!session) {
    showLogin();
    setupLoginAndRegister();
    return;
  }
  onSessionReady(session);
});

client.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' && !session) showLogin();
});
