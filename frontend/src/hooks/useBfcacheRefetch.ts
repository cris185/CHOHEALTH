'use client';

import { useEffect } from 'react';

/**
 * Refetch hook complementario al handler de back-navigation que vive en el
 * `<head>` del root layout.
 *
 * El handler del layout cubre el caso "duro": cuando el usuario vuelve con el
 * botón atrás desde una URL externa (Stripe/PayPal), detecta la navegación
 * `back_forward` y fuerza un reload completo. Eso resuelve por sí solo el
 * problema de la vista atascada en loading.
 *
 * Este hook cubre el caso "suave": cuando el navegador SÍ usa el bfcache real
 * (sólo en producción y sin HMR), `pageshow.persisted === true` y la página
 * se restaura sin remontar React. En ese caso el reload del layout también
 * dispara, pero como red de seguridad — y para casos futuros donde queramos
 * refetch sin reload — exponemos un refetch en `pageshow.persisted` y un
 * fallback con `visibilitychange` cuando la navegación es back/forward.
 */
export function useBfcacheRefetch(refetch: () => void) {
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refetch();
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const navEntry = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (navEntry?.type === 'back_forward') refetch();
    };

    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refetch]);
}
