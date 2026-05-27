import { useEffect, useRef } from 'react';

export default function ScrollProgress() {
  const barRef = useRef(null);

  useEffect(() => {
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const pct = scrollTop / (scrollHeight - clientHeight);
      if (barRef.current) barRef.current.style.transform = `scaleX(${pct})`;
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 2,
      zIndex: 9997, background: 'transparent', pointerEvents: 'none',
    }}>
      <div ref={barRef} style={{
        height: '100%', transformOrigin: 'left',
        background: 'linear-gradient(to right, var(--gold), var(--gold-light))',
        transform: 'scaleX(0)',
      }} />
    </div>
  );
}
