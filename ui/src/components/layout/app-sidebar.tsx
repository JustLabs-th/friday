import { useState } from 'react';
import {
  CalendarClock,
  Plug,
  ChevronRight,
  Ellipsis,
  FolderOpen,
  Pencil,
  Settings,
  SquarePen,
  Trash2,
  LogIn,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { useGatewayStatus } from '@/hooks/use-gateway-status';
import { gatewayLogin } from '@/lib/gateway';

export type Page = 'home' | 'scheduled' | 'connectors';

export interface Session {
  id: string;
  title: string;
}

const VISIBLE_SESSIONS = 5;

interface ProjectSessionsProps {
  project: Project;
  sessions: Session[];
  active: boolean;
  activeSessionId: string | null;
  onSelectProject: (project: Project) => void;
  onSelectSession: (session: Session, project: Project) => void;
  onNewSession: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onDeleteSession: (session: Session, project: Project) => void;
  onRenameProject: (project: Project) => void;
  onRenameSession: (session: Session, project: Project) => void;
}

function ProjectSessions({
  project,
  sessions,
  active,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onDeleteProject,
  onDeleteSession,
  onRenameProject,
  onRenameSession,
}: ProjectSessionsProps) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sessions : sessions.slice(0, VISIBLE_SESSIONS);
  return (
    <div className="mb-2">
      <div
        className={`group/project flex items-center gap-1 rounded-md px-1 py-1 hover:bg-sidebar-accent ${active && activeSessionId === null ? 'bg-sidebar-accent' : ''}`}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Toggle ${project.name}`}
          onClick={() => setOpen(v => !v)}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onSelectProject(project)}
          title={project.path || project.name}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
        >
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{project.name}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`More options for ${project.name}`}
                className="rounded p-1 text-muted-foreground opacity-0 hover:bg-sidebar-accent group-hover/project:opacity-100 aria-expanded:opacity-100"
              />
            }
          >
            <Ellipsis className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => window.setTimeout(() => onRenameProject(project), 0)}>
              <Pencil aria-hidden="true" />
              Rename project
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => window.setTimeout(() => onDeleteProject(project), 0)}
            >
              <Trash2 aria-hidden="true" />
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label={`New session in ${project.name}`}
          title="New session"
          onClick={() => onNewSession(project)}
          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-sidebar-accent group-hover/project:opacity-100"
        >
          <SquarePen className="size-4" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <>
          <SidebarMenu>
            {visible.map(session => (
              <SidebarMenuItem key={session.id}>
                <SidebarMenuButton
                  size="sm"
                  isActive={session.id === activeSessionId}
                  onClick={() => onSelectSession(session, project)}
                  className="pl-7 pr-14"
                >
                  <span className="truncate">{session.title}</span>
                </SidebarMenuButton>
                <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center opacity-0 group-hover/menu-item:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${session.title}`}
                    title="Rename session"
                    onClick={() => onRenameSession(session, project)}
                    className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${session.title}`}
                    title="Delete session"
                    onClick={() => onDeleteSession(session, project)}
                    className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          {sessions.length === 0 && <p className="px-8 py-1 text-xs text-muted-foreground">ยังไม่มี session</p>}
          {sessions.length > VISIBLE_SESSIONS && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="px-8 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface AppSidebarProps {
  onNavigate: (page: Page) => void;
  onOpenSettings: () => void;
  projects: Project[];
  sessions: Record<string, Session[]>;
  activeProjectId: string | null;
  activeSessionId: string | null;
  onSelectProject: (project: Project) => void;
  onSelectSession: (session: Session, project: Project) => void;
  onNewSession: (project: Project) => void;
  onNewProject: () => void;
  onDeleteProject: (project: Project) => void;
  onDeleteSession: (session: Session, project: Project) => void;
  onRenameProject: (project: Project) => void;
  onRenameSession: (session: Session, project: Project) => void;
}

export function AppSidebar({
  onNavigate,
  onOpenSettings,
  projects,
  sessions,
  activeProjectId,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onNewProject,
  onDeleteProject,
  onDeleteSession,
  onRenameProject,
  onRenameSession,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [projectsOpen, setProjectsOpen] = useState(true);
  function navigate(next: Page) {
    onNavigate(next);
    if (isMobile) setOpenMobile(false);
  }

  const gateway = useGatewayStatus();
  const userName = (gateway.signedIn && (gateway.displayName || gateway.username)) || 'Liam';
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');
  async function signIn() {
    setSigningIn(true);
    setSignInError('');
    try {
      await gatewayLogin();
    } catch (error) {
      setSignInError(String(error instanceof Error ? error.message : error));
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <Sidebar collapsible="icon" aria-label="Main navigation" className="top-11 h-[calc(100svh-2.75rem)] border-r-0">
      <SidebarContent>
        <SidebarGroup className="pt-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="New project"
                onClick={onNewProject}
                className="border border-sidebar-border bg-background shadow-xs hover:bg-sidebar-accent"
              >
                <SquarePen aria-hidden="true" />
                <span>New project</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Scheduled tasks" onClick={() => navigate('scheduled')}>
                <CalendarClock aria-hidden="true" />
                <span>Scheduled tasks</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Connectors" onClick={() => navigate('connectors')}>
                <Plug aria-hidden="true" />
                <span>Connectors</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <button
            type="button"
            aria-expanded={projectsOpen}
            onClick={() => setProjectsOpen(v => !v)}
            className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <ChevronRight
              className={`size-3.5 transition-transform ${projectsOpen ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
            <span>Projects</span>
          </button>
          {projectsOpen &&
            (projects.length === 0 ? (
              <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                ยังไม่มี project กด New project เพื่อเริ่ม
              </p>
            ) : (
              <div className="ml-3.5 border-l border-sidebar-border pl-1.5">
                {projects.map(item => (
                  <ProjectSessions
                    key={item.id}
                    project={item}
                    sessions={sessions[item.id] ?? []}
                    active={item.id === activeProjectId}
                    activeSessionId={activeSessionId}
                    onSelectProject={onSelectProject}
                    onSelectSession={onSelectSession}
                    onNewSession={onNewSession}
                    onDeleteProject={onDeleteProject}
                    onDeleteSession={onDeleteSession}
                    onRenameProject={onRenameProject}
                    onRenameSession={onRenameSession}
                  />
                ))}
              </div>
            ))}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col">
          {gateway.signedIn ? (
            <div className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm group-data-[collapsible=icon]:px-1">
              <Avatar className="size-6 shrink-0">
                <AvatarFallback className="bg-muted text-xs font-medium uppercase text-foreground">
                  {userName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate font-medium group-data-[collapsible=icon]:hidden">{userName}</span>
            </div>
          ) : (
            // Not signed in: the sign-in button takes the place of the profile circle and name.
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={signingIn}
              title={signInError || 'Sign in with the company account'}
              aria-label="Sign in"
              className={`flex min-w-0 items-center gap-2 rounded-md border border-sidebar-border bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-sidebar-accent disabled:opacity-60 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 ${signInError ? 'border-destructive text-destructive' : ''}`}
            >
              <LogIn className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                {signingIn ? 'Signing in…' : signInError ? 'Sign in failed, retry' : 'Sign in'}
              </span>
            </button>
          )}
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={onOpenSettings}
            className="rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Settings className="size-4" aria-hidden="true" />
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail aria-label="Toggle sidebar from edge" />
    </Sidebar>
  );
}
