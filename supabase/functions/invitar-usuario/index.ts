// supabase/functions/invitar-usuario/index.ts
//
// Esta función corre en el servidor (Edge Function), no en el navegador.
// Usa el service_role key para crear el usuario en auth y su perfil,
// sin afectar nunca la sesión del admin que hace la petición.
//
// Despliegue:
//   supabase functions deploy invitar-usuario
//
// Variables de entorno necesarias (ya disponibles por defecto en Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Cliente con permisos de administrador (nunca se expone al navegador)
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  // CORS básico
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    // 1. Verifica que quien llama esté autenticado y sea admin de su clínica.
    //    El cliente (frontend) debe mandar su propio access_token en el header Authorization.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "No autorizado" }, 401);
    }

    const supabaseAsCaller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: callerError } = await supabaseAsCaller.auth.getUser();
    if (callerError || !callerUser) {
      return json({ error: "Sesión inválida" }, 401);
    }

    const { data: callerPerfil, error: callerPerfilError } = await supabaseAdmin
      .from("perfiles")
      .select("rol, clinica_id")
      .eq("id", callerUser.id)
      .single();

    if (callerPerfilError || !callerPerfil) {
      return json({ error: "Perfil del solicitante no encontrado" }, 403);
    }

    if (!["admin_sistema", "admin_clinica"].includes(callerPerfil.rol)) {
      return json({ error: "No tienes permiso para invitar usuarios" }, 403);
    }

    // 2. Lee el body con los datos del nuevo usuario
    const body = await req.json();
    const { nombre, email, rol, medico_id, consultorios_ids, permisos } = body;

    if (!nombre || !email || !rol) {
      return json({ error: "Faltan campos requeridos (nombre, email, rol)" }, 400);
    }

    const ROLES_VALIDOS = ["admin_sistema", "admin_clinica", "odontologo", "recepcion"];
    if (!ROLES_VALIDOS.includes(rol)) {
      return json({ error: "Rol inválido: " + rol }, 400);
    }

    // 3. Revisa si el usuario ya existe en auth (por correo)
    const { data: existingUsers, error: listError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      return json({ error: "Error verificando usuarios existentes: " + listError.message }, 500);
    }
    const existingUser = existingUsers.users.find(u => u.email === email);

    let userId: string;
    let cuentaYaExistia = false;

    if (existingUser) {
      userId = existingUser.id;
      cuentaYaExistia = true;
    } else {
      // 4. Crea el usuario en auth con contraseña temporal, ya confirmado
      //    (no requiere que el usuario confirme email para poder iniciar sesión
      //    luego vía "¿Olvidaste tu contraseña?")
      const tempPassword = "Sudent" + Math.random().toString(36).slice(-10);
      const { data: createdUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        });

      if (createError || !createdUser?.user) {
        return json({ error: "Error al crear cuenta: " + (createError?.message || "desconocido") }, 500);
      }
      userId = createdUser.user.id;
    }

    // 5. Crea o actualiza el perfil (upsert) — usa service_role, así que
    //    no depende de RLS ni de la sesión de quien invita.
    const { error: perfilError } = await supabaseAdmin.from("perfiles").upsert({
      id: userId,
      clinica_id: callerPerfil.clinica_id,
      nombre,
      email,
      rol,
      medico_id: medico_id || null,
      consultorios_ids: consultorios_ids || [],
      permisos: permisos || {},
    });

    if (perfilError) {
      return json({ error: "Cuenta creada pero error al guardar perfil: " + perfilError.message }, 500);
    }

    return json({ ok: true, userId, cuentaYaExistia });
  } catch (err) {
    return json({ error: "Error inesperado: " + (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
