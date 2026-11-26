import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// Cloudflare Turnstile for the homepage's Visa Advisor trial (docs/plans/public-visa-advisor-trial.md,
// VA.1/VA.2b). The script loads only when the trial sheet first opens, never on the rest of the site.
//
// `appearance: 'interaction-only'`: most visitors never see anything; Cloudflare shows a checkbox
// in the container only when it wants a visible check. Tokens are single-use, so the sheet calls
// reset() after each check.
//
// VITE_TURNSTILE_SITE_KEY is public. For local dev and Preview, Cloudflare's always-pass test key
// is 1x00000000000000000000AA.

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Turnstile did not load'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export const turnstileSiteKey = (): string | undefined => import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;

/**
 * Renders a Turnstile widget into `containerRef` once `active` is true. Returns the current token
 * (null until Cloudflare issues one), whether it failed, and reset() for after each use.
 */
export function useTurnstile(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const widgetId = useRef<string | null>(null);

  // One widget per opening: rendered when `active` turns true, removed when it turns false (the
  // sheet unmounts its container on close, so an old widget id would point at nothing).
  useEffect(() => {
    const siteKey = turnstileSiteKey();
    if (!active || !siteKey) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current || widgetId.current) return;
        widgetId.current = api.render(containerRef.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          theme: 'light',
          callback: (t: string) => {
            setToken(t);
            setFailed(false);
          },
          'expired-callback': () => setToken(null),
          'error-callback': () => {
            setToken(null);
            setFailed(true);
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      setToken(null);
    };
  }, [active, containerRef]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  return { token, failed, reset };
}
