import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { codex, samePath, useCodex } from '@/lib/codex';
import { AppSidebar, type Session } from '@/components/layout/app-sidebar';
import { NewProjectDialog, type Project } from '@/components/dialogs/new-project-dialog';
import { AppBar } from '@/components/layout/app-bar';
import { NoProject } from '@/components/layout/no-project';
import { ChatView } from '@/components/chat/chat-view';
import { ConnectorsPage } from '@/components/connectors/connectors-page';
import { ScheduledTasks } from '@/components/scheduling/scheduled-tasks';
import { SaveSkillDialog } from '@/components/dialogs/save-skill-dialog';
import { ConfirmDeleteDialog, type ItemTarget } from '@/components/dialogs/confirm-delete-dialog';
import type { JobInput, ScheduledRun } from '@/lib/scheduler';
import { buildSkillDraft, type SavedSkill, type SkillDraft } from '@/lib/skills';
import { ModelSelector } from '@/components/chat/model-selector';
import { RenameDialog } from '@/components/dialogs/rename-dialog';
import { SearchDialog } from '@/components/dialogs/search-dialog';
import { SettingsDialog } from '@/components/dialogs/settings-dialog';
import { RightPanel } from '@/components/panels/right-panel';
import { TerminalPanel } from '@/components/panels/terminal-panel';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useModelChoice } from '@/hooks/use-model-choice';
import { usePageHistory } from '@/hooks/use-page-history';
import { usePanels } from '@/hooks/use-panels';
import { useProjects } from '@/hooks/use-projects';
import { useSearchShortcut } from '@/hooks/use-search-shortcut';

function connectionLabel(status: string) {
  if (status === 'ready') return 'Liam connected · workspace access · approvals on request';
  if (status === 'connecting') return 'กำลังเชื่อมต่อ Liam…';
  if (status === 'browser') return 'เปิด Liam Desktop เพื่อเชื่อมต่อ Liam';
  return 'Liam disconnected';
}

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop();

