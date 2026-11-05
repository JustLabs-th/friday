import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  detail: string;
}

export function EmptyState({ icon: Icon, title, detail }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}
