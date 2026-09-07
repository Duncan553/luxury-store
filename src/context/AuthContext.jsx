import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// C4: comma-separated list of emails that get read-only access.
// Set VITE_ADMIN_READONLY_EMAILS in .env — e.g. "trusted@example.com,backup@example.com".
// These users can VIEW the dashboard but all destructive buttons are hidden.
const READONLY_EMAILS = (import.meta.env.VITE_ADMIN_READONLY_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// ── Session diagnostics ──────────────────────────────────────────────────
// Why this exists: when the dashboard kicks you back to the login page, the
// app itself never decides that. The ONLY way `user` becomes null is
// onAuthStateChange firing with no session, which happens inside
// supabase-js — so from the outside a dying session looks like a silent
// redirect with nothing to read.
//
// This prints one line per auth event with the minute-by-minute truth:
// which event fired, and how long the access token had left. Leave the
// console open on the dashboard; when it logs you out, the last lines say
// whether the token simply expired (no TOKEN_REFRESHED beforehand = the
// refresh never ran) or a refresh was attempted and rejected.
//
// It logs no token and no password — only the event name, the email, and
// the expiry clock. Filter the console with "[auth]".
function authLog(event, session) {
  const exp = session?.expires_at;                      // unix seconds, or undefined
  const left = exp ? Math.round(exp - Date.now() / 1000) : null;
  console.info(
    `[auth] ${new Date().toLocaleTimeString()} ${event}`,
    session
      ? `user=${session.user?.email} token expires in ${Math.floor(left / 60)}m${left % 60}s`
      : 'NO SESSION — this is what sends you back to the login page',
  );
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        authLog('getSession', session);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      authLog(event, session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // True when the logged-in user is in the read-only list.
  // Tabs render destructive buttons conditionally on !isReadOnly.
  const isReadOnly = user
    ? READONLY_EMAILS.includes((user.email || '').toLowerCase())
    : false;

  // loginWithGoogle removed along with the login page's Google button:
  // this project's Supabase auth settings have the google provider
  // disabled (email is the only one enabled), so it could only ever
  // return "provider is not enabled".
  const login  = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const logout = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isReadOnly }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
