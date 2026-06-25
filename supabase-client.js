// ============================================================
// supabase-client.js
// SudentAr — Cliente Supabase centralizado
// Importar en index.html con: <script src="supabase-client.js">
// ============================================================

// ── CONFIGURACIÓN ──────────────────────────────────────────
// Sustituye estos valores con los de tu proyecto Supabase
const SUPABASE_URL  = 'https://ssfttiwcimzkpbsonzfv.supabase.co/rest/v1/';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZnR0aXdjaW16a3Bic29uemZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDYyNTAsImV4cCI6MjA5Nzk4MjI1MH0.CgxrnhTl4oIOgCguM5Gnr981yq3L57ExcORbWoPpN9s';

// ── CLIENTE ────────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(https://ssfttiwcimzkpbsonzfv.supabase.co/rest/v1/, eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZnR0aXdjaW16a3Bic29uemZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDYyNTAsImV4cCI6MjA5Nzk4MjI1MH0.CgxrnhTl4oIOgCguM5Gnr981yq3L57ExcORbWoPpN9s);

// ── ESTADO GLOBAL ──────────────────────────────────────────
let CLINICA_ID = null;   // UUID de la clínica del usuario actual
let USER_PERFIL = null;  // perfil completo del usuario

// ── AUTH ───────────────────────────────────────────────────

async function sbGetSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function sbLogin(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function sbLogout() {
  await sb.auth.signOut();
}

async function sbCargarPerfil() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('perfiles').select('*, clinicas(*)').eq('id', user.id).single();
  if (data) {
    USER_PERFIL = data;
    CLINICA_ID  = data.clinica_id;
  }
  return data;
}

// ── CLINICAS ───────────────────────────────────────────────

async function sbGetClinicas() {
  const { data, error } = await sb.from('clinicas').select('*').eq('activa', true);
  if (error) throw error;
  return data || [];
}

async function sbGetClinica(id) {
  const { data, error } = await sb.from('clinicas').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ── PACIENTES ──────────────────────────────────────────────

async function sbGetPacientes() {
  const { data, error } = await sb
    .from('pacientes')
    .select('*')
    .eq('clinica_id', CLINICA_ID)
    .order('nombre');
  if (error) throw error;
  return data || [];
}

async function sbGetPaciente(id) {
  const { data, error } = await sb
    .from('pacientes').select('*').eq('id', id).eq('clinica_id', CLINICA_ID).single();
  if (error) throw error;
  return data;
}

async function sbInsertPaciente(payload) {
  const { data, error } = await sb
    .from('pacientes')
    .insert({ ...payload, clinica_id: CLINICA_ID, creado_por: USER_PERFIL?.id })
    .select().single();
  if (error) throw error;
  return data;
}

async function sbUpdatePaciente(id, payload) {
  const { data, error } = await sb
    .from('pacientes').update(payload).eq('id', id).eq('clinica_id', CLINICA_ID)
    .select().single();
  if (error) throw error;
  return data;
}

async function sbDeletePaciente(id) {
  const { error } = await sb
    .from('pacientes').delete().eq('id', id).eq('clinica_id', CLINICA_ID);
  if (error) throw error;
}

// ── CITAS ──────────────────────────────────────────────────

async function sbGetCitas(filtros = {}) {
  let q = sb.from('citas').select('*, pacientes(nombre), perfiles(nombre,color)')
    .eq('clinica_id', CLINICA_ID).order('fecha').order('hora');
  if (filtros.fecha)   q = q.eq('fecha', filtros.fecha);
  if (filtros.medico)  q = q.eq('medico_id', filtros.medico);
  if (filtros.estado)  q = q.eq('estado', filtros.estado);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function sbInsertCita(payload) {
  const { data, error } = await sb
    .from('citas')
    .insert({ ...payload, clinica_id: CLINICA_ID, creado_por: USER_PERFIL?.id })
    .select().single();
  if (error) throw error;
  return data;
}

async function sbUpdateCita(id, payload, motivoCambio) {
  // Guardar snapshot en historial antes de actualizar
  const anterior = await sb.from('citas').select('*').eq('id', id).single();
  if (anterior.data) {
    await sb.from('citas_historial').insert({
      cita_id:     id,
      clinica_id:  CLINICA_ID,
      snapshot:    anterior.data,
      motivo:      motivoCambio || '',
      cambiado_por: USER_PERFIL?.id,
    });
  }
  const { data, error } = await sb
    .from('citas').update(payload).eq('id', id).eq('clinica_id', CLINICA_ID)
    .select().single();
  if (error) throw error;
  return data;
}

async function sbDeleteCita(id) {
  const { error } = await sb.from('citas').delete().eq('id', id).eq('clinica_id', CLINICA_ID);
  if (error) throw error;
}

// ── PAGOS ──────────────────────────────────────────────────

async function sbGetPagos(filtros = {}) {
  let q = sb.from('pagos').select('*, pacientes(nombre)')
    .eq('clinica_id', CLINICA_ID).order('fecha', { ascending: false });
  if (filtros.desde) q = q.gte('fecha', filtros.desde);
  if (filtros.hasta) q = q.lte('fecha', filtros.hasta);
  if (filtros.paciente_id) q = q.eq('paciente_id', filtros.paciente_id);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function sbInsertPago(payload) {
  const { data, error } = await sb
    .from('pagos')
    .insert({ ...payload, clinica_id: CLINICA_ID, creado_por: USER_PERFIL?.id })
    .select().single();
  if (error) throw error;
  return data;
}

// ── MÉDICOS / PERFILES ─────────────────────────────────────

async function sbGetMedicos() {
  const { data, error } = await sb
    .from('perfiles').select('*').eq('clinica_id', CLINICA_ID)
    .in('rol', ['odontologo','admin_clinica']).eq('activo', true);
  if (error) throw error;
  return data || [];
}

// ── ODONTOGRAMA ────────────────────────────────────────────

async function sbGetOdontograma(pacienteId) {
  const { data, error } = await sb
    .from('odontograma').select('*')
    .eq('paciente_id', pacienteId).eq('clinica_id', CLINICA_ID);
  if (error) throw error;
  return data || [];
}

async function sbUpsertDiente(pacienteId, diente, estado, notas) {
  const { data, error } = await sb
    .from('odontograma')
    .upsert({
      clinica_id: CLINICA_ID, paciente_id: pacienteId,
      diente, estado, notas, actualizado_por: USER_PERFIL?.id,
    }, { onConflict: 'paciente_id,diente' })
    .select().single();
  if (error) throw error;
  return data;
}

// ── UTILIDADES ─────────────────────────────────────────────

// Suscribirse a cambios en tiempo real (opcional, para multi-usuario)
function sbSubscribeCitas(callback) {
  return sb.channel('citas_realtime')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'citas',
      filter: `clinica_id=eq.${CLINICA_ID}`
    }, callback)
    .subscribe();
}

// Exportar todo para backup
async function sbExportarDatos() {
  const [pacientes, citas, pagos] = await Promise.all([
    sbGetPacientes(), sbGetCitas(), sbGetPagos(),
  ]);
  return { clinica_id: CLINICA_ID, pacientes, citas, pagos, exportado_en: new Date().toISOString() };
}
