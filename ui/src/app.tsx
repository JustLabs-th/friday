import { useState } from 'react';
import { AppSidebar, type Page, type Session } from '@/components/app-sidebar';
import { NewProjectDialog, type Project } from '@/components/new-project-dialog';
import { AppBar } from '@/components/app-bar';
import { ChatView, type Message } from '@/components/chat-view';
import { ModelSelector } from '@/components/model-selector';
import { SettingsDialog } from '@/components/settings-dialog';
import { models, type Effort } from '@/lib/models';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

interface History {
  stack: Page[];
  index: number;
}

// Sample data for the in-memory demo only; nothing is persisted.
const initialProjects: Project[] = [{ id: 'harness', name: 'harness', prompt: '', path: '' }];
const initialSessions: Record<string, Session[]> = {
  harness: [
    { id: 's1', title: 'เปรียบเทียบความเร็ว LLM Harness' },
    { id: 's2', title: 'หา Open Source Harness' },
    { id: 's3', title: 'ร่างพิดช์ของบประมาณ' },
    { id: 's4', title: 'เปรียบเทียบ REST Framework Python' },
    { id: 's5', title: 'เลือกภาษาเขียน Harness V1' },
  ],
};

export function App() {
  const [history, setHistory] = useState<History>({ stack: ['home'], index: 0 });
  const [dark, setDark] = useState(false);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [sessions, setSessions] = useState<Record<string, Session[]>>(initialSessions);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjects[0].id);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelId, setModelId] = useState(models[0].id);
  const [effort, setEffort] = useState<Effort>(models[0].defaultEffort);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: 'project'; project: Project } | { kind: 'session'; project: Project; session: Session } | null
  >(null);

  const activeProject = projects.find(item => item.id === activeProjectId) ?? null;
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
  }
  function startNewSession(project: Project) {
    const created: Session = { id: crypto.randomUUID(), title: 'New session' };
    setSessions(current => ({ ...current, [project.id]: [created, ...(current[project.id] ?? [])] }));
    setActiveProjectId(project.id);
    setActiveSessionId(created.id);
    navigate('home');
  }
  function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'project') {
      const removedId = pendingDelete.project.id;
      const remaining = projects.filter(item => item.id !== removedId);
      setProjects(remaining);
      const removedSessionIds = (sessions[removedId] ?? []).map(item => item.id);
      setSessions(current => {
        const { [removedId]: _removed, ...rest } = current;
        return rest;
      });
      setMessages(current => Object.fromEntries(Object.entries(current).filter(([key]) => !removedSessionIds.includes(key))));
      if (activeProjectId === removedId) {
        setActiveProjectId(remaining[0]?.id ?? null);
        setActiveSessionId(null);
      }
    } else {
      const { project, session } = pendingDelete;
      setSessions(current => ({ ...current, [project.id]: (current[project.id] ?? []).filter(item => item.id !== session.id) }));
      setMessages(current => {
        const { [session.id]: _removed, ...rest } = current;
        return rest;
      });
      if (activeSessionId === session.id) setActiveSessionId(null);
    }
    setPendingDelete(null);
  }
  function sendMessage(text: string, files: File[]) {
    if (!activeProject) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      const created: Session = { id: crypto.randomUUID(), title: text.slice(0, 40) };
      sessionId = created.id;
      setSessions(current => ({ ...current, [activeProject.id]: [created, ...(current[activeProject.id] ?? [])] }));
      setActiveSessionId(created.id);
    } else if (!(messages[sessionId]?.length) && activeSession?.title === 'New session') {
      const targetId = sessionId;
      setSessions(current => ({ ...current, [activeProject.id]: (current[activeProject.id] ?? []).map(item => item.id === targetId ? { ...item, title: text.slice(0, 40) } : item) }));
    }
    const id = sessionId;
    const message: Message = { id: crypto.randomUUID(), role: 'user', text, files: files.map(file => file.name) };
    setMessages(current => ({ ...current, [id]: [...(current[id] ?? []), message] }));
  }
  function createProject(project: Project) {
    setProjects(current => [project, ...current]);
    setActiveProjectId(project.id);
    setActiveSessionId(null);
    navigate('home');
  }

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh min-h-0 flex-col overflow-hidden">
        <AppBar
          title={activeProject?.name ?? 'Friday'}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={selectProject}
          onNewProject={() => setNewProjectOpen(true)}
          canCreateSession={activeProject !== null}
          canGoBack={history.index > 0}
          canGoForward={history.index < history.stack.length - 1}
          onBack={goBack}
          onForward={goForward}
          onNewSession={() => activeProject && startNewSession(activeProject)}
          onOpenSettings={() => setSettingsOpen(true)}
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
          />
          <SidebarInset className="min-h-0">
            <main className="flex min-h-0 flex-1 flex-col" aria-labelledby="page-title">
              {activeProject ? (
                <ChatView
                  title={activeSession?.title ?? activeProject.name}
                  subtitle={activeSession ? undefined : activeProject.path || undefined}
                  detail={activeSession ? `session ใน project ${activeProject.name}` : activeProject.prompt || undefined}
                  messages={activeSession ? messages[activeSession.id] ?? [] : []}
                  onSend={sendMessage}
                  controls={
                    <ModelSelector
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
          </SidebarInset>
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} dark={dark} onSetDark={setTheme} />
        <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} onCreate={createProject} />
        <AlertDialog open={pendingDelete !== null} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingDelete?.kind === 'project' ? 'ลบ project?' : 'ลบ session?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete?.kind === 'project'
                  ? `ลบ "${pendingDelete.project.name}" และ session ทั้งหมดในนั้น การลบนี้ไม่สามารถย้อนกลับได้ (ไม่ลบไฟล์ในโฟลเดอร์)`
                  : pendingDelete?.kind === 'session'
                    ? `ลบ session "${pendingDelete.session.title}" การลบนี้ไม่สามารถย้อนกลับได้`
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
