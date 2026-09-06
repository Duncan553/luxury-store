import { Suspense, lazy, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

import Navbar               from './components/Navbar';
import Footer               from './components/Footer';
import CartModal            from './components/CartModal';
import LoadingScreen        from './components/LoadingScreen';
import ScrollProgress       from './components/ScrollProgress';
import InAppBrowserBanner   from './components/InAppBrowserBanner';

// Home stays a normal import — it's the page almost every visitor lands on
// first, so it should be in the same request as the app shell, not behind
// an extra round-trip. Everything else is lazy: a customer browsing the
// storefront was previously downloading the full admin dashboard's code
// (AdminLogin + AdminDashboard's shell) on their very first page load, even
// though the overwhelming majority of visitors never touch /admin at all.
import Home            from './pages/Home';
const Category         = lazy(() => import('./pages/Category'));
const About            = lazy(() => import('./pages/About'));
const AdminLogin       = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard   = lazy(() => import('./pages/AdminDashboard'));

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/admin/login" replace />;
}

function AppShell() {
  // The storefront chrome must NOT render on admin routes. It was rendering
  // everywhere, so on the dashboard the shop's fixed navbar sat directly on
  // top of the admin header: "KAMILI ADMIN" overlapped the shop's wordmark
  // and the signed-in email disappeared behind the cart badge. The footer
  // and the cart drawer have no business there either — an admin has no
  // cart, and the shop's social links are noise in a management screen.
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  // Reset the scroll position on every route change.
  //
  // A real multi-page site gets this for free: each click builds a brand new
  // document, and a new document starts at scroll 0. An SPA never does that.
  // React Router only swaps which component renders inside <main> — it is the
  // SAME document the whole time, and scroll position belongs to the document,
  // not to the React tree. So a customer who scrolled 2000px down the home page
  // and then tapped "Bags" kept that 2000px: the new page mounted underneath a
  // window that was still parked two screens down, dumping them into the middle
  // (or past the end) of a page they had never seen the top of.
  //
  // navType 'POP' = the browser's back/forward button. Those we deliberately
  // leave alone, so returning to a page puts the customer back where they were
  // instead of at the top — that's what a back button is FOR. Only PUSH and
  // REPLACE (an actual link click) scroll up.
  //
  // useLayoutEffect, not useEffect: layout effects run before the browser
  // paints, so the new page is never drawn at the old offset for a frame. With
  // useEffect you can catch a visible jump on a slow phone.
  const navType = useNavigationType();
  useLayoutEffect(() => {
    if (navType === 'POP') return;
    window.scrollTo(0, 0);
  }, [pathname, navType]);

  return (
    <>
      <ScrollProgress />
      {/* B1: shown only in Instagram/FB/TikTok/Snapchat in-app browsers */}
      {!isAdmin && <InAppBrowserBanner />}
      {!isAdmin && <Navbar />}
      {!isAdmin && <CartModal />}
      <main>
        {/* Blank fallback, not the LoadingScreen splash again — a lazy
            chunk is usually cached and loads in well under 100ms after the
            first visit; re-showing a branded splash on every category
            click would be a regression, not a loading state. */}
        <Suspense fallback={null}>
          <Routes>
            <Route path="/"               element={<Home />} />
            <Route path="/category/:name" element={<Category />} />
            <Route path="/about"          element={<About />} />
            <Route path="/admin/login"    element={<AdminLogin />} />
            <Route path="/admin/dashboard"
              element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
            <Route path="*"              element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!isAdmin && <Footer />}
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
