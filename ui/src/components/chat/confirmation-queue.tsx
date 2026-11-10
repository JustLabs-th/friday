import { Confirmation, type ConfirmationRequest } from '@/components/chat/confirmation';

export interface QueuedConfirmation {
  messageId: string;
  request: ConfirmationRequest;
}

/**
 * Requests waiting for an answer, stacked: one card at a time, the next one appears once this one is
 * answered. Sits above the prompt input so it cannot be scrolled out of sight.
 */
export function ConfirmationQueue({
  items,
  onResolve,
}: {
  items: QueuedConfirmation[];
  onResolve: (messageId: string, confirmationId: string, approved: boolean) => void;
}) {
  if (items.length === 0) return null;
  const [first] = items;
  return (
    <div className="relative mb-5" role="region" aria-label="รอการอนุมัติ">
      {items.length > 2 && (
        <div aria-hidden="true" className="absolute inset-x-6 -bottom-4 top-4 rounded-xl border bg-muted shadow-sm" />
      )}
      {items.length > 1 && (
        <div
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-2 top-2 rounded-xl border bg-muted/80 shadow-sm"
        />
      )}
      <Confirmation
        key={first.request.id}
        className="relative bg-background shadow-sm"
        position={items.length > 1 ? `รอ ${items.length} รายการ` : undefined}
        request={first.request}
        onApprove={() => onResolve(first.messageId, first.request.id, true)}
        onDeny={() => onResolve(first.messageId, first.request.id, false)}
      />
    </div>
  );
}
