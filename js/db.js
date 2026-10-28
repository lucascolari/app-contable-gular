// ============================================================
//  Cliente de Supabase (base de datos + auth + storage)
// ============================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configurado =
  SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.startsWith("PEGA_AQUI") &&
  !SUPABASE_ANON_KEY.startsWith("PEGA_AQUI");

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,      // mantiene la sesión al cerrar/abrir la app
        autoRefreshToken: true,    // renueva el token solo
        detectSessionInUrl: false,
        // Lock propio (no-op): evita que getSession se cuelgue por el
        // bloqueo de navigator.locks en algunos navegadores/WebViews.
        lock: async (_name, _acquireTimeout, fn) => await fn()
      }
    })
  : null;
