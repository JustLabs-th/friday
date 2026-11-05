import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface RenameDialogProps {
  /** What is being renamed, such as "project" or "session". */
  kind: string;
  initialName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

// Mount this only while renaming, so the field starts from the current name each time.
export function RenameDialog({ kind, initialName, onSubmit, onClose }: RenameDialogProps) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>เปลี่ยนชื่อ {kind}</DialogTitle>
            <DialogDescription>ตั้งชื่อใหม่ให้ {kind} นี้</DialogDescription>
          </DialogHeader>
          <div className="px-4">
            <Input autoFocus aria-label={`ชื่อ ${kind}`} value={name} onChange={event => setName(event.target.value)} onFocus={event => event.currentTarget.select()} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button type="submit" disabled={!trimmed}>บันทึก</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
