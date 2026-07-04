// supabase/functions/gestionar-usuario/index.ts
//
// Gestiona usuarios (editar perfil, correo, contraseña, eliminar) con permisos de servidor.
// Solo un admin_sistema (cualquier clínica) o un admin_clinica (SU propia clínica) puede usarla.
//
// Deploy: supabase functions deploy gestionar-usuario --no-verify-jwt
// No requiere secrets extra: SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY
// ya vienen inyectados automáticamente en toda Edge Function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY          = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Roles que la UI puede asignar (nunca admin_sistema desde aquí)
const ROLES_PERMITIDOS = ["admin_clinica", "odontologo", "asistente", "recepcion"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "Método no permitido" }, 405);

  try {
    // Cliente con service_role: ignora RLS y puede tocar Auth
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) ¿Quién llama? (validar sesión con el token del usuario)
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authErr } = await asUser.auth.getUser();
    if (authErr || !caller) return json({ error: "No autorizado" }, 401);

    // 2) Perfil del que llama
    const { data: callerPerfil } = await admin
      .from("perfiles").select("rol, clinica_id").eq("id", caller.id).single();
    if (!callerPerfil) return json({ error: "Perfil del solicitante no encontrado" }, 403);

    const esAdminSistema = callerPerfil.rol === "admin_sistema";
    const esAdminClinica = callerPerfil.rol === "admin_clinica";
    if (!esAdminSistema && !esAdminClinica) {
      return json({ error: "No tienes permisos para gestionar usuarios" }, 403);
    }

    // 3) Payload
    const { action, userId, fields } = await req.json();
    if (!action || !userId) return json({ error: "Faltan campos: action, userId" }, 400);

    // 4) Perfil objetivo + verificación de alcance
    const { data: target } = await admin
      .from("perfiles").select("id, rol, clinica_id, email").eq("id", userId).single();
    if (!target) return json({ error: "Usuario objetivo no encontrado" }, 404);

    // Nadie edita a un admin_sistema desde aquí (protección)
    if (target.rol === "admin_sistema") {
      return json({ error: "No se puede modificar a un administrador de sistema" }, 403);
    }
    // Un admin_clinica solo puede tocar usuarios de SU propia clínica
    if (esAdminClinica && target.clinica_id !== callerPerfil.clinica_id) {
      return json({ error: "Solo puedes gestionar usuarios de tu propia clínica" }, 403);
    }
    // Nadie se elimina/edita a sí mismo por esta vía (evita quedar fuera)
    if (userId === caller.id && (action === "delete" || action === "update_rol")) {
      return json({ error: "No puedes eliminar ni cambiar tu propio rol aquí" }, 400);
    }

    // 5) Acciones
    if (action === "update") {
      const f = fields || {};
      const patch: Record<string, unknown> = {};
      if (typeof f.nombre === "string")            patch.nombre = f.nombre.trim();
      if (typeof f.activo === "boolean")           patch.activo = f.activo;
      if (f.medico_id !== undefined)               patch.medico_id = f.medico_id;
      if (Array.isArray(f.consultorios_ids))       patch.consultorios_ids = f.consultorios_ids;
      if (f.permisos !== undefined)                patch.permisos = f.permisos;
      if (typeof f.rol === "string") {
        if (!ROLES_PERMITIDOS.includes(f.rol)) return json({ error: "Rol no válido" }, 400);
        patch.rol = f.rol;
      }
      if (!Object.keys(patch).length) return json({ error: "Nada que actualizar" }, 400);
      const { error } = await admin.from("perfiles").update(patch).eq("id", userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "update_email") {
      const email = (fields?.email || "").trim();
      if (!email) return json({ error: "Correo requerido" }, 400);
      // Cambia el correo en Auth (confirmado) y lo refleja en el perfil
      const { error: e1 } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (e1) return json({ error: e1.message }, 400);
      await admin.from("perfiles").update({ email }).eq("id", userId);
      return json({ ok: true });
    }

    if (action === "set_password") {
      const password = fields?.password || "";
      if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      // Primero el perfil, luego el usuario de Auth
      const { error: eP } = await admin.from("perfiles").delete().eq("id", userId);
      if (eP) {
        return json({
          error: "No se pudo eliminar: el usuario tiene registros asociados (pagos, citas, etc.). " +
                 "Te recomendamos DESACTIVARLO en lugar de eliminarlo.",
          detail: eP.message,
        }, 409);
      }
      const { error: eA } = await admin.auth.admin.deleteUser(userId);
      if (eA) return json({ error: eA.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Acción no reconocida: " + action }, 400);
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
