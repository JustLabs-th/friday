import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { codex, samePath, useCodex } from '@/lib/codex';
import { AppSidebar, type Page, type Session } from '@/components/app-sidebar';
import { NewProjectDialog, type Project } from '@/components/new-project-dialog';
import { AppBar } from '@/components/app-bar';
import { ChatView } from '@/components/chat-view';
import { ScheduledTasks } from '@/components/scheduled-tasks';
import { SaveSkillDialog } from '@/components/save-skill-dialog';
import type { JobInput, ScheduledRun } from '@/lib/scheduler';
import { buildSkillDraft, type SavedSkill, type SkillDraft } from '@/lib/skills';
import { ModelSelector } from '@/components/model-selector';
import { RenameDialog } from '@/components/rename-dialog';
import { SearchDialog } from '@/components/search-dialog';
import { SettingsDialog } from '@/components/settings-dialog';
import { RightPanel, TerminalPanel, type RightPanelTab } from '@/components/workbench-panels';
import { type Effort } from '@/lib/models';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

interface History {
  stack: Page[];
  index: number;
}

const PROJECTS_KEY = 'friday.projects.v1';
function readProjects(): Project[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    return Array.isArray(data) ? data.filter((item): item is Project =>
      !!item && typeof item === 'object' && typeof item.id === 'string' &&
      typeof item.name === 'string' && typeof item.path === 'string' && typeof item.prompt === 'string') : [];
  } catch { return []; }
}

