import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon, FileIcon } from 'lucide-react';
import { ChainOfThought, type ChainStep } from '@/components/chain-of-thought';
import { Confirmation, type ConfirmationRequest } from '@/components/confirmation';
import { Plan, type PlanData } from '@/components/plan';
import { Markdown } from '@/components/markdown';
import { PromptInput } from '@/components/prompt-input';
import { Reasoning, type ReasoningData } from '@/components/reasoning';
import { SandboxRun, type SandboxRunData } from '@/components/sandbox-run';
import { Sources, type Source } from '@/components/sources';
import { StackTrace } from '@/components/stack-trace';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  files: string[];
  /** Work an assistant message did before answering. */
  reasoning?: ReasoningData;
  plan?: PlanData;
  steps?: ChainStep[];
  /** Commands the assistant already ran, with their output. */
  runs?: SandboxRunData[];
  /** Full stack traces of errors the assistant hit. */
  errors?: string[];
  /** Pages the assistant read, listed after the reply. */
  sources?: Source[];
  /** Commands the assistant asked permission to run. */
  confirmations?: ConfirmationRequest[];
}

interface ChatViewProps {
  title: string;
  subtitle?: string;
  detail?: string;
  messages: Message[];
  onSend: (text: string, files: File[]) => void;
  controls?: ReactNode;
  onResolveConfirmation: (messageId: string, confirmationId: string, approved: boolean) => void;
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; nothing useful to do then.
    }
  }

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : 'Copy message'}
      title="Copy message"
      onClick={() => void copy()}
      className="w-fit rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
    >
      {copied ? <CheckIcon className="size-3.5" aria-hidden="true" /> : <CopyIcon className="size-3.5" aria-hidden="true" />}
    </button>
  );
}

export function ChatView({ title, subtitle, detail, messages, onSend, controls, onResolveConfirmation }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-44">
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
                <div className={`group/message flex min-w-0 flex-col gap-1 ${message.role === 'user' ? 'max-w-[80%] items-end' : 'w-full items-start'}`}>
                <div className={`text-sm leading-relaxed ${message.role === 'user' ? 'rounded-2xl bg-muted px-4 py-2.5' : 'flex w-full min-w-0 flex-col gap-3 px-1'}`}>
                  {message.reasoning && <Reasoning reasoning={message.reasoning} />}
                  {message.plan && <Plan plan={message.plan} />}
                  {message.steps && message.steps.length > 0 && <ChainOfThought steps={message.steps} />}
                  {message.runs?.map(run => <SandboxRun key={run.id} run={run} />)}
                  {message.errors?.map((stack, index) => <StackTrace key={index} stack={stack} defaultOpen />)}
                  {message.confirmations?.map(request => (
                    <Confirmation
                      key={request.id}
                      request={request}
                      onApprove={() => onResolveConfirmation(message.id, request.id, true)}
                      onDeny={() => onResolveConfirmation(message.id, request.id, false)}
                    />
                  ))}
                  {message.files.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {message.files.map((name, index) => (
                        <span key={`${name}-${index}`} className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-xs">
                          <FileIcon className="size-3.5" aria-hidden="true" />{name}
                        </span>
                      ))}
                    </div>
                  )}
                  {message.role === 'assistant' ? <Markdown>{message.text}</Markdown> : <p className="whitespace-pre-wrap">{message.text}</p>}
                  {message.sources && <Sources sources={message.sources} />}
                </div>
                {message.text && <CopyMessageButton text={message.text} />}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-28 bg-gradient-to-t from-background/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl px-6 pb-4">
          <PromptInput onSend={onSend} placeholder="พิมพ์ข้อความถึง Codex..." controls={controls} />
          <p className="mt-2 text-center text-xs text-muted-foreground">ยังไม่ได้เชื่อมต่อ Codex engine จึงยังไม่มีคำตอบกลับ</p>
        </div>
      </div>
    </div>
  );
}
