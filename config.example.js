// CONFIGURACIÓN DE EJEMPLO - Copia este archivo a config.js y rellena con tus valores reales
// DO NOT commit config.js to git - it contains sensitive credentials

window.APP_CONFIG = {
  // Tu URL de Supabase Edge Function para admin login
  // Formato: https://[PROJECT_REF].supabase.co/functions/v1/admin-login
  AUTH_LOGIN_URL: "https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-login",
  
  // Tu clave anónima de Supabase (anon key)
  // Encuentra esto en: Supabase Dashboard → Settings → API → anon key
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY_HERE",
};
