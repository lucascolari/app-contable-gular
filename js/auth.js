// ============================================================
//  Autenticación — login / logout / sesión / perfil
// ============================================================
import { supabase } from "./db.js";

// Devuelve la sesión actual (o null si no hay nadie logueado)
export async function sesionActual() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

// Iniciar sesión con email + contraseña
export async function entrar(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw error;
  return data.user;
}

// Cerrar sesión
export async function salir() {
  await supabase.auth.signOut();
}

// Trae el perfil (nombre) del usuario logueado.
// Si el usuario está autenticado pero NO es miembro (no está en
// profiles), devuelve null -> lo tratamos como "sin acceso".
export async function perfilActual(uid) {
  // Si nos pasan el uid (de la sesión), evitamos una llamada de red extra.
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    uid = user.id;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, email")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return data; // null si no es miembro
}

// Avisar cuando cambia el estado de login (para refrescar la UI)
export function alCambiarSesion(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}
