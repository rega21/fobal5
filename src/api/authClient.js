(function (global) {
  const FALLBACK_AUTH_LOGIN_URL = "https://zguqyimgxppglgrblvim.supabase.co/functions/v1/admin-login";
  const FALLBACK_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpndXF5aW1neHBwZ2xncmJsdmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MzY0NzAsImV4cCI6MjA4NjMxMjQ3MH0.DKc0u44Ja2Z3y01MBXS_YwkOG_DK4mrRnAUrT2fJniU";

  function getAuthConfig() {
    return {
      authLoginUrl: global.APP_CONFIG?.AUTH_LOGIN_URL || FALLBACK_AUTH_LOGIN_URL,
      supabaseAnonKey: global.APP_CONFIG?.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
    };
  }

  async function loginAdmin(pin) {
    const { authLoginUrl, supabaseAnonKey } = getAuthConfig();

    if (!authLoginUrl) {
      return {
        ok: false,
        message: "Configura AUTH_LOGIN_URL en src/api/authClient.js",
      };
    }

    if (!supabaseAnonKey) {
      return {
        ok: false,
        message: "Configura SUPABASE_ANON_KEY en src/api/authClient.js",
      };
    }

    try {
      const response = await fetch(authLoginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ pin }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch (e) {
        payload = {};
      }

      if (!response.ok) {
        return {
          ok: false,
          message: payload?.message || "PIN incorrecto",
        };
      }

      return {
        ok: payload?.ok !== false,
        message: payload?.message || "OK",
        token: payload?.token || null,
      };
    } catch (error) {
      console.error("Error login admin:", error);
      return {
        ok: false,
        message: "No se pudo conectar con autenticación",
      };
    }
  }

  global.AuthApi = {
    loginAdmin,
  };
})(window);
