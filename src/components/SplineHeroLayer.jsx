// SplineHeroLayer.jsx — real, interactive 3D motion behind the hero
// showcase, built with Spline (spline.design).
//
// IMPORTANT — read before swapping the scene: Spline scenes are authored in
// Spline's own browser-based 3D editor (think Figma, but 3D — objects,
// cameras, lights, physics, all placed visually), not written as code.
// SCENE_URL below points at Spline's own official public demo scene from
// their integration docs — a placeholder that proves the mechanism works,
// not real Kamili art. To put an actual Kamili scene here: open
// https://spline.design (free), build or fork a template (a floating
// object with mouse-follow rotation is a five-minute start), Export ->
// Code Export -> React, copy the "scene" URL it gives you
// (https://prod.spline.design/.../scene.splinecode), and paste it in place
// of SCENE_URL. That's the only line that needs to change.
//
// Why this is deferred rather than loaded like everything else:
// @splinetool/runtime is genuinely heavy — ~35MB unpacked, a live WebGL
// context, real battery/data cost on a phone. The hero is above the fold,
// so an IntersectionObserver ("load when scrolled into view") wouldn't
// defer anything here — it'd fire immediately, same as loading it eagerly.
// The lever that actually matters is TIME: wait until the browser reports
// it's idle after the page's real content has painted, THEN start
// fetching the 3D runtime in the background. If the connection is slow or
// in data-saver mode, or the visitor has asked for reduced motion, skip it
// entirely — the CSS gradient + real product cutouts underneath already
// carry the hero on their own.
import { Suspense, lazy, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const Spline = lazy(() => import('@splinetool/react-spline'));

// Spline's own public "getting started" demo scene — see the note above.
const SCENE_URL = 'https://prod.spline.design/6Wq1Q7YGyM-iab9i/scene.splinecode';

// requestIdleCallback isn't in Safari; fall back to a short timeout so this
// still defers there, just on a timer instead of a real idle signal.
function onIdle(cb) {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(cb, { timeout: 4000 });
  }
  return setTimeout(cb, 1200);
}

function prefersDataSaver() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  return conn.saveData === true || /^(slow-2g|2g)$/.test(conn.effectiveType || '');
}

// Matches the exact breakpoint where Home.css hides .hero__showcase-col
// (display:none). CSS hiding an element does NOT stop React from mounting
// it or running its effects — without this check, a phone would still
// silently fetch the full multi-MB Spline runtime for a layer it can
// never see. Checked once on mount, not on resize: nobody rotates a phone
// into a desktop.
function isNarrowViewport() {
  return !window.matchMedia('(min-width: 1025px)').matches;
}

export default function SplineHeroLayer() {
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduce || prefersDataSaver() || isNarrowViewport()) return;   // never even schedule the load
    const id = onIdle(() => setReady(true));
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id);
      else clearTimeout(id);
    };
  }, [reduce]);

  if (!ready) return null;   // the CSS gradient beneath this carries the hero until then

  return (
    <div className="hshow__spline" aria-hidden="true">
      {/* Suspense fallback stays null too — nothing to show while the chunk
          streams in, the gradient underneath is already doing the job. */}
      <Suspense fallback={null}>
        <Spline scene={SCENE_URL} />
      </Suspense>
    </div>
  );
}
