# SudentAr — Guía de Despliegue Paso a Paso
## Para: Andrea Razo — IT Manager / Fundadora SudentAr
## Stack: Supabase · GitHub · Vercel

---

## RESUMEN DEL STACK

```
[Usuario / Odontólogo]
        ↓  HTTPS
[Vercel] → SudentAr (HTML/JS estático)
        ↓  API REST
[Supabase]
  ├── Auth (email/password + magic link)
  ├── PostgreSQL (datos, RLS por clínica)
  ├── Storage (archivos, consentimientos)
  └── Edge Functions (invitaciones email)
        ↓  Backups diarios automáticos
[Supabase Backups (PITR en plan Pro)]
```

---

## FASE 1 — SUPABASE: Crear base de datos

### Paso 1.1 — Crear proyecto
1. Entra a https://supabase.com → **New project**
2. Nombre: `sudentar-prod`
3. Contraseña base de datos: genera una segura y guárdala en tu gestor de contraseñas
4. Región: **South America (São Paulo)** — la más cercana a México disponible
5. Plan: **Free** para comenzar → migra a **Pro ($25/mes)** cuando tengas clientes pagantes (el Pro activa backups automáticos diarios y PITR)
6. Clic en **Create new project** — espera ~2 minutos

### Paso 1.2 — Ejecutar schema SQL
1. En el dashboard de Supabase → **SQL Editor** → **New query**
2. Pega el contenido completo del archivo `01_schema_supabase.sql`
3. Clic en **Run** (▶)
4. Verifica en **Table Editor** que aparecen las tablas:
   - `clinicas`, `perfiles`, `pacientes`, `citas`, `citas_historial`, `pagos`, `odontograma`, `invitaciones`
5. Si ves errores, revisa que no haya habido tablas previas: usa **Database → Tables** y elimina las existentes antes de re-ejecutar

### Paso 1.3 — Configurar Authentication
1. **Authentication → Providers → Email** → asegúrate que esté **habilitado**
2. Desactiva "Confirm email" por ahora (lo activas en producción real):
   - **Authentication → Settings → Email Auth** → desactiva "Enable email confirmations"
3. **Authentication → URL Configuration**:
   - Site URL: `https://tu-dominio.vercel.app` (lo agregas después)
   - Redirect URLs: `https://tu-dominio.vercel.app/accept-invite`

### Paso 1.4 — Obtener credenciales de API
1. **Settings → API**
2. Copia y guarda en un lugar seguro:
   - **Project URL**: `https://xxxxxxxx.supabase.co`
   - **anon/public key**: `eyJ...` (esta va en el frontend)
   - **service_role key**: `eyJ...` (esta NUNCA va en el frontend, solo en Edge Functions)

### Paso 1.5 — Crear primera clínica y admin
1. **Authentication → Users → Invite user**
2. Ingresa tu email → **Send invite**
3. Revisa tu correo, acepta la invitación, establece contraseña
4. Copia el UUID que aparece en **Authentication → Users** para tu usuario
5. En **SQL Editor** ejecuta (sustituye los valores):

```sql
-- 1. Crear la clínica demo/admin
INSERT INTO public.clinicas (nombre, email, plan, responsable, max_usuarios, max_pacientes)
VALUES ('SudentAr Admin', 'admin@sudentarsaas.mx', 'enterprise', 'Andrea Razo', 999, 99999)
RETURNING id;
-- Guarda el UUID que devuelve

-- 2. Crear el perfil admin de sistema (sustituye ambos UUIDs)
INSERT INTO public.perfiles (id, clinica_id, nombre, email, rol)
VALUES (
  'UUID-DEL-USUARIO-EN-AUTH',
  'UUID-DE-LA-CLINICA-RECIEN-CREADA',
  'Andrea Razo',
  'admin@sudentarsaas.mx',
  'admin_sistema'
);
```

---

## FASE 2 — GITHUB: Subir el código

### Paso 2.1 — Preparar repositorio local
Tienes el proyecto en GitHub. Organiza la estructura así:

```
sudentar/
├── index.html          ← SudentAr v3 (el HTML migrado a Supabase)
├── admin.html          ← Panel de admin (nuevo)
├── accept-invite.html  ← Página para aceptar invitación por email
├── supabase-client.js  ← Configuración de Supabase
├── .env.example        ← Variables de entorno de ejemplo
└── README.md
```

### Paso 2.2 — Agregar variables de entorno al HTML
En `supabase-client.js` pon:
```javascript
// ESTAS son las únicas credenciales que van en frontend (son públicas)
const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...'; // anon key (NO la service_role)
```

**IMPORTANTE:** La `anon key` es segura de exponer porque el RLS garantiza que cada usuario solo ve sus datos. La `service_role key` NUNCA debe estar en el frontend.

### Paso 2.3 — Commits y push
```bash
git add .
git commit -m "feat: migración a Supabase con RLS multi-clínica"
git push origin main
```

---

## FASE 3 — VERCEL: Deploy automático

