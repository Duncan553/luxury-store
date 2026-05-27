import { useState } from 'react';
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

function AppShell({ ready }) {
  return (
    <>
      <ScrollProgress />
      {/* B1: shown only in Instagram/FB/TikTok/Snapchat in-app browsers */}
      <InAppBrowserBanner />
      {ready && (
        <>
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
      )}
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <LoadingScreen onComplete={() => setReady(true)} />
          <AppShell ready={ready} />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
