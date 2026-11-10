import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FolderOpen, MessageSquare, Search } from 'lucide-react';
import type { Project } from '@/components/dialogs/new-project-dialog';
import type { Session } from '@/components/layout/app-sidebar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  sessions: Record<string, Session[]>;
  onSelectProject: (project: Project) => void;
  onSelectSession: (session: Session, project: Project) => void;
}

interface Item {
  key: string;
  kind: 'session' | 'project';
  title: string;
  subtitle: string;
  open: () => void;
}

// With no query, list this many sessions so the dialog is useful before typing.
const DEFAULT_LIMIT = 8;

export function SearchDialog({
  open,
  onOpenChange,
  projects,
  sessions,
  onSelectProject,
  onSelectSession,
}: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sessionItems: Item[] = projects.flatMap(project =>
      (sessions[project.id] ?? []).map(session => ({
        key: `s-${session.id}`,
        kind: 'session' as const,
        title: session.title,
        subtitle: project.name,
        open: () => onSelectSession(session, project),
      })),
    );
    const projectItems: Item[] = projects.map(project => ({
      key: `p-${project.id}`,
      kind: 'project' as const,
      title: project.name,
      subtitle: project.path || 'Project',
      open: () => onSelectProject(project),
    }));
    if (!needle) return sessionItems.slice(0, DEFAULT_LIMIT);
    return [...sessionItems, ...projectItems].filter(
      item => item.title.toLowerCase().includes(needle) || item.subtitle.toLowerCase().includes(needle),
    );
  }, [query, projects, sessions, onSelectProject, onSelectSession]);

  // Start from the first result whenever the list changes.
  useEffect(() => setActive(0), [query, open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function close() {
    setQuery('');
    onOpenChange(false);
  }

  function choose(item: Item) {
    item.open();
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(index => (items.length === 0 ? 0 : (index + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => (items.length === 0 ? 0 : (index - 1 + items.length) % items.length));
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl gap-0 overflow-hidden" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">ค้นหา session และ project</DialogDescription>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ค้นหา session หรือ project..."
            aria-label="Search sessions and projects"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={items[active] ? `search-${items[active].key}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} id="search-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">ไม่พบผลลัพธ์</p>
          ) : (
            items.map((item, index) => (
              <button
                key={item.key}
                id={`search-${item.key}`}
                type="button"
                role="option"
                aria-selected={index === active}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(item)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${index === active ? 'bg-muted' : ''}`}
              >
                {item.kind === 'session' ? (
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground">{item.subtitle}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>↑↓ เลือก</span>
          <span>Enter เปิด</span>
          <span>Esc ปิด</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
