import { useEffect, useRef } from 'react';
import './CustomCursor.css';

export default function CustomCursor() {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);
  const mouse   = useRef({ x: -100, y: -100 });
  const ring    = useRef({ x: -100, y: -100 });
  const raf     = useRef(null);
  const active  = useRef(false);

  useEffect(() => {
    if ('ontouchstart' in window) return;
    document.body.classList.add('has-custom-cursor');

    const move = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
        dotRef.current.style.opacity   = '1';
      }
    };

    const enter = () => { active.current = true;  ringRef.current?.classList.add('cursor-ring--hover'); };
    const leave = () => { active.current = false; ringRef.current?.classList.remove('cursor-ring--hover'); };

    const loop = () => {
      const speed = active.current ? 0.14 : 0.10;
      ring.current.x += (mouse.current.x - ring.current.x) * speed;
      ring.current.y += (mouse.current.y - ring.current.y) * speed;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ring.current.x - 20}px, ${ring.current.y - 20}px)`;
        ringRef.current.style.opacity   = '1';
      }
      raf.current = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', move, { passive: true });
    document.addEventListener('mouseleave', () => {
      if (dotRef.current)  dotRef.current.style.opacity  = '0';
      if (ringRef.current) ringRef.current.style.opacity = '0';
    });

    const bindHover = () => {
      document.querySelectorAll('a, button, [role="button"], .cat-tile, .pcard')
        .forEach(el => { el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave); });
    };
    bindHover();
    const obs = new MutationObserver(bindHover);
    obs.observe(document.body, { childList: true, subtree: true });

    raf.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', move);
      cancelAnimationFrame(raf.current);
      obs.disconnect();
      document.body.classList.remove('has-custom-cursor');
    };
  }, []);

  return (
    <>
      <div ref={dotRef}  className="cursor-dot"  />
      <div ref={ringRef} className="cursor-ring" />
    </>
  );
}
