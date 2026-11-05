import { useState, type ReactNode } from 'react';
import { Info, Moon, Palette, Search, Sun, User, type LucideIcon } from 'lucide-react';
import { GatewayAccount } from '@/components/dialogs/gateway-account';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dark: boolean;
  onSetDark: (dark: boolean) => void;
  engineLabel?: string;
  enginePath?: string;
  onReconnect?: () => void;
  /** The gateway sign-in changed, so the engine has to restart to pick it up. */
  onGatewayChanged?: () => void;
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface Section {
  id: string;
  label: string;
  icon: LucideIcon;
  render: (
    props: Pick<
      SettingsDialogProps,
      'dark' | 'onSetDark' | 'engineLabel' | 'enginePath' | 'onReconnect' | 'onGatewayChanged'
    >,
  ) => ReactNode;
}

const sections: Section[] = [
  {
    id: 'account',
    label: 'Account',
    icon: User,
    render: ({ onGatewayChanged }) => <GatewayAccount onChanged={onGatewayChanged} />,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    render: ({ dark, onSetDark }) => (
      <SettingRow label="Theme" description="เลือกโหมดสีของแอป">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          <Button variant={dark ? 'ghost' : 'outline'} size="sm" aria-pressed={!dark} onClick={() => onSetDark(false)}>
            <Sun aria-hidden="true" />
            Light
          </Button>
          <Button variant={dark ? 'outline' : 'ghost'} size="sm" aria-pressed={dark} onClick={() => onSetDark(true)}>
            <Moon aria-hidden="true" />
            Dark
          </Button>
        </div>
      </SettingRow>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: Info,
    render: ({ engineLabel, enginePath, onReconnect }) => (
      <>
        <SettingRow label="Version" description="เวอร์ชันของ Friday UI">
          <span className="text-sm text-muted-foreground">0.1.0</span>
        </SettingRow>
        <SettingRow label="Codex engine" description={enginePath || 'ใช้ login และ configuration ของ Codex ในเครื่อง'}>
          <span className="text-sm text-muted-foreground">{engineLabel || 'Not connected'}</span>
          {onReconnect && (
            <Button className="ml-2" variant="outline" size="sm" onClick={onReconnect}>
              Reconnect
            </Button>
          )}
        </SettingRow>
      </>
    ),
  },
];

export function SettingsDialog({
  open,
  onOpenChange,
  dark,
  onSetDark,
  engineLabel,
  enginePath,
  onReconnect,
  onGatewayChanged,
}: SettingsDialogProps) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(sections[0].id);
  const visible = sections.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const active = sections.find(item => item.id === activeId) ?? sections[0];

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="h-[min(80vh,640px)] max-w-4xl gap-0 overflow-hidden">
        <div className="border-b px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">การตั้งค่าของ Friday</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Settings sections" className="flex w-56 shrink-0 flex-col gap-1 border-r p-3">
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search settings"
                className="pl-8"
              />
            </div>
            {visible.map(item => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === active.id ? 'page' : undefined}
                onClick={() => setActiveId(item.id)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted ${item.id === active.id ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            ))}
            {visible.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">ไม่พบการตั้งค่า</p>}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            <h2 className="mb-2 text-base font-semibold">{active.label}</h2>
            {active.render({ dark, onSetDark, engineLabel, enginePath, onReconnect, onGatewayChanged })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
