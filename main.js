const SUPABASE_URL = (typeof window.SUPABASE_URL !== 'undefined' && window.SUPABASE_URL) ? window.SUPABASE_URL : '';
const SUPABASE_ANON_KEY = (typeof window.SUPABASE_ANON_KEY !== 'undefined' && window.SUPABASE_ANON_KEY) ? window.SUPABASE_ANON_KEY : '';

if (!SUPABASE_ANON_KEY || !SUPABASE_URL) {
  document.body.innerHTML = '<div class="card" style="margin:2rem; color:#b91c1c;">Falta config. Copiá <code>config.example.js</code> a <code>config.js</code> y configurá SUPABASE_URL y SUPABASE_ANON_KEY.</div>';
  throw new Error('Missing Supabase config');
}

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

function showLogin() {
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'none';
}

function showAppContent() {
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('app-content').style.display = 'block';
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
  ['vista-inicio', 'vista-ordenes', 'vista-cajas', 'vista-clientes', 'vista-intermediarios', 'vista-tipos-operacion', 'vista-cuenta-corriente', 'vista-seguridad'].forEach((id) => {
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
  if (vistaId === 'vista-cuenta-corriente') loadCuentaCorriente();
  if (vistaId === 'vista-intermediarios') loadIntermediarios();
  if (vistaId === 'vista-tipos-operacion') loadTiposOperacion();
}

/** Mensaje al desactivar un permiso (para mostrar contexto al administrador). Solo permisos con mensaje específico. */
const MENSAJE_AL_DESACTIVAR_PERMISO = {
  ver_cajas: 'Los usuarios con este rol no podrán acceder a la vista Cajas.',
  ver_cajas_efectivo: 'Los usuarios no verán la tarjeta Efectivo en Cajas. Si tienen Operar, igual podrán registrar movimientos en efectivo desde órdenes o transacciones.',
  ver_cajas_banco: 'Los usuarios no verán la tarjeta Banco en Cajas. Si tienen Operar, igual podrán registrar movimientos en banco desde órdenes o transacciones.',
  abm_movimientos_caja: 'Los usuarios podrán ver los saldos (según Ver Efectivo/Banco) pero no crear ni editar movimientos en Cajas.',
  abm_tipos_movimiento_caja: 'Los usuarios no podrán crear ni editar tipos de movimiento de caja.',
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
  { id: 'inicio', titulo: 'Panel de Control', ver: ['ver_inicio', 'ver_inicio_efectivo', 'ver_inicio_banco', 'ver_inicio_pendientes'], operar: [] },
  { id: 'ordenes', titulo: 'Órdenes', ver: ['ver_ordenes'], operar: ['ingresar_orden', 'editar_orden', 'anular_orden', 'editar_estado_orden', 'ingresar_transacciones', 'editar_transacciones', 'eliminar_transacciones'] },
  { id: 'cajas', titulo: 'Cajas', ver: ['ver_cajas', 'ver_cajas_efectivo', 'ver_cajas_banco'], verSubPerms: ['ver_cajas_efectivo', 'ver_cajas_banco'], operar: ['abm_movimientos_caja', 'abm_tipos_movimiento_caja'] },
  { id: 'clientes', titulo: 'Clientes', ver: ['ver_clientes'], operar: ['abm_clientes'] },
  { id: 'intermediarios', titulo: 'Intermediarios', ver: ['ver_intermediarios'], operar: ['abm_intermediarios'] },
  { id: 'tipos-operacion', titulo: 'Tipos de operación', ver: [], operar: ['abm_tipos_operacion'] },
  { id: 'cuenta-corriente', titulo: 'Cuenta corriente', ver: ['ver_cuenta_corriente'], operar: [] },
  { id: 'seguridad', titulo: 'Seguridad', ver: ['ver_seguridad'], operar: ['assign_roles'] },
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

// --- Cajas ---
let cajasMonedaActual = 'TODO';
let tiposMovimientoCaja = [];

function formatMonto(n, moneda) {
  if (n == null || isNaN(n)) return '–';
  return formatImporteDisplay(n);
}

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
 * Misma lógica que las cards de Cajas: efectivo/banco (cheque no se muestra en cards).
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

function loadCajas() {
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
  const cardEfectivo = document.getElementById('cajas-card-efectivo');
  const cardBanco = document.getElementById('cajas-card-banco');
  if (cardEfectivo) cardEfectivo.style.display = verEfectivo ? '' : 'none';
  if (cardBanco) cardBanco.style.display = verBanco ? '' : 'none';

  loadingEl.style.display = 'block';
  const loadingShownAtCajas = Date.now();
  wrapEl.style.display = 'none';
  const cajasSaldoIds = ['cajas-saldo-efectivo-usd', 'cajas-saldo-efectivo-eur', 'cajas-saldo-efectivo-ars', 'cajas-saldo-banco-usd', 'cajas-saldo-banco-ars'];
  cajasSaldoIds.forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = '–'; });

  Promise.all([getListaMovimientosCajaParaSaldos(), client.from('tipos_movimiento_caja').select('id, nombre')])
    .then(([list, resTipos]) => {
    return delayMinLoading(loadingShownAtCajas).then(() => {
    loadingEl.style.display = 'none';
    const saldos = saldosCajaDesdeLista(list);
    const tiposMap = {};
    (resTipos.data || []).forEach((t) => { tiposMap[t.id] = t.nombre || '–'; });
    const setVal = (el, valor, moneda) => {
      if (!el) return;
      el.textContent = formatMonto(valor, moneda);
      const base = el.id && el.id.startsWith('cajas-saldo-') ? 'inicio-caja-valor valor ' : 'valor ';
      el.className = base + (valor >= 0 ? 'positivo' : 'negativo');
    };
    setVal(document.getElementById('cajas-saldo-efectivo-usd'), saldos.efectivo.USD, 'USD');
    setVal(document.getElementById('cajas-saldo-efectivo-eur'), saldos.efectivo.EUR, 'EUR');
    setVal(document.getElementById('cajas-saldo-efectivo-ars'), saldos.efectivo.ARS, 'ARS');
    setVal(document.getElementById('cajas-saldo-banco-usd'), saldos.banco.USD, 'USD');
    setVal(document.getElementById('cajas-saldo-banco-ars'), saldos.banco.ARS, 'ARS');

    const filtrados = cajasMonedaActual === 'TODO' ? list : list.filter((m) => m.moneda === cajasMonedaActual);
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
            const mov = filtrados.find((x) => x.id === id);
            if (mov) openModalMovimientoCaja(mov);
          });
        });
      }
      wrapEl.style.display = 'block';
    });
    });

  loadTiposMovimientoCajaTable();
}

function loadInicio() {
  const elEfectivo = document.getElementById('inicio-card-efectivo');
  const elBanco = document.getElementById('inicio-card-banco');
  const elSaldos = document.getElementById('inicio-saldos');
  const elPendientes = document.getElementById('inicio-cards-pendientes');
  const canIngresarOrden = userPermissions.includes('ingresar_orden');
  const btnChatInicio = document.getElementById('btn-orden-por-chat-inicio');
  if (btnChatInicio) btnChatInicio.style.display = canIngresarOrden ? '' : 'none';

  const hasEfectivoPerm = userPermissions.includes('ver_inicio_efectivo');
  const hasBancoPerm = userPermissions.includes('ver_inicio_banco');
  const hasPendientesPerm = userPermissions.includes('ver_inicio_pendientes');
  const hasAnyPanelCardPerm = hasEfectivoPerm || hasBancoPerm || hasPendientesPerm;
  if (hasAnyPanelCardPerm) {
    if (elEfectivo) elEfectivo.style.display = hasEfectivoPerm ? '' : 'none';
    if (elBanco) elBanco.style.display = hasBancoPerm ? '' : 'none';
    if (elSaldos) elSaldos.style.display = hasEfectivoPerm || hasBancoPerm ? '' : 'none';
    if (elPendientes) elPendientes.style.display = hasPendientesPerm ? '' : 'none';
  } else {
    if (elEfectivo) elEfectivo.style.display = '';
    if (elBanco) elBanco.style.display = '';
    if (elSaldos) elSaldos.style.display = '';
    if (elPendientes) elPendientes.style.display = '';
  }

  const hoy = new Date();
  const hoyStr = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.getFullYear() + '-' + String(ayer.getMonth() + 1).padStart(2, '0') + '-' + String(ayer.getDate()).padStart(2, '0');

  const monedasEfectivo = ['USD', 'ARS', 'EUR'];
  const monedasBanco = ['USD', 'ARS'];

  // Usar la misma lista y el mismo cálculo que la vista Cajas: Saldo Actual = saldos de las cards de Cajas.
  getListaMovimientosCajaParaSaldos()
    .then((list) => {
      const saldoActual = saldosCajaDesdeLista(list);
      const saldoT1 = { efectivo: { USD: 0, EUR: 0, ARS: 0 }, banco: { USD: 0, EUR: 0, ARS: 0 } };
      (list || []).forEach((m) => {
        const tipo = (m.caja_tipo || 'efectivo').toLowerCase();
        if (tipo === 'cheque') return;
        const t = tipo === 'efectivo' || tipo === 'banco' ? tipo : 'efectivo';
        const moneda = (m.moneda || '').toUpperCase();
        if (saldoT1[t][moneda] == null) return;
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
      monedasEfectivo.forEach((mon) => setFila('efectivo', mon));
      monedasBanco.forEach((mon) => setFila('banco', mon));
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
      <td>${escapeHtml(o.tipo_operacion_id ? tiposOpMap[o.tipo_operacion_id] || '–' : '–')}</td>
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
        tipoOpIds.length ? client.from('tipos_operacion').select('id, nombre').in('id', tipoOpIds) : Promise.resolve({ data: [] }),
        intIds.length ? client.from('intermediarios').select('id, nombre').in('id', intIds) : Promise.resolve({ data: [] }),
      ]).then(([cr, tr, ir]) => {
        const clientesMap = {};
        (cr.data || []).forEach((c) => { clientesMap[c.id] = c.nombre || ''; });
        const tiposOpMap = {};
        (tr.data || []).forEach((t) => { tiposOpMap[t.id] = t.nombre || ''; });
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
  if (backdropOrdenes) backdropOrdenes.addEventListener('click', (e) => { if (e.target === backdropOrdenes) backdropOrdenes.classList.remove('activo'); });
  if (backdropTrans) backdropTrans.addEventListener('click', (e) => { if (e.target === backdropTrans) backdropTrans.classList.remove('activo'); });
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
let ccResumenRowsConSaldo = [];
let ccFiltroTipo = 'cliente';

// Conceptos de movimientos CC (legibles para el usuario). Incluimos textos legacy en listas para borrar/consultar datos ya guardados.
const CONCEPTO_CC_CONVERSION = 'Conversión de moneda';
const CONCEPTO_CC_COMISION = 'Comisión del acuerdo';
const CONCEPTOS_CC_CONVERSION_TODOS = ['Conversión por tipo de cambio', 'Conversión de moneda'];
const CONCEPTOS_CC_COMISION_TODOS = ['Comisión', 'Comisión del acuerdo'];
const CONCEPTOS_CC_AUTOGENERADOS = [...CONCEPTOS_CC_CONVERSION_TODOS, ...CONCEPTOS_CC_COMISION_TODOS];

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
    return Promise.all(ordenIds.map((ordenId) => sincronizarCcYCajaDesdeOrden(ordenId)));
  });
}

function loadCuentaCorriente() {
  const loadingEl = document.getElementById('cc-loading');
  const contenido = document.getElementById('cc-contenido');
  const tbody = document.getElementById('cc-resumen-tbody');
  if (!contenido || !tbody) return;

  if (loadingEl) loadingEl.style.display = 'block';
  const loadingShownAtCc = Date.now();
  contenido.style.display = 'none';

  sincronizarCcYCajaParaTodasLasOrdenesConInstrumentacion().then(() =>
    Promise.all([
      client.from('clientes').select('id, nombre').order('nombre', { ascending: true }),
      client.from('intermediarios').select('id, nombre').order('nombre', { ascending: true }),
      client.from('movimientos_cuenta_corriente').select('cliente_id, orden_id, transaccion_id, moneda, monto, concepto, monto_usd, monto_ars, monto_eur, estado'),
      client.from('movimientos_cuenta_corriente_intermediario').select('intermediario_id, orden_id, transaccion_id, moneda, monto, concepto, monto_usd, monto_ars, monto_eur, estado'),
    ])
  ).then(([rClientes, rInt, rMovCli, rMovInt]) => {
    const clientes = rClientes.data || [];
    const intermediarios = rInt.data || [];
    const movCliRaw = rMovCli.data || [];
    const movIntRaw = rMovInt.data || [];
    const transaccionIds = [...new Set([...(movCliRaw.map((m) => m.transaccion_id)), ...(movIntRaw.map((m) => m.transaccion_id))].filter(Boolean))];
    const ordenIds = [...new Set([...(movCliRaw.map((m) => m.orden_id)), ...(movIntRaw.map((m) => m.orden_id))].filter(Boolean))];
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
      function incluirEnSaldo(m, trEstados, ordEjecutada) {
        if (m.estado === 'anulado') return false;
        const concepto = (m.concepto || '').toString();
        if (concepto.includes('Compromiso Saldado')) return true;
        if (concepto.includes('Compromiso')) {
          const trId = m.transaccion_id;
          const ordenId = m.orden_id;
          return (trId && trEstados[trId] === 'ejecutada') || (ordenId && ordEjecutada[ordenId]);
        }
        return true;
      }
      const movCli = movCliRaw.filter((m) => incluirEnSaldo(m, trById, orderHasEjecutada));
      const movInt = movIntRaw.filter((m) => incluirEnSaldo(m, trById, orderHasEjecutada));
      return delayMinLoading(loadingShownAtCc).then(() => {
        buildCcResumenRows(clientes, intermediarios, movCli, movInt, loadingEl, contenido, tbody);
      });
    });
  }).catch((err) => {
    if (loadingEl) loadingEl.style.display = 'none';
    contenido.style.display = 'block';
  });
}

