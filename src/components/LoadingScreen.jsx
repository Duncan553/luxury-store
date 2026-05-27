import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './LoadingScreen.css';

export default function LoadingScreen({ onComplete }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 700);
    }, 2000);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div className="ls"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}>

          <motion.p className="ls__eyebrow"
            initial={{ opacity: 0, letterSpacing: '0.6em' }}
            animate={{ opacity: 1, letterSpacing: '0.3em' }}
            transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}>
            Nairobi · Est. 2024
          </motion.p>

          <motion.h1 className="ls__logo"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}>
            KAMILI
          </motion.h1>

          <div className="ls__line-wrap">
            <motion.div className="ls__line"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1], delay: 0.7 }} />
          </div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
