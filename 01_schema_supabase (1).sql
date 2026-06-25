-- ============================================================
-- SUDENTAR — SCHEMA SUPABASE
-- Versión: 1.0  |  Fecha: 2025
-- Ejecutar en SQL Editor de Supabase en este orden exacto
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. EXTENSIONES
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- 1. TABLA: clinicas
--    Una fila por consultorio/clínica suscrita a SudentAr
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinicas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  razon_social  TEXT,
  rfc           TEXT,
  direccion     TEXT,
  telefono      TEXT,
  email         TEXT UNIQUE,
  responsable   TEXT,
  color         TEXT DEFAULT '#3BBFBF',
  plan          TEXT NOT NULL DEFAULT 'basico'  CHECK (plan IN ('basico','pro','enterprise')),
  activa        BOOLEAN NOT NULL DEFAULT TRUE,
  max_usuarios  INT NOT NULL DEFAULT 5,
  max_pacientes INT NOT NULL DEFAULT 500,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2. TABLA: perfiles (extiende auth.users de Supabase)
--    Un perfil por usuario; ligado a UNA clínica
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perfiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinica_id   UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  email        TEXT NOT NULL,
  rol          TEXT NOT NULL DEFAULT 'odontologo'
                 CHECK (rol IN ('admin_sistema','admin_clinica','odontologo','recepcion')),
  especialidad TEXT,
  telefono     TEXT,
  color        TEXT DEFAULT '#7B52CC',
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  invitado_por UUID REFERENCES public.perfiles(id),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3. TABLA: pacientes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pacientes (
  id                 BIGSERIAL PRIMARY KEY,
  clinica_id         UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nombre             TEXT NOT NULL,
  nacimiento         DATE,
  telefono           TEXT,
  email              TEXT,
  direccion          TEXT,
  curp               TEXT,

  -- Contacto de emergencia
  emergencia_nombre  TEXT,
  emergencia_tel     TEXT,

  -- Historia clínica NOM-004
  alergias           TEXT,
  enfermedades       TEXT,
  medicamentos       TEXT,
  grupo_sang         TEXT,
  antecedentes       TEXT,

  -- Motivo y diagnóstico
  motivo             TEXT,
  diagnostico        TEXT,
  cie10              TEXT,          -- Código CIE-10 NOM-024
  clues              TEXT,          -- CLUES de la unidad

  -- Tratamiento y finanzas
  tipo               TEXT NOT NULL DEFAULT 'eventual'
                       CHECK (tipo IN ('tratamiento','eventual')),
  tratamiento        TEXT,
  costo_total        NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Consentimiento NOM-004
  consentimiento_firmado    BOOLEAN DEFAULT FALSE,
  consentimiento_fecha      DATE,

  proxima_cita       DATE,
  hora_cita          TIME,
  notas_cita         TEXT,

  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por         UUID REFERENCES public.perfiles(id)
);

-- ─────────────────────────────────────────────────────────────
-- 4. TABLA: citas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.citas (
  id            BIGSERIAL PRIMARY KEY,
  clinica_id    UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id   BIGINT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  medico_id     UUID REFERENCES public.perfiles(id),
  fecha         DATE NOT NULL,
  hora          TIME NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'consulta'
                  CHECK (tipo IN ('consulta','limpieza','tratamiento','ortodoncia','extraccion','endodoncia','cirugia','otro')),
  duracion      INT NOT NULL DEFAULT 60,   -- minutos
  notas         TEXT,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','confirmada','atendida','cancelada','no_asistio')),
  confirmacion  TEXT,
  motivo_cambio TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por    UUID REFERENCES public.perfiles(id)
);

