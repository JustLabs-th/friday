import { useEffect, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gatewayLogin, gatewayLogout, gatewayRefreshProfile, gatewayStatus, type GatewayProfile, type GatewayStatus } from '@/lib/gateway';

/** The person's details as rows (only the ones the directory sent). */
function profileRows(profile: GatewayProfile, username?: string | null): [string, string][] {
  const rows: [string, string][] = [
    ['Name', profile.name],
    ['Employee ID', profile.employeeId || username || ''],
    ['Email', profile.email],
    ['Factory', profile.factory],
    ['Section', profile.section],
    ['Department', profile.department],
    ['Groups', profile.groups.join(', ')],
    ['Roles', profile.roles.join(', ')],
  ];
  return rows.filter(([, value]) => value.trim() !== '');
}

/** The signed-in person's details, or a hint to sign in again when this sign-in did not keep them. */
export function ProfileDetails({ status, onLoad, loading = false }: { status: GatewayStatus | null; onLoad?: () => void; loading?: boolean }) {
  return (
    <div className="mt-3 rounded-lg border">
      {status?.profile ? (
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
          {profileRows(status.profile, status.username).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            This sign-in did not keep your details (name, employee ID, section, groups).
          </p>
          {onLoad && (
            <Button variant="outline" size="sm" disabled={loading} onClick={onLoad} className="shrink-0">
              {loading ? 'Waiting for the browser…' : 'Load my details'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The Account section of Settings: sign in to the company LLM gateway with SSO. */
export function GatewayAccount({ onChanged }: { onChanged?: () => void }) {
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
      onChanged?.();
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
              ? `เข้าสู่ระบบแล้ว${status?.displayName || status?.username ? ` ในชื่อ ${status.displayName || status.username}` : ''}`
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
      {signedIn && <ProfileDetails status={status} loading={busy} onLoad={() => void run(gatewayRefreshProfile)} />}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {!signedIn && (
        <p className="mt-2 text-xs text-muted-foreground">
          ครั้งแรก Windows อาจถามให้ยืนยันใบรับรองของบริษัท ให้กด Yes เพื่อให้เบราว์เซอร์ไม่ขึ้นคำเตือน
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        การออก key ใหม่จะทำให้ key เดิมของคุณในแอปอื่น (เช่น meshroom-ai) ใช้ไม่ได้ ต้องล็อกอินแอปนั้นใหม่
      </p>
    </div>
  );
}
