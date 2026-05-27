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

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setUser(session?.user ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // True when the logged-in user is in the read-only list.
  // Tabs render destructive buttons conditionally on !isReadOnly.
  const isReadOnly = user
    ? READONLY_EMAILS.includes((user.email || '').toLowerCase())
    : false;

  const login          = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const loginWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin/dashboard` },
    });
  const logout = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout, isReadOnly }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