function buildCcResumenRows(clientes, intermediarios, movCli, movInt, loadingEl, contenido, tbody) {
  if (loadingEl) loadingEl.style.display = 'none';
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
   * Regla CC: saldo = suma de todos los movimientos por moneda (solo se excluye estado anulado).
   * Positivo = a Pandy le deben (cliente debe) → verde; negativo = Pandy debe → rojo.
   */
  function saldosDesdeMovimientosPorOrden(movs) {
    const acc = { USD: 0, EUR: 0, ARS: 0 };
    (movs || []).forEach((m) => {
      if (m.estado === 'anulado') return;
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
  clientes.forEach((c) => {
    const saldos = saldosDesdeMovimientosPorOrden(movsCliById[c.id] || []);
    rows.push({ tipo: 'cliente', id: c.id, nombre: c.nombre, saldos });
    addedCli.add(c.id);
  });
  Object.keys(movsCliById || {}).forEach((id) => {
    if (addedCli.has(id)) return;
    const c = clientesById[id];
    const saldos = saldosDesdeMovimientosPorOrden(movsCliById[id] || []);
    rows.push({ tipo: 'cliente', id, nombre: (c && c.nombre) || '–', saldos });
  });
  // Intermediario: misma regla que cliente — saldo solo desde movimientos (momento cero ya tiene Debe+Compensación que suman 0).
  intermediarios.forEach((i) => {
    const saldos = saldosDesdeMovimientosPorOrden(movsIntById[i.id] || []);
    rows.push({ tipo: 'intermediario', id: i.id, nombre: i.nombre, saldos });
    addedInt.add(i.id);
  });
  Object.keys(movsIntById || {}).forEach((id) => {
    if (addedInt.has(id)) return;
    const i = intermediariosById[id];
    const saldos = saldosDesdeMovimientosPorOrden(movsIntById[id] || []);
    rows.push({ tipo: 'intermediario', id, nombre: (i && i.nombre) || '–', saldos });
  });
  const conSaldo = (r) => (Number(r.saldos.USD) || 0) !== 0 || (Number(r.saldos.EUR) || 0) !== 0 || (Number(r.saldos.ARS) || 0) !== 0;
  ccResumenRowsConSaldo = rows.filter(conSaldo);
  ccResumenRowsConSaldo.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  aplicarFiltroCcResumen();
  contenido.style.display = 'block';
}

function aplicarFiltroCcResumen() {
  const filtrados = ccResumenRowsConSaldo.filter((r) => r.tipo === ccFiltroTipo);
  renderCcResumenTable(filtrados);
}

function renderCcResumenTable(rows) {
  const tbody = document.getElementById('cc-resumen-tbody');
  if (!tbody) return;

  const monedas = ['USD', 'EUR', 'ARS'];
  tbody.innerHTML = rows
    .map((row) => {
      const cels = [escapeHtml(row.nombre || '–')];
      monedas.forEach((mon) => {
        const s = Number(row.saldos[mon]) || 0;
        const val = s !== 0 ? formatMonto(s >= 0 ? s : -s, mon) : '–';
        const cls = s > 0 ? 'valor-positivo' : (s < 0 ? 'valor-negativo' : '');
        cels.push(`<span class="${cls}">${val}</span>`);
      });
      cels.push(
        `<button type="button" class="btn-ver-detalle" data-tipo="${escapeHtml(row.tipo)}" data-id="${escapeHtml(row.id)}" data-nombre="${escapeHtml(row.nombre || '')}" title="Ver detalle" aria-label="Ver detalle cuenta corriente"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="2.5" fill="none"/></svg></span></button>`
      );
      return `<tr><td>${cels.join('</td><td>')}</td></tr>`;
    })
    .join('');

  if (rows.length === 0) tbody.innerHTML = '<tr><td colspan="5">No hay ' + (ccFiltroTipo === 'cliente' ? 'clientes' : 'intermediarios') + ' con saldo distinto de cero.</td></tr>';
  else {
    tbody.querySelectorAll('.btn-ver-detalle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tipo = btn.getAttribute('data-tipo');
        const id = btn.getAttribute('data-id');
        const nombre = btn.getAttribute('data-nombre') || '';
        if (tipo && id) openModalCcDetalle(tipo, id, nombre);
      });
    });
  }
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
    ? 'id, moneda, monto, concepto, fecha, estado, estado_fecha, monto_usd, monto_ars, monto_eur, orden_id, transaccion_id'
    : 'id, moneda, monto, concepto, fecha, estado, estado_fecha, monto_usd, monto_ars, monto_eur, orden_id, transaccion_id';
  return Promise.all([
    client.from(tablaMov).select(selectMov).match(filtroMov).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    client.from('ordenes').select(ordenesTieneNumeroColumn ? 'id, numero, cliente_id, intermediario_id, fecha, estado, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado' : 'id, cliente_id, intermediario_id, fecha, estado, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado').neq('estado', 'anulada').match({ [campoId]: entityId }),
  ]).then(([rMov, rOrd]) => {
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
      function incluirEnSaldo(m) {
        if (m.estado === 'anulado') return false;
        const concepto = (m.concepto || '').toString();
        if (concepto.includes('Compromiso Saldado')) return true;
        if (concepto.includes('Compromiso')) {
          return (m.transaccion_id && trById[m.transaccion_id] === 'ejecutada') || (m.orden_id && orderHasEjecutada[m.orden_id]);
        }
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
      return { movimientos, saldos, ordenes };
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
  tituloEl.textContent = 'Detalle cuenta corriente';
  entityEl.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = tipoLabel + ': ' + (nombre || '–');
  entityEl.appendChild(strong);
  saldosWrap.innerHTML = '';
  loadingEl.style.display = 'block';
  tablaWrap.style.display = 'none';
  backdrop.classList.add('activo');

  fetchMovimientosCcPorEntidad(tipo, id).then(({ movimientos, saldos, ordenes }) => {
    ccDetalleMovimientosList = movimientos;
    ccDetalleOrdenesList = ordenes || [];
    loadingEl.style.display = 'none';

    const monedas = ['USD', 'EUR', 'ARS'];
    const iconUrls = { USD: '/assets/Icono_Dolar.avif', EUR: '/assets/Icono_Euro.avif', ARS: '/assets/Icono_ARS.webp' };
    saldosWrap.innerHTML = monedas
      .map((mon) => {
        const s = Number(saldos[mon]) || 0;
        const label = s >= 0 ? 'Positivo' : 'Negativo';
        const val = formatMonto(s >= 0 ? s : -s, mon);
        const cls = 'valor ' + (s >= 0 ? 'positivo' : 'negativo');
        return `<div class="card" style="min-width:120px;"><span class="card-titulo"><img src="${iconUrls[mon]}" alt="" class="cc-icono-moneda" width="20" height="20"/> ${mon}</span><span class="cc-saldo-label" aria-hidden="true">${label}</span><span class="${cls}">${val}</span></div>`;
      })
      .join('');

    renderCcDetalleTable();
    tablaWrap.style.display = 'block';
    renderCcDetalleOperaciones();
    const operacionesWrap = document.getElementById('modal-cc-detalle-operaciones-wrap');
    if (operacionesWrap) operacionesWrap.style.display = ccDetalleOrdenesList.length > 0 ? 'block' : 'none';
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
}

function formatearCeldaMoneda(val, moneda) {
  if (val == null || Number(val) === 0) return '–';
  const n = Number(val);
  const cls = n >= 0 ? 'valor-positivo' : 'valor-negativo';
  const mon = moneda || 'USD';
  return `<span class="${cls}">${formatMonto(n >= 0 ? n : -n, mon)}</span>`;
}

function renderCcDetalleTable() {
  const tbody = document.getElementById('cc-detalle-tbody');
  const tfoot = document.getElementById('cc-detalle-tfoot');
  const canAbmCc = userPermissions.includes('editar_transacciones') && ccDetalleTipo === 'cliente';
  if (!tbody) return;

  const filtrados = ccDetalleMovimientosList;

  tbody.innerHTML = filtrados
    .map((m) => {
      const tienePorMoneda = m.monto_usd != null || m.monto_ars != null || m.monto_eur != null;
      let celdaUsd = '–', celdaArs = '–', celdaEur = '–';
      if (tienePorMoneda) {
        celdaUsd = formatearCeldaMoneda(m.monto_usd, 'USD');
        celdaArs = formatearCeldaMoneda(m.monto_ars, 'ARS');
        celdaEur = formatearCeldaMoneda(m.monto_eur, 'EUR');
      } else {
        const mon = m.moneda || 'USD';
        const n = Number(m.monto) || 0;
        const cls = n >= 0 ? 'valor-positivo' : 'valor-negativo';
        const str = formatMonto(n >= 0 ? n : -n, mon);
        if (mon === 'USD') celdaUsd = `<span class="${cls}">${str}</span>`;
        else if (mon === 'ARS') celdaArs = `<span class="${cls}">${str}</span>`;
        else celdaEur = `<span class="${cls}">${str}</span>`;
      }
      const estadoLabel = (m.estado === 'pendiente' ? 'Pendiente' : (m.estado === 'cerrado' ? 'Cerrado' : (m.estado || '–')));
      const editarBtn = (canAbmCc && !m.synthetic) ? `<button type="button" class="btn-editar btn-editar-cc-detalle" data-id="${m.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : '';
      return `<tr>
          <td>${(m.fecha || '').toString().slice(0, 10)}</td>
          <td>${escapeHtml(m.concepto || '–')}</td>
          <td>${celdaUsd}</td>
          <td>${celdaArs}</td>
          <td>${celdaEur}</td>
          <td>${escapeHtml(estadoLabel)}</td>
          <td>${editarBtn}</td>
        </tr>`;
    })
    .join('');

  if (tfoot) tfoot.innerHTML = filtrados.length === 0 ? '' : '';

  if (filtrados.length === 0) tbody.innerHTML = '<tr><td colspan="7">No hay movimientos.</td></tr>';
  else if (canAbmCc) {
    tbody.querySelectorAll('.btn-editar-cc-detalle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mov = ccDetalleMovimientosList.find((x) => x.id === btn.getAttribute('data-id'));
        if (mov) openModalMovimientoCc(mov);
      });
    });
  }
}

/** Carga CC de un intermediario: misma regla que cliente — saldo desde movimientos (suma sin filtrar por estado; solo se excluye anulado). */
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

/** Carga CC de un cliente: saldo desde movimientos (suma sin filtrar por estado; solo se excluye anulado). */
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
          ccDetalleMovimientosList = movimientos;
          ccDetalleOrdenesList = ordenes || [];
          renderCcDetalleTable();
          const saldosWrap = document.getElementById('modal-cc-detalle-saldos');
          if (saldosWrap && saldos) {
            const monedas = ['USD', 'EUR', 'ARS'];
            const iconUrls = { USD: '/assets/Icono_Dolar.avif', EUR: '/assets/Icono_Euro.avif', ARS: '/assets/Icono_ARS.webp' };
            saldosWrap.innerHTML = monedas.map((mon) => {
              const s = Number(saldos[mon]) || 0;
              const label = s >= 0 ? 'Positivo' : 'Negativo';
              const val = formatMonto(s >= 0 ? s : -s, mon);
              const cls = 'valor ' + (s >= 0 ? 'positivo' : 'negativo');
              return `<div class="card" style="min-width:120px;"><span class="card-titulo"><img src="${iconUrls[mon]}" alt="" class="cc-icono-moneda" width="20" height="20"/> ${mon}</span><span class="cc-saldo-label" aria-hidden="true">${label}</span><span class="${cls}">${val}</span></div>`;
            }).join('');
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
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalMovimientoCc(); });
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveMovimientoCc(); });
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
  if (backdropDetalle) backdropDetalle.addEventListener('click', (e) => { if (e.target === backdropDetalle) closeModalCcDetalle(); });

  const ccFiltroTipoEl = document.getElementById('cc-filtro-tipo');
  if (ccFiltroTipoEl) {
    ccFiltroTipoEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tipo = btn.getAttribute('data-tipo');
        if (!tipo) return;
        ccFiltroTipo = tipo;
        ccFiltroTipoEl.querySelectorAll('button').forEach((b) => b.classList.remove('activo'));
        btn.classList.add('activo');
        aplicarFiltroCcResumen();
      });
    });
  }

  const ccBtnRefrescar = document.getElementById('cc-btn-refrescar');
  if (ccBtnRefrescar) {
    ccBtnRefrescar.addEventListener('click', () => {
      loadCuentaCorriente();
      showToast('Saldos recalculados (solo movimientos ejecutados).', 'info');
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

// --- Formato importes: miles con punto, decimales con coma (es-AR) ---
function parseImporteInput(str) {
  if (str == null || typeof str !== 'string') return NaN;
  const s = str.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s, 10);
  return isNaN(n) ? NaN : n;
}

function formatImporteDisplay(num) {
  if (num == null || isNaN(num)) return '';
  const parts = Number(num).toFixed(2).split('.');
  const entera = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts[1] ? entera + ',' + parts[1] : entera;
}

/** Para inputs de importe: vacío si no hay valor, "0" si es cero (no "0,00"), sino formatImporteDisplay. */
function formatImporteParaInput(num) {
  if (num == null || num === '' || isNaN(Number(num))) return '';
  const n = Number(num);
  if (n === 0) return '0';
  return formatImporteDisplay(n);
}

/** Guarda solo el monto de una transacción. Si está ejecutada, reajusta CC y caja (revierte Cancelación/caja anterior, actualiza resto pendiente si hay momento cero, inserta nueva Cancelación y caja). Llama onSuccess() tras guardar. */
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
      return client.from('ordenes').select('cliente_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, numero').eq('id', ordenId).single().then((rOrd) => {
        const orden = rOrd.data || {};
        const clienteId = orden.cliente_id || null;
        const mr = Number(orden.monto_recibido) || 0;
        const me = Number(orden.monto_entregado) || 0;
        const monR = orden.moneda_recibida || 'USD';
        const monE = orden.moneda_entregada || 'USD';
        const ordenLabel = orden.numero != null ? 'nro orden ' + orden.numero : 'nro orden ' + (ordenId || '').toString().slice(0, 8);
        const fecha = new Date().toISOString().slice(0, 10);
        const ahora = new Date().toISOString();
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
          const rowDebe = rows.find((r) => (r.concepto || '').toUpperCase().includes('DEBE'));
          const rowComp = rows.find((r) => (r.concepto || '').normalize('NFD').replace(/\u0301/g, '').toUpperCase().includes('COMPENSACION'));
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
          return prom.then(() => sincronizarCcYCajaDesdeOrden(ordenId)).then(() => { if (onSuccess) onSuccess(); }).catch((err) => { showToast('Error al reajustar CC/caja: ' + (err?.message || ''), 'error'); });
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
        client.from('ordenes').select('numero, tipos_operacion(codigo)').eq('id', ordenId).single(),
        client.from('modos_pago').select('codigo').eq('id', t.modo_pago_id).single(),
      ]).then(([rOrd, rModoActual]) => {
        const tipoCodigo = rOrd.data?.tipos_operacion?.codigo || '';
        const modoActualCodigo = (rModoActual.data && rModoActual.data.codigo) || '';
        if (tipoCodigo === 'ARS-ARS' && modoActualCodigo === 'cheque') {
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
  inputEl.addEventListener('focus', () => {
    if (inputEl.value === '0' || inputEl.value === '') inputEl._importeValorPrevio = inputEl.value || '0';
  });
  inputEl.addEventListener('input', () => formatImporteInputOnType(inputEl, maxDecimales, soloComaDecimal));
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
    if (backdrop._confirmAbort) backdrop.removeEventListener('click', backdrop._confirmAbort);
    backdrop._confirmAbort = null;
    if (!ejecutado && typeof onCancel === 'function') onCancel();
  };
  btnAceptar.onclick = () => { if (typeof onConfirm === 'function') onConfirm(); cerrar(true); };
  btnCancelar.onclick = () => cerrar(false);
  btnCerrar.onclick = () => cerrar(false);
  backdrop._confirmAbort = (e) => { if (e.target === backdrop) cerrar(false); };
  backdrop.addEventListener('click', backdrop._confirmAbort);
}

function setupModalMovimientoCaja() {
  const backdrop = document.getElementById('modal-movimiento-caja-backdrop');
  const btnClose = document.getElementById('modal-movimiento-caja-close');
  const btnCancel = document.getElementById('modal-movimiento-caja-cancelar');
  const form = document.getElementById('form-movimiento-caja');
  const btnNuevo = document.getElementById('btn-nuevo-movimiento-caja');
  if (btnClose) btnClose.addEventListener('click', closeModalMovimientoCaja);
  if (btnCancel) btnCancel.addEventListener('click', closeModalMovimientoCaja);
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalMovimientoCaja(); });
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
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalTipoMovimientoCaja(); });
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveTipoMovimientoCaja(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalTipoMovimientoCaja(null));
}

// --- Órdenes ---
let ordenesVistaList = [];
let ordenesVistaClientesMap = {};
let ordenesVistaTiposOpMap = {};
let ordenesVistaIntermediariosMap = {};
let ordenesFiltrosListenersAttached = false;

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
          <td>${escapeHtml(o.tipo_operacion_id ? tiposOpMap[o.tipo_operacion_id] || '–' : '–')}</td>
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
  const estado = selEstado && selEstado.value ? selEstado.value.trim() : '';
  const filtered = ordenesVistaList.filter((o) => {
    if (clienteId && o.cliente_id !== clienteId) return false;
    if (intermediarioId && o.intermediario_id !== intermediarioId) return false;
    if (estado && (o.estado || '') !== estado) return false;
    return true;
  });
  renderOrdenesTabla(filtered);
}

function loadOrdenes() {
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
          tipoOpIds.length ? client.from('tipos_operacion').select('id, nombre').in('id', tipoOpIds) : Promise.resolve({ data: [] }),
          client.from('intermediarios').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
        ]).then(([crClientes, tr, crInt]) => {
          const clientesMap = {};
          (crClientes.data || []).forEach((c) => { clientesMap[c.id] = c.nombre || ''; });
          const tiposOpMap = {};
          (tr.data || []).forEach((t) => { tiposOpMap[t.id] = t.nombre || ''; });
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
  const btnCerrarWizard = document.getElementById('orden-btn-cerrar-wizard');
  const btnCancelarWizard = document.getElementById('orden-btn-cancelar-wizard');
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

  const promDatos = Promise.all([
    client.from('clientes').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
    client.from('tipos_operacion').select('id, codigo, nombre, moneda_in, moneda_out, usa_intermediario').eq('activo', true).order('codigo'),
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
      const tipos = (rTipos.data || []);
      const intermediarios = (rInt.data || []);

    const selCliente = document.getElementById('orden-cliente');
    const selTipo = document.getElementById('orden-tipo-operacion');
    const selInt = document.getElementById('orden-intermediario');
    if (selCliente) selCliente.innerHTML = '<option value="">Sin asignar</option>' + clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    if (selTipo) selTipo.innerHTML = '<option value="">Elegir…</option>' + tipos.map((t) => `<option value="${t.id}" data-codigo="${escapeHtml(t.codigo || '')}" data-moneda-in="${escapeHtml((t.moneda_in || '').toUpperCase())}" data-moneda-out="${escapeHtml((t.moneda_out || '').toUpperCase())}" data-usa-intermediario="${t.usa_intermediario === true ? 'true' : 'false'}">${escapeHtml(t.nombre)}</option>`).join('');
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
      if (codigo) {
        if (wizard) wizard.style.display = 'block';
        if (selCliente) selCliente.disabled = false;
        adaptarFormularioOrden(codigo, tipos);
        showStep('participantes');
        toggleComisionSplit();
      } else {
        if (wizard) wizard.style.display = 'none';
        if (selCliente) selCliente.disabled = true;
        if (wrapIntermediario) wrapIntermediario.style.display = 'none';
      }
    }
    if (selTipoEl) selTipoEl.addEventListener('change', onTipoChange);
    if (selIntEl) selIntEl.addEventListener('change', toggleComisionSplit);
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
      if (codigo === 'ARS-USD') {
        setTimeout(() => {
          const el = document.getElementById('orden-monto-entregado');
          if (el) {
            el.focus();
            setTimeout(() => { el.setSelectionRange(0, 0); }, 0);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 150);
      } else if (codigo === 'USD-ARS') {
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
      } else if (codigo === 'ARS-ARS' || codigo === 'USD-USD') {
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
    if (btnCerrarWizard) btnCerrarWizard.onclick = () => { closeModalOrden(); loadOrdenes(); };
    if (btnCancelarWizard) btnCancelarWizard.onclick = () => closeModalOrden();
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
      const tipoCodigoReg = tipos.find((t) => t.id === registroActual.tipo_operacion_id)?.codigo || '';
      if ((tipoCodigoReg === 'ARS-ARS' || tipoCodigoReg === 'USD-USD') && me != null && me > 0 && mr != null && mr > 0) {
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
      backdrop.classList.add('activo');
      showOrdenWizardStep('participantes');
      if (wizard && wizard.style.display === 'none') {
        setTimeout(() => { selTipoEl?.focus(); }, 120);
      }
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

function adaptarFormularioOrden(codigo, tipos) {
  // Prioridad: moneda_in/moneda_out del tipo (tabla); fallback: parsear código (primera = recibida, segunda = entregada)
  let recibidaDesdeTipo = null;
  let entregadaDesdeTipo = null;
  const tipo = Array.isArray(tipos) && codigo ? tipos.find((t) => (t.codigo || '') === codigo) : null;
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

  const isUsdUsd = codigo === 'USD-USD';
  const isArsUsd = codigo === 'ARS-USD';
  const isUsdArs = codigo === 'USD-ARS';
  const isArsArs = codigo === 'ARS-ARS';
  const isTipoConTc = isArsUsd || isUsdArs;
  const isTipoDosMonedas = !!(recibidaDesdeTipo && entregadaDesdeTipo && recibidaDesdeTipo !== entregadaDesdeTipo);
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
    if (recibidaDesdeTipo && ['USD', 'EUR', 'ARS'].includes(recibidaDesdeTipo)) {
      monedaRecibida.value = recibidaDesdeTipo;
      monedaRecibida.disabled = true;
    } else {
      monedaRecibida.disabled = false;
    }
  }
  if (monedaEntregada) {
    if (entregadaDesdeTipo && ['USD', 'EUR', 'ARS'].includes(entregadaDesdeTipo)) {
      monedaEntregada.value = entregadaDesdeTipo;
      monedaEntregada.disabled = true;
    } else {
      monedaEntregada.disabled = false;
    }
  }
  if (labelMontoRecibido) {
    if (isTipoDosMonedas) {
      if (isUsdArs) labelMontoRecibido.textContent = 'El cliente vende ' + (recibidaDesdeTipo || '') + ' *';
      else labelMontoRecibido.innerHTML = 'El cliente <span class="orden-label-verb-destacado">entregará</span> ' + escapeHtml(recibidaDesdeTipo || '') + ' (calculado)';
    } else labelMontoRecibido.textContent = (isUsdUsd || isTipoConTc || isArsArs) ? 'Monto a Recibir *' : 'Monto recibido *';
  }
  if (labelMontoEntregado) {
    if (isTipoDosMonedas) {
      if (isUsdArs) labelMontoEntregado.innerHTML = 'El cliente <span class="orden-label-verb-destacado">recibirá</span> ' + escapeHtml(entregadaDesdeTipo || '') + ' (calculado)';
      else labelMontoEntregado.textContent = 'El cliente compra ' + (entregadaDesdeTipo || '') + ' *';
    } else labelMontoEntregado.textContent = (isUsdUsd || isTipoConTc || isArsArs) ? 'Monto a Entregar *' : 'Monto entregado *';
  }
  const wrapTasaDescuentoInt = document.getElementById('orden-wrap-tasa-descuento-intermediario');
  const wrapComisionSplit = document.getElementById('orden-wrap-comision-split');
  const isTipoSinComision = codigo === 'ARS-USD' || codigo === 'USD-ARS';
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
      if (codigo === 'USD-ARS') {
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
    if (montoRecibidoElEarly && codigo !== 'USD-ARS') {
      montoRecibidoElEarly.readOnly = true;
      montoRecibidoElEarly.style.background = '#eee';
      montoRecibidoElEarly.style.color = '#555';
    }
    if (codigo === 'USD-ARS' && montoRecibidoElEarly) {
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
    if (!isUsdArs || !comisionDisplay) return;
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
    if (codigo === 'ARS-USD') {
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
    } else if (codigo === 'USD-ARS') {
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
  } else if (codigo === 'ARS-USD' || codigo === 'USD-ARS') {
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
      // ARS-USD: editable "El cliente compra" USD (monto entregado); USD-ARS: editable "El cliente vende" USD (monto recibido), ARS calculado
      if (fechaEl) fechaEl.disabled = true;
      if (estadoSelect) estadoSelect.disabled = true;
      if (observacionesEl) observacionesEl.disabled = !editable;
      if (codigo === 'USD-ARS') {
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
}

function closeModalOrden() {
  const idBorrador = ordenIdBorradorParaEliminar;
  const instId = ordenWizardInstrumentacionIdActual;
  ordenIdBorradorParaEliminar = null;
  ordenWizardOrdenIdActual = null;
  ordenWizardInstrumentacionIdActual = null;
  const backdrop = document.getElementById('modal-orden-backdrop');
  function doClose() {
    dismissAllToasts();
    if (backdrop) backdrop.classList.remove('activo');
    if (idBorrador) client.from('ordenes').delete().eq('id', idBorrador).then(() => loadOrdenes());
  }
  // Sincronizar montos editados en la tabla de instrumentación sin blur (relojería: no perder cambios al cerrar).
  if (instId && backdrop && backdrop.classList.contains('activo')) {
    const inputs = backdrop.querySelectorAll('.input-monto-transaccion-tabla');
    let prom = Promise.resolve();
    inputs.forEach((input) => {
      const id = input.getAttribute('data-id');
      if (!id) return;
      prom = prom.then(() => guardarSoloMontoTransaccion(id, input.value));
    });
    const timeoutMs = 8000;
    const withTimeout = Promise.race([
      prom,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    withTimeout.then(doClose).catch(doClose);
  } else {
    doClose();
  }
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
  if (!fecha || isNaN(montoRecibido) || montoRecibido <= 0 || isNaN(montoEntregado) || montoEntregado <= 0) {
    showToast('Completá fecha, monto recibido y monto entregado (números positivos).', 'error');
    return Promise.resolve(null);
  }

  const selTipoOpt = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const tipoCodigo = selTipoOpt ? (selTipoOpt.getAttribute('data-codigo') || '') : '';
  if (tipoCodigo === 'ARS-USD' || tipoCodigo === 'USD-ARS') {
    if (!cotizacion || !(cotizacion > 0)) {
      showToast('En ARS-USD y USD-ARS el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
      return Promise.resolve(null);
    }
  }
  if (tipoCodigo === 'USD-USD' && montoRecibido <= montoEntregado) {
    showToast('En USD-USD el monto a recibir debe ser mayor al monto a entregar (la diferencia es la comisión).', 'error');
    return Promise.resolve(null);
  }
  if (tipoCodigo === 'ARS-ARS') {
    if (montoRecibido <= montoEntregado) {
      showToast('En ARS-ARS (CHEQUE) el monto a recibir debe ser mayor al monto a entregar (descuento acuerdo).', 'error');
      return Promise.resolve(null);
    }
    if (!intermediarioId) {
      showToast('En ARS-ARS (CHEQUE) es obligatorio elegir un intermediario.', 'error');
      return Promise.resolve(null);
    }
    const tasaPctRaw = document.getElementById('orden-tasa-descuento-intermediario')?.value?.trim() || '';
    const tasaPct = tasaPctRaw ? parseImporteInput(tasaPctRaw) : null;
    if (typeof tasaPct !== 'number' || isNaN(tasaPct) || tasaPct <= 0 || tasaPct >= 100) {
      showToast('En ARS-ARS (CHEQUE) la tasa de descuento del intermediario es obligatoria (ej. 1 para 1%, entre 0 y 100).', 'error');
      return Promise.resolve(null);
    }
  }
  const comisionUsd = tipoCodigo === 'USD-USD' ? montoRecibido - montoEntregado
    : (tipoCodigo === 'ARS-ARS' ? montoRecibido - montoEntregado
      : ((tipoCodigo === 'ARS-USD') && cotizacion > 0 ? (montoRecibido / cotizacion) - montoEntregado
        : (tipoCodigo === 'USD-ARS' && cotizacion > 0 ? montoRecibido - (montoEntregado / cotizacion) : null)));
  const pctPandy = parseImporteInput(document.getElementById('orden-comision-pandy-pct')?.value || '100');
  const pctInt = parseImporteInput(document.getElementById('orden-comision-intermediario-pct')?.value || '0');
  const tieneSplitVisible = document.getElementById('orden-wrap-comision-split')?.style?.display !== 'none';
  if ((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-USD' || tipoCodigo === 'USD-ARS' || tipoCodigo === 'ARS-ARS') && intermediarioId && tieneSplitVisible) {
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
  const tasaDescuentoIntermediario = (tipoCodigo === 'ARS-ARS' && tasaDescuentoIntPct) ? (parseImporteInput(tasaDescuentoIntPct) / 100) : null;
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
      const conceptoComision = tipoCodigo === 'USD-ARS' ? 'Comisión USD-ARS' : (tipoCodigo === 'ARS-ARS' ? 'Comisión ARS-ARS' : 'Comisión USD-USD');
      const comisionMoneda = tipoCodigo === 'ARS-ARS' ? 'ARS' : 'USD';
      if (!((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-ARS') && comisionUsd != null && comisionUsd > 0)) return Promise.resolve();
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
    if (tipoCodigo === 'ARS-ARS' && intermediarioId && tasaDescuentoIntermediario != null) {
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
          const mr = Number(orden.monto_recibido) || 0;
          const me = Number(orden.monto_entregado) || 0;
          const okRec = totalRecibido <= mr + 1e-6;
          const okEnt = totalEntregado <= me + 1e-6;
          acuerdoAviso.textContent = (!okRec || !okEnt) ? ' (Supera acuerdo)' : '';
        }
        const modosMap = {};
        (rModos.data || []).forEach((m) => { modosMap[m.id] = m; });
        const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        const cobradorL = (t) => participantLabelHtml(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
        const pagadorL = (t) => participantLabelHtml(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
        const canEditarTr = userPermissions.includes('editar_transacciones');
        const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`; };
        const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
        const listaSorted = sortTransaccionesIngresosPrimero(lista);
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
        client.from('tipos_operacion').select('codigo').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
          const codigo = (rTipo.data && rTipo.data.codigo) || '';
          if (codigo === 'ARS-ARS' && orden.intermediario_id) {
            return autoCompletarInstrumentacionChequeConIntermediario(ordenId, instId, orden);
          }
          if (!orden.intermediario_id && (codigo === 'USD-USD' || codigo === 'ARS-USD' || codigo === 'USD-ARS' || codigo === 'ARS-ARS')) {
            return autoCompletarInstrumentacionSinIntermediario(ordenId, instId, orden);
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
  if (!fecha || isNaN(montoRecibido) || montoRecibido <= 0 || isNaN(montoEntregado) || montoEntregado <= 0) {
    showToast('Completá fecha, monto recibido y monto entregado (números positivos).', 'error');
    return;
  }

  const selTipoOpt = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const tipoCodigo = selTipoOpt ? (selTipoOpt.getAttribute('data-codigo') || '') : '';
  if (tipoCodigo === 'ARS-USD') {
    if (!cotizacion || !(cotizacion > 0)) {
      showToast('En ARS-USD el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
      return;
    }
  }
  if (tipoCodigo === 'USD-ARS') {
    if (!cotizacion || !(cotizacion > 0)) {
      showToast('En USD - ARS el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
      return;
    }
  }
  if (tipoCodigo === 'USD-USD' && montoRecibido <= montoEntregado) {
    showToast('En USD-USD el monto a recibir debe ser mayor al monto a entregar (la diferencia es la comisión).', 'error');
    return;
  }
  if (tipoCodigo === 'ARS-ARS') {
    if (montoRecibido <= montoEntregado) {
      showToast('En ARS-ARS (CHEQUE) el monto a recibir debe ser mayor al monto a entregar (descuento acuerdo).', 'error');
      return;
    }
    if (!intermediarioId) {
      showToast('En ARS-ARS (CHEQUE) es obligatorio elegir un intermediario.', 'error');
      return;
    }
    const tasaPctRaw = document.getElementById('orden-tasa-descuento-intermediario')?.value?.trim() || '';
    const tasaPct = tasaPctRaw ? parseImporteInput(tasaPctRaw) : null;
    if (typeof tasaPct !== 'number' || isNaN(tasaPct) || tasaPct <= 0 || tasaPct >= 100) {
      showToast('En ARS-ARS (CHEQUE) la tasa de descuento del intermediario es obligatoria (ej. 1 para 1%, entre 0 y 100).', 'error');
      return;
    }
  }
  const comisionUsd = tipoCodigo === 'USD-USD' ? montoRecibido - montoEntregado : (tipoCodigo === 'ARS-ARS' ? montoRecibido - montoEntregado : ((tipoCodigo === 'ARS-USD') && cotizacion > 0 ? (montoRecibido / cotizacion) - montoEntregado : (tipoCodigo === 'USD-ARS' && cotizacion > 0 ? montoRecibido - (montoEntregado / cotizacion) : null)));

  const pctPandy = parseImporteInput(document.getElementById('orden-comision-pandy-pct')?.value || '100');
  const pctInt = parseImporteInput(document.getElementById('orden-comision-intermediario-pct')?.value || '0');
  const tieneSplitVisible = document.getElementById('orden-wrap-comision-split')?.style?.display !== 'none';
  if ((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-USD' || tipoCodigo === 'USD-ARS' || tipoCodigo === 'ARS-ARS') && intermediarioId && tieneSplitVisible) {
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
  const tasaDescuentoIntermediarioSave = (tipoCodigo === 'ARS-ARS' && tasaDescuentoIntPctSave) ? (parseImporteInput(tasaDescuentoIntPctSave) / 100) : null;
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
      closeModalOrden();
      loadOrdenes();
      return;
    }
    if (ordenIdBorradorParaEliminar === ordenId) ordenIdBorradorParaEliminar = null;
    const conceptoComision = tipoCodigo === 'USD-ARS' ? 'Comisión USD-ARS' : (tipoCodigo === 'ARS-ARS' ? 'Comisión ARS-ARS' : 'Comisión USD-USD');
    const comisionMoneda = tipoCodigo === 'ARS-ARS' ? 'ARS' : 'USD';
    function guardarComisionYContinuar(continuar) {
      if ((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-ARS') && comisionUsd != null && comisionUsd > 0) {
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
          closeModalOrden();
          loadOrdenes();
        });
      });
      return;
    }
    // Al editar, también guardar comisión; si es CHEQUE con intermediario, actualizar monto 4.ª transacción por tasa; luego flujo legacy
    guardarComisionYContinuar(() => {
      const promTasa = (tipoCodigo === 'ARS-ARS' && intermediarioId && tasaDescuentoIntermediarioSave != null)
        ? actualizarTasaTransaccionIngresoIntermediarioCheque(ordenId, { monto_recibido: montoRecibido, tasa_descuento_intermediario: tasaDescuentoIntermediarioSave, intermediario_id: intermediarioId })
        : Promise.resolve();
      promTasa.then(() => {
      if (estado !== 'concertada') {
        client.from('movimientos_caja').select('id').eq('orden_id', ordenId).eq('estado', 'cerrado').limit(1).then((r) => {
          const tieneMovimientosLegacy = r.data && r.data.length > 0;
          if (!tieneMovimientosLegacy) {
            closeModalOrden();
            loadOrdenes();
            return;
          }
          const ahora = new Date().toISOString();
          client.from('movimientos_cuenta_corriente').update({ estado: 'anulado', estado_fecha: ahora }).eq('orden_id', ordenId).then((rCc) => {
            if (rCc.error) showToast('Error al revertir cuenta corriente: ' + (rCc.error.message || ''), 'error');
            client.from('movimientos_caja').update({ estado: 'anulado', estado_fecha: ahora }).eq('orden_id', ordenId).then((rCaja) => {
              if (rCaja.error) showToast('Error al revertir caja: ' + (rCaja.error.message || ''), 'error');
              closeModalOrden();
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
          closeModalOrden();
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
            closeModalOrden();
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
  if (btnClose) btnClose.addEventListener('click', closeModalOrden);
  if (btnCancel) btnCancel.addEventListener('click', () => {
    showConfirm('Los datos se perderán. ¿Continuar?', 'Sí, salir', () => closeModalOrden());
  });
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalOrden(); });
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveOrden(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalOrden(null));
  ['orden-cotizacion', 'orden-monto-recibido', 'orden-monto-entregado', 'orden-importe-cheque', 'orden-tasa-descuento-cliente', 'orden-tasa-descuento-intermediario', 'orden-comision-pandy-pct', 'orden-comision-intermediario-pct'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('focus', () => el.classList.add('orden-field-editing'));
      el.addEventListener('blur', () => el.classList.remove('orden-field-editing'));
    }
  });
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
    const codigo = monedaRecibida + '-' + monedaEntregada;
    if (codigo === 'USD-ARS') montoEntregado = montoRecibido * cotizacion;
    else if (codigo === 'ARS-USD') montoEntregado = montoRecibido / cotizacion;
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

  const requiereCotizacion = codigoTipo === 'ARS-USD' || codigoTipo === 'USD-ARS';
  if (requiereCotizacion && (!cotizacion || cotizacion <= 0)) {
    return { error: 'Para ' + codigoTipo + ' indicá el tipo de cambio (ej. "a tc 1500").' };
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
    client.from('tipos_operacion').select('id, codigo, nombre').eq('activo', true).order('codigo'),
  ]).then(([rC, rT]) => {
    chatOrdenClientes = rC.data || [];
    chatOrdenTipos = rT.data || [];
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
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalChatOrden(); });

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
      const requiereTc = r.tipo_codigo === 'ARS-USD' || r.tipo_codigo === 'USD-ARS';
      if (requiereTc && (!r.cotizacion || r.cotizacion <= 0)) {
        showToast('Para ' + r.tipo_codigo + ' el tipo de cambio es obligatorio.', 'error');
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

/** Totales de transacciones en moneda del acuerdo. orden: { moneda_recibida, monto_recibido, moneda_entregada, monto_entregado }. */
function totalesInstrumentacion(transacciones, orden) {
  if (!orden) return { totalRecibido: 0, totalEntregado: 0 };
  const requiereCliente = !!orden.cliente_id;
  const monedaRecibida = orden.moneda_recibida || 'USD';
  const monedaEntregada = orden.moneda_entregada || 'USD';
  let totalRecibido = 0;
  let totalEntregado = 0;
  (transacciones || []).forEach((t) => {
    // Para comparar con el acuerdo del cliente, solo cuentan transacciones donde participa el cliente.
    // Las transacciones Pandy ↔ Intermediario se permiten para conciliar cuentas, pero no deben bloquear el acuerdo.
    if (requiereCliente && !(t.cobrador === 'cliente' || t.pagador === 'cliente')) return;
    const monto = Number(t.monto);
    const tc = t.tipo_cambio != null && !isNaN(t.tipo_cambio) ? Number(t.tipo_cambio) : null;
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
 * Si la orden es CHEQUE (ARS-ARS) con intermediario y ya tiene las 4 transacciones,
 * actualiza el monto de la 4.ª (ingreso efectivo del intermediario) según la tasa actual de la orden.
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
  const montosCobro = montosCcPorOrden(monR, monE, mr, me, mon, monto);
  const montosDeuda = montosCcPorOrden(monR, monE, mr, me, mon, -monto);
  const inserts = [];
  // Cliente: Cobro = cliente pagó (Pandy cobró). Deuda = Pandy debe. Ambas monedas de la orden en la fila (nunca 0 en participante).
  if (pag === 'cliente' && cob !== 'intermediario' && clienteId) {
    inserts.push(client.from('movimientos_cuenta_corriente').insert({
      cliente_id: clienteId, moneda: mon, monto, orden_id: ordenId, transaccion_id: transaccionId,
      concepto: conceptoCcMovimiento(mon, monto, 'cobro'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
      ...montosCobro,
    }));
  }
  if (cob === 'cliente' && pag !== 'intermediario' && clienteId) {
    inserts.push(client.from('movimientos_cuenta_corriente').insert({
      cliente_id: clienteId, moneda: mon, monto: -monto, orden_id: ordenId, transaccion_id: transaccionId,
      concepto: conceptoCcMovimiento(mon, monto, 'deuda'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
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
          intermediario_id: intermediarioId, moneda: mon, monto, orden_id: ordenId, transaccion_id: transaccionId,
          concepto: conceptoCcMovimiento(mon, monto, 'cobro'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
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
          intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, moneda: monInt, monto: -montoEfectivoInt,
          concepto: 'Deuda del intermediario con Pandy', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
          ...montosCcPorMoneda(monInt, -montoEfectivoInt),
        }))
        .then(() => {
          if (!instrumentacionId) return Promise.resolve();
          return client.from('comisiones_orden').select('moneda, monto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario').maybeSingle()
            .then((rCom) => {
              const comMonto = rCom.data && (Number(rCom.data.monto) || 0);
              if (comMonto >= 1e-6) {
                const monCom = (rCom.data.moneda || 'ARS').toUpperCase();
                return client.from('movimientos_cuenta_corriente_intermediario').insert({
                  intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, moneda: monCom, monto: comMonto,
                  concepto: 'Comisión del acuerdo', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCcPorMoneda(monCom, comMonto),
                }).then(() => asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, comMonto, monCom));
              }
              return Promise.resolve();
            });
        })
    );
  }
  // Cliente ↔ Intermediario: se refleja en Pandy-Intermediario
  if (cob === 'cliente' && pag === 'intermediario' && intermediarioId) {
    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
      intermediario_id: intermediarioId, moneda: mon, monto: -monto, orden_id: ordenId, transaccion_id: transaccionId,
      concepto: conceptoCcMovimiento(mon, monto, 'deuda'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
      ...montosCcPorMoneda(mon, -monto),
    }));
  }
  if (cob === 'intermediario' && pag === 'cliente' && intermediarioId) {
    inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
      intermediario_id: intermediarioId, moneda: mon, monto, orden_id: ordenId, transaccion_id: transaccionId,
      concepto: conceptoCcMovimiento(mon, monto, 'cobro'), fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
      ...montosCcPorMoneda(mon, monto),
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

  return client.from('ordenes').select('id, numero, cliente_id, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, tasa_descuento_intermediario').eq('id', ordenId).single()
    .then((rOrd) => {
      if (rOrd.error || !rOrd.data) return Promise.resolve();
      const orden = rOrd.data;
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
          const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;

          const rowsCcCliente = [];
          const rowsCcInt = [];
          const rowsCaja = [];
          const yaTieneGananciaTrx = transacciones.some((t) => (t.concepto || '').includes('Ganancia del acuerdo'));

          // Regla simple CC: un registro por evento y por moneda (Compromiso + Compromiso Saldado). Sin intermediario, 2 transacciones (ingreso + egreso).
          const ingresoTr = transacciones.find((t) => String(t.tipo || '').toLowerCase() === 'ingreso' && String(t.pagador || '').toLowerCase() === 'cliente' && String(t.cobrador || '').toLowerCase() === 'pandy');
          const egresoTr = transacciones.find((t) => String(t.tipo || '').toLowerCase() === 'egreso' && String(t.cobrador || '').toLowerCase() === 'cliente' && String(t.pagador || '').toLowerCase() === 'pandy');
          const usarReglaSimpleCliente = clienteId && !intermediarioId && ingresoTr && egresoTr && transacciones.length === 2 && mr >= 1e-6 && me >= 1e-6;
          const ordenLabelSimple = 'Orden Nro ' + (orden.numero != null ? orden.numero : '?');
          if (usarReglaSimpleCliente) {
            rowsCcCliente.push({
              cliente_id: clienteId,
              orden_id: ordenId,
              transaccion_id: ingresoTr.id,
              transaccion_numero: ingresoTr.numero != null ? ingresoTr.numero : null,
              concepto: 'Compromiso - ' + ordenLabelSimple + ' y Trans Nro ' + (ingresoTr.numero != null ? ingresoTr.numero : '?'),
              fecha,
              usuario_id: currentUserId,
              moneda: monR,
              monto: -mr,
              monto_usd: numCc(monR === 'USD' ? -mr : 0),
              monto_ars: numCc(monR === 'ARS' ? -mr : 0),
              monto_eur: numCc(monR === 'EUR' ? -mr : 0),
            });
            rowsCcCliente.push({
              cliente_id: clienteId,
              orden_id: ordenId,
              transaccion_id: egresoTr.id,
              transaccion_numero: egresoTr.numero != null ? egresoTr.numero : null,
              concepto: 'Compromiso - ' + ordenLabelSimple + ' y Trans Nro ' + (egresoTr.numero != null ? egresoTr.numero : '?'),
              fecha,
              usuario_id: currentUserId,
              moneda: monE,
              monto: -me,
              monto_usd: numCc(monE === 'USD' ? -me : 0),
              monto_ars: numCc(monE === 'ARS' ? -me : 0),
              monto_eur: numCc(monE === 'EUR' ? -me : 0),
            });
          }

          transacciones.forEach((t) => {
            const transaccionId = t.id;
            const monto = Number(t.monto) || 0;
            const mon = (t.moneda || 'USD').toUpperCase();
            const cob = String(t.cobrador != null ? t.cobrador : (t.tipo === 'ingreso' ? 'pandy' : 'cliente')).toLowerCase();
            const pag = String(t.pagador != null ? t.pagador : (t.tipo === 'egreso' ? 'pandy' : 'cliente')).toLowerCase();
            const estadoMov = t.estado === 'ejecutada' ? 'cerrado' : 'pendiente';
            const montosCobro = montosCcPorOrden(monR, monE, mr, me, mon, monto);
            const montosDeuda = montosCcPorOrden(monR, monE, mr, me, mon, -monto);

            if (t.estado === 'ejecutada') {
              const codigoModo = modosMap[t.modo_pago_id] || 'efectivo';
              const cajaTipo = codigoCajaTipoDesdeCodigo(codigoModo);
              const signoCaja = cob === 'pandy' ? 1 : -1;
              const esIngreso = cob === 'pandy';
              const conceptoEspecial = (t.concepto || '').trim();
              const usarConvencion = conceptoEspecial && (conceptoEspecial.includes('Ganancia del acuerdo') || conceptoEspecial.includes('Comisión del acuerdo'));
              const concepto = usarConvencion
                ? conceptoCajaTransaccionEspecial(conceptoEspecial, mon, monto, orden.numero, t.numero)
                : conceptoCajaTransaccion(esIngreso, mon, monto, orden.numero, t.numero);
              rowsCaja.push({
                moneda: mon,
                monto: signoCaja * monto,
                caja_tipo: cajaTipo,
                transaccion_id: transaccionId,
                orden_id: ordenId,
                orden_numero: orden.numero != null ? orden.numero : null,
                transaccion_numero: t.numero != null ? t.numero : null,
                concepto,
                fecha,
                usuario_id: currentUserId,
              });
            }

            // Ganancia del acuerdo: solo "Comisión Pandy" -1.250 en CC (no "Ganancia" +1.250). Así el saldo cierra en 0: 50.000 - 1.250 - 48.750 - 48.750 + 48.750 = 0.
            const esGananciaPandy = (t.concepto || '').includes('Ganancia del acuerdo') && cob === 'pandy' && pag === 'cliente' && clienteId;
            if (esGananciaPandy) {
              const montosNeg = montosCcPorMoneda(mon, -monto);
              rowsCcCliente.push({
                cliente_id: clienteId,
                orden_id: ordenId,
                transaccion_id: transaccionId,
                concepto: conceptoConOrden('Comisión Pandy', ordenLabel),
                moneda: mon,
                monto: -monto,
                fecha,
                usuario_id: currentUserId,
                estado: estadoMov,
                estado_fecha: ahora,
                monto_usd: montosNeg.monto_usd,
                monto_ars: montosNeg.monto_ars,
                monto_eur: montosNeg.monto_eur,
              });
            } else {
              // Regla simple: una fila "Compromiso Saldado" por moneda cuando la transacción está ejecutada.
              if (usarReglaSimpleCliente && t.estado === 'ejecutada') {
                if ((t.tipo || '').toLowerCase() === 'ingreso' && pag === 'cliente') {
                  rowsCcCliente.push({
                    cliente_id: clienteId,
                    orden_id: ordenId,
                    transaccion_id: transaccionId,
                    transaccion_numero: t.numero != null ? t.numero : null,
                    concepto: 'Compromiso Saldado - ' + ordenLabelSimple + ' y Trans Nro ' + (t.numero != null ? t.numero : '?'),
                    fecha,
                    usuario_id: currentUserId,
                    moneda: monR,
                    monto: monto,
                    monto_usd: numCc(monR === 'USD' ? monto : 0),
                    monto_ars: numCc(monR === 'ARS' ? monto : 0),
                    monto_eur: numCc(monR === 'EUR' ? monto : 0),
                  });
                }
                if ((t.tipo || '').toLowerCase() === 'egreso' && cob === 'cliente') {
                  rowsCcCliente.push({
                    cliente_id: clienteId,
                    orden_id: ordenId,
                    transaccion_id: transaccionId,
                    transaccion_numero: t.numero != null ? t.numero : null,
                    concepto: 'Compromiso Saldado - ' + ordenLabelSimple + ' y Trans Nro ' + (t.numero != null ? t.numero : '?'),
                    fecha,
                    usuario_id: currentUserId,
                    moneda: monE,
                    monto: monto,
                    monto_usd: numCc(monE === 'USD' ? monto : 0),
                    monto_ars: numCc(monE === 'ARS' ? monto : 0),
                    monto_eur: numCc(monE === 'EUR' ? monto : 0),
                  });
                }
              } else if (!usarReglaSimpleCliente) {
                // Cobro: ingreso cliente→Pandy (lógica legacy cuando no aplica regla simple).
                if (pag === 'cliente' && cob !== 'intermediario' && clienteId) {
                  const esIngresoClientePandy = (t.tipo || '').toLowerCase() === 'ingreso' && cob === 'pandy' && pag === 'cliente';
                  const comisionPandyOrden = (monR === monE && mr > me) ? mr - me : 0;
                  const usarNominalOrden = comisionPandyOrden >= 1e-6 && esIngresoClientePandy;
                  const yaTieneCobroNominal = usarNominalOrden && rowsCcCliente.some((r) => Math.abs(Number(r.monto) - mr) < 1e-6 && (r.concepto || '').toLowerCase().includes('cobro'));
                  if (!yaTieneCobroNominal && t.estado === 'ejecutada') {
                    const montoCobro = usarNominalOrden ? mr : monto;
                    const monedaCobro = usarNominalOrden ? monR : mon;
                    const montosCobroRow = usarNominalOrden ? montosCcPorOrden(monR, monE, mr, me, monR, mr) : montosCobro;
                    rowsCcCliente.push({
                      cliente_id: clienteId,
                      moneda: monedaCobro,
                      monto: montoCobro,
                      orden_id: ordenId,
                      transaccion_id: transaccionId,
                      transaccion_numero: t.numero != null ? t.numero : null,
                      concepto: conceptoConOrden(conceptoCcMovimiento(monedaCobro, montoCobro, 'cobro'), ordenLabel),
                      fecha,
                      usuario_id: currentUserId,
                      estado: estadoMov,
                      estado_fecha: ahora,
                      ...montosCobroRow,
                    });
                  }
                }
                if (cob === 'cliente' && pag !== 'intermediario' && clienteId && t.estado === 'ejecutada') {
                  rowsCcCliente.push({
                    cliente_id: clienteId,
                    moneda: mon,
                    monto: -monto,
                    orden_id: ordenId,
                    transaccion_id: transaccionId,
                    transaccion_numero: t.numero != null ? t.numero : null,
                    concepto: conceptoConOrden(conceptoCcMovimiento(mon, monto, 'deuda'), ordenLabel),
                    fecha,
                    usuario_id: currentUserId,
                    estado: estadoMov,
                    estado_fecha: ahora,
                    ...montosDeuda,
                  });
                }
              }
            }

            const esPandyInt = (cob === 'pandy' && pag === 'intermediario') || (cob === 'intermediario' && pag === 'pandy');
            // Ingreso Intermediario→Pandy: no registrar +monto (duplicaría "Intermediario debe a Pandy"). Se cierra con -monto "Pago Intermediario a Pandy" más abajo.
            if (esPandyInt && cob === 'pandy' && intermediarioId) {
              // No push positivo aquí; el cierre a 0 se hace con movimiento negativo cuando ingreso Int→Pandy ejecutada (bloque después del forEach).
            }
            if (esPandyInt && cob === 'intermediario' && intermediarioId) {
              const monInt = orden.moneda_recibida || mon || 'ARS';
              // Egreso Pandy→Intermediario (cheque): registro -monto (-50.000), no -montoEfectivoInt, para que las 3 líneas sumen 0.
              rowsCcInt.push({
                intermediario_id: intermediarioId,
                orden_id: ordenId,
                transaccion_id: transaccionId,
                moneda: monInt,
                monto: -monto,
                concepto: conceptoConOrden('Pandy a Intermediario', ordenLabel),
                fecha,
                usuario_id: currentUserId,
                estado: estadoMov,
                estado_fecha: ahora,
                ...montosCcPorMoneda(monInt, -monto),
              });
              if (comisionIntMonto >= 1e-6) {
                // CC: +750 = parte de los 50.000 que se queda el intermediario (tasa descuento). -50.000 + 49.250 + 750 = 0.
                rowsCcInt.push({
                  intermediario_id: intermediarioId,
                  orden_id: ordenId,
                  transaccion_id: transaccionId,
                  moneda: comisionIntMon,
                  monto: comisionIntMonto,
                  concepto: conceptoConOrden('Comisión Intermediario', ordenLabel),
                  fecha,
                  usuario_id: currentUserId,
                  estado: estadoMov,
                  estado_fecha: ahora,
                  ...montosCcPorMoneda(comisionIntMon, comisionIntMonto),
                });
              }
            }
            if (cob === 'cliente' && pag === 'intermediario' && intermediarioId) {
              rowsCcInt.push({
                intermediario_id: intermediarioId,
                moneda: mon,
                monto: -monto,
                orden_id: ordenId,
                transaccion_id: transaccionId,
                concepto: conceptoConOrden(conceptoCcMovimiento(mon, monto, 'deuda'), ordenLabel),
                fecha,
                usuario_id: currentUserId,
                estado: estadoMov,
                estado_fecha: ahora,
                ...montosCcPorMoneda(mon, -monto),
              });
            }
            if (cob === 'intermediario' && pag === 'cliente' && intermediarioId) {
              rowsCcInt.push({
                intermediario_id: intermediarioId,
                moneda: mon,
                monto,
                orden_id: ordenId,
                transaccion_id: transaccionId,
                concepto: conceptoConOrden(conceptoCcMovimiento(mon, monto, 'cobro'), ordenLabel),
                fecha,
                usuario_id: currentUserId,
                estado: estadoMov,
                estado_fecha: ahora,
                ...montosCcPorMoneda(mon, monto),
              });
            }
          });

          // Cuenta corriente cliente (legacy): momento cero 3 líneas; "Pandy debe al cliente" cuando aplica. No usar con regla simple.
          const montoDeudaPandy = me >= 1e-6 ? me : 0;
          const ingresoClientePandyEjecutada = transacciones.find((t) => {
            const cob = String(t.cobrador || '').toLowerCase();
            const pag = String(t.pagador || '').toLowerCase();
            return (t.tipo === 'ingreso' && cob === 'pandy' && pag === 'cliente' && t.estado === 'ejecutada');
          });
          const cuantasDeuda48750 = rowsCcCliente.filter((r) => {
            const rm = Number(r.monto) || 0;
            return rm < 0 && Math.abs(rm + montoDeudaPandy) < 1e-6;
          }).length;
          const cuantasFaltan = !usarReglaSimpleCliente && ingresoClientePandyEjecutada && montoDeudaPandy >= 1e-6 && cuantasDeuda48750 < 2 ? (2 - cuantasDeuda48750) : 0;
          if (clienteId && cuantasFaltan > 0 && transacciones.length > 0) {
            const cobPag = (t) => ({ cob: String(t.cobrador || '').toLowerCase(), pag: String(t.pagador || '').toLowerCase() });
            const egresoPandyCliente = transacciones.find((t) => {
              const { cob, pag } = cobPag(t);
              const esEgreso = String(t.tipo || '').toLowerCase() === 'egreso';
              return (cob === 'cliente' && pag === 'pandy') || (esEgreso && pag === 'cliente' && cob === 'pandy');
            });
            const trEgr = egresoPandyCliente || transacciones.find((t) => String(t.tipo || '').toLowerCase() === 'egreso');
            const monEgr = (trEgr && trEgr.moneda) ? String(trEgr.moneda).toUpperCase() : monE;
            const trIdDeuda = (trEgr && trEgr.id) || (transacciones[0] && transacciones[0].id);
            for (let i = 0; i < cuantasFaltan; i++) {
              const montosDeudaEgr = montosCcPorOrden(monR, monE, mr, me, monEgr, -montoDeudaPandy);
              rowsCcCliente.push({
                cliente_id: clienteId,
                moneda: monEgr,
                monto: -montoDeudaPandy,
                orden_id: ordenId,
                transaccion_id: trIdDeuda,
                concepto: conceptoConOrden('Pandy debe al cliente', ordenLabel),
                fecha,
                usuario_id: currentUserId,
                estado: trEgr && trEgr.estado === 'ejecutada' ? 'cerrado' : 'pendiente',
                estado_fecha: ahora,
                ...montosDeudaEgr,
              });
            }
          }

          // CC cliente: cuando Pandy paga al cliente (egreso Pandy→cliente ejecutada), agregar +monto "Pago Pandy al cliente" para que el saldo pase de -48.750 a 0.
          const egresoPandyClienteEjecutada = transacciones.find((t) => {
            const cob = String(t.cobrador || '').toLowerCase();
            const pag = String(t.pagador || '').toLowerCase();
            return (cob === 'cliente' && pag === 'pandy' && t.estado === 'ejecutada') || (String(t.tipo || '').toLowerCase() === 'egreso' && pag === 'pandy' && cob === 'cliente' && t.estado === 'ejecutada');
          });
          const montoPagoPandyCliente = egresoPandyClienteEjecutada ? (Number(egresoPandyClienteEjecutada.monto) || 0) : 0;
          const cuantasPagoCliente = rowsCcCliente.filter((r) => {
            const rm = Number(r.monto) || 0;
            return rm > 0 && Math.abs(rm - montoPagoPandyCliente) < 1e-6;
          }).length;
          if (!usarReglaSimpleCliente && clienteId && egresoPandyClienteEjecutada && montoPagoPandyCliente >= 1e-6 && cuantasPagoCliente < 1) {
            const monPago = (egresoPandyClienteEjecutada.moneda || monE).toUpperCase();
            const montosPago = montosCcPorOrden(monR, monE, mr, me, monPago, montoPagoPandyCliente);
            rowsCcCliente.push({
              cliente_id: clienteId,
              orden_id: ordenId,
              transaccion_id: egresoPandyClienteEjecutada.id,
              moneda: monPago,
              monto: montoPagoPandyCliente,
              concepto: conceptoConOrden('Pago Pandy al cliente', ordenLabel),
              fecha,
              usuario_id: currentUserId,
              estado: 'cerrado',
              estado_fecha: ahora,
              ...montosPago,
            });
          }

          // Asegurar fila "Comisión Intermediario" (+750) en CC intermediario: parte de los 50.000 que se queda el intermediario; -50.000 + 49.250 + 750 = 0.
          const tienePandyAInt = rowsCcInt.some((r) => (r.concepto || '').includes('Pandy a Intermediario'));
          const tieneComisionIntRow = rowsCcInt.some((r) => (r.concepto || '').includes('Comisión Intermediario'));
          if (intermediarioId && comisionIntMonto >= 1e-6 && tienePandyAInt && !tieneComisionIntRow) {
            const egresoTr = transacciones.find((t) => (t.cobrador === 'intermediario' && t.pagador === 'pandy') || (t.tipo === 'egreso' && t.pagador === 'pandy' && (t.cobrador || '') === 'intermediario'));
            const transaccionIdCom = egresoTr ? egresoTr.id : (transacciones[0] ? transacciones[0].id : null);
            const estadoMovCom = egresoTr && egresoTr.estado === 'ejecutada' ? 'cerrado' : 'pendiente';
            rowsCcInt.push({
              intermediario_id: intermediarioId,
              orden_id: ordenId,
              transaccion_id: transaccionIdCom,
              moneda: comisionIntMon,
              monto: comisionIntMonto,
              concepto: conceptoConOrden('Comisión Intermediario', ordenLabel),
              fecha,
              usuario_id: currentUserId,
              estado: estadoMovCom,
              estado_fecha: ahora,
              ...montosCcPorMoneda(comisionIntMon, comisionIntMonto),
            });
          }

          // CC intermediario: momento cero 1 fila +49.250 (suma 0 con -50.000 y +750). Cuando egreso Pandy→Int ejecutada, segunda fila +49.250 para que el saldo muestre +49.250 (intermediario nos debe).
          const egresoPandyIntTrx = transacciones.find((t) => {
            const cob = String(t.cobrador || '').toLowerCase();
            const pag = String(t.pagador || '').toLowerCase();
            return (cob === 'intermediario' && pag === 'pandy') || (String(t.tipo || '').toLowerCase() === 'egreso' && pag === 'pandy' && cob === 'intermediario');
          });
          const egresoPandyIntEjecutada = egresoPandyIntTrx && egresoPandyIntTrx.estado === 'ejecutada';
          const cuantasCobroInt = rowsCcInt.filter((r) => {
            const rm = Number(r.monto) || 0;
            return rm > 0 && Math.abs(rm - montoEfectivoInt) < 1e-6;
          }).length;
          const cuantasQueremos = egresoPandyIntEjecutada ? 2 : 1;
          const cuantasFaltanInt = intermediarioId && montoEfectivoInt >= 1e-6 && tienePandyAInt && cuantasCobroInt < cuantasQueremos ? (cuantasQueremos - cuantasCobroInt) : 0;
          if (cuantasFaltanInt > 0 && transacciones.length > 0) {
            const ingresoIntPandy = transacciones.find((t) => String(t.tipo || '').toLowerCase() === 'ingreso' && String(t.cobrador || '').toLowerCase() === 'pandy' && String(t.pagador || '').toLowerCase() === 'intermediario');
            const ingresoIntPandyEjecutada = ingresoIntPandy && ingresoIntPandy.estado === 'ejecutada';
            const trInt = ingresoIntPandy || egresoPandyIntTrx || transacciones.find((t) => String(t.tipo || '').toLowerCase() === 'egreso') || transacciones[0];
            const monInt = (trInt && trInt.moneda) ? String(trInt.moneda).toUpperCase() : monR;
            const trIdInt = (egresoPandyIntTrx && egresoPandyIntTrx.id) || (trInt && trInt.id) || (transacciones[0] && transacciones[0].id);
            const estadoMovInt = ingresoIntPandyEjecutada ? 'cerrado' : (egresoPandyIntEjecutada ? 'cerrado' : 'pendiente');
            for (let i = 0; i < cuantasFaltanInt; i++) {
              rowsCcInt.push({
                intermediario_id: intermediarioId,
                orden_id: ordenId,
                transaccion_id: trIdInt,
                moneda: monInt,
                monto: montoEfectivoInt,
                concepto: conceptoConOrden('Intermediario debe a Pandy', ordenLabel),
                fecha,
                usuario_id: currentUserId,
                estado: estadoMovInt,
                estado_fecha: ahora,
                ...montosCcPorMoneda(monInt, montoEfectivoInt),
              });
            }
          }

          // Cuando el ingreso Int→Pandy está ejecutada, agregar -49.250 "Pago Intermediario a Pandy" para cerrar la CC en 0 (saldo pasó de +49.250 a 0).
          const ingresoIntPandyTrx = transacciones.find((t) => String(t.tipo || '').toLowerCase() === 'ingreso' && String(t.cobrador || '').toLowerCase() === 'pandy' && String(t.pagador || '').toLowerCase() === 'intermediario');
          const ingresoIntPandyEjecutadaTrx = ingresoIntPandyTrx && ingresoIntPandyTrx.estado === 'ejecutada';
          const tienePagoIntPandy = rowsCcInt.some((r) => (r.concepto || '').includes('Pago Intermediario a Pandy'));
          if (intermediarioId && montoEfectivoInt >= 1e-6 && tienePandyAInt && ingresoIntPandyEjecutadaTrx && !tienePagoIntPandy) {
            const trRefInt = ingresoIntPandyTrx || transacciones[0];
            const monRefInt = (trRefInt && trRefInt.moneda) ? String(trRefInt.moneda).toUpperCase() : monR;
            rowsCcInt.push({
              intermediario_id: intermediarioId,
              orden_id: ordenId,
              transaccion_id: ingresoIntPandyTrx ? ingresoIntPandyTrx.id : (transacciones[0] && transacciones[0].id),
              moneda: monRefInt,
              monto: -montoEfectivoInt,
              concepto: conceptoConOrden('Pago Intermediario a Pandy', ordenLabel),
              fecha,
              usuario_id: currentUserId,
              estado: 'cerrado',
              estado_fecha: ahora,
              ...montosCcPorMoneda(monRefInt, -montoEfectivoInt),
            });
          }

          // Comisión Pandy: solo cuando el ingreso cliente→Pandy está ejecutada (así al revertir la entrega no queda saldo 48.750; queda 0).
          const comisionPandy = (monR === monE && mr > me) ? mr - me : 0;
          if (clienteId && comisionPandy >= 1e-6 && !yaTieneGananciaTrx && ingresoClientePandyEjecutada) {
            const egresoPandyCliente = transacciones.find((t) => t.tipo === 'egreso' && t.cobrador === 'cliente' && t.pagador === 'pandy');
            if (egresoPandyCliente) {
              const estadoCom = egresoPandyCliente.estado === 'ejecutada' ? 'cerrado' : 'pendiente';
              const montosCom = montosCcPorMoneda(monR, -comisionPandy);
              rowsCcCliente.push({
                cliente_id: clienteId,
                orden_id: ordenId,
                transaccion_id: egresoPandyCliente.id,
                concepto: conceptoConOrden('Comisión Pandy', ordenLabel),
                moneda: monR,
                monto: -comisionPandy,
                fecha,
                usuario_id: currentUserId,
                estado: estadoCom,
                estado_fecha: ahora,
                monto_usd: montosCom.monto_usd,
                monto_ars: montosCom.monto_ars,
                monto_eur: montosCom.monto_eur,
              });
            }
            // Movimiento de caja por comisión solo con intermediario (ej. ARS-ARS): ahí ingreso/egreso pueden ser cheque vs efectivo y el neto por caja_tipo no refleja la comisión. En USD-USD (2 transacciones, mismo tipo) la comisión ya es el neto (+mr -me), no agregar otro movimiento para no duplicar.
            if (intermediarioId) {
              const conceptoComisionCaja = conceptoCajaTransaccionEspecial('Comisión Pandy', monR, comisionPandy, orden.numero, null);
              rowsCaja.push({
                moneda: monR,
                monto: comisionPandy,
                caja_tipo: 'efectivo',
                transaccion_id: null,
                orden_id: ordenId,
                orden_numero: orden.numero != null ? orden.numero : null,
                transaccion_numero: null,
                concepto: conceptoComisionCaja,
                fecha,
                usuario_id: currentUserId,
              });
            }
          }

          const idsTrx = transacciones.map((t) => t.id).filter(Boolean);
          const promDelCc = client.from('movimientos_cuenta_corriente').delete().eq('orden_id', ordenId);
          const promDelCcInt = client.from('movimientos_cuenta_corriente_intermediario').delete().eq('orden_id', ordenId);
          const promDelCajaTrx = idsTrx.length > 0
            ? client.from('movimientos_caja').delete().in('transaccion_id', idsTrx)
            : Promise.resolve();
          const promDelCajaComision = client.from('movimientos_caja').delete().eq('orden_id', ordenId).is('transaccion_id', null);

          return Promise.all([promDelCc, promDelCcInt, promDelCajaTrx, promDelCajaComision]).then(() => {
            const inserts = [];
            rowsCcCliente.forEach((row) => inserts.push(client.from('movimientos_cuenta_corriente').insert(row)));
            rowsCcInt.forEach((row) => inserts.push(client.from('movimientos_cuenta_corriente_intermediario').insert(row)));
            rowsCaja.forEach((row) => inserts.push(client.from('movimientos_caja').insert(row)));
            if (inserts.length === 0) return Promise.resolve();
            return Promise.all(inserts);
          });
        });
      });
    })
    .catch((err) => {
      console.warn('sincronizarCcYCajaDesdeOrden:', err && (err.message || err.code));
      return Promise.resolve();
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
                cliente_id: clienteId, orden_id: ordenId, transaccion_id: trId, concepto: 'Ganancia del acuerdo',
                moneda: monedaCom, monto: comisionPandyMonto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                monto_usd: montosPos.monto_usd, monto_ars: montosPos.monto_ars, monto_eur: montosPos.monto_eur,
              }).then(() => client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, orden_id: ordenId, transaccion_id: trId, concepto: 'Comisión Pandy',
                moneda: monedaCom, monto: -comisionPandyMonto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                monto_usd: montosNeg.monto_usd, monto_ars: montosNeg.monto_ars, monto_eur: montosNeg.monto_eur,
              }));
            }
            return client.from('movimientos_cuenta_corriente').insert({
              cliente_id: clienteId, orden_id: ordenId, transaccion_id: trId, concepto: 'Ganancia del acuerdo',
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

function asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, montoCom, monCom) {
  if (!ordenId || !instrumentacionId || !intermediarioId || !montoCom || montoCom < 1e-6) return Promise.resolve();
  return client.from('orden_comisiones_generadas').select('id').eq('orden_id', ordenId).eq('tipo', 'comision_intermediario').maybeSingle()
    .then((r) => {
      if (r.data && r.data.id) return Promise.resolve();
      const ahora = new Date().toISOString();
      const fecha = ahora.slice(0, 10);
      return client.from('modos_pago').select('id').eq('codigo', 'efectivo').maybeSingle()
        .then((rModo) => {
          const modoId = (rModo.data && rModo.data.id) || null;
          return client.from('transacciones').insert({
            instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoId, moneda: monCom, monto: montoCom,
            cobrador: 'intermediario', pagador: 'pandy', owner: 'pandy', estado: 'ejecutada', concepto: 'Comisión del acuerdo',
            fecha_ejecucion: fecha, usuario_id: currentUserId, updated_at: ahora,
          }).select('id, numero').single();
        })
        .then((rNew) => {
          const trComId = rNew.data && rNew.data.id;
          const trComNumero = rNew.data && rNew.data.numero;
          if (!trComId) return Promise.resolve();
          const conceptoCom = conceptoCajaTransaccionEspecial('Comisión del acuerdo', monCom, montoCom, orden.numero, trComNumero);
          return client.from('movimientos_caja').insert({
            moneda: monCom, monto: -montoCom, caja_tipo: 'efectivo', transaccion_id: trComId,
            orden_numero: orden.numero != null ? orden.numero : null, transaccion_numero: trComNumero != null ? trComNumero : null,
            concepto: conceptoCom, fecha, usuario_id: currentUserId,
          }).then(() => {
            const montos = montosCcPorMoneda(monCom, -montoCom);
            return client.from('movimientos_cuenta_corriente_intermediario').insert({
              intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: trComId, concepto: 'Comisión del acuerdo',
              moneda: monCom, monto: -montoCom, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
              monto_usd: montos.monto_usd, monto_ars: montos.monto_ars, monto_eur: montos.monto_eur,
            });
          }).then(() => client.from('orden_comisiones_generadas').insert({ orden_id: ordenId, tipo: 'comision_intermediario', transaccion_id: trComId }));
        });
    });
}

function revertirComisionIntermediario(ordenId) {
  if (!ordenId) return Promise.resolve();
  return client.from('orden_comisiones_generadas').select('transaccion_id').eq('orden_id', ordenId).eq('tipo', 'comision_intermediario').maybeSingle()
    .then((r) => {
      if (!r.data || !r.data.transaccion_id) return Promise.resolve();
      const trId = r.data.transaccion_id;
      return client.from('movimientos_cuenta_corriente_intermediario').delete().eq('transaccion_id', trId)
        .then(() => client.from('movimientos_caja').delete().eq('transaccion_id', trId))
        .then(() => client.from('transacciones').delete().eq('id', trId))
        .then(() => client.from('orden_comisiones_generadas').delete().eq('orden_id', ordenId).eq('tipo', 'comision_intermediario'));
    });
}

/**
 * Inserta en movimientos_cuenta_corriente_intermediario los registros "momento cero" (regla simple):
 * un registro por evento/moneda, concepto "Compromiso - Orden Nro X y Trans Nro Y". CHEQUE: una moneda (monR).
 * egresoChequeTrId = egreso Pandy→Intermediario; ingresoEfectivoIntTrId = ingreso Intermediario→Pandy.
 */
function insertarMovimientosCcMomentoCeroIntermediario(ordenId, orden, egresoChequeTrId, ingresoEfectivoIntTrId) {
  const intermediarioId = orden.intermediario_id;
  if (!intermediarioId || !ordenId || !currentUserId || !egresoChequeTrId || !ingresoEfectivoIntTrId) return Promise.resolve();
  const mr = Number(orden.monto_recibido) || 0;
  const monR = orden.moneda_recibida || 'ARS';
  if (mr < 1e-6) return Promise.resolve();
  const fecha = new Date().toISOString().slice(0, 10);
  const resolverOrdenLabel = () => {
    if (orden.numero != null) return Promise.resolve('Orden Nro ' + orden.numero);
    return client.from('ordenes').select('numero').eq('id', ordenId).single().then((r) => {
      const numero = r.data?.numero;
      return 'Orden Nro ' + (numero != null ? numero : '?');
    });
  };
  return resolverOrdenLabel().then((ordenLabel) =>
    client.from('transacciones').select('id, numero').in('id', [egresoChequeTrId, ingresoEfectivoIntTrId]).then((rTr) => {
      const trs = rTr.data || [];
      const nroEgreso = trs.find((x) => x.id === egresoChequeTrId)?.numero;
      const nroIngreso = trs.find((x) => x.id === ingresoEfectivoIntTrId)?.numero;
      const conceptoDebe = 'Compromiso - ' + ordenLabel + ' y Trans Nro ' + (nroEgreso != null ? nroEgreso : '?');
      const conceptoComp = 'Compromiso - ' + ordenLabel + ' y Trans Nro ' + (nroIngreso != null ? nroIngreso : '?');
      const row1 = {
        intermediario_id: intermediarioId,
        orden_id: ordenId,
        transaccion_id: egresoChequeTrId,
        transaccion_numero: nroEgreso != null ? nroEgreso : null,
        concepto: conceptoDebe,
        moneda: monR,
        monto: -mr,
        monto_usd: numCc(monR === 'USD' ? -mr : 0),
        monto_ars: numCc(monR === 'ARS' ? -mr : 0),
        monto_eur: numCc(monR === 'EUR' ? -mr : 0),
        fecha,
        usuario_id: currentUserId,
      };
      const row2 = {
        intermediario_id: intermediarioId,
        orden_id: ordenId,
        transaccion_id: ingresoEfectivoIntTrId,
        transaccion_numero: nroIngreso != null ? nroIngreso : null,
        concepto: conceptoComp,
        moneda: monR,
        monto: mr,
        monto_usd: numCc(monR === 'USD' ? mr : 0),
        monto_ars: numCc(monR === 'ARS' ? mr : 0),
        monto_eur: numCc(monR === 'EUR' ? mr : 0),
        fecha,
        usuario_id: currentUserId,
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
 * Operación CHEQUE (ARS-ARS) con intermediario: crea 4 transacciones por defecto.
 * 1) Ingreso cheques 10M ARS – paga cliente, cobra Pandy
 * 2) Egreso efectivo 9,8M ARS – paga Pandy, cobra cliente
 * 3) Egreso cheques 10M ARS – paga Pandy, cobra intermediario
 * 4) Ingreso efectivo 10M*(1-tasa) ARS – paga intermediario, cobra Pandy
 * Cuenta corriente intermediario: momento cero (una fila "Debe" pendiente por el cheque), igual que cliente.
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
    const rows = [
      { instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoChequeId, moneda: 'ARS', monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora },
      { instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoEfectivoId, moneda: 'ARS', monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora },
      { instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoChequeId, moneda: 'ARS', monto: mr, cobrador: 'intermediario', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora },
      { instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoEfectivoId, moneda: 'ARS', monto: montoEfectivoInt, cobrador: 'pandy', pagador: 'intermediario', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora },
    ];
    return Promise.all(rows.map((row) => client.from('transacciones').insert(row).select('id').single())).then((results) => {
      const ingresoClienteId = results[0]?.data?.id;
      const egresoClienteId = results[1]?.data?.id;
      const egresoChequeTrId = results[2]?.data?.id;
      const ingresoEfectivoIntTrId = results[3]?.data?.id;
      // CC y caja se derivan de la instrumentación: una sola sincronización desde orden + transacciones.
      return sincronizarCcYCajaDesdeOrden(ordenId).then(() => actualizarEstadoOrden(ordenId));
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

  const resolverOrdenLabel = () => {
    if (orden.numero != null) return Promise.resolve('Orden Nro ' + orden.numero);
    return client.from('ordenes').select('numero').eq('id', ordenId).single().then((r) => {
      const numero = r.data?.numero;
      return 'Orden Nro ' + (numero != null ? numero : ordenId.toString().slice(0, 8));
    });
  };

  return resolverOrdenLabel().then((ordenLabel) =>
    client.from('transacciones').select('id, numero').in('id', [ingresoId, egresoId]).then((rTr) => {
      const trs = rTr.data || [];
      const nroIngreso = trs.find((x) => x.id === ingresoId)?.numero;
      const nroEgreso = trs.find((x) => x.id === egresoId)?.numero;
      const conceptoMonR = 'Compromiso - ' + ordenLabel + ' y Trans Nro ' + (nroIngreso != null ? nroIngreso : '?');
      const conceptoMonE = 'Compromiso - ' + ordenLabel + ' y Trans Nro ' + (nroEgreso != null ? nroEgreso : '?');
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
    })
  ).catch((err) => {
    console.warn('insertarMovimientosCcMomentoCero:', err && (err.message || err.code));
    return Promise.resolve();
  });
}

/**
 * Si la orden es sin intermediario y la instrumentación está vacía, crea dos transacciones por defecto
 * (ingreso moneda recibida, egreso moneda entregada). Soporta USD-USD, ARS-USD, USD-ARS, ARS-ARS.
 * Modo de pago efectivo, estado pendiente.
 */
function autoCompletarInstrumentacionSinIntermediario(ordenId, instrumentacionId, orden) {
  if (!ordenId || !instrumentacionId || !orden || orden.intermediario_id || !orden.tipo_operacion_id) return Promise.resolve();
  return client.from('tipos_operacion').select('codigo').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
    const codigo = (rTipo.data && rTipo.data.codigo) || '';
    const esUsdUsd = codigo === 'USD-USD';
    const esArsUsd = codigo === 'ARS-USD';
    const esUsdArs = codigo === 'USD-ARS';
    const esArsArs = codigo === 'ARS-ARS';
    if (!esUsdUsd && !esArsUsd && !esUsdArs && !esArsArs) return Promise.resolve();
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
      } else if (esArsUsd) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: cotizacion, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
      } else if (esUsdArs) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: cotizacion, updated_at: ahora });
      } else {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: 'ARS', monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: 'ARS', monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
      }
      return Promise.all(rows.map((row) => client.from('transacciones').insert(row).select('id').single())).then((results) => {
        const ingresoId = results[0]?.data?.id;
        const egresoId = results[1]?.data?.id;
        if (orden.cliente_id && ingresoId && egresoId && currentUserId) {
          return insertarMovimientosCcMomentoCero(ordenId, orden, ingresoId, egresoId).then(() => actualizarEstadoOrden(ordenId));
        }
        return actualizarEstadoOrden(ordenId);
      });
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
            const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
            const esOrdenChequeWiz = orden?.tipos_operacion?.codigo === 'ARS-ARS';
            const cobradorL = (t) => participantLabelHtml(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
            const pagadorL = (t) => participantLabelHtml(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
            const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`; };
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
            return client.from('tipos_operacion').select('codigo').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
              const codigo = (rTipo.data && rTipo.data.codigo) || '';
              if (codigo === 'ARS-ARS' && orden.intermediario_id) {
                return autoCompletarInstrumentacionChequeConIntermediario(ordenId, instrumentacionId, orden);
              }
if (!orden.intermediario_id && (codigo === 'USD-USD' || codigo === 'ARS-USD' || codigo === 'USD-ARS' || codigo === 'ARS-ARS')) {
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
    client.from('ordenes').select('id, cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, estado, tipos_operacion(codigo)').eq('id', ordenId).single(),
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
        const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        const esOrdenCheque = orden?.tipos_operacion?.codigo === 'ARS-ARS';
        const cobradorL = (t) => participantLabelHtml(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
        const pagadorL = (t) => participantLabelHtml(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
        const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`; };
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

  instIdEl.value = instrumentacionId || '';
  function cargarParticipantesYOrden() {
    if (!instrumentacionId) return Promise.resolve({ cliente: false, intermediario: false, cotizacion: null, esCheque: false, monedaRecibida: '', monedaEntregada: '', clienteNombre: '', montoRecibido: null, montoEntregado: null });
    return client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rInst) => {
      const ordenId = rInst.data && rInst.data.orden_id;
      if (!ordenId) return { cliente: false, intermediario: false, cotizacion: null, esCheque: false, monedaRecibida: '', monedaEntregada: '', clienteNombre: '', montoRecibido: null, montoEntregado: null };
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
        const base = { cliente: !!o.cliente_id, intermediario: !!o.intermediario_id, cotizacion: cot, monedaRecibida, monedaEntregada, clienteNombre, montoRecibido, montoEntregado };
        if (!tipoOpId) return { ...base, esCheque: false };
        return client.from('tipos_operacion').select('codigo').eq('id', tipoOpId).single().then((rTipo) => {
          const codigo = (rTipo.data && rTipo.data.codigo) || '';
          return { ...base, esCheque: codigo === 'ARS-ARS' };
        }).catch(() => ({ ...base, esCheque: false }));
      });
    }).catch(() => ({ cliente: false, intermediario: false, cotizacion: null, esCheque: false, monedaRecibida: '', monedaEntregada: '', clienteNombre: '', montoRecibido: null, montoEntregado: null }));
  }

  Promise.all([
    client.from('modos_pago').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    cargarParticipantesYOrden(),
  ]).then(([r, participantes]) => {
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
      document.getElementById('transaccion-tipo').value = 'ingreso';
      document.getElementById('transaccion-moneda').value = esCheque ? 'ARS' : 'USD';
      document.getElementById('transaccion-modo-pago').value = '';
      document.getElementById('transaccion-cobrador').value = 'pandy';
      document.getElementById('transaccion-pagador').value = participantes?.cliente ? 'cliente' : (participantes?.intermediario ? 'intermediario' : 'pandy');
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
    adaptarTransaccionTipoYMoneda();
    toggleTransaccionMonedaArs();
    backdrop.classList.add('activo');
    setupInputImporte(document.getElementById('transaccion-monto'));
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
    if (!selectEl) return;
    const enWizard = selectEl.closest('#orden-inst-tabla-wrap');
    if (enWizard) {
      const msg = document.getElementById('orden-inst-actualizando-msg');
      if (msg) msg.style.display = 'none';
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
      // Regla configurable (app_config.reversar_max_veces): 0 = no permitir reversión; 1 = una vez por transacción.
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
        return client.from('app_config').select('value').eq('key', 'reversar_max_veces').maybeSingle().then((rCfg) => {
          const maxVeces = parseInt(rCfg?.data?.value, 10);
          if (maxVeces === 0) {
            hideLoadingEstado();
            if (selectEl) selectEl.value = 'ejecutada';
            showConfirm(
              textoImplicancia + 'No está permitido reversar operaciones. Si necesitás corregir algo, anulá la orden y cargá una nueva.',
              'Anular orden',
              () => { client.from('ordenes').select('*').eq('id', ordenId).single().then((rOrd) => { if (rOrd.data) openModalOrden(rOrd.data); }); },
              () => {},
              'Entendido',
              'Reversión no permitida'
            );
            return Promise.resolve();
          }
          if (t.revertida_una_vez === true) {
            hideLoadingEstado();
            if (selectEl) selectEl.value = 'ejecutada';
            showConfirm(
              textoImplicancia + 'Solo podés reversar esta operación una vez. Si necesitás más cambios, te conviene anular la orden y cargar una nueva.',
              'Anular orden',
              () => { client.from('ordenes').select('*').eq('id', ordenId).single().then((rOrd) => { if (rOrd.data) openModalOrden(rOrd.data); }); },
              () => {},
              'Entendido',
              'No se puede reversar de nuevo'
            );
            return Promise.resolve();
          }
          // Siempre pedir confirmación antes de reversar (mitigar riesgos).
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

        return client.from('transacciones').update(payload).eq('id', transaccionId).then((rUp) => {
          if (rUp.error) {
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
              return Promise.all(deletes).then(() => sincronizarCcYCajaDesdeOrden(ordenId))
                .then(() => actualizarEstadoOrden(ordenId))
                .then(() => {
                  // Comisión Pandy se refleja en CC desde el acuerdo (no se crea transacción Ganancia ni se divide el ingreso).
                  return { ordenId, instrumentacionId };
                });
            }
            const ordenLabel = orden.numero != null ? 'nro orden ' + orden.numero : 'nro orden ' + (ordenId || '').toString().slice(0, 8);
            const monR = orden.moneda_recibida || 'USD';
            const monE = orden.moneda_entregada || 'USD';
            const mr = Number(orden.monto_recibido) || 0;
            const me = Number(orden.monto_entregado) || 0;
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
                  const rowDebe = rowsCc.find((r) => (r.concepto || '').toUpperCase().includes('DEBE'));
                  const rowComp = rowsCc.find((r) => (r.concepto || '').normalize('NFD').replace(/\u0301/g, '').toUpperCase().includes('COMPENSACION'));
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
                        const montosCobroItem = montosCcPorOrden(monR, monE, mr, me, item.moneda, montoItem);
                        const montosDeudaItem = montosCcPorOrden(monR, monE, mr, me, item.moneda, -montoItem);
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
                          insertsCc.push(
                            client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora })
                              .eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', item.id).eq('estado', 'pendiente')
                              .then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
                                intermediario_id: intermediarioId, moneda: item.moneda, monto: montoItem, orden_id: ordenId, transaccion_id: item.id,
                                concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                                ...montosCcPorMoneda(item.moneda || 'USD', montoItem),
                              }))
                          );
                        }
                        if (esPandyInt && cob === 'intermediario' && intermediarioId) {
                          const tasa = Number(orden.tasa_descuento_intermediario) || 0;
                          const montoEfectivoInt = (typeof tasa === 'number' && !isNaN(tasa) && tasa >= 0 && tasa < 1) ? mr * (1 - tasa) : mr;
                          const monInt = orden.moneda_recibida || item.moneda || 'ARS';
                          insertsCc.push(
                            client.from('movimientos_cuenta_corriente_intermediario').select('id').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', item.id).maybeSingle()
                              .then((r) => {
                                if (r.data && r.data.id)
                                  return client.from('movimientos_cuenta_corriente_intermediario').update({ estado: 'cerrado', estado_fecha: ahora }).eq('id', r.data.id);
                                return Promise.resolve();
                              })
                              .then(() => client.from('movimientos_cuenta_corriente_intermediario').insert({
                                intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: item.id, moneda: monInt, monto: -montoEfectivoInt,
                                concepto: 'Deuda del intermediario con Pandy', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                                ...montosCcPorMoneda(monInt, -montoEfectivoInt),
                              }))
                              .then(() => client.from('comisiones_orden').select('moneda, monto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario').maybeSingle())
                              .then((rCom) => {
                                const comMonto = rCom.data && (Number(rCom.data.monto) || 0);
                                if (comMonto >= 1e-6) {
                                  const monCom = (rCom.data.moneda || 'ARS').toUpperCase();
                                  return client.from('movimientos_cuenta_corriente_intermediario').insert({
                                    intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: item.id, moneda: monCom, monto: comMonto,
                                    concepto: 'Comisión del acuerdo', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                                    ...montosCcPorMoneda(monCom, comMonto),
                                  }).then(() => asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, comMonto, monCom));
                                }
                                return Promise.resolve();
                              })
                          );
                        }
                        if (cob === 'cliente' && pag === 'intermediario' && intermediarioId) {
                          insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                            intermediario_id: intermediarioId, moneda: item.moneda, monto: -montoItem, orden_id: ordenId, transaccion_id: item.id,
                            concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                            ...montosCcPorMoneda(item.moneda || 'USD', -montoItem),
                          }));
                        }
                        if (cob === 'intermediario' && pag === 'cliente' && intermediarioId) {
                          insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                            intermediario_id: intermediarioId, moneda: item.moneda, monto: montoItem, orden_id: ordenId, transaccion_id: item.id,
                            concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                            ...montosCcPorMoneda(item.moneda || 'USD', montoItem),
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
                    function syncYActualizarEstado() {
                      return sincronizarCcYCajaDesdeOrden(ordenId).then(() => actualizarEstadoYConversion());
                    }
                    return Promise.all(insertsCc).then(() => promUpdatesCc).then(() => {
                        if (nuevoEstado !== 'ejecutada') {
                        let promReversa = Promise.resolve();
                        if (cob === 'pandy' && pag === 'intermediario' && intermediarioId) {
                          promReversa = promReversa.then(() => revertirComisionIntermediario(ordenId)).then(() =>
                            client.from('movimientos_cuenta_corriente_intermediario').select('id, concepto').eq('orden_id', ordenId).eq('intermediario_id', intermediarioId).eq('transaccion_id', transaccionId).then((rRows) => {
                              const rows = rRows.data || [];
                              const idsBorrar = rows.filter((r) => (r.concepto || '').includes('Deuda del intermediario') || (r.concepto || '').includes('Comisión del acuerdo')).map((r) => r.id);
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
                        // No revertir Ganancia: ya no creamos esa transacción; la comisión se trata en CC desde el acuerdo.
                        return promReversa.then(() => syncYActualizarEstado());
                      }
                      const pandyParticipa = cob === 'pandy' || pag === 'pandy';
                      if (!pandyParticipa) return syncYActualizarEstado();
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
                      return promCaja.then(() => syncYActualizarEstado()).then(() => {
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
        loadOrdenes();
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
    client.from('ordenes').select('id, cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado').eq('id', ordenId).single().then((rOrd) => {
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
            if (esSplit) {
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
          ccDetalleMovimientosList = movimientos;
          ccDetalleOrdenesList = ordenes || [];
          renderCcDetalleTable();
          const saldosWrap = document.getElementById('modal-cc-detalle-saldos');
          if (saldosWrap && saldos) {
            const monedas = ['USD', 'EUR', 'ARS'];
            const iconUrls = { USD: '/assets/Icono_Dolar.avif', EUR: '/assets/Icono_Euro.avif', ARS: '/assets/Icono_ARS.webp' };
            saldosWrap.innerHTML = monedas.map((mon) => {
              const s = Number(saldos[mon]) || 0;
              const label = s >= 0 ? 'Positivo' : 'Negativo';
              const val = formatMonto(s >= 0 ? s : -s, mon);
              const cls = 'valor ' + (s >= 0 ? 'positivo' : 'negativo');
              return `<div class="card" style="min-width:120px;"><span class="card-titulo"><img src="${iconUrls[mon]}" alt="" class="cc-icono-moneda" width="20" height="20"/> ${mon}</span><span class="cc-saldo-label" aria-hidden="true">${label}</span><span class="${cls}">${val}</span></div>`;
            }).join('');
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
        sincronizarCcYCajaDesdeOrden(ordenId).then(() => actualizarEstadoOrden(ordenId))
          .then((res) => {
            mostrarMensajeSiInstrumentacionCerrada(res);
            return res;
          })
          .then((res) => {
            if (res && res.estado === 'instrumentacion_cerrada_ejecucion') {
              return client.from('ordenes').select('intermediario_id, tipos_operacion(codigo)').eq('id', ordenId).single().then((rOrd) => {
                const orden = rOrd.data || {};
                const codigo = orden.tipos_operacion && (orden.tipos_operacion.codigo || (Array.isArray(orden.tipos_operacion) && orden.tipos_operacion[0] && orden.tipos_operacion[0].codigo));
                const esChequeConIntermediario = codigo === 'ARS-ARS' && orden.intermediario_id;
                if (esChequeConIntermediario) return res;
                return generarTransaccionesCompensacionPandyIntermediario(ordenId, instrumentacionId).then(() => res);
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
      client.from('ordenes').select('cliente_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, numero, tasa_descuento_intermediario, tipos_operacion(codigo)').eq('id', ordenId).single().then((rO) => {
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
        const esOrdenCheque = (orden.tipos_operacion && orden.tipos_operacion.codigo === 'ARS-ARS') || (Array.isArray(orden.tipos_operacion) && orden.tipos_operacion[0] && orden.tipos_operacion[0].codigo === 'ARS-ARS');
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
          const rowDebe = filasCc.find((r) => (r.concepto || '').toUpperCase().includes('DEBE'));
          const rowComp = filasCc.find((r) => (r.concepto || '').normalize('NFD').replace(/\u0301/g, '').toUpperCase().includes('COMPENSACION'));
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
            const montosCobro = montosCcPorOrden(monR, monE, mr, me, moneda, monto);
            const montosDeuda = montosCcPorOrden(monR, monE, mr, me, moneda, -monto);
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
                  intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, moneda: monInt, monto: -montoEfectivoInt,
                  concepto: 'Deuda del intermediario con Pandy', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  ...montosCcPorMoneda(monInt, -montoEfectivoInt),
                }))
                .then(() => client.from('comisiones_orden').select('moneda, monto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario').maybeSingle())
                .then((rCom) => {
                  const comMonto = rCom.data && (Number(rCom.data.monto) || 0);
                  if (comMonto >= 1e-6) {
                    const monCom = (rCom.data.moneda || 'ARS').toUpperCase();
                    return client.from('movimientos_cuenta_corriente_intermediario').insert({
                      intermediario_id: intermediarioId, orden_id: ordenId, transaccion_id: transaccionId, moneda: monCom, monto: comMonto,
                      concepto: 'Comisión del acuerdo', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                      ...montosCcPorMoneda(monCom, comMonto),
                    }).then(() => asegurarComisionIntermediario(ordenId, instrumentacionId, intermediarioId, comMonto, monCom));
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
                    const idsBorrar = rows.filter((r) => (r.concepto || '').includes('Deuda del intermediario') || (r.concepto || '').includes('Comisión del acuerdo')).map((r) => r.id);
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
              // No revertir Ganancia: ya no creamos esa transacción.
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
 * Crea transacciones de compensación Pandy → Intermediario:
 * 1) Por el neto que el intermediario pagó al cliente (ej. 45.000 - 25.000 = 20.000 USD a compensar).
 * 2) Por comisiones_orden con beneficiario = intermediario (ej. 2.500 USD).
 * Por defecto se crean con modo de pago Efectivo. Solo se ejecuta si aún no existe ninguna transacción Pandy↔Intermediario.
 */
function generarTransaccionesCompensacionPandyIntermediario(ordenId, instrumentacionId) {
  if (!ordenId || !instrumentacionId || !currentUserId) return Promise.resolve();
  return client.from('ordenes').select('id, intermediario_id, cliente_id').eq('id', ordenId).single().then((rOrd) => {
    const orden = rOrd.data;
    if (!orden || !orden.intermediario_id) return Promise.resolve();
    const intermediarioId = orden.intermediario_id;
    return client.from('transacciones').select('id').eq('instrumentacion_id', instrumentacionId).eq('cobrador', 'intermediario').eq('pagador', 'pandy').limit(1).then((rExist) => {
      if (rExist.data && rExist.data.length > 0) return Promise.resolve();
      return Promise.all([
        client.from('transacciones').select('tipo, moneda, monto, cobrador, pagador').eq('instrumentacion_id', instrumentacionId),
        client.from('comisiones_orden').select('moneda, monto, concepto').eq('orden_id', ordenId).eq('beneficiario', 'intermediario'),
        client.from('modos_pago').select('id').eq('codigo', 'efectivo').maybeSingle(),
      ]).then(([rTr, rCom, rModo]) => {
        const list = rTr.data || [];
        const comisiones = rCom.data || [];
        const modoPagoEfectivoId = (rModo.data && rModo.data.id) || null;
        const aCrear = [];
        if (orden.cliente_id) {
          const neto = netoIntermediarioClientePorMoneda(list);
          Object.keys(neto).forEach((moneda) => {
            const monto = neto[moneda];
            if (monto > 1e-6) aCrear.push({ moneda, monto, concepto: 'Compensación intermediario' });
          });
        }
        comisiones.forEach((c) => {
          const monto = Number(c.monto) || 0;
          if (monto > 0) aCrear.push({ moneda: c.moneda || 'USD', monto, concepto: (c.concepto && c.concepto.trim()) ? c.concepto : 'Comisión intermediario' });
        });
        if (aCrear.length === 0) return Promise.resolve();
        const fecha = new Date().toISOString().slice(0, 10);
        const ahora = new Date().toISOString();
        function insertarUna(item) {
          const payload = {
            instrumentacion_id: instrumentacionId,
            tipo: 'egreso',
            modo_pago_id: modoPagoEfectivoId,
            moneda: item.moneda,
            monto: item.monto,
            cobrador: 'intermediario',
            pagador: 'pandy',
            owner: 'pandy',
            estado: 'pendiente',
            concepto: item.concepto,
            tipo_cambio: null,
            updated_at: ahora,
          };
          return client.from('transacciones').insert(payload).select('id').single().then((rTr) => {
            if (rTr.error) return Promise.reject(new Error(rTr.error.message || 'Error al crear transacción de compensación'));
            const trId = rTr.data && rTr.data.id;
            if (!trId) return Promise.reject(new Error('No se devolvió id de la transacción'));
            return client.from('movimientos_cuenta_corriente_intermediario').insert({
              intermediario_id: intermediarioId,
              moneda: payload.moneda,
              monto: -item.monto,
              orden_id: ordenId,
              transaccion_id: trId,
              concepto: item.concepto,
              fecha,
              usuario_id: currentUserId,
              estado: 'cerrado',
              estado_fecha: ahora,
            }).then((rCc) => {
              if (rCc.error) return Promise.reject(new Error(rCc.error.message || 'Error al crear movimiento CC intermediario'));
            });
          });
        }
        return aCrear.reduce((p, item) => p.then(() => insertarUna(item)), Promise.resolve()).then(() => {
          showToast('Se crearon ' + aCrear.length + ' transacción(es) de compensación Pandy → Intermediario (Efectivo por defecto).', 'success');
        }).catch((err) => {
          showToast('Error al crear transacciones de compensación: ' + (err && err.message ? err.message : String(err)), 'error');
        });
      });
    });
  });
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
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalTransacciones(); });
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
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalTransaccion(); });
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
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModalCliente();
    });
  }
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
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalIntermediario(); });
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveIntermediario(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalIntermediario(null));
}

// --- Tipos de operación (ABM)
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

  client.from('tipos_operacion').select('id, codigo, nombre, moneda_in, moneda_out, usa_intermediario, activo').order('codigo').then((res) => {
    loadingEl.style.display = 'none';
    if (res.error) {
      tbody.innerHTML = '<tr><td colspan="7">Error: ' + (res.error.message || '') + '</td></tr>';
      wrapEl.style.display = 'block';
      return;
    }
    const list = res.data || [];
    const switchCell = (id, field, checked) =>
      `<div class="tipo-op-toggle-cell"><span class="toggle-switch"><input type="checkbox" class="tipo-op-toggle" data-id="${id}" data-field="${field}"${checked ? ' checked' : ''}${canAbm ? '' : ' disabled'} /><span class="slider"></span></span></div>`;
    tbody.innerHTML = list.map((t) => {
      const monIn = (t.moneda_in || '').toUpperCase();
      const monOut = (t.moneda_out || '').toUpperCase();
      return `<tr data-id="${t.id}">
        <td>${escapeHtml(t.codigo || '')}</td>
        <td>${escapeHtml(t.nombre || '')}</td>
        <td>${escapeHtml(monIn)}</td>
        <td>${escapeHtml(monOut)}</td>
        <td>${switchCell(t.id, 'usa_intermediario', t.usa_intermediario === true)}</td>
        <td>${switchCell(t.id, 'activo', t.activo !== false)}</td>
        <td>${canAbm ? `<button type="button" class="btn-editar btn-editar-tipo-operacion" data-id="${t.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.tipo-op-toggle').forEach((chk) => {
      if (chk.disabled) return;
      chk.addEventListener('change', function () {
        const id = this.getAttribute('data-id');
        const field = this.getAttribute('data-field');
        const newVal = this.checked;
        client.from('tipos_operacion').update({ [field]: newVal }).eq('id', id).then((res) => {
          if (res.error) showToast('Error: ' + (res.error.message || 'No se pudo actualizar.'), 'error');
          else showToast('Actualizado.');
        });
      });
    });
    tbody.querySelectorAll('.btn-editar-tipo-operacion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const row = list.find((r) => r.id === id);
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
  } else {
    titulo.textContent = 'Nuevo tipo de operación';
    idEl.value = '';
    form.reset();
    document.getElementById('tipo-operacion-moneda-in').value = 'USD';
    document.getElementById('tipo-operacion-moneda-out').value = 'USD';
    document.getElementById('tipo-operacion-usa-intermediario').checked = false;
    document.getElementById('tipo-operacion-activo').checked = true;
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
  if (!['USD', 'EUR', 'ARS'].includes(monedaIn) || !['USD', 'EUR', 'ARS'].includes(monedaOut)) {
    showToast('Moneda IN y OUT deben ser USD, EUR o ARS.', 'error');
    return;
  }
  const payload = {
    codigo,
    nombre,
    moneda_in: monedaIn,
    moneda_out: monedaOut,
    usa_intermediario: document.getElementById('tipo-operacion-usa-intermediario').checked,
    activo: document.getElementById('tipo-operacion-activo').checked,
  };
  const prom = id
    ? client.from('tipos_operacion').update(payload).eq('id', id)
    : client.from('tipos_operacion').insert(payload);
  prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return;
    }
    closeModalTipoOperacion();
    loadTiposOperacion();
    showToast(id ? 'Tipo de operación actualizado.' : 'Tipo de operación creado.', 'success');
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
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalTipoOperacion(); });
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveTipoOperacion(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalTipoOperacion(null));
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
    'vista-seguridad': loadSeguridad,
  };
  const fn = loaders[currentVistaId];
  if (typeof fn === 'function') fn();
}

function startSessionTimeoutCheck() {
  if (sessionCheckIntervalId) clearInterval(sessionCheckIntervalId);
  lastActivityTime = Date.now();
  lastActivityUpdate = lastActivityTime;
  const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
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
        ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((ev) => document.removeEventListener(ev, updateSessionActivity));
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
      if (toggle) {
        toggle.addEventListener('click', () => {
          sidebar.classList.toggle('expanded');
          localStorage.setItem(SIDEBAR_KEY, sidebar.classList.contains('expanded') ? '1' : '0');
          updateSidebarToggleLabel();
        });
      }

      setupVistasMenu();
      applyVistasMenuVisibility();
      setupPanelControl();
      setupModalCliente();
      setupModalIntermediario();
      setupModalTipoOperacion();
      setupModalOrden();
      setupModalChatOrden();
      setupModalTransacciones();
      setupModalTransaccion();
      setupModalMovimientoCaja();
      setupModalTipoMovimientoCaja();
      setupCajasToggle();
      setupCuentaCorriente();
      setupModalMovimientoCc();
      setupModalesDraggable();
      setupHelpPopovers();
      const [defaultVistaId, defaultTitle] = getFirstAllowedView();
      showView(defaultVistaId, defaultTitle);
      if (refreshDataIntervalId) clearInterval(refreshDataIntervalId);
      refreshDataIntervalId = setInterval(refreshCurrentViewData, REFRESH_DATA_INTERVAL_MS);
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
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeHelpModal(); });

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

// Inicio
client.auth.getSession().then(({ data: { session } }) => {
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
