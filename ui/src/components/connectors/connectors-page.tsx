import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckIcon, Plug, PlusIcon, RefreshCw, Search, Server } from 'lucide-react';
import { BrandIcon, LogoImage, brandFor } from '@/components/connectors/brand-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { codex, type Connector, type McpServer } from '@/lib/codex';
import { giteaLogin, giteaLogout, giteaStatus, type GiteaStatus } from '@/lib/gitea';

const statusLabels: Record<string, string> = {
  connected: 'Connected',
  starting: 'Starting',
  notStarted: 'Not started',
  authenticationRequired: 'Sign-in required',
  failed: 'Failed',
  cancelled: 'Cancelled',
  disabled: 'Disabled',
};

type Tab = 'yours' | 'discover';

/** One connector as a card: icon tile, name, description, who provides it, and what can be done. */
function Card({
  icon,
  name,
  description,
  by,
  action,
  note,
}: {
  icon: ReactNode;
  name: string;
  description: string;
  by: string;
  action: ReactNode;
  note?: string;
}) {
  return (
    <li className="flex items-start gap-4 rounded-xl border p-4">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold">{name}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">by {by}</p>
        {note && <p className="mt-1 text-xs text-destructive">{note}</p>}
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{count}</span>
      </h2>
      <ul className="grid gap-3 md:grid-cols-2">{children}</ul>
    </section>
  );
}

/** Everything Friday can connect to: the company Git server, MCP servers and the engine's connectors. */
export function ConnectorsPage({ engineReady }: { engineReady: boolean }) {
  const [tab, setTab] = useState<Tab>('yours');
  const [query, setQuery] = useState('');
  const [gitea, setGitea] = useState<GiteaStatus | null>(null);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [apps, setApps] = useState<Connector[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadEngine = useCallback(async (reload: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (reload) await codex.reloadMcp();
      setServers(await codex.mcpServers());
      // Connectors need a ChatGPT account; with only the company gateway there may be none.
      setApps(await codex.connectors().catch(() => []));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void giteaStatus().then(setGitea, () => setGitea({ signedIn: false }));
  }, []);
  useEffect(() => {
    if (engineReady) void loadEngine(false);
  }, [engineReady, loadEngine]);

  async function giteaAction(action: () => Promise<GiteaStatus>) {
    setBusy(true);
    setError('');
    try {
      setGitea(await action());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const match = (...parts: (string | undefined)[]) =>
    !needle || parts.some(part => part?.toLowerCase().includes(needle));
  const giteaVisible = match('gitea', 'git', 'repo', 'pull request');
  const giteaIn = gitea?.signedIn === true;
  const giteaName = gitea?.displayName || gitea?.username;

  const yoursServers = useMemo(
    () =>
      servers.filter(
        server => !needle || [server.name, server.origin].some(part => part?.toLowerCase().includes(needle)),
      ),
    [servers, needle],
  );
  const yoursApps = useMemo(
    () => apps.filter(app => !needle || [app.name, app.description].some(part => part?.toLowerCase().includes(needle))),
    [apps, needle],
  );

  const giteaCard = (
    <Card
      key="gitea"
      icon={<BrandIcon brand={brandFor('gitea')} fallback={<Plug className="size-6" aria-hidden="true" />} />}
      name="Gitea"
      description={
        giteaIn
          ? `เข้าสู่ระบบแล้ว${giteaName ? ` ในชื่อ ${giteaName}` : ''} ใช้ repo และ pull request ของบริษัท`
          : 'เข้าสู่ระบบ Git server ของบริษัทด้วย SSO เพื่อใช้ repo และ pull request'
      }
      by={gitea?.url?.replace(/^https:\/\//, '') ?? 'บริษัท'}
      action={
        giteaIn ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void giteaAction(giteaLogout)}>
              ออกจากระบบ
            </Button>
            <span className="flex size-8 items-center justify-center text-green-600" title="Connected">
              <CheckIcon className="size-4" aria-hidden="true" />
            </span>
          </div>
        ) : (
          <Button
            variant="outline"
            size="icon"
            aria-label="Connect Gitea"
            title="Connect Gitea"
            disabled={busy || gitea === null}
            onClick={() => void giteaAction(giteaLogin)}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        )
      }
    />
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6 lg:p-10">
        <header className="space-y-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
              <Plug className="size-5" aria-hidden="true" />
              <span className="text-xs">INTEGRATIONS</span>
            </div>
            <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
              Connectors
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label="Connectors" className="flex gap-1 rounded-lg bg-muted p-0.5">
              {(['yours', 'discover'] as const).map(id => (
                <Button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  variant={tab === id ? 'outline' : 'ghost'}
                  size="sm"
                  onClick={() => setTab(id)}
                >
                  {id === 'yours' ? 'Yours' : 'Discover'}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search"
                  aria-label="Search connectors"
                  className="w-56 pl-8"
                />
              </div>
              <Button variant="outline" size="sm" disabled={!engineReady || busy} onClick={() => void loadEngine(true)}>
                <RefreshCw aria-hidden="true" />
                โหลดใหม่
              </Button>
            </div>
          </div>
        </header>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {tab === 'yours' ? (
          <>
            {giteaIn && giteaVisible && (
              <Section title="Git" count={1}>
                {giteaCard}
              </Section>
            )}
            <Section title="MCP servers" count={yoursServers.length}>
              {yoursServers.map(server => (
                <Card
                  key={server.name}
                  icon={
                    <BrandIcon
                      brand={brandFor(server.name)}
                      fallback={<Server className="size-6" aria-hidden="true" />}
                    />
                  }
                  name={server.name}
                  description={[server.origin, `${server.toolCount} tools`].filter(Boolean).join(' · ')}
                  by="MCP"
                  note={server.error}
                  action={
                    <Badge variant={server.status === 'failed' ? 'destructive' : 'secondary'}>
                      {statusLabels[server.status] ?? server.status}
                    </Badge>
                  }
                />
              ))}
            </Section>
            {!engineReady ? (
              <p className="text-sm text-muted-foreground">เชื่อมต่อ Liam ก่อนจึงจะเห็น MCP servers และ connectors</p>
            ) : (
              yoursServers.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  ยังไม่มี MCP server ตั้งค่าได้ในไฟล์ config ของ engine แล้วกด “โหลดใหม่”
                </p>
              )
            )}
            {yoursApps.length > 0 && (
              <Section title="Apps" count={yoursApps.length}>
                {yoursApps.map(app => (
                  <Card
                    key={app.id}
                    icon={
                      <LogoImage
                        url={app.logoUrl}
                        name={app.name}
                        fallback={
                          <BrandIcon
                            brand={brandFor(app.name)}
                            fallback={<Plug className="size-6" aria-hidden="true" />}
                          />
                        }
                      />
                    }
                    name={app.name}
                    description={app.description ?? ''}
                    by="Liam"
                    action={
                      <Badge variant="secondary">
                        {!app.enabled ? 'Disabled' : app.connected ? 'Connected' : 'Not connected'}
                      </Badge>
                    }
                  />
                ))}
              </Section>
            )}
          </>
        ) : !giteaIn && giteaVisible ? (
          <Section title="Available connectors" count={1}>
            {giteaCard}
          </Section>
        ) : (
          <p className="text-sm text-muted-foreground">
            {giteaIn ? 'เชื่อมต่อทุกอย่างที่มีให้แล้ว' : 'ไม่พบ connector ที่ค้นหา'}
          </p>
        )}
      </div>
    </div>
  );
}
