import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  Copy,
  CopyIcon,
  BookPlus,
  Ellipsis,
  FolderOpen,
  Pencil,
  Trash2,
  Globe,
  Menu,
  Minus,
  PanelRight,
  ScanSearch,
  SquareArrowOutUpRight,
  SquareTerminal,
  Square,
  X,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { copyText } from '@/lib/clipboard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AppBarProps {
  onNewProject: () => void;
  canCreateSession: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  onOpenPreview: () => void;
  /** The active project's folder, if it has one. */
  projectPath: string | null;
  onDeleteProject: (() => void) | null;
  onRenameProject: (() => void) | null;
  /** Turns the open session into a skill; null when there is nothing to save. */
  onSaveAsSkill: (() => void) | null;
}

// Asks the system file manager to show the folder. Only works in the desktop app.
function revealFolder(path: string) {
  if (isTauri()) void revealItemInDir(path);
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
  onNewProject,
  canCreateSession,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNewSession,
  onOpenSettings,
  onOpenSearch,
  terminalOpen,
  onToggleTerminal,
  rightPanelOpen,
  onToggleRightPanel,
  onOpenPreview,
  projectPath,
  onDeleteProject,
  onRenameProject,
  onSaveAsSkill,
}: AppBarProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const refresh = () => void win.isMaximized().then(setMaximized);
    refresh();
    const unlisten = win.onResized(refresh);
    return () => void unlisten.then(stop => stop());
  }, []);

  const win = isTauri() ? getCurrentWindow() : null;

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
              <DropdownMenuItem disabled={!canCreateSession} onClick={onNewSession}>
                New session
              </DropdownMenuItem>
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

      <div className="ml-1 flex items-center">
        <IconButton label="Search (Ctrl+K)" onClick={onOpenSearch}>
          <ScanSearch aria-hidden="true" />
        </IconButton>
      </div>

      <div className="min-w-0 flex-1" data-tauri-drag-region />

      <div className="flex items-center gap-0.5">
        <IconButton
          label="Terminal"
          aria-pressed={terminalOpen}
          className={terminalOpen ? 'bg-muted text-foreground' : ''}
          onClick={onToggleTerminal}
        >
          <SquareTerminal aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Right panel"
          aria-pressed={rightPanelOpen}
          className={rightPanelOpen ? 'bg-muted text-foreground' : ''}
          onClick={onToggleRightPanel}
        >
          <PanelRight aria-hidden="true" />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Open in" title="Open in" disabled={!projectPath} />
            }
          >
            <SquareArrowOutUpRight aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Open in</DropdownMenuLabel>
              <DropdownMenuItem disabled={!isTauri()} onClick={() => projectPath && revealFolder(projectPath)}>
                <FolderOpen aria-hidden="true" />
                Reveal in File Explorer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => projectPath && void copyText(projectPath)}>
                <CopyIcon aria-hidden="true" />
                Copy path
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="Preview" onClick={onOpenPreview}>
          <Globe aria-hidden="true" />
        </IconButton>
        <IconButton
          label={projectPath ? 'Open folder' : 'Open folder (this project has no folder)'}
          disabled={!projectPath || !isTauri()}
          onClick={() => projectPath && revealFolder(projectPath)}
        >
          <FolderOpen aria-hidden="true" />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="More" title="More" disabled={!onDeleteProject} />
            }
          >
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              disabled={!onSaveAsSkill}
              onClick={() => onSaveAsSkill && window.setTimeout(onSaveAsSkill, 0)}
            >
              <BookPlus aria-hidden="true" />
              Save session as skill
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRenameProject && window.setTimeout(onRenameProject, 0)}>
              <Pencil aria-hidden="true" />
              Rename project
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDeleteProject && window.setTimeout(onDeleteProject, 0)}
            >
              <Trash2 aria-hidden="true" />
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
