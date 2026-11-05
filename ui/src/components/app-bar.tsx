import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChevronDown, Copy, Ellipsis, FolderOpen, Globe, Menu, Minus, PanelRight, ScanSearch, Code, SquareArrowOutUpRight, SquareTerminal, Square, X, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { Project } from '@/components/new-project-dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface AppBarProps {
  title: string;
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (project: Project) => void;
  onNewProject: () => void;
  canCreateSession: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}

function IconButton({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} {...props} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppBar({
  title,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  canCreateSession,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNewSession,
  onOpenSettings,
}: AppBarProps) {
  const [maximized, setMaximized] = useState(false);
  const [codeView, setCodeView] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    const refresh = () => void win.isMaximized().then(setMaximized);
    refresh();
    const unlisten = win.onResized(refresh);
    return () => void unlisten.then(stop => stop());
  }, []);

  const win = isTauri ? getCurrentWindow() : null;

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 select-none items-center gap-1 border-b bg-background px-2"
    >
      <div className="flex items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />}>
            <Menu aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onNewProject}>New project</DropdownMenuItem>
              <DropdownMenuItem disabled={!canCreateSession} onClick={onNewSession}>New session</DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenSettings}>Settings</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <SidebarTrigger aria-label="Toggle sidebar" title="Toggle sidebar (Ctrl+B)" className="size-8" />
        <IconButton label="Back" disabled={!canGoBack} onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </IconButton>
        <IconButton label="Forward" disabled={!canGoForward} onClick={onForward}>
          <ArrowRight aria-hidden="true" />
        </IconButton>
      </div>

      <div className="ml-1 flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
        <IconButton label="Search" onClick={() => undefined}>
          <ScanSearch aria-hidden="true" />
        </IconButton>
        <IconButton label="Code view" aria-pressed={codeView} className={codeView ? 'bg-muted text-foreground' : ''} onClick={() => setCodeView(v => !v)}>
          <Code aria-hidden="true" />
        </IconButton>
      </div>

      <div className="flex min-w-0 flex-1 justify-center" data-tauri-drag-region>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="max-w-full gap-1 font-medium" aria-label="Choose project" />}>
            <span className="truncate">{title}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Projects</DropdownMenuLabel>
              {projects.length === 0 && <DropdownMenuItem onClick={onNewProject}>สร้าง project ใหม่</DropdownMenuItem>}
              {projects.map(item => (
                <DropdownMenuItem key={item.id} onClick={() => onSelectProject(item)}>
                  <FolderOpen aria-hidden="true" />
                  <span className="truncate">{item.name}</span>
                  {item.id === activeProjectId && <Check className="ml-auto" aria-hidden="true" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-0.5">
        <IconButton label="Terminal" aria-pressed={terminalOpen} className={terminalOpen ? 'bg-muted text-foreground' : ''} onClick={() => setTerminalOpen(v => !v)}>
          <SquareTerminal aria-hidden="true" />
        </IconButton>
        <IconButton label="Right panel" aria-pressed={rightPanelOpen} className={rightPanelOpen ? 'bg-muted text-foreground' : ''} onClick={() => setRightPanelOpen(v => !v)}>
          <PanelRight aria-hidden="true" />
        </IconButton>
        <IconButton label="Open">
          <SquareArrowOutUpRight aria-hidden="true" />
        </IconButton>
        <IconButton label="Browser">
          <Globe aria-hidden="true" />
        </IconButton>
        <IconButton label="Open folder">
          <FolderOpen aria-hidden="true" />
        </IconButton>
        <IconButton label="More">
          <Ellipsis aria-hidden="true" />
        </IconButton>
      </div>

      {win && (
        <div className="ml-1 flex items-center border-l pl-1">
          <IconButton label="Minimize" onClick={() => void win.minimize()}>
            <Minus aria-hidden="true" />
          </IconButton>
          <IconButton label={maximized ? 'Restore' : 'Maximize'} onClick={() => void win.toggleMaximize()}>
            {maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
          </IconButton>
          <IconButton label="Close" className="hover:bg-destructive hover:text-white" onClick={() => void win.close()}>
            <X aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </header>
  );
}