export function App() {
  const [history, setHistory] = useState<History>({ stack: ['home'], index: 0 });
  const [dark, setDark] = useState(false);
  const engine = useCodex();
  const [projects, setProjects] = useState<Project[]>(readProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => readProjects()[0]?.id || null);
  const configuredAtMount = useRef(false);
  const startupComplete = useRef(false);
  const startingSession = useRef(false);
  useEffect(() => {
    try { configuredAtMount.current = localStorage.getItem(PROJECTS_KEY) !== null; } catch { /* unavailable storage */ }
    if (isTauri()) void codex.connect().catch(() => {});
  }, []);
  useEffect(() => {
    if (engine.status !== 'ready' || !engine.info || startupComplete.current) return;
    startupComplete.current = true;
    if (!projects.length && !configuredAtMount.current) {
      const path = engine.info.cwd;
      const project = { id: crypto.randomUUID(), name: path.split(/[\\/]/).filter(Boolean).pop() || 'Friday', path, prompt: '' };
      setProjects([project]); setActiveProjectId(project.id);
    }
  }, [engine.status, engine.info, projects.length]);
  useEffect(() => {
    if (!projects.length && !startupComplete.current) return;
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch { /* keep in memory */ }
  }, [projects]);
  const projectPaths = projects.map(project => project.path).filter(Boolean).sort().join('\0');
  useEffect(() => {
    if (engine.status === 'ready') void Promise.all(projectPaths.split('\0').filter(Boolean).map(path => codex.loadProject(path))).catch(codex.report);
  }, [engine.status, projectPaths]);
  const sessions: Record<string, Session[]> = Object.fromEntries(projects.map(project => [
    project.id,
    Object.values(engine.threads).filter(thread => samePath(thread.cwd, project.path))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map(thread => ({ id: thread.id, title: thread.name || thread.preview || 'New session' })),
  ]));
  const messages = engine.messages;
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const [schedulePrefill, setSchedulePrefill] = useState<Partial<JobInput> | null>(null);

  // Ctrl+K (Cmd+K on macOS) opens the search from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(open => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('overview');
  const [modelId, setModelId] = useState('');
  const [effort, setEffort] = useState<Effort>('medium');
  useEffect(() => {
    if (!engine.models.length) return;
    const selected = engine.models.find(model => model.id === modelId);
    if (!selected) {
      const fallback = engine.models.find(model => model.id === engine.defaultModel) || engine.models[0];
      setModelId(fallback.id); setEffort(fallback.defaultEffort);
    } else if (selected.efforts.length && !selected.efforts.includes(effort)) setEffort(selected.defaultEffort);
  }, [engine.models, engine.defaultModel, modelId, effort]);
  const [pendingRename, setPendingRename] = useState<
    { kind: 'project'; project: Project } | { kind: 'session'; project: Project; session: Session } | null
  >(null);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'project'; project: Project } | { kind: 'session'; project: Project; session: Session } | null
  >(null);

  const activeProject = projects.find(item => item.id === activeProjectId) ?? null;
  const activeRuns = (activeSessionId ? messages[activeSessionId] ?? [] : []).flatMap(message => message.runs ?? []);
  const activeSession = activeProject && activeSessionId
    ? (sessions[activeProject.id] ?? []).find(item => item.id === activeSessionId) ?? null
    : null;

  function navigate(next: Page) {
    setHistory(current => {
      if (current.stack[current.index] === next) return current;
      const stack = [...current.stack.slice(0, current.index + 1), next];
      return { stack, index: stack.length - 1 };
    });
  }
  function goBack() {
    setHistory(current => ({ ...current, index: Math.max(0, current.index - 1) }));
  }
  function goForward() {
    setHistory(current => ({ ...current, index: Math.min(current.stack.length - 1, current.index + 1) }));
  }
  function setTheme(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  }
  function selectProject(project: Project) {
    setActiveProjectId(project.id);
    setActiveSessionId(null);
    navigate('home');
  }
  function selectSession(item: Session, project: Project) {
    setActiveProjectId(project.id);
    setActiveSessionId(item.id);
    navigate('home');
    void codex.resume(item.id).catch(codex.report);
  }
  async function startNewSession(project: Project) {
    if (startingSession.current) return;
    startingSession.current = true;
    try {
      const thread = await codex.start(project.path, project.prompt);
      setActiveProjectId(project.id); setActiveSessionId(thread.id); navigate('home');
    } catch (error) { codex.report(error); }
    finally { startingSession.current = false; }
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === 'project') {
        const remaining = projects.filter(item => item.id !== pendingDelete.project.id);
        setProjects(remaining);
        if (activeProjectId === pendingDelete.project.id) {
          setActiveProjectId(remaining[0]?.id || null); setActiveSessionId(null);
        }
      } else {
        await codex.archive(pendingDelete.session.id);
        if (activeSessionId === pendingDelete.session.id) setActiveSessionId(null);
      }
      setPendingDelete(null);
    } catch (error) { codex.report(error); }
  }
  async function sendMessage(text: string, files: File[]) {
    if (!activeProject) return false;
    try {
      let id = activeSessionId;
      if (!id) {
        const thread = await codex.start(activeProject.path, activeProject.prompt);
        id = thread.id; setActiveSessionId(id);
      }
      await codex.send(id, text, files, modelId, effort);
      return true;
    } catch (error) { codex.report(error); return false; }
  }
  function resolveConfirmation(_messageId: string, confirmationId: string, approved: boolean) {
    void codex.respond(confirmationId, approved).catch(codex.report);
  }
  async function renamePending(name: string) {
    if (!pendingRename) return;
    try {
      if (pendingRename.kind === 'project') {
        const id = pendingRename.project.id;
        setProjects(current => current.map(item => item.id === id ? { ...item, name } : item));
      } else await codex.rename(pendingRename.session.id, name);
    } catch (error) { codex.report(error); }
  }
  function createProject(project: Project) {
    setProjects(current => [project, ...current]);
    setActiveProjectId(project.id);
    setActiveSessionId(null);
    navigate('home');
  }

  function openScheduledSession(run: ScheduledRun) {
    if (!run.threadId) return;
    let project = projects.find(project => samePath(project.path, run.cwd));
    if (!project) {
      project = { id: crypto.randomUUID(), name: run.cwd.split(/[\\/]/).filter(Boolean).pop() || run.jobName, path: run.cwd, prompt: '' };
      const added = project;
      setProjects(current => [...current, added]);
    }
    selectSession({ id: run.threadId, title: run.jobName }, project);
    void codex.loadProject(run.cwd).catch(codex.report);
  }
  function scheduleSkill(skill: SavedSkill, projectPath: string | null) {
    setSchedulePrefill({
      name: skill.name,
      cwd: projectPath ?? activeProject?.path ?? '',
      prompt: `Run the ${skill.name} skill.`,
      skill: { name: skill.name, path: skill.path },
    });
    navigate('scheduled');
  }
  const scheduledPage = history.stack[history.index] === 'scheduled';

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh min-h-0 flex-col overflow-hidden">
        <AppBar
          title={scheduledPage ? 'Scheduled tasks' : activeProject?.name ?? 'Friday'}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={selectProject}
          onNewProject={() => setNewProjectOpen(true)}
          canCreateSession={activeProject !== null && engine.status === 'ready'}
          canGoBack={history.index > 0}
          canGoForward={history.index < history.stack.length - 1}
          onBack={goBack}
          onForward={goForward}
          onNewSession={() => activeProject && startNewSession(activeProject)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          terminalOpen={terminalOpen}
          onToggleTerminal={() => setTerminalOpen(open => !open)}
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={() => setRightPanelOpen(open => !open)}
          onOpenPreview={() => { setRightPanelTab('preview'); setRightPanelOpen(true); }}
          projectPath={activeProject?.path || null}
          onDeleteProject={activeProject ? () => setPendingDelete({ kind: 'project', project: activeProject }) : null}
          onRenameProject={activeProject ? () => setPendingRename({ kind: 'project', project: activeProject }) : null}
          onSaveAsSkill={activeSession && (messages[activeSession.id]?.length ?? 0) > 0
            ? () => setSkillDraft(buildSkillDraft(activeSession.title, messages[activeSession.id] ?? []))
            : null}
        />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            onNavigate={navigate}
            onOpenSettings={() => setSettingsOpen(true)}
            projects={projects}
            sessions={sessions}
            activeProjectId={activeProjectId}
            activeSessionId={activeSessionId}
            onSelectProject={selectProject}
            onSelectSession={selectSession}
            onNewSession={startNewSession}
            onNewProject={() => setNewProjectOpen(true)}
            onDeleteProject={project => setPendingDelete({ kind: 'project', project })}
            onDeleteSession={(session, project) => setPendingDelete({ kind: 'session', session, project })}
            onRenameProject={project => setPendingRename({ kind: 'project', project })}
            onRenameSession={(session, project) => setPendingRename({ kind: 'session', session, project })}
          />
          <SidebarInset className="min-h-0 min-w-0">
            {!activeProject && engine.error && <div role="alert" className="border-b px-5 py-3 text-sm text-destructive">{engine.error}<button className="ml-3 underline" onClick={() => { void codex.connect().catch(codex.report); }}>เชื่อมต่อใหม่</button></div>}
            <div className="flex min-h-0 min-w-0 flex-1">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby="page-title">
              {scheduledPage ? <ScheduledTasks projects={projects} models={engine.models} onOpenSession={openScheduledSession} prefill={schedulePrefill} onPrefillUsed={() => setSchedulePrefill(null)} /> : activeProject ? (
                <ChatView
                  title={activeSession?.title ?? activeProject.name}
                  subtitle={activeSession ? undefined : activeProject.path || undefined}
                  detail={activeSession ? `session ใน project ${activeProject.name}` : activeProject.prompt || undefined}
                  messages={activeSession ? messages[activeSession.id] ?? [] : []}
                  onSend={sendMessage}
                  onResolveConfirmation={resolveConfirmation}
                  running={!!(activeSessionId && engine.running[activeSessionId])}
                  loading={!!(activeSessionId && engine.loading[activeSessionId])}
                  onStop={() => { if (activeSessionId) void codex.stop(activeSessionId).catch(codex.report); }}
                  connection={{
                    status: engine.status, error: engine.error,
                    label: engine.status === 'ready' ? 'Codex connected · workspace access · approvals on request' : engine.status === 'connecting' ? 'กำลังเชื่อมต่อ Codex…' : engine.status === 'browser' ? 'เปิด Friday Desktop เพื่อเชื่อมต่อ Codex' : 'Codex disconnected',
                    onReconnect: () => { void codex.connect().catch(codex.report); },
                    onDismiss: codex.clearError,
                  }}
                  controls={
                    <ModelSelector
                      models={engine.models}
                      disabled={engine.status !== 'ready' || !!(activeSessionId && engine.running[activeSessionId])}
                      modelId={modelId}
                      effort={effort}
                      onModelChange={next => {
                        setModelId(next.id);
                        if (!next.efforts.includes(effort)) setEffort(next.defaultEffort);
                      }}
                      onEffortChange={setEffort}
                    />
                  }
                />
              ) : (
                <div className="flex flex-1 items-center justify-center p-8">
                  <div className="w-full max-w-sm text-center">
                    <p className="mb-4 text-[10px] tracking-[.25em] text-muted-foreground">FRIDAY</p>
                    <h1 id="page-title" className="text-2xl font-medium tracking-tight">ยังไม่มี project</h1>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">สร้าง project เพื่อเลือกโฟลเดอร์และเริ่ม session</p>
                    <Button className="mt-5" onClick={() => setNewProjectOpen(true)}>สร้าง project</Button>
                  </div>
                </div>
              )}
            </main>
            {!scheduledPage && rightPanelOpen && <RightPanel tab={rightPanelTab} onTabChange={setRightPanelTab} onClose={() => setRightPanelOpen(false)} project={activeProject} runs={activeRuns} />}
            </div>
            {!scheduledPage && terminalOpen && <TerminalPanel runs={activeRuns} onClose={() => setTerminalOpen(false)} />}
          </SidebarInset>
        </div>
        {pendingRename && (
          <RenameDialog
            kind={pendingRename.kind}
            initialName={pendingRename.kind === 'project' ? pendingRename.project.name : pendingRename.session.title}
            onSubmit={renamePending}
            onClose={() => setPendingRename(null)}
          />
        )}
        {skillDraft && activeProject && (
          <SaveSkillDialog
            draft={skillDraft}
            projectName={activeProject.name}
            projectPath={activeProject.path || null}
            onClose={() => setSkillDraft(null)}
            onSchedule={scheduleSkill}
          />
        )}
        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} projects={projects} sessions={sessions} onSelectProject={selectProject} onSelectSession={selectSession} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} dark={dark} onSetDark={setTheme} engineLabel={engine.status === 'ready' ? 'Connected' : engine.status} enginePath={engine.info?.binary} onReconnect={() => { void codex.connect().catch(codex.report); }} />
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} onCreate={createProject} />
        <AlertDialog open={pendingDelete !== null} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingDelete?.kind === 'project' ? 'ลบ project?' : 'ลบ session?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete?.kind === 'project'
                  ? `ลบ "${pendingDelete.project.name}" ออกจาก Friday โดยไม่ลบไฟล์หรือประวัติใน Codex`
                  : pendingDelete?.kind === 'session'
                    ? `ลบ session "${pendingDelete.session.title}" ออกจากรายการ โดยเก็บประวัติไว้ใน Codex`
                    : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={confirmDelete}>ลบ</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>
    </TooltipProvider>
  );
}