export function App() {
  const engine = useCodex();
  const nav = usePageHistory();
  const panels = usePanels();
  const { projects, setProjects, activeProjectId, setActiveProjectId, activeProject } = useProjects(engine);
  const model = useModelChoice(engine.models, engine.defaultModel);
  const [dark, setDark] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const startingSession = useRef(false);

  // Dialogs and the thing each one is about.
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const [schedulePrefill, setSchedulePrefill] = useState<Partial<JobInput> | null>(null);
  const [pendingRename, setPendingRename] = useState<ItemTarget | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ItemTarget | null>(null);

  useSearchShortcut(setSearchOpen);
  useEffect(() => {
    if (isTauri()) void codex.connect().catch(() => {});
  }, []);

  const messages = engine.messages;
  const sessions: Record<string, Session[]> = Object.fromEntries(
    projects.map(project => [
      project.id,
      Object.values(engine.threads)
        .filter(thread => samePath(thread.cwd, project.path))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(thread => ({ id: thread.id, title: thread.name || thread.preview || 'New session' })),
    ]),
  );
  const activeSession =
    activeProject && activeSessionId
      ? ((sessions[activeProject.id] ?? []).find(item => item.id === activeSessionId) ?? null)
      : null;
  const activeRuns = (activeSessionId ? (messages[activeSessionId] ?? []) : []).flatMap(message => message.runs ?? []);
  const sessionRunning = !!(activeSessionId && engine.running[activeSessionId]);
  const scheduledPage = nav.page === 'scheduled';
  const connectorsPage = nav.page === 'connectors';
  const sidePage = scheduledPage || connectorsPage;

  function setTheme(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  }
  function selectProject(project: Project) {
    setActiveProjectId(project.id);
    setActiveSessionId(null);
    nav.navigate('home');
  }
  function selectSession(item: Session, project: Project) {
    setActiveProjectId(project.id);
    setActiveSessionId(item.id);
    nav.navigate('home');
    void codex.resume(item.id).catch(codex.report);
  }
  async function startNewSession(project: Project) {
    if (startingSession.current) return;
    startingSession.current = true;
    try {
      const thread = await codex.start(project.path, project.prompt);
      setActiveProjectId(project.id);
      setActiveSessionId(thread.id);
      nav.navigate('home');
    } catch (error) {
      codex.report(error);
    } finally {
      startingSession.current = false;
    }
  }
  function createProject(project: Project) {
    setProjects(current => [project, ...current]);
    setActiveProjectId(project.id);
    setActiveSessionId(null);
    nav.navigate('home');
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.kind === 'project') {
        const remaining = projects.filter(item => item.id !== pendingDelete.project.id);
        setProjects(remaining);
        if (activeProjectId === pendingDelete.project.id) {
          setActiveProjectId(remaining[0]?.id || null);
          setActiveSessionId(null);
        }
      } else {
        await codex.archive(pendingDelete.session.id);
        if (activeSessionId === pendingDelete.session.id) setActiveSessionId(null);
      }
      setPendingDelete(null);
    } catch (error) {
      codex.report(error);
    }
  }
  async function renamePending(name: string) {
    if (!pendingRename) return;
    try {
      if (pendingRename.kind === 'project') {
        const id = pendingRename.project.id;
        setProjects(current => current.map(item => (item.id === id ? { ...item, name } : item)));
      } else {
        await codex.rename(pendingRename.session.id, name);
      }
    } catch (error) {
      codex.report(error);
    }
  }
  async function sendMessage(text: string, files: File[]) {
    if (!activeProject) return false;
    try {
      let id = activeSessionId;
      if (!id) {
        const thread = await codex.start(activeProject.path, activeProject.prompt);
        id = thread.id;
        setActiveSessionId(id);
      }
      await codex.send(id, text, files, model.modelId, model.effort);
      return true;
    } catch (error) {
      codex.report(error);
      return false;
    }
  }
  function resolveConfirmation(_messageId: string, confirmationId: string, approved: boolean) {
    void codex.respond(confirmationId, approved).catch(codex.report);
  }
  function openScheduledSession(run: ScheduledRun) {
    if (!run.threadId) return;
    let project = projects.find(item => samePath(item.path, run.cwd));
    if (!project) {
      project = { id: crypto.randomUUID(), name: folderName(run.cwd) || run.jobName, path: run.cwd, prompt: '' };
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
    nav.navigate('scheduled');
  }
  const reconnect = () => {
    void codex.connect().catch(codex.report);
  };

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh min-h-0 flex-col overflow-hidden">
        <AppBar
          onNewProject={() => setNewProjectOpen(true)}
          canCreateSession={activeProject !== null && engine.status === 'ready'}
          canGoBack={nav.canGoBack}
          canGoForward={nav.canGoForward}
          onBack={nav.goBack}
          onForward={nav.goForward}
          onNewSession={() => activeProject && startNewSession(activeProject)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          terminalOpen={panels.terminalOpen}
          onToggleTerminal={panels.toggleTerminal}
          rightPanelOpen={panels.rightPanelOpen}
          onToggleRightPanel={panels.toggleRightPanel}
          onOpenPreview={panels.openPreview}
          projectPath={activeProject?.path || null}
          onDeleteProject={activeProject ? () => setPendingDelete({ kind: 'project', project: activeProject }) : null}
          onRenameProject={activeProject ? () => setPendingRename({ kind: 'project', project: activeProject }) : null}
          onSaveAsSkill={
            activeSession && (messages[activeSession.id]?.length ?? 0) > 0
              ? () => setSkillDraft(buildSkillDraft(activeSession.title, messages[activeSession.id] ?? []))
              : null
          }
        />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            onNavigate={nav.navigate}
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
            {!activeProject && engine.error && (
              <div role="alert" className="border-b px-5 py-3 text-sm text-destructive">
                {engine.error}
                <button className="ml-3 underline" onClick={reconnect}>
                  เชื่อมต่อใหม่
                </button>
              </div>
            )}
            <div className="flex min-h-0 min-w-0 flex-1">
              <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-labelledby="page-title">
                {connectorsPage ? (
                  <ConnectorsPage engineReady={engine.status === 'ready'} />
                ) : scheduledPage ? (
                  <ScheduledTasks
                    projects={projects}
                    models={engine.models}
                    onOpenSession={openScheduledSession}
                    prefill={schedulePrefill}
                    onPrefillUsed={() => setSchedulePrefill(null)}
                  />
                ) : activeProject ? (
                  <ChatView
                    title={activeSession?.title ?? activeProject.name}
                    subtitle={activeSession ? undefined : activeProject.path || undefined}
                    detail={
                      activeSession ? `session ใน project ${activeProject.name}` : activeProject.prompt || undefined
                    }
                    messages={activeSession ? (messages[activeSession.id] ?? []) : []}
                    onSend={sendMessage}
                    onResolveConfirmation={resolveConfirmation}
                    running={sessionRunning}
                    loading={!!(activeSessionId && engine.loading[activeSessionId])}
                    onStop={() => {
                      if (activeSessionId) void codex.stop(activeSessionId).catch(codex.report);
                    }}
                    connection={{
                      status: engine.status,
                      error: engine.error,
                      label: connectionLabel(engine.status),
                      onReconnect: reconnect,
                      onDismiss: codex.clearError,
                    }}
                    controls={
                      <ModelSelector
                        models={engine.models}
                        disabled={engine.status !== 'ready' || sessionRunning}
                        modelId={model.modelId}
                        effort={model.effort}
                        onModelChange={model.chooseModel}
                        onEffortChange={model.setEffort}
                      />
                    }
                  />
                ) : (
                  <NoProject onCreate={() => setNewProjectOpen(true)} />
                )}
              </main>
              {!sidePage && panels.rightPanelOpen && (
                <RightPanel
                  preview={panels.previewOpen}
                  onClose={panels.closeRightPanel}
                  project={activeProject}
                  runs={activeRuns}
                  threadId={activeSessionId}
                  running={sessionRunning}
                />
              )}
            </div>
            {!sidePage && panels.terminalOpen && <TerminalPanel runs={activeRuns} onClose={panels.closeTerminal} />}
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
        <SearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          projects={projects}
          sessions={sessions}
          onSelectProject={selectProject}
          onSelectSession={selectSession}
        />
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          dark={dark}
          onSetDark={setTheme}
          engineLabel={engine.status === 'ready' ? 'Connected' : engine.status}
          enginePath={engine.info?.binary}
          onReconnect={reconnect}
          onGatewayChanged={() => void codex.restart().catch(codex.report)}
        />
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} onCreate={createProject} />
        <ConfirmDeleteDialog target={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