-- Historial de cambios en citas (audit trail)
CREATE TABLE IF NOT EXISTS public.citas_historial (
  id            BIGSERIAL PRIMARY KEY,
  cita_id       BIGINT NOT NULL REFERENCES public.citas(id) ON DELETE CASCADE,
  clinica_id    UUID NOT NULL REFERENCES public.clinicas(id),
  snapshot      JSONB NOT NULL,            -- estado anterior completo
  motivo        TEXT,
  cambiado_por  UUID REFERENCES public.perfiles(id),
  cambiado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 5. TABLA: pagos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos (
  id            BIGSERIAL PRIMARY KEY,
  clinica_id    UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id   BIGINT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'visita'
                  CHECK (tipo IN ('abono','visita','anticipo','descuento')),
  monto         NUMERIC(12,2) NOT NULL,
  forma_pago    TEXT NOT NULL DEFAULT 'efectivo'
                  CHECK (forma_pago IN ('efectivo','transferencia','tarjeta','cheque')),
  concepto      TEXT,
  servicio      TEXT,
  notas         TEXT,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por    UUID REFERENCES public.perfiles(id)
);

-- ─────────────────────────────────────────────────────────────
-- 6. TABLA: odontograma
--    Un registro por diente por paciente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.odontograma (
  id            BIGSERIAL PRIMARY KEY,
  clinica_id    UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id   BIGINT NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  diente        SMALLINT NOT NULL,          -- número FDI (11–48)
  estado        TEXT NOT NULL DEFAULT 'sano'
                  CHECK (estado IN ('sano','caries','obturado','extraccion','corona','implante','puente','fractura','ausente')),
  superficie    TEXT[],                     -- ['vestibular','oclusal', etc.]
  notas         TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por UUID REFERENCES public.perfiles(id),
  UNIQUE (paciente_id, diente)
);

-- ─────────────────────────────────────────────────────────────
-- 7. TABLA: invitaciones (para enviar invitación email a odontólogos)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'odontologo',
  token         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','aceptada','expirada','cancelada')),
  invitado_por  UUID REFERENCES public.perfiles(id),
  expira_en     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 8. TRIGGERS — actualizar updated_at automáticamente
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clinicas_updated
  BEFORE UPDATE ON public.clinicas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_perfiles_updated
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_pacientes_updated
  BEFORE UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_citas_updated
  BEFORE UPDATE ON public.citas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 9. TRIGGER — crear perfil automáticamente al registrar usuario
-- ─────────────────────────────────────────────────────────────
-- (El perfil se inserta vía Edge Function al aceptar invitación;
--  este trigger es de respaldo para el admin de sistema)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Solo crear perfil si ya existe metadata con clinica_id
  IF NEW.raw_user_meta_data->>'clinica_id' IS NOT NULL THEN
    INSERT INTO public.perfiles (id, clinica_id, nombre, email, rol)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'clinica_id')::UUID,
      COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'rol', 'odontologo')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY (RLS)
--     Garantiza que cada clínica VE SOLO SUS DATOS
-- ─────────────────────────────────────────────────────────────

-- Helper: obtener clinica_id del usuario autenticado
CREATE OR REPLACE FUNCTION public.mi_clinica_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT clinica_id FROM public.perfiles WHERE id = auth.uid();
$$;

-- Helper: saber si el usuario es admin de sistema
CREATE OR REPLACE FUNCTION public.es_admin_sistema()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol = 'admin_sistema'
  );
$$;

-- Habilitar RLS en todas las tablas
ALTER TABLE public.clinicas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odontograma    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitaciones   ENABLE ROW LEVEL SECURITY;

-- ── CLINICAS ─────────────────────────────────────────────────
-- Usuarios ven solo su propia clínica; admin_sistema ve todas
CREATE POLICY "clinicas_select" ON public.clinicas FOR SELECT
  USING (
    es_admin_sistema()
    OR id = mi_clinica_id()
  );

CREATE POLICY "clinicas_insert" ON public.clinicas FOR INSERT
  WITH CHECK (es_admin_sistema());

CREATE POLICY "clinicas_update" ON public.clinicas FOR UPDATE
  USING (es_admin_sistema() OR id = mi_clinica_id())
  WITH CHECK (es_admin_sistema() OR id = mi_clinica_id());

-- ── PERFILES ─────────────────────────────────────────────────
CREATE POLICY "perfiles_select" ON public.perfiles FOR SELECT
  USING (
    es_admin_sistema()
    OR clinica_id = mi_clinica_id()
  );

CREATE POLICY "perfiles_insert" ON public.perfiles FOR INSERT
  WITH CHECK (
    es_admin_sistema()
    OR (clinica_id = mi_clinica_id()
        AND EXISTS (
          SELECT 1 FROM public.perfiles
          WHERE id = auth.uid()
          AND rol IN ('admin_sistema','admin_clinica')
        ))
  );

CREATE POLICY "perfiles_update" ON public.perfiles FOR UPDATE
  USING (
    es_admin_sistema()
    OR id = auth.uid()
    OR (clinica_id = mi_clinica_id()
        AND EXISTS (
          SELECT 1 FROM public.perfiles
          WHERE id = auth.uid() AND rol IN ('admin_sistema','admin_clinica')
        ))
  );

-- ── PACIENTES ────────────────────────────────────────────────
CREATE POLICY "pacientes_select" ON public.pacientes FOR SELECT
  USING (es_admin_sistema() OR clinica_id = mi_clinica_id());

CREATE POLICY "pacientes_insert" ON public.pacientes FOR INSERT
  WITH CHECK (clinica_id = mi_clinica_id() OR es_admin_sistema());

CREATE POLICY "pacientes_update" ON public.pacientes FOR UPDATE
  USING (clinica_id = mi_clinica_id() OR es_admin_sistema());

CREATE POLICY "pacientes_delete" ON public.pacientes FOR DELETE
  USING (
    es_admin_sistema()
    OR (clinica_id = mi_clinica_id()
        AND EXISTS (
          SELECT 1 FROM public.perfiles
          WHERE id = auth.uid() AND rol IN ('admin_sistema','admin_clinica')
        ))
  );

