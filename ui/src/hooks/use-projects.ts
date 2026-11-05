import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/components/dialogs/new-project-dialog';
import { codex, type useCodex } from '@/lib/codex';

const PROJECTS_KEY = 'friday.projects.v1';

function readProjects(): Project[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item): item is Project =>
        !!item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.path === 'string' &&
        typeof item.prompt === 'string',
    );
  } catch {
    return [];
  }
}

type Engine = Pick<ReturnType<typeof useCodex>, 'status' | 'info'>;

/**
 * The projects Friday knows about and which one is open. They are kept in local storage; Codex owns
 * the sessions. On the very first start (nothing stored) the folder Codex runs in becomes the first project.
 */
export function useProjects(engine: Engine) {
  const [projects, setProjects] = useState<Project[]>(readProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => readProjects()[0]?.id || null);
  const configuredAtMount = useRef(false);
  const startupComplete = useRef(false);

  useEffect(() => {
    try {
      configuredAtMount.current = localStorage.getItem(PROJECTS_KEY) !== null;
    } catch {
      /* unavailable storage */
    }
  }, []);

  useEffect(() => {
    if (engine.status !== 'ready' || !engine.info || startupComplete.current) return;
    startupComplete.current = true;
    if (!projects.length && !configuredAtMount.current) {
      const path = engine.info.cwd;
      const project = {
        id: crypto.randomUUID(),
        name: path.split(/[\\/]/).filter(Boolean).pop() || 'Friday',
        path,
        prompt: '',
      };
      setProjects([project]);
      setActiveProjectId(project.id);
    }
  }, [engine.status, engine.info, projects.length]);

  useEffect(() => {
    if (!projects.length && !startupComplete.current) return;
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      /* keep in memory */
    }
  }, [projects]);

  // Ask Codex for the sessions of every project folder once it is connected.
  const projectPaths = projects
    .map(project => project.path)
    .filter(Boolean)
    .sort()
    .join('\0');
  useEffect(() => {
    if (engine.status !== 'ready') return;
    void Promise.all(
      projectPaths
        .split('\0')
        .filter(Boolean)
        .map(path => codex.loadProject(path)),
    ).catch(codex.report);
  }, [engine.status, projectPaths]);

  const activeProject = projects.find(item => item.id === activeProjectId) ?? null;
  return { projects, setProjects, activeProjectId, setActiveProjectId, activeProject };
}
