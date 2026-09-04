import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminLogin.css';

// "Continue with Google" used to sit above the email form. It was a dead
// button: Supabase's auth settings for this project have google disabled
// (only the email provider is enabled), so clicking it could only ever
// return "provider is not enabled". Removed rather than left as a trap —
// along with its divider, icon and loading state.
export default function AdminLogin() {
  const { login }             = useAuth();
  const navigate              = useNavigate();
  const [email,   setEmail]   = useState('');
  const [pwd,     setPwd]     = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="admin-login">
      <div className="admin-login__card card">
        <span className="admin-login__brand">Kamili</span>
        <h1 className="admin-login__title">Admin</h1>
        <p className="admin-login__sub">Sign in to manage your store.</p>

        <form className="admin-login__form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@kamili.co.ke"
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="admin-login__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <Link to="/" className="admin-login__back">
          <span aria-hidden="true">←</span> Back to store
        </Link>
      </div>
    </div>
  );
}
