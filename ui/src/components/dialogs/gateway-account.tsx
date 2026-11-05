import { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gatewayLogin, gatewayLogout, gatewayStatus, type GatewayStatus } from '@/lib/gateway';

/** The Account section of Settings: sign in to the company LLM gateway with SSO. */
export function GatewayAccount() {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void gatewayStatus().then(setStatus, () => setStatus({ signedIn: false }));
  }, []);

  async function run(action: () => Promise<GatewayStatus>) {
    setBusy(true);
    setError('');
    try {
      setStatus(await action());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  const signedIn = status?.signedIn === true;
  return (
    <div className="border-b py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium">LLM gateway</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {signedIn
              ? `เข้าสู่ระบบแล้ว${status?.username ? ` ในชื่อ ${status.username}` : ''}`
              : 'เข้าสู่ระบบด้วย SSO ของบริษัทเพื่อขอ key สำหรับใช้โมเดลผ่าน gateway'}
          </p>
          {signedIn && status?.expiresAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">key หมดอายุ {status.expiresAt}</p>
          )}
        </div>
        {signedIn ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(gatewayLogout)}>
            <LogOut aria-hidden="true" />
            ออกจากระบบ
          </Button>
        ) : (
          <Button size="sm" disabled={busy || status === null} onClick={() => void run(gatewayLogin)}>
            <LogIn aria-hidden="true" />
            {busy ? 'รอการล็อกอินในเบราว์เซอร์…' : 'Login'}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        การออก key ใหม่จะทำให้ key เดิมของคุณในแอปอื่น (เช่น meshroom-ai) ใช้ไม่ได้ ต้องล็อกอินแอปนั้นใหม่
      </p>
    </div>
  );
}
