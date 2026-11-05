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
import type { Job } from '@/lib/scheduler';

interface DeleteJobDialogProps {
  /** The task about to be deleted; null keeps the dialog closed. */
  job: Job | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (job: Job) => void;
}

export function DeleteJobDialog({ job, pending, onCancel, onConfirm }: DeleteJobDialogProps) {
  return (
    <AlertDialog
      open={!!job}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {job?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the schedule and its run history from Friday. Codex sessions and project files are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (job) onConfirm(job);
            }}
          >
            Delete task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
