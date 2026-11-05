import { useEffect, useRef, type ReactNode } from 'react';
import { FileIcon } from 'lucide-react';
import { PromptInput } from '@/components/prompt-input';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  files: string[];
}

interface ChatViewProps {
  title: string;
  subtitle?: string;
  detail?: string;
  messages: Message[];
  onSend: (text: string, files: File[]) => void;
  controls?: ReactNode;
}

export function ChatView({ title, subtitle, detail, messages, onSend, controls }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="w-full max-w-md text-center">
              <p className="mb-4 text-[10px] tracking-[.25em] text-muted-foreground">FRIDAY</p>
              <h1 id="page-title" className="text-2xl font-medium tracking-tight">{title}</h1>
              {subtitle && <p className="mt-2 truncate text-xs text-muted-foreground" title={subtitle}>{subtitle}</p>}
              {detail && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
            <h1 id="page-title" className="sr-only">{title}</h1>
            {messages.map(message => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${message.role === 'user' ? 'bg-muted' : ''}`}>
                  {message.files.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {message.files.map((name, index) => (
                        <span key={`${name}-${index}`} className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-xs">
                          <FileIcon className="size-3.5" aria-hidden="true" />{name}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-3xl px-6 pb-4">
        <PromptInput onSend={onSend} placeholder="พิมพ์ข้อความถึง Codex..." controls={controls} />
        <p className="mt-2 text-center text-xs text-muted-foreground">ยังไม่ได้เชื่อมต่อ Codex engine จึงยังไม่มีคำตอบกลับ</p>
      </div>
    </div>
  );
}
