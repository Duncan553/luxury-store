// B1: Detects Instagram, Facebook, TikTok, and Snapchat in-app browsers.
// These browsers block M-Pesa redirects and sometimes wipe localStorage mid-session.
// The banner prompts the customer to open Chrome before they try to pay and fail.
import { useState } from 'react';
import './InAppBrowserBanner.css';

// Exported separately so it can be tested without rendering the component.
export function isInAppBrowser(ua = navigator.userAgent) {
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|TikTok|Snapchat/i.test(ua);
}

export default function InAppBrowserBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !isInAppBrowser()) return null;

  return (
    <div className="iab-banner" role="alert">
      <span className="iab-banner__text">
        For best experience, tap <strong>•••</strong> → <strong>Open in Chrome</strong>
      </span>
      <button className="iab-banner__close" onClick={() => setDismissed(true)} aria-label="Dismiss">✕</button>
    </div>
  );
}
