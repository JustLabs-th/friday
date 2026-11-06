import { useState, type FormEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface Project {
  id: string;
  name: string;
  prompt: string;
  path: string;
}

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (project: Project) => void;
}

export function NewProjectDialog({ open: isOpen, onOpenChange, onCreate }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [folder, setFolder] = useState('');

  function reset() {
    setName('');
    setPrompt('');
    setFolder('');
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function chooseFolder() {
    const selected = await open({ directory: true, multiple: false, title: 'เลือกโฟลเดอร์ของ project' });
    if (typeof selected === 'string') setFolder(selected);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({
      id: crypto.randomUUID(),
      name: trimmed,
      prompt: prompt.trim(),
      path: folder.trim(),
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>สร้าง project ใหม่</DialogTitle>
            <DialogDescription>ตั้งชื่อ prompt และเลือกโฟลเดอร์ในเครื่องสำหรับ project นี้</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-name" className="text-xs font-medium">
                ชื่อโปรเจกต์
              </label>
              <Input
                id="project-name"
                autoFocus
                required
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="เช่น Liam UI"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-prompt" className="text-xs font-medium">
                Project prompt
              </label>
              <Textarea
                id="project-prompt"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                rows={4}
                placeholder="บอกเป้าหมายและบริบทของ project นี้"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">โฟลเดอร์ในเครื่อง</span>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Project folder"
                  className="min-w-0 flex-1"
                  value={folder}
                  onChange={event => setFolder(event.target.value)}
                  placeholder="Absolute project path"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void chooseFolder()}
                  disabled={!isTauri()}
                  title={isTauri() ? undefined : 'เลือกโฟลเดอร์ได้เฉพาะในแอปเดสก์ท็อป'}
                >
                  <FolderOpen aria-hidden="true" />
                  เลือกโฟลเดอร์
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={!name.trim() || !folder.trim()}>
              สร้าง project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
