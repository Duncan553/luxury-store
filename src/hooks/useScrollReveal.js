import { useEffect, useRef } from 'react';

export function useScrollReveal(selector = '.reveal') {
  const ref = useRef(null);
  useEffect(() => {
    const targets = ref.current
      ? ref.current.querySelectorAll(selector)
      : document.querySelectorAll(selector);

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      }),
      { threshold: 0.12 }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [selector]);

  return ref;
}
