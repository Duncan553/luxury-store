import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

import Navbar               from './components/Navbar';
import Footer               from './components/Footer';
import CartModal            from './components/CartModal';
import LoadingScreen        from './components/LoadingScreen';
import ScrollProgress       from './components/ScrollProgress';
import InAppBrowserBanner   from './components/InAppBrowserBanner';

import Home           from './pages/Home';
import Category       from './pages/Category';
import About          from './pages/About';
import AdminLogin     from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/admin/login" replace />;
}

function AppShell() {
  return (
    <>
      <ScrollProgress />
      {/* B1: shown only in Instagram/FB/TikTok/Snapchat in-app browsers */}
      <InAppBrowserBanner />
      <Navbar />
      <CartModal />
      <main>
        <Routes>
          <Route path="/"               element={<Home />} />
          <Route path="/category/:name" element={<Category />} />
          <Route path="/about"          element={<About />} />
          <Route path="/admin/login"    element={<AdminLogin />} />
          <Route path="/admin/dashboard"
            element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  // The splash used to gate the whole app: nothing — not even the navbar —
  // rendered until it finished, so a first visit was ~2.7s of black screen
  // before any content, and ~4.2s before a tappable CTA. Now the store renders
  // immediately and the splash fades away on top of it (it's position:fixed,
  // z-index 9999), so the animation costs the customer nothing.
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <LoadingScreen />
          <AppShell />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
