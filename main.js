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
let ordenWizardInstrumentacionIdActual = null;

const SIDEBAR_KEY = 'pandi-sidebar-expanded';

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
    });
}

function showView(vistaId, pageTitle) {
  ['vista-inicio', 'vista-ordenes', 'vista-cajas', 'vista-clientes', 'vista-intermediarios', 'vista-cuenta-corriente', 'vista-seguridad'].forEach((id) => {
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
}

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
    client.from('app_role').select('role, label').order('role'),
    client.from('app_permission').select('permission, description').order('permission'),
    client.from('app_role_permission').select('role, permission'),
  ]).then(([rUsers, rRoles, rPerms, rRolePerms]) => {
    loadingEl.style.display = 'none';

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

    const permissions = (rPerms.data || []).slice();
    const rolePermList = rRolePerms.data || [];
    const rolePermSet = new Set(rolePermList.map((r) => r.role + '|' + r.permission));

    if (permisosGrid && roles.length > 0 && permissions.length > 0) {
      permisosGrid.innerHTML = roles
        .map((r) => {
          const roleKey = r.role;
          const label = escapeHtml(r.label || roleKey);
          const rows = permissions
            .map((p) => {
              const permKey = p.permission;
              const desc = escapeHtml(p.description || permKey);
              const checked = rolePermSet.has(roleKey + '|' + permKey);
              const id = 'perm-' + roleKey + '-' + permKey.replace(/_/g, '-');
              return `<div class="seguridad-perm-row">
                <label for="${id}" style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;width:100%;cursor:pointer;">
                  <span>${desc}</span>
                  <span class="toggle-switch">
                    <input type="checkbox" id="${id}" class="seguridad-perm-toggle" data-role="${roleKey}" data-permission="${permKey}" ${checked ? ' checked' : ''} />
                    <span class="slider"></span>
                  </span>
                </label>
              </div>`;
            })
            .join('');
          return `<div class="seguridad-permisos-rol" data-role="${roleKey}"><h4>${label}</h4>${rows}</div>`;
        })
        .join('');

      permisosGrid.querySelectorAll('.seguridad-perm-toggle').forEach((chk) => {
        chk.addEventListener('change', function () {
          const role = this.getAttribute('data-role');
          const permission = this.getAttribute('data-permission');
          const enable = this.checked;
          const prom = enable
            ? client.from('app_role_permission').insert({ role, permission })
            : client.from('app_role_permission').delete().eq('role', role).eq('permission', permission);
          prom.then((res) => {
            if (res.error) {
              showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
              this.checked = !enable;
            } else {
              showToast(enable ? 'Permiso activado.' : 'Permiso desactivado.', 'success');
            }
          });
        });
      });
      if (permisosWrap) permisosWrap.style.display = 'block';
    }
  });
}

// --- Cajas ---
let cajasMonedaActual = 'USD';
let tiposMovimientoCaja = [];

