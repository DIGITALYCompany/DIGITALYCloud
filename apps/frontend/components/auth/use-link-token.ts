import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Reads `?token=` from an email link once (also after client-side navigations), then removes it
 * from the address bar so it doesn't linger in history, screenshots or shared URLs.
 * Pages using it wrap the component in <Suspense> (useSearchParams).
 */
export function useLinkToken({ strip = true }: { strip?: boolean } = {}) {
  const params = useSearchParams();
  const [token] = useState(() => params.get('token'));
  useEffect(() => {
    if (token && strip) window.history.replaceState(null, '', window.location.pathname);
  }, [token, strip]);
  return token;
}
