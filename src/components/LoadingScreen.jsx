import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './LoadingScreen.css';

// The splash no longer gates the app (see App.jsx) — it just fades over it.
// Two changes for the customer's benefit:
//   * 2000ms → 900ms. Long enough to read KAMILI, short enough not to annoy.
//   * skipped entirely for the rest of the session, so browsing between
//     categories never replays it.
const SEEN_KEY = 'kamili_splash_seen';

export default function LoadingScreen() {
  const [visible, setVisible] = useState(() => {
    try { return !sessionStorage.getItem(SEEN_KEY); } catch { return true; }
  });

  useEffect(() => {
    if (!visible) return;
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch {}
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
    // Intentionally runs once — `visible` only ever goes true → false here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div className="ls"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}>

          <motion.p className="ls__eyebrow"
            initial={{ opacity: 0, letterSpacing: '0.6em' }}
            animate={{ opacity: 1, letterSpacing: '0.3em' }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.05 }}>
            Nairobi · Est. 2024
          </motion.p>

          {/* Not an <h1>: this is decorative, and the page's real h1 is
              already in the DOM behind it. Two h1s confuse crawlers. */}
          <motion.div className="ls__logo" aria-hidden="true"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.12 }}>
            KAMILI
          </motion.div>

          <div className="ls__line-wrap">
            <motion.div className="ls__line"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1], delay: 0.3 }} />
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
