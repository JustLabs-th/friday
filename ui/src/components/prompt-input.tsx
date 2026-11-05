import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpIcon, FileIcon, PlusIcon, XIcon } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group';

interface PromptInputProps {
  onSend: (text: string, files: File[]) => void;
  placeholder?: string;
  disabled?: boolean;
  controls?: ReactNode;
}

export function PromptInput({ onSend, placeholder = 'พิมพ์ข้อความ...', disabled = false, controls }: PromptInputProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canSend = !disabled && text.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    onSend(text.trim(), files);
    setText('');
    setFiles([]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a line. Ignore Enter while an IME (e.g. Thai) is composing.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length > 0) setFiles(current => [...current, ...picked]);
    event.target.value = '';
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <input ref={inputRef} type="file" multiple tabIndex={-1} className="sr-only" onChange={handleFiles} />
      <InputGroup className="glow-ring rounded-2xl border-border/60 bg-background/55 shadow-lg backdrop-blur-lg transition-colors has-[[data-slot=input-group-control]:focus-visible]:border-border/60 has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-disabled:bg-background/55 has-disabled:opacity-100 dark:bg-background/55 dark:has-disabled:bg-background/55">
        {files.length > 0 && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1.5">
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`} className="flex max-w-48 items-center gap-1.5 rounded-lg border bg-muted/50 py-1 pr-1 pl-2 text-xs text-foreground">
                <FileIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles(current => current.filter((_, i) => i !== index))}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          aria-label="Message"
          className="min-h-14 p-3"
          disabled={disabled}
          onChange={event => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={text}
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton
            type="button"
            aria-label="Attach files"
            className="rounded-full"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            size="icon-sm"
            variant="outline"
          >
            <PlusIcon aria-hidden="true" />
          </InputGroupButton>
          {controls}
          <InputGroupButton
            type="submit"
            aria-label="Send"
            className="ms-auto rounded-full"
            disabled={!canSend}
            size="icon-sm"
            variant="default"
          >
            <ArrowUpIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
