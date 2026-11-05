import { useState, type FormEvent } from 'react';
import { GlobeIcon } from 'lucide-react';
import { EmptyState } from '@/components/panels/empty-state';
import { Input } from '@/components/ui/input';

// Shows a page, normally a project's local dev server, in a frame.
export function PreviewPanel() {
  const [draft, setDraft] = useState('http://localhost:3000');
  const [url, setUrl] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setUrl(/^https?:\/\//i.test(value) ? value : `http://${value}`);
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={submit} className="border-b p-2">
        <Input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          aria-label="Preview address"
          placeholder="localhost:3000"
        />
      </form>
      {url ? (
        <iframe title="Preview" src={url} className="min-h-0 flex-1 bg-white" />
      ) : (
        <EmptyState
          icon={GlobeIcon}
          title="Preview"
          detail="ใส่ที่อยู่ของ dev server เช่น localhost:3000 แล้วกด Enter เพื่อดูหน้าเว็บของ project"
        />
      )}
    </div>
  );
}
