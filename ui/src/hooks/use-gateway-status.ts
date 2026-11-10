import { useEffect, useState } from 'react';
import { CHANGED, gatewayStatus, type GatewayStatus } from '@/lib/gateway';

/** Who is signed in to the company gateway, kept current after a sign-in or sign-out. */
export function useGatewayStatus(): GatewayStatus {
  const [status, setStatus] = useState<GatewayStatus>({ signedIn: false });
  useEffect(() => {
    const read = () => void gatewayStatus().then(setStatus, () => setStatus({ signedIn: false }));
    read();
    window.addEventListener(CHANGED, read);
    return () => window.removeEventListener(CHANGED, read);
  }, []);
  return status;
}
