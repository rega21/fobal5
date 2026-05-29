(function (global) {
  const SUPABASE_URL = global.APP_CONFIG?.SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = global.APP_CONFIG?.SUPABASE_ANON_KEY || "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("UserAuth: falta SUPABASE_URL o SUPABASE_ANON_KEY en APP_CONFIG");
  }

  const supabaseClient = global.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data?.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function signInWithGoogle() {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) throw error;
  }

  async function signInWithEmail(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUpWithEmail(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  }

  function onAuthStateChange(callback) {
    return supabaseClient.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  }

  global.UserAuth = {
    getSession,
    getUser,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    onAuthStateChange,
  };

  global.SupabaseClient = supabaseClient;
})(window);
