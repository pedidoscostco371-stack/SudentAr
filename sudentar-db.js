// ================================================================
// sudentar-db.js  —  Capa de datos Supabase para SudentAr
// Reemplaza las funciones localStorage del index.html
// Pegar este bloque ANTES del cierre </script> del index.html
// ================================================================

// ── CLIENTE SUPABASE (ya inicializado en el guard del <head>) ──
const SB_URL  = 'https://ssfttiwcimzkpbsonzfv.supabase.co';
const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZnR0aXdjaW16a3Bic29uemZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDYyNTAsImV4cCI6MjA5Nzk4MjI1MH0.CgxrnhTl4oIOgCguM5Gnr981yq3L57ExcORbWoPpN9s';
const _sb = window.SB || supabase.createClient(SB_URL, SB_KEY);

let _clinicaId = null;
let _userId    = null;

// ── INICIALIZACIÓN ─────────────────────────────────────────────
// Reemplaza la función init() original
async function init() {
  // 1. Obtener sesión y perfil del usuario
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { window.location.replace('/login'); return; }
  _userId = session.user.id;

  const { data: perfil } = await _sb.from('perfiles').select('*, clinicas(*)').eq('id', _userId).single();
  if (!perfil) { window.location.replace('/login'); return; }

  _clinicaId = perfil.clinica_id;

  // 2. Cargar todos los datos en DB (mantiene compatibilidad con el rendering existente)
  await cargarTodo();

  // 3. Mostrar nombre del usuario en la UI si existe el elemento
  const userEl = document.getElementById('user-nombre');
  if (userEl) userEl.textContent = perfil.nombre || perfil.email;

  // 4. Arrancar UI
  updateLiveDate();
  setInterval(updateLiveDate, 60000);
  renderAll();
}

async function cargarTodo() {
  const [
    { data: pacientes },
    { data: citas },
    { data: pagos },
    { data: medicos },
    { data: clinicas }
  ] = await Promise.all([
    _sb.from('pacientes').select('*').eq('clinica_id', _clinicaId).order('nombre'),
    _sb.from('citas').select('*').eq('clinica_id', _clinicaId).order('fecha').order('hora'),
    _sb.from('pagos').select('*').eq('clinica_id', _clinicaId).order('fecha', { ascending: false }),
    _sb.from('perfiles').select('*').eq('clinica_id', _clinicaId).in('rol', ['odontologo','admin_clinica']).eq('activo', true),
    _sb.from('clinicas').select('*').eq('id', _clinicaId),
  ]);

  // Adaptar estructura para compatibilidad con el rendering existente
  DB.pacientes = (pacientes || []).map(adaptarPaciente);
  DB.citas     = (citas     || []).map(adaptarCita);
  DB.pagos     = (pagos     || []).map(adaptarPago);
  DB.medicos   = (medicos   || []).map(adaptarMedico);
  DB.clinicas  = (clinicas  || []).map(adaptarClinica);
  DB.horarios  = [];
  DB.bloqueos  = [];
}

// ── ADAPTADORES (Supabase → formato esperado por el rendering) ──
function adaptarPaciente(p) {
  return {
    id:               p.id,
    nombre:           p.nombre,
    nacimiento:       p.nacimiento,
    telefono:         p.telefono,
    email:            p.email,
    direccion:        p.direccion,
    emergencia_nombre: p.emergencia_nombre,
    emergencia_tel:   p.emergencia_tel,
    alergias:         p.alergias,
    enfermedades:     p.enfermedades,
    medicamentos:     p.medicamentos,
    grupo_sang:       p.grupo_sang,
    antecedentes:     p.antecedentes,
    motivo:           p.motivo,
    diagnostico:      p.diagnostico,
    tipo:             p.tipo || 'eventual',
    tratamiento:      p.tratamiento,
    costo_total:      Number(p.costo_total) || 0,
    proxima_cita:     p.proxima_cita,
    hora_cita:        p.hora_cita,
    notas_cita:       p.notas_cita,
    curp:             p.curp,
    cie10:            p.cie10,
    odontograma:      {},
    radiografias:     [],
    notasClinicas:    [],
    creado:           p.creado_en ? p.creado_en.split('T')[0] : '',
    _sbId:            p.id,    // guardar ID original de Supabase
  };
}

