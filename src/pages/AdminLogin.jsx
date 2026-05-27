import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminLogin.css';

const GOOGLE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export default function AdminLogin() {
  const { login, loginWithGoogle } = useAuth();
  const navigate                   = useNavigate();
  const [email,   setEmail]        = useState('');
  const [pwd,     setPwd]          = useState('');
  const [error,   setError]        = useState('');
  const [loading, setLoading]      = useState(false);
  const [gLoading, setGLoading]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: authError } = await login(email, pwd);
    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Wrong email or password.'
        : authError.message);
    } else {
      navigate('/admin/dashboard');
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError('');
    setGLoading(true);
    const { error: authError } = await loginWithGoogle();
    if (authError) {
      setError(authError.message);
      setGLoading(false);
    }
    // On success Supabase redirects to /admin/dashboard automatically
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card card">
        <h1 className="admin-login__title">Kamili Admin</h1>
        <p className="admin-login__sub">Sign in to manage your store.</p>

        {/* Google sign-in */}
        <button
          type="button"
          className="btn-google"
          onClick={handleGoogle}
          disabled={gLoading || loading}
        >
          {GOOGLE_ICON}
          {gLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <div className="admin-login__divider">
          <span>or sign in with email</span>
        </div>

        <form className="admin-login__form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@kamili.co.ke"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading || gLoading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
