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
  Promise.all([
    client.from('reglas_de_negocio').select('*').order('tipo_operacion_codigo').order('usa_intermediario'),
    client.from('tipos_operacion').select('codigo, usa_intermediario, moneda_in, moneda_out'),
  ]).then(([rR, rT]) => {
    loadingEl.style.display = 'none';
    wrapEl.style.display = 'block';
    if (rR.error) {
      tbody.innerHTML = '<tr><td colspan="17">Error: ' + escapeHtml(rR.error.message || '') + '</td></tr>';
      return;
    }
    reglasNegocioCacheList = rR.data || [];
    tiposOperacionReglasCache = rT.data || [];
    reglasNegocioRellenarFiltroCodigos();
    renderReglasNegocioTabla();
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

