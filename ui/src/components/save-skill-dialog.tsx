import { useState, type FormEvent } from 'react';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { composeSkill, isValidSkillName, saveSkill, skillSavingAvailable, type SavedSkill, type SkillDraft, type SkillScope } from '@/lib/skills';

interface SaveSkillDialogProps {
  draft: SkillDraft;
  /** The project the session belongs to; a project skill is saved in its folder. */
  projectName: string;
  projectPath: string | null;
  onClose: () => void;
  /** Called after saving when the person chose to schedule the skill. */
  onSchedule: (skill: SavedSkill, projectPath: string | null) => void;
}

// Mount this only while saving, so the fields start from a fresh draft each time.
export function SaveSkillDialog({ draft, projectName, projectPath, onClose, onSchedule }: SaveSkillDialogProps) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [body, setBody] = useState(draft.body);
  const [scope, setScope] = useState<SkillScope>(projectPath ? 'project' : 'global');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SavedSkill | null>(null);
  const available = skillSavingAvailable();
  const nameOk = isValidSkillName(name);
  const ready = available && nameOk && description.trim().length > 0 && body.trim().length > 0;
  const exists = error.includes('already exists');

  async function save(overwrite: boolean, thenSchedule: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = await saveSkill({
        scope,
        projectPath: scope === 'project' ? projectPath : null,
        name,
        content: composeSkill({ name, description, body }),
        overwrite,
      });
      if (thenSchedule) {
        onSchedule(result, projectPath);
        onClose();
      } else {
        setSaved(result);
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready && !busy) void save(false, false);
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Save session as skill</DialogTitle>
            <DialogDescription>ร่างจากบทสนทนาของ session นี้ แก้ให้เรียบร้อยก่อนบันทึก</DialogDescription>
          </DialogHeader>

          {saved ? (
            <div className="flex flex-col gap-3 px-4" role="status">
              <p className="text-sm">บันทึก skill <strong>{saved.name}</strong> แล้ว</p>
              <p className="break-all rounded-lg border bg-muted/40 p-3 font-mono text-xs">{saved.path}</p>
              <p className="text-xs text-muted-foreground">เรียกใช้ใน session ถัดไปได้โดยพิมพ์ชื่อ skill หรือตั้งเวลาให้รันอัตโนมัติ</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 px-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="skill-name" className="text-xs font-medium">ชื่อ skill</label>
                <Input id="skill-name" autoFocus value={name} onChange={event => { setName(event.target.value.toLowerCase()); setError(''); }} aria-invalid={!nameOk} />
                {!nameOk && <p className="text-xs text-destructive">ใช้ตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และขีดกลาง (-) เช่น weekly-report</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="skill-description" className="text-xs font-medium">คำอธิบาย (บอกว่าทำอะไรและใช้เมื่อไหร่)</label>
                <Textarea id="skill-description" rows={2} value={description} onChange={event => setDescription(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="skill-body" className="text-xs font-medium">คำสั่งใน skill</label>
                <Textarea id="skill-body" rows={12} className="font-mono text-xs" value={body} onChange={event => setBody(event.target.value)} />
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-xs font-medium">เก็บไว้ที่</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={scope === 'project' ? 'default' : 'outline'} aria-pressed={scope === 'project'} disabled={!projectPath} onClick={() => setScope('project')} className="h-auto flex-col items-start gap-0.5 py-2">
                    <span>โปรเจกต์นี้</span>
                    <span className="text-xs font-normal opacity-70">{projectPath ? `${projectName} · .agents/skills` : 'โปรเจกต์นี้ยังไม่มีโฟลเดอร์'}</span>
                  </Button>
                  <Button type="button" variant={scope === 'global' ? 'default' : 'outline'} aria-pressed={scope === 'global'} onClick={() => setScope('global')} className="h-auto flex-col items-start gap-0.5 py-2">
                    <span>ทุกโปรเจกต์</span>
                    <span className="text-xs font-normal opacity-70">~/.agents/skills</span>
                  </Button>
                </div>
              </fieldset>
              {!available && <p className="text-sm text-muted-foreground">เปิด Friday Desktop เพื่อบันทึก skill ลงเครื่อง</p>}
              {error && (
                <div role="alert" className="flex flex-col gap-2 text-sm text-destructive">
                  <p className="break-words">{error}</p>
                  {exists && <Button type="button" variant="outline" size="sm" className="w-fit" disabled={busy} onClick={() => void save(true, false)}>เขียนทับ skill เดิม</Button>}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {saved ? (
              <>
                <Button type="button" variant="outline" onClick={onClose}>เสร็จสิ้น</Button>
                <Button type="button" onClick={() => { onSchedule(saved, projectPath); onClose(); }}>
                  <CalendarClock aria-hidden="true" />ตั้งเวลารัน
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={onClose}>ยกเลิก</Button>
                <Button type="submit" variant="outline" disabled={!ready || busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
                <Button type="button" disabled={!ready || busy} onClick={() => void save(false, true)}>
                  <CalendarClock aria-hidden="true" />บันทึกและตั้งเวลา
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