### Paso 3.1 — Conectar repositorio
1. Entra a https://vercel.com → **Add New → Project**
2. Importa tu repositorio de GitHub `sudentar`
3. Framework Preset: **Other** (es HTML estático, no necesita build)
4. Output Directory: deja en blanco (la raíz)
5. Clic en **Deploy**

### Paso 3.2 — Variables de entorno en Vercel
*(Opcional para archivos HTML estáticos puros; necesario si usas Edge Functions de Vercel)*
1. **Settings → Environment Variables**
2. Agrega:
   - `SUPABASE_URL` = tu project URL
   - `SUPABASE_ANON_KEY` = tu anon key

### Paso 3.3 — Dominio personalizado (cuando estés lista)
1. **Settings → Domains → Add**
2. Ingresa `app.sudentarsaas.mx` (o el dominio que elijas)
3. Agrega el CNAME en tu proveedor DNS → Vercel te da las instrucciones exactas
4. SSL/HTTPS: Vercel lo configura automáticamente con Let's Encrypt

---

## FASE 4 — INVITACIONES POR EMAIL

### Opción A — Supabase Auth (más simple, recomendada para iniciar)
1. **Authentication → Users → Invite user**
2. Ingresa el email del odontólogo
3. Supabase manda un magic link
4. El odontólogo establece contraseña
5. **Tú** ejecutas en SQL Editor:
```sql
-- Asociar el nuevo usuario a su clínica
INSERT INTO public.perfiles (id, clinica_id, nombre, email, rol)
VALUES (
  'UUID-DEL-NUEVO-USUARIO',
  'UUID-DE-SU-CLINICA',
  'Dr. Nombre Apellido',
  'doctor@clinica.mx',
  'odontologo'
);
```

### Opción B — Sistema de invitaciones propio (panel admin lo maneja)
El panel de admin (`admin.html`) incluye el flujo completo:
1. Admin crea invitación → se inserta en tabla `invitaciones` con token único
2. Supabase manda email automático (configura SMTP propio en **Settings → Auth → SMTP Settings**)
3. Odontólogo hace clic en el link → `accept-invite.html` verifica token → crea cuenta

### Configurar SMTP propio (para producción)
1. **Settings → Auth → SMTP Settings**
2. Usa Gmail con App Password, o preferentemente **Resend.com** (gratis hasta 3k emails/mes):
   - Host: `smtp.resend.com`
   - Port: `465`
   - User: `resend`
   - Password: tu API key de Resend
3. From Address: `no-reply@sudentarsaas.mx`

---

## FASE 5 — BACKUPS Y MONITOREO

### Backups automáticos
| Plan Supabase | Tipo de backup | Retención |
|---|---|---|
| Free | Ninguno (exporta manualmente) | — |
| Pro ($25/mes) | Diarios automáticos | 7 días |
| Pro + PITR | Point-in-Time Recovery | 7 días |

**Recomendación:** Sube a Pro cuando tengas 2+ clientes. Costo se comparte entre clínicas.

### Backup manual mientras estés en Free
Ejecuta esto cada semana en SQL Editor → descarga el resultado:
```sql
-- Exportar todo a JSON (copia y pega resultado)
SELECT json_build_object(
  'clinicas',    (SELECT json_agg(row_to_json(c)) FROM public.clinicas c),
  'pacientes',   (SELECT json_agg(row_to_json(p)) FROM public.pacientes p),
  'citas',       (SELECT json_agg(row_to_json(ci)) FROM public.citas ci),
  'pagos',       (SELECT json_agg(row_to_json(pg)) FROM public.pagos pg)
) AS backup;
```

### Monitoreo
- **Supabase Dashboard → Database → Performance** — queries lentas
- **Vercel → Analytics** — tráfico y errores
- Configura alertas en **Supabase → Settings → Alerts** (email si BD supera 80% de capacidad)

---

## CHECKLIST FINAL ANTES DE DAR ACCESO A CLIENTES

- [ ] Schema SQL ejecutado sin errores
- [ ] RLS activado en todas las tablas (verificar en **Authentication → Policies**)
- [ ] Admin de sistema creado y funcionando
- [ ] Login/logout probado con usuario de prueba
- [ ] Crear clínica de prueba desde panel admin
- [ ] Invitar odontólogo de prueba → verificar que solo ve sus datos
- [ ] Verificar que odontólogo NO puede ver pacientes de otra clínica
- [ ] Dominio con HTTPS activo
- [ ] SMTP configurado (emails de invitación llegan)
- [ ] Backup manual realizado
- [ ] Contratos/NDA firmados antes de datos reales de pacientes

---

## COSTOS ESTIMADOS

| Servicio | Plan | Costo |
|---|---|---|
| Supabase | Free → Pro | $0 → $25/mes USD |
| Vercel | Hobby | $0/mes |
| Dominio (.mx) | — | ~$200/año MXN |
| SMTP (Resend) | Free | $0 (hasta 3k/mes) |
| **Total inicial** | | **~$0–$500 MXN/mes** |

Con 2 clientes en Plan Básico ($399 + IVA c/u) ya cubres costos con amplio margen.