function adaptarCita(c) {
  return {
    id:          c.id,
    paciente_id: c.paciente_id,
    consultorio: c.clinica_id,   // mapear clinica_id a consultorio para compatibilidad
    medico_id:   c.medico_id,
    fecha:       c.fecha,
    hora:        c.hora ? c.hora.substring(0,5) : '09:00',
    tipo:        c.tipo || 'consulta',
    duracion:    c.duracion || 60,
    notas:       c.notas,
    estado:      c.estado || 'pendiente',
    confirmacion: c.estado === 'confirmada' ? 'confirmado' : '',
    historial:   [],
    _sbId:       c.id,
  };
}

function adaptarPago(p) {
  return {
    id:          p.id,
    paciente_id: p.paciente_id,
    tipo:        p.tipo || 'visita',
    monto:       Number(p.monto) || 0,
    fecha:       p.fecha,
    forma_pago:  p.forma_pago || 'efectivo',
    concepto:    p.concepto,
    servicio:    p.servicio,
    notas:       p.notas,
    _sbId:       p.id,
  };
}

function adaptarMedico(m) {
  return {
    id:          m.id,
    nombre:      m.nombre,
    especialidad: m.especialidad,
    telefono:    m.telefono,
    color:       m.color || '#7B52CC',
    _sbId:       m.id,
  };
}

function adaptarClinica(c) {
  return {
    id:          c.id,
    nombre:      c.nombre,
    razon_social: c.razon_social,
    rfc:         c.rfc,
    direccion:   c.direccion,
    telefono:    c.telefono,
    email:       c.email,
    responsable: c.responsable,
    color:       c.color || '#3BBFBF',
    _sbId:       c.id,
  };
}

// ── SAVE (ahora no hace nada — cada operación guarda directamente) ──
function save() {
  // No-op: en la versión Supabase cada función guarda directamente
  // Se mantiene para compatibilidad con código que llama save()
}

// ── GUARDAR PACIENTE NUEVO ─────────────────────────────────────
const _origGuardarPaciente = window.guardarPaciente;
async function guardarPaciente() {
  const nombre = document.getElementById('np-nombre')?.value?.trim();
  if (!nombre) return showToast('⚠️ El nombre es obligatorio');

  const payload = {
    clinica_id:        _clinicaId,
    nombre:            nombre,
    nacimiento:        document.getElementById('np-nacimiento')?.value || null,
    telefono:          document.getElementById('np-telefono')?.value || null,
    email:             document.getElementById('np-email')?.value || null,
    direccion:         document.getElementById('np-direccion')?.value || null,
    emergencia_nombre: document.getElementById('np-emergencia')?.value || null,
    emergencia_tel:    document.getElementById('np-emergencia-tel')?.value || null,
    alergias:          document.getElementById('np-alergias')?.value || null,
    enfermedades:      document.getElementById('np-enfermedades')?.value || null,
    medicamentos:      document.getElementById('np-medicamentos')?.value || null,
    grupo_sang:        document.getElementById('np-grupo-sang')?.value || null,
    antecedentes:      document.getElementById('np-antecedentes')?.value || null,
    motivo:            document.getElementById('np-motivo')?.value || null,
    diagnostico:       document.getElementById('np-diagnostico')?.value || null,
    tipo:              document.getElementById('np-tipo')?.value || 'eventual',
    tratamiento:       document.getElementById('np-tratamiento')?.value || null,
    costo_total:       parseFloat(document.getElementById('np-costo')?.value) || 0,
    proxima_cita:      document.getElementById('np-proxima-cita')?.value || null,
    hora_cita:         document.getElementById('np-hora-cita')?.value || null,
    notas_cita:        document.getElementById('np-notas-cita')?.value || null,
    creado_por:        _userId,
  };

  const { data, error } = await _sb.from('pacientes').insert(payload).select().single();
  if (error) { showToast('❌ Error al guardar: ' + error.message); return; }

  DB.pacientes.push(adaptarPaciente(data));
  closeModal('modal-nuevo-paciente');
  renderAll();
  showToast('✅ Paciente registrado');
  verPaciente(data.id);
}