-- ── CITAS ────────────────────────────────────────────────────
CREATE POLICY "citas_select"  ON public.citas FOR SELECT
  USING (es_admin_sistema() OR clinica_id = mi_clinica_id());

CREATE POLICY "citas_insert"  ON public.citas FOR INSERT
  WITH CHECK (clinica_id = mi_clinica_id() OR es_admin_sistema());

CREATE POLICY "citas_update"  ON public.citas FOR UPDATE
  USING (clinica_id = mi_clinica_id() OR es_admin_sistema());

CREATE POLICY "citas_delete"  ON public.citas FOR DELETE
  USING (clinica_id = mi_clinica_id() OR es_admin_sistema());

-- ── CITAS HISTORIAL ──────────────────────────────────────────
CREATE POLICY "citas_hist_select" ON public.citas_historial FOR SELECT
  USING (es_admin_sistema() OR clinica_id = mi_clinica_id());

CREATE POLICY "citas_hist_insert" ON public.citas_historial FOR INSERT
  WITH CHECK (clinica_id = mi_clinica_id() OR es_admin_sistema());

-- ── PAGOS ────────────────────────────────────────────────────
CREATE POLICY "pagos_select" ON public.pagos FOR SELECT
  USING (es_admin_sistema() OR clinica_id = mi_clinica_id());

CREATE POLICY "pagos_insert" ON public.pagos FOR INSERT
  WITH CHECK (clinica_id = mi_clinica_id() OR es_admin_sistema());

CREATE POLICY "pagos_update" ON public.pagos FOR UPDATE
  USING (clinica_id = mi_clinica_id() OR es_admin_sistema());

-- ── ODONTOGRAMA ──────────────────────────────────────────────
CREATE POLICY "odonto_select" ON public.odontograma FOR SELECT
  USING (es_admin_sistema() OR clinica_id = mi_clinica_id());

CREATE POLICY "odonto_insert" ON public.odontograma FOR INSERT
  WITH CHECK (clinica_id = mi_clinica_id() OR es_admin_sistema());

CREATE POLICY "odonto_update" ON public.odontograma FOR UPDATE
  USING (clinica_id = mi_clinica_id() OR es_admin_sistema());

-- ── INVITACIONES ─────────────────────────────────────────────
CREATE POLICY "invit_select" ON public.invitaciones FOR SELECT
  USING (
    es_admin_sistema()
    OR clinica_id = mi_clinica_id()
  );

CREATE POLICY "invit_insert" ON public.invitaciones FOR INSERT
  WITH CHECK (
    es_admin_sistema()
    OR (clinica_id = mi_clinica_id()
        AND EXISTS (
          SELECT 1 FROM public.perfiles
          WHERE id = auth.uid() AND rol IN ('admin_sistema','admin_clinica')
        ))
  );

CREATE POLICY "invit_update" ON public.invitaciones FOR UPDATE
  USING (es_admin_sistema() OR clinica_id = mi_clinica_id());

-- ─────────────────────────────────────────────────────────────
-- 11. ÍNDICES DE RENDIMIENTO
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica    ON public.pacientes(clinica_id);
CREATE INDEX IF NOT EXISTS idx_citas_clinica        ON public.citas(clinica_id);
CREATE INDEX IF NOT EXISTS idx_citas_fecha          ON public.citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_paciente       ON public.citas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_clinica        ON public.pagos(clinica_id);
CREATE INDEX IF NOT EXISTS idx_pagos_paciente       ON public.pagos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_clinica     ON public.perfiles(clinica_id);
CREATE INDEX IF NOT EXISTS idx_odonto_paciente      ON public.odontograma(paciente_id);
CREATE INDEX IF NOT EXISTS idx_invit_token          ON public.invitaciones(token);
CREATE INDEX IF NOT EXISTS idx_invit_email          ON public.invitaciones(email);

-- ─────────────────────────────────────────────────────────────
-- 12. DATOS INICIALES: admin de sistema
-- ─────────────────────────────────────────────────────────────
-- NOTA: Ejecuta esto DESPUÉS de crear el usuario admin en
--       Authentication → Users en el dashboard de Supabase.
--       Sustituye el UUID por el generado.
--
-- INSERT INTO public.perfiles (id, clinica_id, nombre, email, rol)
-- VALUES (
--   '<UUID_DEL_ADMIN>',
--   '<UUID_DE_CLINICA_DEMO>',
--   'Andrea Razo',
--   'andrea@sudentarsaas.mx',
--   'admin_sistema'
-- );

-- ─────────────────────────────────────────────────────────────
-- FIN DEL SCHEMA
-- ─────────────────────────────────────────────────────────────
