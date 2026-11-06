import type { Session } from '@/components/layout/app-sidebar';
import type { Project } from '@/components/dialogs/new-project-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** A project, or one session in a project: what rename and delete act on. */
export type ItemTarget =
  { kind: 'project'; project: Project } | { kind: 'session'; project: Project; session: Session };

interface ConfirmDeleteDialogProps {
  /** What is about to be deleted; null keeps the dialog closed. */
  target: ItemTarget | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({ target, onCancel, onConfirm }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{target?.kind === 'project' ? 'ลบ project?' : 'ลบ session?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.kind === 'project'
              ? `ลบ "${target.project.name}" ออกจาก Friday โดยไม่ลบไฟล์หรือประวัติใน Liam`
              : target?.kind === 'session'
                ? `ลบ session "${target.session.title}" ออกจากรายการ โดยเก็บประวัติไว้ใน Liam`
                : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            ลบ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