// ── GUARDAR EDICIÓN DE PACIENTE ────────────────────────────────
async function guardarEdicion() {
  const pac = getPaciente(editingPacienteId);
  if (!pac) return;

  const payload = {
    nombre:            document.getElementById('edit-nombre').value,
    nacimiento:        document.getElementById('edit-nacimiento').value || null,
    telefono:          document.getElementById('edit-telefono').value || null,
    email:             document.getElementById('edit-email').value || null,
    direccion:         document.getElementById('edit-direccion').value || null,
    emergencia_nombre: document.getElementById('edit-emergencia').value || null,
    emergencia_tel:    document.getElementById('edit-emergencia-tel').value || null,
    motivo:            document.getElementById('edit-motivo').value || null,
    alergias:          document.getElementById('edit-alergias').value || null,
    enfermedades:      document.getElementById('edit-enfermedades').value || null,
    medicamentos:      document.getElementById('edit-medicamentos').value || null,
    grupo_sang:        document.getElementById('edit-grupo-sang').value || null,
    antecedentes:      document.getElementById('edit-antecedentes').value || null,
    diagnostico:       document.getElementById('edit-diagnostico').value || null,
    tipo:              document.getElementById('edit-tipo').value,
    tratamiento:       document.getElementById('edit-tratamiento').value || null,
    costo_total:       parseFloat(document.getElementById('edit-costo').value) || 0,
    proxima_cita:      document.getElementById('edit-proxima-cita').value || null,
    hora_cita:         document.getElementById('edit-hora-cita').value || null,
    notas_cita:        document.getElementById('edit-notas-cita').value || null,
  };

  const { error } = await _sb.from('pacientes').update(payload).eq('id', pac._sbId || pac.id);
  if (error) { showToast('❌ Error al actualizar: ' + error.message); return; }

  // Actualizar en memoria
  Object.assign(pac, payload);
  closeModal('modal-editar');
  renderAll();
  showToast('✅ Datos del paciente actualizados');
}

// ── REGISTRAR ABONO ────────────────────────────────────────────
async function registrarAbono() {
  const monto = parseFloat(document.getElementById('abono-monto').value);
  if (!monto || monto <= 0) return alert('Ingresa un monto válido');
  const pac = getPaciente(currentPacienteId);

  const payload = {
    clinica_id:  _clinicaId,
    paciente_id: currentPacienteId,
    tipo:        'abono',
    monto,
    fecha:       document.getElementById('abono-fecha').value || todayStr(),
    forma_pago:  document.getElementById('abono-tipo-pago').value,
    concepto:    `Abono — ${pac.tratamiento || 'Tratamiento'}`,
    notas:       document.getElementById('abono-notas').value,
    creado_por:  _userId,
  };

  const { data, error } = await _sb.from('pagos').insert(payload).select().single();
  if (error) { showToast('❌ Error al registrar abono: ' + error.message); return; }

  DB.pagos.push(adaptarPago(data));
  closeModal('modal-abono');
  renderAll();
  showToast('✅ Abono registrado');
  enviarNotificacionPago(currentPacienteId, monto, payload.forma_pago, payload.concepto);
}

// ── REGISTRAR PAGO VISITA ──────────────────────────────────────
async function registrarPagoVisita() {
  const monto = parseFloat(document.getElementById('visita-monto').value);
  if (!monto || monto <= 0) return alert('Ingresa un monto válido');

  const servicio = document.getElementById('visita-servicio').value;
  const proxima  = document.getElementById('visita-proxima').value;

  const payload = {
    clinica_id:  _clinicaId,
    paciente_id: currentPacienteId,
    tipo:        'visita',
    monto,
    fecha:       todayStr(),
    forma_pago:  document.getElementById('visita-tipo-pago').value,
    concepto:    servicio + (document.getElementById('visita-desc').value ? ' — ' + document.getElementById('visita-desc').value : ''),
    servicio,
    notas:       document.getElementById('visita-notas').value,
    creado_por:  _userId,
  };

  const { data: pagoData, error: pagoErr } = await _sb.from('pagos').insert(payload).select().single();
  if (pagoErr) { showToast('❌ Error: ' + pagoErr.message); return; }
  DB.pagos.push(adaptarPago(pagoData));

  // Crear cita de seguimiento si se especificó próxima fecha
  if (proxima) {
    const citaPayload = {
      clinica_id:  _clinicaId,
      paciente_id: currentPacienteId,
      fecha:       proxima,
      hora:        '09:00',
      tipo:        'limpieza',
      duracion:    45,
      notas:       'Revisión / limpieza',
      estado:      'pendiente',
      creado_por:  _userId,
    };
    const { data: citaData } = await _sb.from('citas').insert(citaPayload).select().single();
    if (citaData) DB.citas.push(adaptarCita(citaData));

    // Actualizar proxima_cita en paciente
    await _sb.from('pacientes').update({ proxima_cita: proxima }).eq('id', currentPacienteId);
    const pac = getPaciente(currentPacienteId);
    if (pac) pac.proxima_cita = proxima;
  }

  closeModal('modal-pago-visita');
  renderAll();
  showToast('✅ Visita y pago registrados');
  enviarNotificacionPago(currentPacienteId, monto, payload.forma_pago, servicio);
}