function formatMonto(n, moneda) {
  if (n == null || isNaN(n)) return '–';
  return formatImporteDisplay(n);
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

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  const cajasSaldoIds = ['cajas-saldo-efectivo-usd', 'cajas-saldo-efectivo-eur', 'cajas-saldo-efectivo-ars', 'cajas-saldo-banco-usd', 'cajas-saldo-banco-ars'];
  cajasSaldoIds.forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = '–'; });

  client
    .from('movimientos_caja')
    .select('id, moneda, monto, concepto, fecha, tipo_movimiento_id, orden_id, transaccion_id, estado, estado_fecha, caja_tipo')
    .eq('estado', 'cerrado')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .then((res) => {
      loadingEl.style.display = 'none';
      if (res.error) {
        tbody.innerHTML = '<tr><td colspan="6">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      const list = res.data || [];
      const saldos = { efectivo: { USD: 0, EUR: 0, ARS: 0 }, banco: { USD: 0, EUR: 0, ARS: 0 }, cheque: { USD: 0, EUR: 0, ARS: 0 } };
      list.forEach((m) => {
        const tipo = (m.caja_tipo || 'efectivo').toLowerCase();
        const moneda = m.moneda;
        if (saldos[tipo] && saldos[tipo][moneda] != null) saldos[tipo][moneda] += Number(m.monto);
      });
      const setVal = (el, valor, moneda) => {
        if (!el) return;
        el.textContent = formatMonto(valor, moneda);
        el.className = 'valor ' + (valor >= 0 ? 'positivo' : 'negativo');
      };
      setVal(document.getElementById('cajas-saldo-efectivo-usd'), saldos.efectivo.USD, 'USD');
      setVal(document.getElementById('cajas-saldo-efectivo-eur'), saldos.efectivo.EUR, 'EUR');
      setVal(document.getElementById('cajas-saldo-efectivo-ars'), saldos.efectivo.ARS, 'ARS');
      setVal(document.getElementById('cajas-saldo-banco-usd'), saldos.banco.USD, 'USD');
      setVal(document.getElementById('cajas-saldo-banco-ars'), saldos.banco.ARS, 'ARS');

      const filtrados = list.filter((m) => m.moneda === cajasMonedaActual);
      const tipoLabel = (m) => (m.orden_id ? 'Orden' : m.transaccion_id ? 'Transacción' : 'Manual');
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
              <td>${escapeHtml(m.concepto || '–')}</td>
              <td>${cajaTipoLabel(m)}</td>
              <td>${tipoLabel(m)}</td>
              <td class="${Number(m.monto) >= 0 ? 'monto-positivo' : 'monto-negativo'}">${formatMonto(m.monto)}</td>
              <td>${canAbmCaja ? `<button type="button" class="btn-editar btn-editar-mov-caja" data-id="${m.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
            </tr>`
        )
        .join('');
      if (filtrados.length === 0) tbody.innerHTML = '<tr><td colspan="6">No hay movimientos en esta moneda.</td></tr>';
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

  loadTiposMovimientoCajaTable();
}

function loadInicio() {
  const ids = ['inicio-saldo-efectivo-usd', 'inicio-saldo-efectivo-eur', 'inicio-saldo-efectivo-ars', 'inicio-saldo-banco-usd', 'inicio-saldo-banco-ars'];
  const els = ids.map((id) => document.getElementById(id));
  if (els.some((el) => !el)) return;
  client
    .from('movimientos_caja')
    .select('moneda, monto, caja_tipo')
    .eq('estado', 'cerrado')
    .then((res) => {
      if (res.error) {
        els.forEach((el) => { el.textContent = '–'; });
        return;
      }
      const saldos = { efectivo: { USD: 0, EUR: 0, ARS: 0 }, banco: { USD: 0, EUR: 0, ARS: 0 }, cheque: { USD: 0, EUR: 0, ARS: 0 } };
      (res.data || []).forEach((m) => {
        const tipo = (m.caja_tipo || 'efectivo').toLowerCase();
        const moneda = m.moneda;
        if (saldos[tipo] && saldos[tipo][moneda] != null) saldos[tipo][moneda] += Number(m.monto);
      });
      const setVal = (el, valor, moneda) => {
        el.textContent = formatMonto(valor, moneda);
        el.className = 'valor ' + (valor >= 0 ? 'positivo' : 'negativo');
      };
      setVal(els[0], saldos.efectivo.USD, 'USD');
      setVal(els[1], saldos.efectivo.EUR, 'EUR');
      setVal(els[2], saldos.efectivo.ARS, 'ARS');
      setVal(els[3], saldos.banco.USD, 'USD');
      setVal(els[4], saldos.banco.ARS, 'ARS');
      const elCountOrd = document.getElementById('inicio-count-ordenes-pendientes');
      const elCountTr = document.getElementById('inicio-count-transacciones-pendientes');
      if (elCountOrd) client.from('ordenes').select('id', { count: 'exact', head: true }).neq('estado', 'orden_ejecutada').then((r) => { elCountOrd.textContent = r.count != null ? String(r.count) : '–'; });
      if (elCountTr) client.from('transacciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').then((r) => { elCountTr.textContent = r.count != null ? String(r.count) : '–'; });
    });
}

/** Abre el modal de órdenes pendientes (estado ≠ orden_ejecutada) y reutiliza la lógica de la lista para operar. */
function openModalOrdenesPendientes() {
  const backdrop = document.getElementById('modal-ordenes-pendientes-backdrop');
  const loadingEl = document.getElementById('ordenes-pendientes-loading');
  const wrapEl = document.getElementById('ordenes-pendientes-tabla-wrap');
  const tbody = document.getElementById('ordenes-pendientes-tbody');
  if (!backdrop || !loadingEl || !wrapEl || !tbody) return;
  backdrop.classList.add('activo');
  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';
  const canAbm = userPermissions.includes('abm_ordenes');
  const canEditarOrden = canAbm || userPermissions.includes('editar_orden');
  const canCambiarEstado = canAbm || userPermissions.includes('cambiar_estado_transaccion');
  const canVerAccionesOrden = canEditarOrden || canCambiarEstado;
  client
    .from('ordenes')
    .select('id, cliente_id, fecha, estado, tipo_operacion_id, operacion_directa, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, cotizacion, observaciones')
    .neq('estado', 'orden_ejecutada')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .then((res) => {
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
        const estadoLabel = (e) => ({ pendiente_instrumentar: 'Pendiente Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada' }[e] || (e ? String(e) : '–'));
        const estadoBadgeClass = (e) => (e && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada'].includes(e) ? `badge badge-estado-${e.replace(/_/g, '-')}` : '');
        tbody.innerHTML = list.map((o) => {
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
        }).join('');
        tbody.querySelectorAll('.btn-editar-orden-pendiente').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const row = list.find((r) => r.id === id);
            if (row) { backdrop.classList.remove('activo'); openModalOrden(row); }
          });
        });
        tbody.querySelectorAll('.btn-transacciones-pendiente').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const orden = list.find((r) => r.id === id);
            if (!orden) return;
            backdrop.classList.remove('activo');
            showView('vista-ordenes', 'Órdenes');
            loadOrdenes().then(() => { expandOrdenTransacciones(id, orden); });
          });
        });
        loadingEl.style.display = 'none';
        wrapEl.style.display = 'block';
      });
    });
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
      client.from('ordenes').select('id, cliente_id, intermediario_id, fecha').in('id', ordenIds).then((rOrd) => {
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
  const canAbm = userPermissions.includes('abm_ordenes');
  const canCambiarEstado = canAbm || userPermissions.includes('cambiar_estado_transaccion');
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
  const ownerL = (o) => ({ pandy: 'Pandy', cliente: 'Cliente', intermediario: 'Intermediario' }[o] || o);
  const tipoL = (t) => (t.tipo === 'ingreso' ? 'Ingreso' : 'Egreso');
  const estadoTrxCombo = (t) => {
    const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente';
    return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" data-instrumentacion-id="${t.instrumentacion_id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`;
  };
  const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
  tbody.innerHTML = list.map((t) => {
    const orden = ordenesMap[t.orden_id];
    const ordenLabel = orden ? (orden.fecha || '').toString().slice(0, 10) + (orden.cliente_id ? ' · ' + (clientesMap[orden.cliente_id] || '–') : '') : '–';
    return `<tr data-id="${t.id}" data-instrumentacion-id="${t.instrumentacion_id}">
      <td>${escapeHtml(ordenLabel)}</td>
      <td>${escapeHtml(t.cliente_id ? clientesMap[t.cliente_id] || '–' : '–')}</td>
      <td>${escapeHtml(t.intermediario_id ? intermediariosMap[t.intermediario_id] || '–' : '–')}</td>
      <td>${tipoL(t)}</td>
      <td>${escapeHtml(t.moneda)}</td>
      <td>${formatMonto(t.monto)}</td>
      <td>${ownerL(t.cobrador)}</td>
      <td>${ownerL(t.pagador)}</td>
      <td>${canCambiarEstado ? estadoTrxCombo(t) : estadoTexto(t)}</td>
      <td>${canCambiarEstado ? `<button type="button" class="btn-editar btn-editar-transaccion-pendiente" data-id="${t.id}" data-instrumentacion-id="${t.instrumentacion_id}" title="Editar"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span></button>` : ''}</td>
    </tr>`;
  }).join('');
  if (canCambiarEstado) {
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
}

// --- Cuenta corriente ---
let ccMonedaActual = 'TODAS';
let ccMovimientosList = [];
let ccEsIntermediario = false;

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

function loadCuentaCorriente() {
  const selCliente = document.getElementById('cc-cliente');
  const selIntermediario = document.getElementById('cc-intermediario');
  const sinCliente = document.getElementById('cc-sin-cliente');
  const sinIntermediario = document.getElementById('cc-sin-intermediario');
  const contenido = document.getElementById('cc-contenido');
  if (!selCliente || !sinCliente || !contenido) return;

  setCcSaldoCards(null);
  ccMovimientosList = [];

  Promise.all([
    client.from('clientes').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
    client.from('intermediarios').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
  ]).then(([rClientes, rInt]) => {
    const clientes = rClientes.data || [];
    const intermediarios = rInt.data || [];
    selCliente.innerHTML = '<option value="">Elegir cliente…</option>' + clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    if (selIntermediario) {
      selIntermediario.innerHTML = '<option value="">Elegir intermediario…</option>' + intermediarios.map((i) => `<option value="${i.id}">${escapeHtml(i.nombre)}</option>`).join('');
      const idIntStored = selIntermediario.getAttribute('data-last-id') || '';
      if (idIntStored && intermediarios.some((i) => i.id === idIntStored)) selIntermediario.value = idIntStored;
    }
    const tipo = document.getElementById('cc-tipo-entity')?.querySelector('button.activo')?.getAttribute('data-tipo') || 'cliente';
    ccEsIntermediario = tipo === 'intermediario';
    const wrapCliente = document.getElementById('cc-wrap-cliente');
    const wrapIntermediario = document.getElementById('cc-wrap-intermediario');
    if (wrapCliente) wrapCliente.style.display = ccEsIntermediario ? 'none' : 'block';
    if (wrapIntermediario) wrapIntermediario.style.display = ccEsIntermediario ? 'block' : 'none';
    if (sinCliente) sinCliente.style.display = 'none';
    if (sinIntermediario) sinIntermediario.style.display = 'none';
    if (ccEsIntermediario) {
      const idInt = selIntermediario?.value?.trim() || '';
      if (idInt) {
        contenido.style.display = 'block';
        loadCuentaCorrienteIntermediario(idInt);
      } else {
        contenido.style.display = 'none';
        if (sinIntermediario) sinIntermediario.style.display = 'block';
      }
    } else {
      const idStored = selCliente.getAttribute('data-last-id') || '';
      if (idStored && clientes.some((c) => c.id === idStored)) selCliente.value = idStored;
      const id = selCliente.value ? selCliente.value.trim() : '';
      if (id) {
        sinCliente.style.display = 'none';
        contenido.style.display = 'block';
        loadCuentaCorrienteCliente(id);
      } else {
        sinCliente.style.display = 'block';
        contenido.style.display = 'none';
      }
    }
  });
}

function loadCuentaCorrienteIntermediario(intermediarioId) {
  const loadingEl = document.getElementById('cc-loading');
  const wrapEl = document.getElementById('cc-tabla-wrap');
  const tbody = document.getElementById('cc-tbody');
  if (!loadingEl || !wrapEl || !tbody) return;

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';

  client
    .from('movimientos_cuenta_corriente_intermediario')
    .select('id, moneda, monto, concepto, fecha, estado, estado_fecha')
    .eq('intermediario_id', intermediarioId)
    .or('estado.eq.cerrado,estado.is.null')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .then((res) => {
      loadingEl.style.display = 'none';
      if (res.error) {
        tbody.innerHTML = '<tr><td colspan="9">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      ccMovimientosList = res.data || [];
      const saldos = { USD: 0, EUR: 0, ARS: 0 };
      ccMovimientosList.forEach((m) => {
        if (saldos[m.moneda] != null) saldos[m.moneda] += Number(m.monto);
      });
      setCcSaldoCards(saldos);
      renderCcTable();
      wrapEl.style.display = 'block';
      // Backfill: recalcular movimientos de conversión/comisión por orden ejecutada (conciliación: Debe no puede superar Haber por moneda)
      client.from('ordenes').select('id').eq('intermediario_id', intermediarioId).eq('estado', 'orden_ejecutada').then((rOrd) => {
        const ordenes = rOrd.data || [];
        const refetch = () => {
          client.from('movimientos_cuenta_corriente_intermediario').select('id, moneda, monto, concepto, fecha, estado, estado_fecha').eq('intermediario_id', intermediarioId).or('estado.eq.cerrado,estado.is.null').order('fecha', { ascending: false }).order('created_at', { ascending: false }).then((r2) => {
            if (!r2.error && r2.data) {
              ccMovimientosList = r2.data;
              const saldos = { USD: 0, EUR: 0, ARS: 0 };
              ccMovimientosList.forEach((m) => { if (saldos[m.moneda] != null) saldos[m.moneda] += Number(m.monto); });
              setCcSaldoCards(saldos);
              renderCcTable();
            }
          });
        };
        if (ordenes.length === 0) return;
        let i = 0;
        const siguiente = () => {
          if (i >= ordenes.length) {
            refetch();
            return;
          }
          const ordenId = ordenes[i].id;
          i += 1;
          generarMovimientoConversionCcIntermediario(ordenId).then(siguiente).catch(siguiente);
        };
        siguiente();
      });
    });
}

function loadCuentaCorrienteCliente(clienteId) {
  const loadingEl = document.getElementById('cc-loading');
  const wrapEl = document.getElementById('cc-tabla-wrap');
  const tbody = document.getElementById('cc-tbody');
  if (!loadingEl || !wrapEl || !tbody) return;

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';

  client
    .from('movimientos_cuenta_corriente')
    .select('id, moneda, monto, concepto, fecha, estado, estado_fecha')
    .eq('cliente_id', clienteId)
    .or('estado.eq.cerrado,estado.is.null')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .then((res) => {
      loadingEl.style.display = 'none';
      if (res.error) {
        tbody.innerHTML = '<tr><td colspan="9">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return;
      }
      ccMovimientosList = res.data || [];
      const saldos = { USD: 0, EUR: 0, ARS: 0 };
      ccMovimientosList.forEach((m) => {
        if (saldos[m.moneda] != null) saldos[m.moneda] += Number(m.monto);
      });
      setCcSaldoCards(saldos);
      renderCcTable();
      wrapEl.style.display = 'block';
      // Backfill: órdenes ejecutadas sin movimiento de conversión → generarlo para saldo en cero (solo refrescamos datos, sin volver a cargar para evitar loop/parpadeo)
      client.from('ordenes').select('id').eq('cliente_id', clienteId).eq('estado', 'orden_ejecutada').then((rOrd) => {
        const ordenes = rOrd.data || [];
        if (ordenes.length === 0) return;
        let generado = false;
        const siguiente = (i) => {
          if (i >= ordenes.length) {
            if (generado) {
              client.from('movimientos_cuenta_corriente').select('id, moneda, monto, concepto, fecha, estado, estado_fecha').eq('cliente_id', clienteId).or('estado.eq.cerrado,estado.is.null').order('fecha', { ascending: false }).order('created_at', { ascending: false }).then((r2) => {
                if (!r2.error && r2.data) {
                  ccMovimientosList = r2.data;
                  const saldos = { USD: 0, EUR: 0, ARS: 0 };
                  ccMovimientosList.forEach((m) => { if (saldos[m.moneda] != null) saldos[m.moneda] += Number(m.monto); });
                  setCcSaldoCards(saldos);
                  renderCcTable();
                }
              });
            }
            return;
          }
          const ordenId = ordenes[i].id;
          client.from('movimientos_cuenta_corriente').select('id').eq('orden_id', ordenId).in('concepto', CONCEPTOS_CC_CONVERSION_TODOS).limit(1).then((rEx) => {
            if (rEx.data && rEx.data.length > 0) return siguiente(i + 1);
            generarMovimientoConversionCc(ordenId).then(() => { generado = true; siguiente(i + 1); }).catch(() => siguiente(i + 1));
          });
        };
        siguiente(0);
      });
    });
}

function renderCcTable() {
  const tbody = document.getElementById('cc-tbody');
  const tfoot = document.getElementById('cc-tfoot');
  const moneda = ccMonedaActual === 'TODAS' ? null : ccMonedaActual;
  const filtrados = moneda ? ccMovimientosList.filter((m) => m.moneda === moneda) : ccMovimientosList;
  const canAbmCc = userPermissions.includes('abm_ordenes') && !ccEsIntermediario;
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
      const selCliente = document.getElementById('cc-cliente');
      const clienteId = selCliente && selCliente.value ? selCliente.value.trim() : '';
      if (clienteId) loadCuentaCorrienteCliente(clienteId);
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

function setupCuentaCorriente() {
  const selCliente = document.getElementById('cc-cliente');
  const selIntermediario = document.getElementById('cc-intermediario');
  const sinCliente = document.getElementById('cc-sin-cliente');
  const sinIntermediario = document.getElementById('cc-sin-intermediario');
  const contenido = document.getElementById('cc-contenido');
  const wrapCliente = document.getElementById('cc-wrap-cliente');
  const wrapIntermediario = document.getElementById('cc-wrap-intermediario');

  const tipoToggle = document.getElementById('cc-tipo-entity');
  if (tipoToggle) {
    tipoToggle.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        tipoToggle.querySelectorAll('button').forEach((b) => b.classList.remove('activo'));
        btn.classList.add('activo');
        loadCuentaCorriente();
      });
    });
  }

  if (selCliente) {
    selCliente.addEventListener('change', () => {
      const id = selCliente.value ? selCliente.value.trim() : '';
      selCliente.setAttribute('data-last-id', id);
      if (ccEsIntermediario) return;
      if (!id) {
        if (sinCliente) sinCliente.style.display = 'block';
        if (contenido) contenido.style.display = 'none';
        return;
      }
      if (sinCliente) sinCliente.style.display = 'none';
      if (contenido) contenido.style.display = 'block';
      loadCuentaCorrienteCliente(id);
    });
  }
  if (selIntermediario) {
    selIntermediario.addEventListener('change', () => {
      const id = selIntermediario.value ? selIntermediario.value.trim() : '';
      selIntermediario.setAttribute('data-last-id', id);
      if (!ccEsIntermediario) return;
      if (!id) {
        if (sinIntermediario) sinIntermediario.style.display = 'block';
        if (contenido) contenido.style.display = 'none';
        return;
      }
      if (sinIntermediario) sinIntermediario.style.display = 'none';
      if (contenido) contenido.style.display = 'block';
      loadCuentaCorrienteIntermediario(id);
    });
  }

  const toggle = document.getElementById('cc-toggle-moneda');
  if (toggle) {
    toggle.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        ccMonedaActual = btn.getAttribute('data-moneda');
        toggle.querySelectorAll('button').forEach((b) => b.classList.remove('activo'));
        btn.classList.add('activo');
        renderCcTable();
      });
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
      inputMonto.value = formatImporteDisplay(Math.abs(Number(registro.monto)));
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

function formatImporteInputOnType(inputEl, maxDecimales, soloComaDecimal) {
  if (!inputEl) return;
  const maxDec = (typeof maxDecimales === 'number' && maxDecimales >= 0) ? maxDecimales : 4;
  let raw = inputEl.value.replace(/[^\d.,]/g, '');
  // Tasa de descuento: solo coma como decimal, no permitir punto.
  if (soloComaDecimal) {
    raw = raw.replace(/\./g, '');
  } else {
    // Montos: varios puntos = miles (quitar). Un punto con 1–2 cifras después = decimal (pasar a coma), si no = miles.
    const numDots = (raw.match(/\./g) || []).length;
    if (numDots > 1) {
      raw = raw.replace(/\./g, '');
    } else if (numDots === 1) {
      const idx = raw.indexOf('.');
      const after = raw.slice(idx + 1).replace(/\D/g, '');
      if (after.length <= 2) raw = raw.replace('.', ',');
      else raw = raw.replace('.', '');
    }
  }
  raw = raw.replace(/[^\d,]/g, '');
  // Varias comas = formato US (miles), quitar todas. Una sola coma = decimal (es-AR).
  const numComas = (raw.match(/,/g) || []).length;
  if (numComas >= 2) raw = raw.replace(/,/g, '');
  const idxComa = raw.indexOf(',');
  let parteEntera = idxComa >= 0 ? raw.slice(0, idxComa) : raw;
  let parteDecimal = idxComa >= 0 ? raw.slice(idxComa + 1).replace(/\D/g, '').slice(0, maxDec) : '';
  parteEntera = parteEntera.replace(/\D/g, '');
  // Tasa: no agregar miles con punto para no confundir con decimal.
  const formattedEntera = soloComaDecimal ? parteEntera : parteEntera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // En tasa (soloComaDecimal) mantener la coma aunque aún no haya decimales, para poder escribir "1," y luego "50".
  const formatted = (soloComaDecimal && idxComa >= 0) || parteDecimal.length > 0
    ? formattedEntera + ',' + parteDecimal
    : formattedEntera;
  inputEl.value = formatted;
  inputEl.setSelectionRange(formatted.length, formatted.length);
}

function setupInputImporte(inputEl, maxDecimales, soloComaDecimal) {
  if (!inputEl) return;
  inputEl.addEventListener('input', () => formatImporteInputOnType(inputEl, maxDecimales, soloComaDecimal));
  inputEl.addEventListener('blur', () => {
    const n = parseImporteInput(inputEl.value);
    if (!isNaN(n) && inputEl.value.trim() !== '') inputEl.value = soloComaDecimal ? Number(n).toFixed(2).replace('.', ',') : formatImporteDisplay(n);
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
function loadOrdenes() {
  const loadingEl = document.getElementById('ordenes-loading');
  const wrapEl = document.getElementById('ordenes-tabla-wrap');
  const tbody = document.getElementById('ordenes-tbody');
  const btnNuevo = document.getElementById('btn-nueva-orden');
  if (!loadingEl || !wrapEl || !tbody) return Promise.resolve();

  const canAbm = userPermissions.includes('abm_ordenes');
  const canEditarOrden = canAbm || userPermissions.includes('editar_orden');
  const canCambiarEstado = canAbm || userPermissions.includes('cambiar_estado_transaccion');
  const canVerAccionesOrden = canEditarOrden || canCambiarEstado;
  if (btnNuevo) btnNuevo.style.display = canAbm ? '' : 'none';

  loadingEl.style.display = 'block';
  wrapEl.style.display = 'none';
  tbody.innerHTML = '';

  return client
    .from('ordenes')
    .select('id, cliente_id, fecha, estado, tipo_operacion_id, operacion_directa, intermediario_id, moneda_recibida, moneda_entregada, monto_recibido, monto_entregado, cotizacion, tasa_descuento_intermediario, observaciones')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .then((res) => {
      if (res.error) {
        loadingEl.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="8">Error: ' + (res.error.message || '') + '</td></tr>';
        wrapEl.style.display = 'block';
        return Promise.resolve();
      }
      const list = res.data || [];
      if (list.length === 0) {
        loadingEl.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="8">No hay órdenes.</td></tr>';
        wrapEl.style.display = 'block';
        return Promise.resolve();
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
        const estadoLabel = (e) => ({ pendiente_instrumentar: 'Pendiente Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada', cotizacion: 'Cotización', concertada: 'Concertada' }[e] || (e ? String(e) : '–'));
        const estadoBadgeClass = (e) => (e && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'cotizacion', 'concertada'].includes(e) ? `badge badge-estado-${e.replace(/_/g, '-')}` : '');
        tbody.innerHTML = list
          .map(
            (o) => {
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
                <td>${canVerAccionesOrden ? `${canEditarOrden ? `<button type="button" class="btn-editar btn-editar-orden btn-icon-only" data-id="${o.id}" title="Editar" aria-label="Editar"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span></button> ` : ''}<button type="button" class="btn-secondary btn-transacciones btn-icon-only" data-id="${o.id}" title="Transacciones" aria-label="Transacciones" style="margin-left:0.25rem;"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg></span></button>` : ''}</td>
              </tr>
              <tr class="orden-detalle-tr" id="orden-detalle-${o.id}" data-orden-id="${o.id}" style="display:none;">
                <td colspan="8" class="orden-detalle-cell">
                  <div class="orden-detalle-panel" id="panel-orden-${o.id}" data-orden-id="${o.id}">
                    <div class="orden-detalle-encabezado"></div>
                    <div class="orden-detalle-loading" style="display:none;">Cargando transacciones…</div>
                    <div class="orden-detalle-content" style="display:none;">
                      <div class="orden-detalle-totales" style="margin-bottom:0.75rem; font-size:0.9rem; color:#555;"></div>
                      <div class="vista-toolbar" style="margin-bottom:0.75rem;">
                        <button type="button" class="btn-nuevo btn-nueva-transaccion-panel" data-orden-id="${o.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>Nueva transacción</button>
                      </div>
                      <table class="tabla-transacciones-panel"><thead><tr><th>Tipo</th><th>Modo pago</th><th>Moneda</th><th>Monto</th><th>Cobrador</th><th>Pagador</th><th>Estado</th><th></th></tr></thead><tbody class="orden-detalle-tbody"></tbody></table>
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
        loadingEl.style.display = 'none';
        wrapEl.style.display = 'block';
      });
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

  Promise.all([
    client.from('clientes').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
    client.from('tipos_operacion').select('id, codigo, nombre').eq('activo', true).order('codigo'),
    client.from('intermediarios').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
  ]).then(([rClientes, rTipos, rInt]) => {
    const clientes = rClientes.data || [];
    const tipos = rTipos.data || [];
    const intermediarios = rInt.data || [];

    const selCliente = document.getElementById('orden-cliente');
    const selTipo = document.getElementById('orden-tipo-operacion');
    const selInt = document.getElementById('orden-intermediario');
    if (selCliente) selCliente.innerHTML = '<option value="">Sin asignar</option>' + clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    if (selTipo) selTipo.innerHTML = '<option value="">Elegir…</option>' + tipos.map((t) => `<option value="${t.id}" data-codigo="${escapeHtml(t.codigo || '')}">${escapeHtml(t.nombre)}</option>`).join('');
    if (selInt) selInt.innerHTML = '<option value="">Sin asignar</option>' + intermediarios.map((i) => `<option value="${i.id}">${escapeHtml(i.nombre)}</option>`).join('');

    const selTipoEl = document.getElementById('orden-tipo-operacion');
    const selIntEl = document.getElementById('orden-intermediario');
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
      const isTipoConComision = codigo === 'USD-USD' || codigo === 'ARS-DOLAR' || codigo === 'ARS-USD' || codigo === 'USD-ARS';
      const tieneIntermediario = !!(selIntEl && selIntEl.value && selIntEl.value.trim());
      wrapSplit.style.display = isTipoConComision ? 'flex' : 'none';
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
        adaptarFormularioOrden(codigo, tipos);
        showStep('participantes');
        toggleComisionSplit();
      } else {
        if (wizard) wizard.style.display = 'none';
      }
    }
    if (selTipoEl) selTipoEl.addEventListener('change', onTipoChange);
    if (selIntEl) selIntEl.addEventListener('change', toggleComisionSplit);
    if (pctPandyEl) pctPandyEl.addEventListener('change', () => syncComisionPctOtro('pandy'));
    if (pctPandyEl) pctPandyEl.addEventListener('input', () => syncComisionPctOtro('pandy'));
    if (pctIntEl) pctIntEl.addEventListener('change', () => syncComisionPctOtro('intermediario'));
    if (pctIntEl) pctIntEl.addEventListener('input', () => syncComisionPctOtro('intermediario'));
    if (btnNext) btnNext.onclick = () => showStep('detalles');
    if (btnBack) btnBack.onclick = () => showStep('participantes');
    if (btnBackDetalles) btnBackDetalles.onclick = () => showOrdenWizardStep('detalles');
    if (btnCerrarWizard) btnCerrarWizard.onclick = () => { closeModalOrden(); loadOrdenes(); };
    if (btnCancelarWizard) btnCancelarWizard.onclick = () => closeModalOrden();
    if (btnIrInst) btnIrInst.onclick = () => {
      guardarOrdenDesdeWizard().then((ordenId) => {
        if (!ordenId) return;
        ensureInstrumentacionForOrden(ordenId).then((instId) => {
          if (!instId) return;
          ordenWizardInstrumentacionIdActual = instId;
          showOrdenWizardStep('instrumentacion');
          renderOrdenWizardInstrumentacion(instId);
          if (btnNuevaTr) {
            const canAbm = userPermissions.includes('abm_ordenes');
            btnNuevaTr.style.display = canAbm ? '' : 'none';
            btnNuevaTr.onclick = () => openModalTransaccion(null, instId);
          }
        });
      });
    };

    let promContinuar = Promise.resolve();
    if (registro) {
      titulo.textContent = 'Editar orden';
      idEl.value = registro.id;
      document.getElementById('orden-cliente').value = registro.cliente_id || '';
      document.getElementById('orden-fecha').value = (registro.fecha || '').toString().slice(0, 10);
      document.getElementById('orden-tipo-operacion').value = registro.tipo_operacion_id || '';
      document.getElementById('orden-intermediario').value = registro.intermediario_id || '';
      document.getElementById('orden-moneda-recibida').value = registro.moneda_recibida || 'USD';
      document.getElementById('orden-monto-recibido').value = registro.monto_recibido != null ? formatImporteDisplay(registro.monto_recibido) : '';
      document.getElementById('orden-moneda-entregada').value = registro.moneda_entregada || 'USD';
      document.getElementById('orden-monto-entregado').value = registro.monto_entregado != null ? formatImporteDisplay(registro.monto_entregado) : '';
      document.getElementById('orden-cotizacion').value = registro.cotizacion != null && registro.cotizacion !== '' ? formatImporteDisplay(registro.cotizacion) : '';
      const tasaIntEl = document.getElementById('orden-tasa-descuento-intermediario');
      if (tasaIntEl) tasaIntEl.value = (registro.tasa_descuento_intermediario != null && Number(registro.tasa_descuento_intermediario) > 0) ? formatImporteDisplay(Number(registro.tasa_descuento_intermediario) * 100) : '';
      document.getElementById('orden-estado').value = (registro.estado && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada'].includes(registro.estado)) ? registro.estado : 'pendiente_instrumentar';
      document.getElementById('orden-observaciones').value = registro.observaciones || '';
      onTipoChange();
      ordenWizardOrdenIdActual = registro.id;
      promContinuar = client.from('comisiones_orden').select('beneficiario, monto').eq('orden_id', registro.id).then((rCom) => {
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
      titulo.textContent = 'Nueva orden';
      idEl.value = '';
      form.reset();
      document.getElementById('orden-fecha').value = new Date().toISOString().slice(0, 10);
      document.getElementById('orden-estado').value = 'pendiente_instrumentar';
      if (wizard) wizard.style.display = 'none';
      ordenWizardOrdenIdActual = null;
    }
    promContinuar.then(() => {
      if (pctPandyEl && !pctPandyEl.value) pctPandyEl.value = '100';
      if (pctIntEl && !pctIntEl.value) pctIntEl.value = '0';
      backdrop.classList.add('activo');
      showOrdenWizardStep('participantes');
      setupInputImporte(document.getElementById('orden-monto-recibido'));
      setupInputImporte(document.getElementById('orden-monto-entregado'));
      setupInputImporte(document.getElementById('orden-cotizacion'));
      setupInputImporte(document.getElementById('orden-tasa-descuento-intermediario'), 2, true);
      setupInputImporte(document.getElementById('orden-comision-pandy-pct'));
      setupInputImporte(document.getElementById('orden-comision-intermediario-pct'));
    });
  });
}

function adaptarFormularioOrden(codigo, tipos) {
  // Regla: en el código tipo operación la primera moneda es la recibida y la segunda la entregada (ej. ARS-USD → recibimos ARS, entregamos USD)
  const partes = (codigo || '').split('-');
  const primera = (partes[0] || '').trim().toUpperCase();
  const segunda = (partes[1] || '').trim().toUpperCase();
  const normalizarMoneda = (s) => (s === 'DOLAR' ? 'USD' : s);
  const recibidaDesdeTipo = primera && segunda ? normalizarMoneda(primera) : null;
  const entregadaDesdeTipo = primera && segunda ? normalizarMoneda(segunda) : null;

  const isUsdUsd = codigo === 'USD-USD';
  const isArsDolar = codigo === 'ARS-DOLAR' || codigo === 'ARS-USD';
  const isUsdArs = codigo === 'USD-ARS';
  const isArsArs = codigo === 'ARS-ARS';
  const isTipoConTc = isArsDolar || isUsdArs;
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
  if (labelMontoRecibido) labelMontoRecibido.textContent = (isUsdUsd || isTipoConTc || isArsArs) ? 'Monto a Recibir *' : 'Monto recibido *';
  if (labelMontoEntregado) labelMontoEntregado.textContent = (isUsdUsd || isTipoConTc || isArsArs) ? 'Monto a Entregar *' : 'Monto entregado *';
  const wrapTasaDescuentoInt = document.getElementById('orden-wrap-tasa-descuento-intermediario');
  const wrapComisionSplit = document.getElementById('orden-wrap-comision-split');
  if (wrapComision) wrapComision.style.display = (isUsdUsd || isTipoConTc || isArsArs) ? 'block' : 'none';
  if (wrapTasaDescuentoInt) wrapTasaDescuentoInt.style.display = isArsArs ? 'block' : 'none';
  if (wrapComisionSplit) {
    if (isArsArs) wrapComisionSplit.style.display = 'none';
    else if ((isUsdUsd || isArsDolar || isUsdArs) && document.getElementById('orden-intermediario')?.value?.trim())
      wrapComisionSplit.style.display = 'flex';
  }
  if (wrapCotizacion) {
    wrapCotizacion.style.display = (isUsdUsd || isArsArs) ? 'none' : 'block';
    if (labelCotizacion) labelCotizacion.textContent = isTipoConTc ? 'Tipo de cambio del acuerdo *' : 'Cotización (opcional)';
    if (inputCotizacion) inputCotizacion.required = !!isTipoConTc;
  }
  const labelComision = document.querySelector('#orden-wrap-comision label[for="orden-comision-display"]');
  if (labelComision) labelComision.textContent = isArsArs ? 'Diferencia (descuento acuerdo)' : 'Comisión a Recibir';
  if (comisionDisplay) comisionDisplay.value = '';

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
  function actualizarComisionArsDolar() {
    if (!isArsDolar || !comisionDisplay) return;
    const r = parseImporteInput(document.getElementById('orden-monto-recibido').value);
    const e = parseImporteInput(document.getElementById('orden-monto-entregado').value);
    const tc = parseImporteInput(document.getElementById('orden-cotizacion').value);
    let comision = null;
    if (typeof r === 'number' && !isNaN(r) && r > 0 && typeof tc === 'number' && !isNaN(tc) && tc > 0 && typeof e === 'number' && !isNaN(e) && e >= 0) {
      const usdEquiv = r / tc;
      if (usdEquiv > e) comision = usdEquiv - e;
    }
    comisionDisplay.value = comision != null ? formatImporteDisplay(comision) + ' USD' : '';
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
    montoRecibidoEl.removeEventListener('input', actualizarComisionArsDolar); montoRecibidoEl.removeEventListener('change', actualizarComisionArsDolar);
    montoRecibidoEl.removeEventListener('input', actualizarComisionUsdArs); montoRecibidoEl.removeEventListener('change', actualizarComisionUsdArs);
    montoRecibidoEl.removeEventListener('input', actualizarComisionArsArs); montoRecibidoEl.removeEventListener('change', actualizarComisionArsArs);
  }
  if (montoEntregadoEl) {
    montoEntregadoEl.removeEventListener('input', actualizarComisionUsdUsd); montoEntregadoEl.removeEventListener('change', actualizarComisionUsdUsd);
    montoEntregadoEl.removeEventListener('input', actualizarComisionArsDolar); montoEntregadoEl.removeEventListener('change', actualizarComisionArsDolar);
    montoEntregadoEl.removeEventListener('input', actualizarComisionUsdArs); montoEntregadoEl.removeEventListener('change', actualizarComisionUsdArs);
    montoEntregadoEl.removeEventListener('input', actualizarComisionArsArs); montoEntregadoEl.removeEventListener('change', actualizarComisionArsArs);
  }
  if (inputCotizacion) {
    inputCotizacion.removeEventListener('input', actualizarComisionArsDolar); inputCotizacion.removeEventListener('change', actualizarComisionArsDolar);
    inputCotizacion.removeEventListener('input', actualizarComisionUsdArs); inputCotizacion.removeEventListener('change', actualizarComisionUsdArs);
  }
  if (isUsdUsd) {
    if (montoRecibidoEl) { montoRecibidoEl.addEventListener('input', actualizarComisionUsdUsd); montoRecibidoEl.addEventListener('change', actualizarComisionUsdUsd); }
    if (montoEntregadoEl) { montoEntregadoEl.addEventListener('input', actualizarComisionUsdUsd); montoEntregadoEl.addEventListener('change', actualizarComisionUsdUsd); }
    actualizarComisionUsdUsd();
  } else if (isArsDolar) {
    if (montoRecibidoEl) { montoRecibidoEl.addEventListener('input', actualizarComisionArsDolar); montoRecibidoEl.addEventListener('change', actualizarComisionArsDolar); }
    if (montoEntregadoEl) { montoEntregadoEl.addEventListener('input', actualizarComisionArsDolar); montoEntregadoEl.addEventListener('change', actualizarComisionArsDolar); }
    if (inputCotizacion) { inputCotizacion.addEventListener('input', actualizarComisionArsDolar); inputCotizacion.addEventListener('change', actualizarComisionArsDolar); }
    actualizarComisionArsDolar();
  } else if (isUsdArs) {
    if (montoRecibidoEl) { montoRecibidoEl.addEventListener('input', actualizarComisionUsdArs); montoRecibidoEl.addEventListener('change', actualizarComisionUsdArs); }
    if (montoEntregadoEl) { montoEntregadoEl.addEventListener('input', actualizarComisionUsdArs); montoEntregadoEl.addEventListener('change', actualizarComisionUsdArs); }
    if (inputCotizacion) { inputCotizacion.addEventListener('input', actualizarComisionUsdArs); inputCotizacion.addEventListener('change', actualizarComisionUsdArs); }
    actualizarComisionUsdArs();
  } else if (isArsArs) {
    if (montoRecibidoEl) { montoRecibidoEl.addEventListener('input', actualizarComisionArsArs); montoRecibidoEl.addEventListener('change', actualizarComisionArsArs); }
    if (montoEntregadoEl) { montoEntregadoEl.addEventListener('input', actualizarComisionArsArs); montoEntregadoEl.addEventListener('change', actualizarComisionArsArs); }
    actualizarComisionArsArs();
  }
}

function closeModalOrden() {
  const backdrop = document.getElementById('modal-orden-backdrop');
  if (backdrop) backdrop.classList.remove('activo');
  ordenWizardOrdenIdActual = null;
  ordenWizardInstrumentacionIdActual = null;
}

function showOrdenWizardStep(which) {
  const stepParticipantes = document.getElementById('orden-step-participantes');
  const stepDetalles = document.getElementById('orden-step-detalles');
  const stepInst = document.getElementById('orden-step-instrumentacion');
  if (stepParticipantes) stepParticipantes.style.display = which === 'participantes' ? 'block' : 'none';
  if (stepDetalles) stepDetalles.style.display = which === 'detalles' ? 'block' : 'none';
  if (stepInst) stepInst.style.display = which === 'instrumentacion' ? 'block' : 'none';
}

/** Guarda la orden según el form, pero sin cerrar el modal. Devuelve Promise<ordenId>. */
function guardarOrdenDesdeWizard() {
  const idEl = document.getElementById('orden-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const clienteId = document.getElementById('orden-cliente').value.trim() || null;
  const fecha = document.getElementById('orden-fecha').value;
  const tipoOperacionId = document.getElementById('orden-tipo-operacion')?.value?.trim() || null;
  const intermediarioId = document.getElementById('orden-intermediario')?.value?.trim() || null;
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
  if (!fecha || isNaN(montoRecibido) || montoRecibido <= 0 || isNaN(montoEntregado) || montoEntregado <= 0) {
    showToast('Completá fecha, monto recibido y monto entregado (números positivos).', 'error');
    return Promise.resolve(null);
  }

  const selTipoOpt = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const tipoCodigo = selTipoOpt ? (selTipoOpt.getAttribute('data-codigo') || '') : '';
  if (tipoCodigo === 'ARS-DOLAR') {
    if (!cotizacion || !(cotizacion > 0)) {
      showToast('En ARS - DOLAR el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
      return Promise.resolve(null);
    }
    const usdEquiv = montoRecibido / cotizacion;
    if (usdEquiv <= montoEntregado) {
      showToast('En ARS - DOLAR el monto a recibir (dolarizado) debe ser mayor al monto a entregar. La diferencia es la comisión.', 'error');
      return Promise.resolve(null);
    }
  }
  if (tipoCodigo === 'USD-ARS') {
    if (!cotizacion || !(cotizacion > 0)) {
      showToast('En USD - ARS el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
      return Promise.resolve(null);
    }
    const usdEquivEntregado = montoEntregado / cotizacion;
    if (montoRecibido <= usdEquivEntregado) {
      showToast('En USD - ARS el monto a recibir debe ser mayor al monto a entregar (pesificado). La diferencia es la comisión.', 'error');
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
      : ((tipoCodigo === 'ARS-DOLAR' || tipoCodigo === 'ARS-USD') && cotizacion > 0 ? (montoRecibido / cotizacion) - montoEntregado
        : (tipoCodigo === 'USD-ARS' && cotizacion > 0 ? montoRecibido - (montoEntregado / cotizacion) : null)));
  const pctPandy = parseImporteInput(document.getElementById('orden-comision-pandy-pct')?.value || '100');
  const pctInt = parseImporteInput(document.getElementById('orden-comision-intermediario-pct')?.value || '0');
  const tieneSplitVisible = document.getElementById('orden-wrap-comision-split')?.style?.display !== 'none';
  if ((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-DOLAR' || tipoCodigo === 'ARS-USD' || tipoCodigo === 'USD-ARS' || tipoCodigo === 'ARS-ARS') && intermediarioId && tieneSplitVisible) {
    const a = Number(pctPandy);
    const b = Number(pctInt);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a > 100 || b > 100 || Math.abs((a + b) - 100) > 1e-6) {
      showToast('La distribución de comisión debe sumar 100% (Pandy + Intermediario).', 'error');
      return Promise.resolve(null);
    }
  }
  if (intermediarioId && tieneSplitVisible && (Number(pctInt) || 0) < 1e-6) {
    const acepta = confirm('La comisión del intermediario es cero. ¿Deseás guardar la orden igual?');
    if (!acepta) return Promise.resolve(null);
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
    : client.from('ordenes').insert(payload).select('id');

  return prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return null;
    }
    const ordenId = id || (res.data && res.data[0] && res.data[0].id);
    if (!ordenId) return null;
    if (!idEl.value) idEl.value = ordenId;
    ordenWizardOrdenIdActual = ordenId;
    function guardarComision() {
      const conceptoComision = tipoCodigo === 'ARS-DOLAR' ? 'Comisión ARS-USD' : (tipoCodigo === 'USD-ARS' ? 'Comisión USD-ARS' : (tipoCodigo === 'ARS-ARS' ? 'Comisión ARS-ARS' : 'Comisión USD-USD'));
      const comisionMoneda = tipoCodigo === 'ARS-ARS' ? 'ARS' : 'USD';
      if (!((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-DOLAR' || tipoCodigo === 'USD-ARS' || tipoCodigo === 'ARS-ARS') && comisionUsd != null && comisionUsd > 0)) return Promise.resolve();
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
      client.from('ordenes').select('id, cliente_id, tipo_operacion_id, intermediario_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado, cotizacion, tasa_descuento_intermediario').eq('id', ordenId).single(),
      client.from('transacciones').select('id, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instId).order('created_at', { ascending: true }),
      client.from('modos_pago').select('id, codigo, nombre'),
    ]).then(([rOrd, resTr, rModos]) => {
      loadingEl.style.display = 'none';
      wrapEl.style.display = 'block';
      const orden = rOrd.data || null;
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
        tbody.innerHTML = '<tr><td colspan="8">Error: ' + (resTr.error.message || '') + '</td></tr>';
        if (instrumentadoTexto) instrumentadoTexto.textContent = '–';
        return;
      }
      let list = resTr.data || [];

      function renderWizardList(lista) {
        const { totalRecibido, totalEntregado } = totalesInstrumentacion(lista, orden);
        if (instrumentadoTexto && orden) {
          const monR = orden.moneda_recibida || 'USD';
          const monE = orden.moneda_entregada || 'USD';
          instrumentadoTexto.textContent = `Recibido ${formatImporteDisplay(totalRecibido)} ${monR} · Entregado ${formatImporteDisplay(totalEntregado)} ${monE}.`;
        } else if (instrumentadoTexto) {
          instrumentadoTexto.textContent = '–';
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
        const tipoL = (t) => (t === 'ingreso' ? 'Ingreso' : 'Egreso');
        const ownerL = (o) => ({ pandy: 'Pandy', cliente: 'Cliente', intermediario: 'Intermediario' }[o] || o);
        const cobradorL = (t) => ownerL(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
        const pagadorL = (t) => ownerL(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
        const canAbm = userPermissions.includes('abm_ordenes');
        const canCambiarEstado = canAbm || userPermissions.includes('cambiar_estado_transaccion');
        const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`; };
        const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
        if (lista.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8">Todavía no hay transacciones.</td></tr>';
        } else {
          tbody.innerHTML = lista.map((t) => {
            const modo = modosMap[t.modo_pago_id];
            const modoNombre = modo ? modo.nombre : '–';
            return `<tr data-id="${t.id}">
              <td>${tipoL(t.tipo)}</td>
              <td>${esc(modoNombre)}</td>
              <td>${esc(t.moneda)}</td>
              <td>${formatImporteDisplay(t.monto)}</td>
              <td>${cobradorL(t)}</td>
              <td>${pagadorL(t)}</td>
              <td>${canCambiarEstado ? estadoTrxCombo(t) : estadoTexto(t)}</td>
              <td>${canCambiarEstado ? `<button type="button" class="btn-editar btn-editar-transaccion-ordenwizard" data-id="${t.id}">Editar</button>` : ''}</td>
            </tr>`;
          }).join('');
          if (canCambiarEstado) {
            tbody.querySelectorAll('.combo-estado-transaccion').forEach((sel) => {
              sel.addEventListener('change', function() { cambiarEstadoTransaccion(this.getAttribute('data-id'), this.value, instId, this); });
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
          if (!orden.intermediario_id && (codigo === 'USD-USD' || codigo === 'ARS-DOLAR' || codigo === 'ARS-USD' || codigo === 'USD-ARS' || codigo === 'ARS-ARS')) {
            return autoCompletarInstrumentacionSinIntermediario(ordenId, instId, orden);
          }
          return Promise.resolve();
        }).then(() =>
          client.from('transacciones').select('id, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instId).order('created_at', { ascending: true })
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

function saveOrden() {
  const idEl = document.getElementById('orden-id');
  const id = idEl && idEl.value ? idEl.value.trim() : '';
  const canAbm = userPermissions.includes('abm_ordenes');
  const canEditarOrden = canAbm || userPermissions.includes('editar_orden');
  if (id) {
    if (!canEditarOrden) {
      showToast('No tenés permiso para editar órdenes.', 'error');
      return;
    }
  } else {
    if (!canAbm) {
      showToast('No tenés permiso para crear órdenes.', 'error');
      return;
    }
  }
  const clienteId = document.getElementById('orden-cliente').value.trim() || null;
  const fecha = document.getElementById('orden-fecha').value;
  const tipoOperacionId = document.getElementById('orden-tipo-operacion')?.value?.trim() || null;
  const intermediarioId = document.getElementById('orden-intermediario')?.value?.trim() || null;
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

  if (!fecha || isNaN(montoRecibido) || montoRecibido <= 0 || isNaN(montoEntregado) || montoEntregado <= 0) {
    showToast('Completá fecha, monto recibido y monto entregado (números positivos).', 'error');
    return;
  }

  const selTipoOpt = document.getElementById('orden-tipo-operacion')?.selectedOptions?.[0];
  const tipoCodigo = selTipoOpt ? (selTipoOpt.getAttribute('data-codigo') || '') : '';
  if (tipoCodigo === 'ARS-DOLAR' || tipoCodigo === 'ARS-USD') {
    if (!cotizacion || !(cotizacion > 0)) {
      showToast('En ARS - USD el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
      return;
    }
    const usdEquiv = montoRecibido / cotizacion;
    if (usdEquiv <= montoEntregado) {
      showToast('En ARS - USD el monto a recibir (dolarizado) debe ser mayor al monto a entregar. La diferencia es la comisión.', 'error');
      return;
    }
  }
  if (tipoCodigo === 'USD-ARS') {
    if (!cotizacion || !(cotizacion > 0)) {
      showToast('En USD - ARS el tipo de cambio del acuerdo es obligatorio y debe ser mayor a cero.', 'error');
      return;
    }
    const usdEquivEntregado = montoEntregado / cotizacion;
    if (montoRecibido <= usdEquivEntregado) {
      showToast('En USD - ARS el monto a recibir debe ser mayor al monto a entregar (pesificado). La diferencia es la comisión.', 'error');
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
  const comisionUsd = tipoCodigo === 'USD-USD' ? montoRecibido - montoEntregado : (tipoCodigo === 'ARS-ARS' ? montoRecibido - montoEntregado : ((tipoCodigo === 'ARS-DOLAR' || tipoCodigo === 'ARS-USD') && cotizacion > 0 ? (montoRecibido / cotizacion) - montoEntregado : (tipoCodigo === 'USD-ARS' && cotizacion > 0 ? montoRecibido - (montoEntregado / cotizacion) : null)));

  const pctPandy = parseImporteInput(document.getElementById('orden-comision-pandy-pct')?.value || '100');
  const pctInt = parseImporteInput(document.getElementById('orden-comision-intermediario-pct')?.value || '0');
  const tieneSplitVisible = document.getElementById('orden-wrap-comision-split')?.style?.display !== 'none';
  if ((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-DOLAR' || tipoCodigo === 'ARS-USD' || tipoCodigo === 'USD-ARS' || tipoCodigo === 'ARS-ARS') && intermediarioId && tieneSplitVisible) {
    const a = Number(pctPandy);
    const b = Number(pctInt);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0 || a > 100 || b > 100 || Math.abs((a + b) - 100) > 1e-6) {
      showToast('La distribución de comisión debe sumar 100% (Pandy + Intermediario).', 'error');
      return;
    }
  }
  if (intermediarioId && tieneSplitVisible && (Number(pctInt) || 0) < 1e-6) {
    if (!confirm('La comisión del intermediario es cero. ¿Deseás guardar la orden igual?')) return;
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
    : client.from('ordenes').insert(payload).select('id');

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
    const conceptoComision = tipoCodigo === 'ARS-DOLAR' ? 'Comisión ARS-USD' : (tipoCodigo === 'USD-ARS' ? 'Comisión USD-ARS' : (tipoCodigo === 'ARS-ARS' ? 'Comisión ARS-ARS' : 'Comisión USD-USD'));
    const comisionMoneda = tipoCodigo === 'ARS-ARS' ? 'ARS' : 'USD';
    function guardarComisionYContinuar(continuar) {
      if ((tipoCodigo === 'USD-USD' || tipoCodigo === 'ARS-DOLAR' || tipoCodigo === 'USD-ARS' || tipoCodigo === 'ARS-ARS') && comisionUsd != null && comisionUsd > 0) {
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
              if (vistaCc && vistaCc.style.display !== 'none') {
                if (ccEsIntermediario) {
                  const selInt = document.getElementById('cc-intermediario');
                  if (selInt && selInt.value) loadCuentaCorrienteIntermediario(selInt.value);
                } else {
                  const selCc = document.getElementById('cc-cliente');
                  if (selCc && selCc.value) loadCuentaCorrienteCliente(selCc.value);
                }
              }
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
        const movCaja = [
          { moneda: monedaRecibida, monto: montoRecibido, orden_id: ordenId, concepto: 'Orden concertada', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora },
          { moneda: monedaEntregada, monto: -montoEntregado, orden_id: ordenId, concepto: 'Orden concertada', fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora },
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
}

function setupModalOrden() {
  const backdrop = document.getElementById('modal-orden-backdrop');
  const btnClose = document.getElementById('modal-orden-close');
  const btnCancel = document.getElementById('modal-orden-cancelar');
  const form = document.getElementById('form-orden');
  const btnNuevo = document.getElementById('btn-nueva-orden');
  if (btnClose) btnClose.addEventListener('click', closeModalOrden);
  if (btnCancel) btnCancel.addEventListener('click', closeModalOrden);
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalOrden(); });
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveOrden(); });
  if (btnNuevo) btnNuevo.addEventListener('click', () => openModalOrden(null));
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

/** Valida que los totales no superen el acuerdo. Devuelve { ok, mensaje }. */
function validarTotalesVsAcuerdo(transacciones, orden, transaccionExcluirId, transaccionAgregar) {
  const list = (transacciones || []).filter((t) => t.id !== transaccionExcluirId);
  if (transaccionAgregar) list.push(transaccionAgregar);
  const { totalRecibido, totalEntregado } = totalesInstrumentacion(list, orden);
  const montoRecibido = Number(orden.monto_recibido) || 0;
  const montoEntregado = Number(orden.monto_entregado) || 0;
  const monedaRecibida = orden.moneda_recibida || 'USD';
  const monedaEntregada = orden.moneda_entregada || 'USD';
  if (totalRecibido > montoRecibido + 1e-6) {
    return { ok: false, mensaje: `La suma de ingresos (${formatImporteDisplay(totalRecibido)} ${monedaRecibida}) supera el acuerdo a recibir (${formatImporteDisplay(montoRecibido)} ${monedaRecibida}).` };
  }
  if (totalEntregado > montoEntregado + 1e-6) {
    return { ok: false, mensaje: `La suma de egresos (${formatImporteDisplay(totalEntregado)} ${monedaEntregada}) supera el acuerdo a entregar (${formatImporteDisplay(montoEntregado)} ${monedaEntregada}).` };
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
 * Operación CHEQUE (ARS-ARS) con intermediario: crea 4 transacciones por defecto.
 * 1) Ingreso cheques 10M ARS – paga cliente, cobra Pandy
 * 2) Egreso efectivo 9,8M ARS – paga Pandy, cobra cliente
 * 3) Egreso cheques 10M ARS – paga Pandy, cobra intermediario
 * 4) Ingreso efectivo 10M*(1-tasa) ARS – paga intermediario, cobra Pandy
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
    return Promise.all(rows.map((row) => client.from('transacciones').insert(row)));
  });
}

/**
 * Si la orden es sin intermediario y la instrumentación está vacía, crea dos transacciones por defecto
 * (ingreso moneda recibida, egreso moneda entregada). Soporta USD-USD, ARS-DOLAR, ARS-USD, USD-ARS, ARS-ARS.
 * Modo de pago efectivo, estado pendiente.
 */
function autoCompletarInstrumentacionSinIntermediario(ordenId, instrumentacionId, orden) {
  if (!ordenId || !instrumentacionId || !orden || orden.intermediario_id || !orden.tipo_operacion_id) return Promise.resolve();
  return client.from('tipos_operacion').select('codigo').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
    const codigo = (rTipo.data && rTipo.data.codigo) || '';
    const codigoNorm = codigo === 'ARS-USD' ? 'ARS-DOLAR' : codigo;
    const esUsdUsd = codigoNorm === 'USD-USD';
    const esArsDolar = codigoNorm === 'ARS-DOLAR';
    const esUsdArs = codigoNorm === 'USD-ARS';
    const esArsArs = codigoNorm === 'ARS-ARS';
    if (!esUsdUsd && !esArsDolar && !esUsdArs && !esArsArs) return Promise.resolve();
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
      } else if (esArsDolar) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: cotizacion, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
      } else if (esUsdArs) {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: monR, monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: monE, monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: cotizacion, updated_at: ahora });
      } else {
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'ingreso', modo_pago_id: modoPagoEfectivoId, moneda: 'ARS', monto: mr, cobrador: 'pandy', pagador: 'cliente', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
        rows.push({ instrumentacion_id: instrumentacionId, tipo: 'egreso', modo_pago_id: modoPagoEfectivoId, moneda: 'ARS', monto: me, cobrador: 'cliente', pagador: 'pandy', owner: 'pandy', estado: 'pendiente', concepto: '', tipo_cambio: null, updated_at: ahora });
      }
      return Promise.all(rows.map((row) => client.from('transacciones').insert(row)));
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
  const canAbm = userPermissions.includes('abm_ordenes');
  const canCambiarEstado = canAbm || userPermissions.includes('cambiar_estado_transaccion');
  const btnNuevaTr = panel.querySelector('.btn-nueva-transaccion-panel');
  if (btnNuevaTr) btnNuevaTr.style.display = canAbm ? '' : 'none';

  const estadoLabelOrd = (e) => ({ pendiente_instrumentar: 'Pendiente Instrumentar', instrumentacion_parcial: 'Instrumentación Parcial', instrumentacion_cerrada_ejecucion: 'Cerrada en Ejecución', orden_ejecutada: 'Orden Ejecutada' }[e] || (e || '–'));
  const estadoBadgeOrd = (e) => (e && ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada'].includes(e) ? `<span class="badge badge-estado-${e.replace(/_/g, '-')}">${estadoLabelOrd(e)}</span>` : estadoLabelOrd(e));
  encabezado.innerHTML = orden
    ? `<div class="orden-detalle-resumen"><strong>Orden</strong> ${(orden.fecha || '').toString().slice(0, 10)} · Estado: ${estadoBadgeOrd(orden.estado)} · ${orden.moneda_recibida} ${formatImporteDisplay(orden.monto_recibido)} → ${orden.moneda_entregada} ${formatImporteDisplay(orden.monto_entregado)}</div>`
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
        tbody.innerHTML = '<tr><td colspan="8">No se pudo cargar la instrumentación.</td></tr>';
        contentEl.style.display = 'block';
        return;
      }
      panel.dataset.instrumentacionId = instrumentacionId;

      client
        .from('transacciones')
        .select('id, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio')
        .eq('instrumentacion_id', instrumentacionId)
        .order('created_at', { ascending: true })
        .then((res) => {
          loadingEl.style.display = 'none';
          contentEl.style.display = 'block';
          if (res.error) {
            tbody.innerHTML = '<tr><td colspan="8">Error: ' + (res.error.message || '') + '</td></tr>';
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
              totalesEl.innerHTML = `<strong>Acuerdo:</strong> Recibir ${formatImporteDisplay(mr)} ${monR} · Entregar ${formatImporteDisplay(me)} ${monE}. &nbsp; <strong>Instrumentado:</strong> Recibido ${formatImporteDisplay(totalRecibido)} ${monR} · Entregado ${formatImporteDisplay(totalEntregado)} ${monE}.${(!okRec || !okEnt) ? ' <span style="color:#b91c1c;">(Supera acuerdo)</span>' : ''}`;
            }
            return client.from('modos_pago').select('id, codigo, nombre').then((rModos) => {
              const modosMap = {};
              (rModos.data || []).forEach((m) => { modosMap[m.id] = m; });
              const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
              const tipoL = (t) => (t === 'ingreso' ? 'Ingreso' : 'Egreso');
              const ownerL = (o) => ({ pandy: 'Pandy', cliente: 'Cliente', intermediario: 'Intermediario' }[o] || o);
              const cobradorL = (t) => ownerL(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
              const pagadorL = (t) => ownerL(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
              const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`; };
              const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
              tbody.innerHTML = lista
                .map(
                  (t) => {
                    const modo = modosMap[t.modo_pago_id];
                    const modoNombre = modo ? modo.nombre : '–';
                    return `<tr data-id="${t.id}">
                      <td>${tipoL(t.tipo)}</td>
                      <td>${esc(modoNombre)}</td>
                      <td>${esc(t.moneda)}</td>
                      <td>${formatImporteDisplay(t.monto)}</td>
                      <td>${cobradorL(t)}</td>
                      <td>${pagadorL(t)}</td>
                      <td>${canCambiarEstado ? estadoTrxCombo(t) : estadoTexto(t)}</td>
                      <td>${canCambiarEstado ? `<button type="button" class="btn-editar btn-editar-transaccion-panel" data-id="${t.id}">Editar</button>` : ''}</td>
                    </tr>`;
                  }
                )
                .join('');
              if (canCambiarEstado) {
                tbody.querySelectorAll('.combo-estado-transaccion').forEach((sel) => {
                  sel.addEventListener('change', function() { cambiarEstadoTransaccion(this.getAttribute('data-id'), this.value, instrumentacionId, this); });
                });
                tbody.querySelectorAll('.btn-editar-transaccion-panel').forEach((btn) => {
                  btn.addEventListener('click', () => {
                    const row = lista.find((r) => r.id === btn.getAttribute('data-id'));
                    if (row) openModalTransaccion(row, instrumentacionId);
                  });
                });
              }
            });
          }

          if (list.length === 0 && orden && orden.tipo_operacion_id) {
            return client.from('tipos_operacion').select('codigo').eq('id', orden.tipo_operacion_id).single().then((rTipo) => {
              const codigo = (rTipo.data && rTipo.data.codigo) || '';
              if (codigo === 'ARS-ARS' && orden.intermediario_id) {
                return autoCompletarInstrumentacionChequeConIntermediario(ordenId, instrumentacionId, orden);
              }
if (!orden.intermediario_id && (codigo === 'USD-USD' || codigo === 'ARS-DOLAR' || codigo === 'ARS-USD' || codigo === 'USD-ARS' || codigo === 'ARS-ARS')) {
              return autoCompletarInstrumentacionSinIntermediario(ordenId, instrumentacionId, orden);
            }
              return Promise.resolve();
            }).then(() =>
              client.from('transacciones').select('id, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instrumentacionId).order('created_at', { ascending: true })
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
    client.from('transacciones').select('id, tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, estado, concepto, tipo_cambio').eq('instrumentacion_id', instrumentacionId).order('created_at', { ascending: true }),
    client.from('ordenes').select('id, cliente_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado').eq('id', ordenId).single(),
  ]).then(([resTr, resOrd]) => {
    const orden = resOrd?.data || null;
    if (resTr.error) {
      tbody.innerHTML = '<tr><td colspan="8">Error: ' + (resTr.error.message || '') + '</td></tr>';
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
      totalesEl.innerHTML = `<strong>Acuerdo:</strong> Recibir ${formatImporteDisplay(mr)} ${monR} · Entregar ${formatImporteDisplay(me)} ${monE}. &nbsp; <strong>Instrumentado:</strong> Recibido ${formatImporteDisplay(totalRecibido)} ${monR} · Entregado ${formatImporteDisplay(totalEntregado)} ${monE}.${(!okRec || !okEnt) ? ' <span style="color:#b91c1c;">(Supera acuerdo)</span>' : ''}`;
    }
    const canCambiarEstado = userPermissions.includes('abm_ordenes') || userPermissions.includes('cambiar_estado_transaccion');
    client.from('modos_pago').select('id, codigo, nombre').then((rModos) => {
        const modosMap = {};
        (rModos.data || []).forEach((m) => { modosMap[m.id] = m; });
        const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        const tipoL = (t) => (t === 'ingreso' ? 'Ingreso' : 'Egreso');
        const ownerL = (o) => ({ pandy: 'Pandy', cliente: 'Cliente', intermediario: 'Intermediario' }[o] || o);
        const cobradorL = (t) => ownerL(t.cobrador || (t.tipo === 'ingreso' ? t.owner : 'pandy'));
        const pagadorL = (t) => ownerL(t.pagador || (t.tipo === 'egreso' ? t.owner : 'pandy'));
        const estadoTrxCombo = (t) => { const est = t.estado === 'ejecutada' ? 'ejecutada' : 'pendiente'; return `<select class="combo-estado-transaccion combo-estado-${est}" data-id="${t.id}" aria-label="Estado"><option value="pendiente"${t.estado === 'pendiente' ? ' selected' : ''}>Pendiente</option><option value="ejecutada"${t.estado === 'ejecutada' ? ' selected' : ''}>Ejecutada</option></select>`; };
        const estadoTexto = (t) => (t.estado === 'ejecutada' ? 'Ejecutada' : 'Pendiente');
        tbody.innerHTML = list
          .map(
            (t) => {
              const modo = modosMap[t.modo_pago_id];
              const modoNombre = modo ? modo.nombre : '–';
              return `<tr data-id="${t.id}">
                <td>${tipoL(t.tipo)}</td>
                <td>${esc(modoNombre)}</td>
                <td>${esc(t.moneda)}</td>
                <td>${formatImporteDisplay(t.monto)}</td>
                <td>${cobradorL(t)}</td>
                <td>${pagadorL(t)}</td>
                <td>${canCambiarEstado ? estadoTrxCombo(t) : estadoTexto(t)}</td>
                <td>${canCambiarEstado ? `<button type="button" class="btn-editar btn-editar-transaccion-panel" data-id="${t.id}">Editar</button>` : ''}</td>
              </tr>`;
            }
          )
          .join('');
        if (canCambiarEstado) {
          tbody.querySelectorAll('.combo-estado-transaccion').forEach((sel) => {
            sel.addEventListener('change', function() { cambiarEstadoTransaccion(this.getAttribute('data-id'), this.value, instrumentacionId, this); });
          });
          tbody.querySelectorAll('.btn-editar-transaccion-panel').forEach((btn) => {
            btn.addEventListener('click', () => {
              const row = list.find((r) => r.id === btn.getAttribute('data-id'));
              if (row) openModalTransaccion(row, instrumentacionId);
            });
          });
        }
      });
  });
}

function actualizarMontoArsCalculado() {
  const wrapArs = document.getElementById('transaccion-wrap-ars');
  const wrapNormal = document.getElementById('transaccion-wrap-monto-normal');
  const montoBaseRaw = document.getElementById('transaccion-monto-base')?.value?.trim() || '';
  const tcRaw = document.getElementById('transaccion-tipo-cambio')?.value?.trim() || '';
  const base = parseImporteInput(montoBaseRaw);
  const tc = parseImporteInput(tcRaw);
  const montoArs = (typeof base === 'number' && !isNaN(base) && typeof tc === 'number' && !isNaN(tc) && tc > 0) ? base * tc : null;
  const display = document.getElementById('transaccion-monto-ars-display');
  const montoInput = document.getElementById('transaccion-monto');
  if (display) display.value = montoArs != null ? formatImporteDisplay(montoArs) : '';
  if (montoInput) montoInput.value = montoArs != null ? formatImporteDisplay(montoArs) : '';
}

function toggleTransaccionMonedaArs() {
  const selMoneda = document.getElementById('transaccion-moneda');
  const wrapArs = document.getElementById('transaccion-wrap-ars');
  const wrapNormal = document.getElementById('transaccion-wrap-monto-normal');
  const esOrdenCheque = document.getElementById('transaccion-es-orden-cheque')?.value === '1';
  if (esOrdenCheque) {
    if (selMoneda) { selMoneda.value = 'ARS'; selMoneda.disabled = true; }
    if (wrapArs) wrapArs.style.display = 'none';
    if (wrapNormal) wrapNormal.style.display = 'block';
    return;
  }
  if (selMoneda) selMoneda.disabled = false;
  const esArs = selMoneda && selMoneda.value === 'ARS';
  if (wrapArs) wrapArs.style.display = esArs ? 'block' : 'none';
  if (wrapNormal) wrapNormal.style.display = esArs ? 'none' : 'block';
  if (esArs) actualizarMontoArsCalculado();
  else {
    const d = document.getElementById('transaccion-monto-ars-display');
    if (d) d.value = '';
    // No vaciar transaccion-monto: al editar ya tiene el valor cargado; al cambiar de ARS a otra moneda se escribe nuevo monto manualmente.
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
  const wrapArs = document.getElementById('transaccion-wrap-ars');
  const wrapNormal = document.getElementById('transaccion-wrap-monto-normal');
  const selMoneda = document.getElementById('transaccion-moneda');
  if (!backdrop || !titulo || !idEl || !instIdEl) return;

  instIdEl.value = instrumentacionId || '';
  function cargarParticipantesYOrden() {
    if (!instrumentacionId) return Promise.resolve({ cliente: false, intermediario: false, cotizacion: null, esCheque: false, monedaRecibida: '', monedaEntregada: '' });
    return client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rInst) => {
      const ordenId = rInst.data && rInst.data.orden_id;
      if (!ordenId) return { cliente: false, intermediario: false, cotizacion: null, esCheque: false, monedaRecibida: '', monedaEntregada: '' };
      return client.from('ordenes').select('cliente_id, intermediario_id, cotizacion, tipo_operacion_id, moneda_recibida, moneda_entregada').eq('id', ordenId).single().then((rOrd) => {
        const o = rOrd.data || {};
        const cot = o.cotizacion != null && Number(o.cotizacion) > 0 ? Number(o.cotizacion) : null;
        const tipoOpId = o.tipo_operacion_id;
        const monedaRecibida = (o.moneda_recibida || '').trim().toUpperCase() || '';
        const monedaEntregada = (o.moneda_entregada || '').trim().toUpperCase() || '';
        const base = { cliente: !!o.cliente_id, intermediario: !!o.intermediario_id, cotizacion: cot, monedaRecibida, monedaEntregada };
        if (!tipoOpId) return { ...base, esCheque: false };
        return client.from('tipos_operacion').select('codigo').eq('id', tipoOpId).single().then((rTipo) => {
          const codigo = (rTipo.data && rTipo.data.codigo) || '';
          return { ...base, esCheque: codigo === 'ARS-ARS' };
        }).catch(() => ({ ...base, esCheque: false }));
      });
    }).catch(() => ({ cliente: false, intermediario: false, cotizacion: null, esCheque: false, monedaRecibida: '', monedaEntregada: '' }));
  }

  Promise.all([
    client.from('modos_pago').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    cargarParticipantesYOrden(),
  ]).then(([r, participantes]) => {
    const sel = document.getElementById('transaccion-modo-pago');
    if (sel) sel.innerHTML = (r.data || []).map((m) => `<option value="${m.id}" data-codigo="${escapeHtml(m.codigo)}">${escapeHtml(m.nombre)}</option>`).join('');

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

    if (registro) {
      titulo.textContent = 'Editar transacción';
      idEl.value = registro.id;
      document.getElementById('transaccion-tipo').value = registro.tipo || 'ingreso';
      document.getElementById('transaccion-modo-pago').value = registro.modo_pago_id || '';
      document.getElementById('transaccion-moneda').value = esCheque ? 'ARS' : (registro.moneda || 'USD');
      document.getElementById('transaccion-monto').value = formatImporteDisplay(registro.monto);
      document.getElementById('transaccion-cobrador').value = registro.cobrador || 'pandy';
      document.getElementById('transaccion-pagador').value = registro.pagador || 'pandy';
      document.getElementById('transaccion-estado').value = registro.estado || 'pendiente';
      document.getElementById('transaccion-concepto').value = registro.concepto || '';
      if (!esCheque) {
        const tc = registro.tipo_cambio != null && Number(registro.tipo_cambio) > 0 ? Number(registro.tipo_cambio) : null;
        document.getElementById('transaccion-tipo-cambio').value = tc != null ? formatImporteDisplay(tc) : '';
        if (registro.moneda === 'ARS' && tc) {
          const montoBase = Number(registro.monto) / tc;
          document.getElementById('transaccion-monto-base').value = formatImporteDisplay(montoBase);
        } else document.getElementById('transaccion-monto-base').value = '';
      } else {
        document.getElementById('transaccion-tipo-cambio').value = '';
        document.getElementById('transaccion-monto-base').value = '';
      }
    } else {
      titulo.textContent = 'Nueva transacción';
      idEl.value = '';
      document.getElementById('form-transaccion').reset();
      if (elEsCheque) elEsCheque.value = esCheque ? '1' : '0';
      document.getElementById('transaccion-tipo').value = 'ingreso';
      document.getElementById('transaccion-moneda').value = esCheque ? 'ARS' : 'USD';
      document.getElementById('transaccion-cobrador').value = 'pandy';
      document.getElementById('transaccion-pagador').value = participantes?.cliente ? 'cliente' : (participantes?.intermediario ? 'intermediario' : 'pandy');
      document.getElementById('transaccion-estado').value = 'pendiente';
      document.getElementById('transaccion-monto-base').value = '';
      if (!esCheque) {
        const tcAcuerdo = participantes?.cotizacion;
        document.getElementById('transaccion-tipo-cambio').value = tcAcuerdo != null ? formatImporteDisplay(tcAcuerdo) : '';
      } else document.getElementById('transaccion-tipo-cambio').value = '';
    }
    if (backdrop) {
      backdrop.dataset.monedaRecibida = participantes?.monedaRecibida || '';
      backdrop.dataset.monedaEntregada = participantes?.monedaEntregada || '';
    }
    adaptarTransaccionTipoYMoneda();
    toggleTransaccionMonedaArs();
    backdrop.classList.add('activo');
    setupInputImporte(document.getElementById('transaccion-monto'));
    setupInputImporte(document.getElementById('transaccion-monto-base'));
    setupInputImporte(document.getElementById('transaccion-tipo-cambio'));
  });
}

function closeModalTransaccion() {
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
  const payload = { estado: nuevoEstado, updated_at: new Date().toISOString() };
  if (nuevoEstado === 'ejecutada') {
    payload.fecha_ejecucion = new Date().toISOString().slice(0, 10);
    payload.usuario_id = currentUserId;
  }
  return client.from('transacciones').update(payload).eq('id', transaccionId).then((rUp) => {
    if (rUp.error) {
      showToast('Error al actualizar estado: ' + (rUp.error.message || ''), 'error');
      return;
    }
    return client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rInst) => {
      const ordenId = rInst.data && rInst.data.orden_id;
      if (!ordenId) return Promise.resolve();
      return client.from('transacciones').select('tipo, modo_pago_id, moneda, monto, cobrador, pagador, owner, concepto').eq('id', transaccionId).single().then((rTr) => {
        const t = rTr.data;
        if (!t) return Promise.resolve();
        const cob = t.cobrador || (t.tipo === 'ingreso' ? (t.owner || 'pandy') : 'pandy');
        const pag = t.pagador || (t.tipo === 'egreso' ? (t.owner || 'pandy') : 'pandy');
        return client.from('ordenes').select('cliente_id, intermediario_id').eq('id', ordenId).single().then((rOrd) => {
          const orden = rOrd.data || {};
          const clienteId = orden.cliente_id || null;
          const intermediarioId = orden.intermediario_id || null;
          const fecha = new Date().toISOString().slice(0, 10);
          const ahora = new Date().toISOString();
          const concepto = nuevoEstado === 'ejecutada' ? 'Transacción ejecutada' : 'Transacción pendiente';
          const monto = Number(t.monto) || 0;

          const deletes = [
            client.from('movimientos_cuenta_corriente').delete().eq('transaccion_id', transaccionId),
            client.from('movimientos_cuenta_corriente_intermediario').delete().eq('transaccion_id', transaccionId),
          ];
          if (nuevoEstado === 'pendiente') deletes.push(client.from('movimientos_caja').delete().eq('transaccion_id', transaccionId));
          return Promise.all(deletes).then(() => {
            const insertsCc = [];
            if (cob === 'cliente' && clienteId) {
              insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, moneda: t.moneda, monto: -monto, transaccion_id: transaccionId,
                concepto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
              }));
            }
            if (pag === 'cliente' && clienteId) {
              insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
                cliente_id: clienteId, moneda: t.moneda, monto, transaccion_id: transaccionId,
                concepto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
              }));
            }
            const esPandyInt = (cob === 'pandy' && pag === 'intermediario') || (cob === 'intermediario' && pag === 'pandy');
            if (esPandyInt && cob === 'intermediario' && intermediarioId) {
              insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                intermediario_id: intermediarioId, moneda: t.moneda, monto: -monto, transaccion_id: transaccionId,
                concepto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
              }));
            }
            if (esPandyInt && pag === 'intermediario' && intermediarioId) {
              insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
                intermediario_id: intermediarioId, moneda: t.moneda, monto: -monto, transaccion_id: transaccionId,
                concepto, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
              }));
            }
            function actualizarEstadoYConversion() {
              return actualizarEstadoOrden(ordenId).then((res) => {
                if (res && res.estado === 'orden_ejecutada') return generarMovimientoConversionCc(ordenId).then(() => generarMovimientoConversionCcIntermediario(ordenId)).then(() => res);
                return res;
              }).then(() => ({ ordenId, instrumentacionId }));
            }
            return Promise.all(insertsCc).then(() => {
              if (nuevoEstado !== 'ejecutada') return actualizarEstadoYConversion();
              // La caja es siempre la de Pandy: solo registramos movimiento cuando Pandy es cobrador o pagador.
              const pandyParticipa = cob === 'pandy' || pag === 'pandy';
              if (!pandyParticipa) return actualizarEstadoYConversion();
              return client.from('movimientos_caja').select('id').eq('transaccion_id', transaccionId).limit(1).then((rCaja) => {
                if (rCaja.data && rCaja.data.length > 0) return actualizarEstadoYConversion();
                if (!t.modo_pago_id) return actualizarEstadoYConversion();
                return client.from('modos_pago').select('codigo').eq('id', t.modo_pago_id).single().then((rModo) => {
                  const codigo = (rModo.data && rModo.data.codigo) || '';
                  const cajaTipo = codigoCajaTipoDesdeCodigo(codigo);
                  const signo = cob === 'pandy' ? 1 : -1; // Pandy cobra = ingreso; Pandy paga = egreso
                  return client.from('movimientos_caja').insert({
                    moneda: t.moneda, monto: signo * monto, caja_tipo: cajaTipo, transaccion_id: transaccionId,
                    concepto: t.concepto || 'Transacción ejecutada', fecha, usuario_id: currentUserId,
                  }).then(() => actualizarEstadoYConversion());
                });
              });
            });
          });
        });
      });
    });
  }).then((ctx) => {
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
      if (vistaCc && vistaCc.style.display !== 'none') {
        if (ccEsIntermediario && document.getElementById('cc-intermediario')?.value) loadCuentaCorrienteIntermediario(document.getElementById('cc-intermediario').value);
        else if (document.getElementById('cc-cliente')?.value) loadCuentaCorrienteCliente(document.getElementById('cc-cliente').value);
      }
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
  const modoPagoId = document.getElementById('transaccion-modo-pago').value;
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
    showToast(esOrdenCheque || moneda !== 'ARS' ? 'Monto debe ser un número positivo.' : 'Completá monto base y tipo de cambio para calcular el monto en ARS.', 'error');
    return;
  }

  const transaccionProyectada = { tipo, moneda, monto, tipo_cambio: tipoCambio };

  client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rInst) => {
    const ordenId = rInst.data?.orden_id;
    if (!ordenId) {
      showToast('No se encontró la orden de esta instrumentación.', 'error');
      return;
    }
    client.from('ordenes').select('id, cliente_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado').eq('id', ordenId).single().then((rOrd) => {
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
        guardarTransaccionPayload();
      });
    });
  });

  function guardarTransaccionPayload() {
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
    : client.from('transacciones').insert(payload).select('id');

  prom.then((res) => {
    if (res.error) {
      showToast('Error: ' + (res.error.message || 'No se pudo guardar.'), 'error');
      return;
    }
    const transaccionId = id || (res.data && res.data[0] && res.data[0].id);
    if (!transaccionId) {
      closeModalTransaccion();
      refreshTransaccionesModal();
      return;
    }
    const fecha = new Date().toISOString().slice(0, 10);
    const ahora = new Date().toISOString();
    const conceptoCc = estado === 'ejecutada' ? 'Transacción ejecutada' : 'Transacción pendiente';

    function refreshCcView() {
      const vistaCc = document.getElementById('vista-cuenta-corriente');
      if (vistaCc && vistaCc.style.display !== 'none') {
        if (ccEsIntermediario) {
          const selInt = document.getElementById('cc-intermediario');
          if (selInt && selInt.value) loadCuentaCorrienteIntermediario(selInt.value);
        } else {
          const selCc = document.getElementById('cc-cliente');
          if (selCc && selCc.value) loadCuentaCorrienteCliente(selCc.value);
        }
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
            if (res && res.estado === 'instrumentacion_cerrada_ejecucion') return generarTransaccionesCompensacionPandyIntermediario(ordenId, instrumentacionId).then(() => res);
            return res;
          })
          .then((res) => {
            if (res && res.estado === 'orden_ejecutada') return generarMovimientoConversionCc(ordenId).then(() => generarMovimientoConversionCcIntermediario(ordenId));
          })
          .then(() => {
            if (ordenWizardInstrumentacionIdActual && instrumentacionId && ordenWizardInstrumentacionIdActual === instrumentacionId) renderOrdenWizardInstrumentacion(instrumentacionId);
            refreshCcView();
          });
      } else {
        refreshCcView();
      }
    }

    client.from('instrumentacion').select('orden_id').eq('id', instrumentacionId).single().then((rOrd) => {
      const ordenId = rOrd.data && rOrd.data.orden_id;
      if (!ordenId) {
        hacerCierre();
        return;
      }
      client.from('ordenes').select('cliente_id, intermediario_id').eq('id', ordenId).single().then((rO) => {
        const orden = rO.data || {};
        const clienteId = orden.cliente_id || null;
        const intermediarioId = orden.intermediario_id || null;

        // Cuenta corriente se impacta siempre (pendiente y ejecutada) para reflejar la situación real.
        Promise.all([
          client.from('movimientos_cuenta_corriente').delete().eq('transaccion_id', transaccionId),
          client.from('movimientos_cuenta_corriente_intermediario').delete().eq('transaccion_id', transaccionId),
        ]).then(() => {
          const insertsCc = [];
          if (cobrador === 'cliente' && clienteId) {
            insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
              cliente_id: clienteId, moneda, monto: -monto, transaccion_id: transaccionId,
              concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
            }));
          }
          if (pagador === 'cliente' && clienteId) {
            insertsCc.push(client.from('movimientos_cuenta_corriente').insert({
              cliente_id: clienteId, moneda, monto, transaccion_id: transaccionId,
              concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
            }));
          }
          const esPandyIntermediario = (cobrador === 'pandy' && pagador === 'intermediario') || (cobrador === 'intermediario' && pagador === 'pandy');
          if (esPandyIntermediario && cobrador === 'intermediario' && intermediarioId) {
            insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
              intermediario_id: intermediarioId, moneda, monto: -monto, transaccion_id: transaccionId,
              concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
            }));
          }
          if (esPandyIntermediario && pagador === 'intermediario' && intermediarioId) {
            insertsCc.push(client.from('movimientos_cuenta_corriente_intermediario').insert({
              intermediario_id: intermediarioId, moneda, monto: -monto, transaccion_id: transaccionId,
              concepto: conceptoCc, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
            }));
          }
          Promise.all(insertsCc).then(() => {
            if (estado !== 'ejecutada') {
              hacerCierre(ordenId);
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
              const cajaTipo = codigoCajaTipo(modoPagoId);
              const signo = cobrador === 'pandy' ? 1 : -1; // Pandy cobra = ingreso; Pandy paga = egreso
              const movCaja = {
                moneda, monto: signo * monto, caja_tipo: cajaTipo, transaccion_id: transaccionId,
                concepto: concepto || 'Transacción ejecutada', fecha, usuario_id: currentUserId,
              };
              client.from('movimientos_caja').insert(movCaja).then((rCaja) => {
                if (rCaja.error) {
                  showToast('Error al crear movimiento de caja: ' + (rCaja.error.message || ''), 'error');
                  return;
                }
                hacerCierre(ordenId);
                loadCajas();
              });
            });
          });
        });
      });
    });
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
                }));
              }
              // Comisión en CC cliente para que la cuenta cierre: ARS-DOLAR en USD (Haber), USD-ARS en ARS (Haber), USD-USD en moneda (Haber)
              if (comisionUsd != null && comisionUsd > 1e-6) {
                if (!mismaMoneda && monedaRecibida === 'ARS' && monedaEntregada === 'USD') {
                  inserts.push(client.from('movimientos_cuenta_corriente').insert({
                    cliente_id: clienteId, moneda: 'USD', monto: -comisionUsd, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  }));
                } else if (!mismaMoneda && monedaRecibida === 'USD' && monedaEntregada === 'ARS' && cotizacion > 1e-6) {
                  // USD-ARS: comisión en ARS (Haber) para que cierre el saldo ARS: Debe = recibido*TC, Haber = entregado + comisión
                  const comisionArs = comisionUsd * cotizacion;
                  inserts.push(client.from('movimientos_cuenta_corriente').insert({
                    cliente_id: clienteId, moneda: 'ARS', monto: -comisionArs, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  }));
                } else {
                  inserts.push(client.from('movimientos_cuenta_corriente').insert({
                    cliente_id: clienteId, moneda: 'USD', monto: -comisionUsd, orden_id: ordenId, transaccion_id: null,
                    concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
                  }));
                }
              } else if (comisionOrden > 1e-6) {
                inserts.push(client.from('movimientos_cuenta_corriente').insert({
                  cliente_id: clienteId, moneda: monedaRecibida, monto: -comisionOrden, orden_id: ordenId, transaccion_id: null,
                  concepto: CONCEPTO_CC_COMISION, fecha, usuario_id: currentUserId, estado: 'cerrado', estado_fecha: ahora,
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

/** Actualiza el estado de la orden según transacciones y acuerdo. Devuelve promesa con { estado, conciliada, todasEjecutadas } o undefined. */
function actualizarEstadoOrden(ordenId) {
  if (!ordenId) return Promise.resolve();
  return client.from('instrumentacion').select('id').eq('orden_id', ordenId).maybeSingle().then((r) => {
    const instId = r.data && r.data.id;
    if (!instId) return;
    return client.from('ordenes').select('id, cliente_id, moneda_recibida, monto_recibido, moneda_entregada, monto_entregado').eq('id', ordenId).single().then((rOrd) => {
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
  const montoBaseEl = document.getElementById('transaccion-monto-base');
  const tcEl = document.getElementById('transaccion-tipo-cambio');
  if (btnClose) btnClose.addEventListener('click', closeModalTransaccion);
  if (btnCancel) btnCancel.addEventListener('click', closeModalTransaccion);
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModalTransaccion(); });
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); saveTransaccion(); });
  const selTipo = document.getElementById('transaccion-tipo');
  if (selTipo) selTipo.addEventListener('change', adaptarTransaccionTipoYMoneda);
  if (selMoneda) selMoneda.addEventListener('change', toggleTransaccionMonedaArs);
  if (montoBaseEl) { montoBaseEl.addEventListener('input', actualizarMontoArsCalculado); montoBaseEl.addEventListener('change', actualizarMontoArsCalculado); }
  if (tcEl) { tcEl.addEventListener('input', actualizarMontoArsCalculado); tcEl.addEventListener('change', actualizarMontoArsCalculado); }
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
      tbody.innerHTML = list
        .map(
          (c) =>
            `<tr data-id="${c.id}">
              <td>${esc(c.nombre)}</td>
              <td>${esc(c.documento)}</td>
              <td>${esc(c.email)}</td>
              <td>${esc(c.telefono)}</td>
              <td>${c.activo ? 'Sí' : 'No'}</td>
              <td>${canAbm ? `<button type="button" class="btn-editar" data-id="${c.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
            </tr>`
        )
        .join('');
      tbody.querySelectorAll('.btn-editar').forEach((btn) => {
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
      tbody.innerHTML = list
        .map(
          (i) =>
            `<tr data-id="${i.id}">
              <td>${esc(i.nombre)}</td>
              <td>${esc(i.documento)}</td>
              <td>${esc(i.email)}</td>
              <td>${esc(i.telefono)}</td>
              <td>${i.activo ? 'Sí' : 'No'}</td>
              <td>${canAbm ? `<button type="button" class="btn-editar btn-editar-intermediario" data-id="${i.id}"><span class="btn-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>Editar</button>` : ''}</td>
            </tr>`
        )
        .join('');
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

function setupVistasMenu() {
  const views = [
    ['menu-inicio', 'vista-inicio', 'Panel de Control'],
    ['menu-ordenes', 'vista-ordenes', 'Órdenes'],
    ['menu-cajas', 'vista-cajas', 'Cajas'],
    ['menu-clientes', 'vista-clientes', 'Clientes'],
    ['menu-intermediarios', 'vista-intermediarios', 'Intermediarios'],
    ['menu-cuenta-corriente', 'vista-cuenta-corriente', 'Cuenta corriente'],
    ['menu-seguridad', 'vista-seguridad', 'Seguridad'],
  ];
  views.forEach(([menuId, vistaId, title]) => {
    const menuEl = document.getElementById(menuId);
    if (!menuEl) return;
    menuEl.addEventListener('click', (e) => {
      e.preventDefault();
      showView(vistaId, title);
    });
  });
}

function onSessionReady(session) {
  currentUserEmail = session.user.email || '';
  currentUserId = session.user.id;
  ensureProfile(session)
    .then(() => client.rpc('get_my_permissions'))
    .then((res) => {
      if (res.error) {
        document.getElementById('login-error').textContent = res.error.message || 'Error al cargar permisos.';
        return;
      }
      userPermissions = res.data || [];
      showAppContent();
      const userEmailEl = document.getElementById('user-email');
      if (userEmailEl) userEmailEl.textContent = currentUserEmail;

      document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
        client.auth.signOut().then(() => showLogin());
      });

      const btnRefresh = document.getElementById('btn-refresh');
      if (btnRefresh) btnRefresh.addEventListener('click', () => refreshPermisosYVista());

      const sidebar = document.getElementById('sidebar');
      const toggle = document.getElementById('sidebar-toggle');
      if (localStorage.getItem(SIDEBAR_KEY) === '1') sidebar.classList.add('expanded');
      if (toggle) {
        toggle.addEventListener('click', () => {
          sidebar.classList.toggle('expanded');
          localStorage.setItem(SIDEBAR_KEY, sidebar.classList.contains('expanded') ? '1' : '0');
        });
      }

      setupVistasMenu();
      setupPanelControl();
      setupModalCliente();
      setupModalIntermediario();
      setupModalOrden();
      setupModalTransacciones();
      setupModalTransaccion();
      setupModalMovimientoCaja();
      setupModalTipoMovimientoCaja();
      setupCajasToggle();
      setupCuentaCorriente();
      setupModalMovimientoCc();
      setupHelpPopovers();
      showView('vista-inicio', 'Panel de Control');
    });
}

/** Iconos de ayuda: al hacer clic en .help-icon-btn se muestra/oculta el .help-popover; clic fuera cierra. */
function setupHelpPopovers() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.help-icon-btn');
    if (btn) {
      e.preventDefault();
      const popover = btn.parentElement?.querySelector('.help-popover');
      const wasVisible = popover?.classList.contains('help-popover-visible');
      document.querySelectorAll('.help-popover-visible').forEach((p) => p.classList.remove('help-popover-visible'));
      if (popover && !wasVisible) popover.classList.add('help-popover-visible');
      return;
    }
    if (!e.target.closest('.help-popover')) document.querySelectorAll('.help-popover-visible').forEach((p) => p.classList.remove('help-popover-visible'));
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