// ── GUARDAR CITA ───────────────────────────────────────────────
async function guardarCita() {
  const data = getCitaFormData();
  if (!data.paciente_id) return alertField('Selecciona un paciente');
  if (!data.fecha)        return alertField('Ingresa la fecha');
  if (!data.medico_id)    return alertField('El médico tratante es obligatorio');

  // Validación de horario
  const horarioError = ghValidarHorario(data);
  if (horarioError) {
    const ok = confirm(`⚠️ Fuera del horario configurado\n\n${horarioError}\n\n¿Deseas agendar la cita de todos modos?`);
    if (!ok) return;
  }

  // Detectar conflicto
  const conflictos = detectarConflicto(data);
  if (conflictos.length && !data.edit_id) {
    const ok = confirm(`⚠️ Ya existe una cita a las ${data.hora} en este consultorio.\n¿Deseas agendar de todos modos?`);
    if (!ok) return;
  }

  const payload = {
    clinica_id:  _clinicaId,
    paciente_id: data.paciente_id,
    medico_id:   data.medico_id,
    fecha:       data.fecha,
    hora:        data.hora,
    tipo:        data.tipo,
    duracion:    data.duracion,
    notas:       data.notas,
    estado:      'pendiente',
    creado_por:  _userId,
  };

  if (data.edit_id) {
    // Guardar snapshot en historial
    const anterior = DB.citas.find(c => c.id === data.edit_id);
    if (anterior) {
      await _sb.from('citas_historial').insert({
        cita_id:    data.edit_id,
        clinica_id: _clinicaId,
        snapshot:   anterior,
        motivo:     data.motivo_cambio || '',
        cambiado_por: _userId,
      });
    }
    const { error } = await _sb.from('citas').update(payload).eq('id', data.edit_id);
    if (error) { showToast('❌ Error al actualizar cita: ' + error.message); return; }
    // Actualizar en memoria
    const idx = DB.citas.findIndex(c => c.id === data.edit_id);
    if (idx >= 0) DB.citas[idx] = adaptarCita({ ...payload, id: data.edit_id });
    showToast('✅ Cita actualizada');
  } else {
    const { data: citaData, error } = await _sb.from('citas').insert(payload).select().single();
    if (error) { showToast('❌ Error al agendar cita: ' + error.message); return; }
    DB.citas.push(adaptarCita(citaData));
    showToast('✅ Cita agendada');
  }

  closeModal('modal-nueva-cita');
  renderAll();
}

// ── CONFIRMAR CITA ─────────────────────────────────────────────
async function confirmarCita(citaId) {
  const { error } = await _sb.from('citas').update({ estado: 'confirmada' }).eq('id', citaId);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  const c = DB.citas.find(x => x.id === citaId);
  if (c) { c.estado = 'confirmada'; c.confirmacion = 'confirmado'; }
  renderCitasHoy();
  showToast('✅ Cita confirmada');
}

// ── ELIMINAR PACIENTE ──────────────────────────────────────────
async function pacienteEliminar(id) {
  if (!confirm('¿Eliminar este paciente? Esta acción no se puede deshacer.')) return;
  const { error } = await _sb.from('pacientes').delete().eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  DB.pacientes = DB.pacientes.filter(p => p.id !== id);
  closeModal('modal-detalle');
  renderAll();
  showToast('🗑 Paciente eliminado');
}

// ── LOGOUT ─────────────────────────────────────────────────────
async function cerrarSesion() {
  await _sb.auth.signOut();
  window.location.replace('/login');
}

// ── SEED DEMO (desactivado en producción) ─────────────────────
function seedDemo() {
  // No hace nada en producción — los datos vienen de Supabase
  console.log('SudentAr: modo Supabase activo, seedDemo desactivado');
}
