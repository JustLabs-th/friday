import { useEffect, useRef, useState, type ReactNode } from 'react';
import { copyText } from '@/lib/clipboard';
import { CheckIcon, CopyIcon, FileIcon } from 'lucide-react';
import { ChainOfThought, type ChainStep } from '@/components/chat/chain-of-thought';
import { type ConfirmationRequest } from '@/components/chat/confirmation';
import { ConfirmationQueue } from '@/components/chat/confirmation-queue';
import { Plan, type PlanData } from '@/components/chat/plan';
import { Markdown } from '@/components/chat/markdown';
import { PromptInput } from '@/components/chat/prompt-input';
import { Reasoning, type ReasoningData } from '@/components/chat/reasoning';
import { type SandboxRunData } from '@/components/chat/sandbox-run';
import { Sources, type Source } from '@/components/chat/sources';
import { StackTrace } from '@/components/chat/stack-trace';
import { ActivityLine, TurnSummary } from '@/components/chat/turn-activity';
import type { TokenBreakdown } from '@/lib/codex';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  files: string[];
  /** Work an assistant message did before answering. */
  reasoning?: ReasoningData;
  plan?: PlanData;
  steps?: ChainStep[];
  /** Commands and file changes of this turn. They are listed under Background tasks, not in the chat. */
  runs?: SandboxRunData[];
  /** The turn is still going. With a plan, the chat shows only the plan until the answer is final. */
  running?: boolean;
  /** Full stack traces of errors the assistant hit. */
  errors?: string[];
  /** Pages the assistant read, listed after the reply. */
  sources?: Source[];
  /** Commands the assistant asked permission to run. */
  confirmations?: ConfirmationRequest[];
  /** Where the turn's changes were saved (the company Git server), once that has happened. */
  publish?: { status: 'saved' | 'open' | 'skipped' | 'error'; message: string; url?: string };
  /** While the turn runs: what the agent is doing now, when the turn started (ms since 1970). */
  activity?: string;
  startedMs?: number;
  /** After it ends: how it ended and how long it took (ms). */
  outcome?: 'completed' | 'failed' | 'interrupted';
  elapsedMs?: number;
  /** Tokens the turn has used (growing while it runs). Absent when the engine reported none. */
  tokens?: TokenBreakdown;
}

interface ChatViewProps {
  title: string;
  subtitle?: string;
  detail?: string;
  messages: Message[];
  onSend: (text: string, files: File[]) => void | boolean | Promise<boolean | void>;
  controls?: ReactNode;
  onResolveConfirmation: (messageId: string, confirmationId: string, approved: boolean) => void;
  connection?: { status: string; error: string; label: string; onReconnect: () => void; onDismiss: () => void };
  running?: boolean;
  loading?: boolean;
  onStop?: () => void;
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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
      {copied ? (
        <CheckIcon className="size-3.5" aria-hidden="true" />
      ) : (
        <CopyIcon className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

export function ChatView({
  title,
  subtitle,
  detail,
  messages,
  onSend,
  controls,
  onResolveConfirmation,
  connection,
  running = false,
  loading = false,
  onStop,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingConfirmations = messages.flatMap(message =>
    (message.confirmations || [])
      .filter(request => request.state === 'requested')
      .map(request => ({ messageId: message.id, request })),
  );
  /** Follow new output while the reader is at the bottom; stop once they scroll up to read. */
  const following = useRef(true);
  const lastCount = useRef(0);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    // A new message (the user just sent one, or a session opened) always jumps to the end.
    if (messages.length !== lastCount.current) following.current = true;
    lastCount.current = messages.length;
    if (following.current) box.scrollTop = box.scrollHeight;
  }, [messages, running]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {connection?.error && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b bg-destructive/5 px-5 py-3 text-sm text-destructive"
        >
          <span className="min-w-0 flex-1 break-words">{connection.error}</span>
          <button type="button" onClick={connection.onReconnect} className="shrink-0 underline">
            เชื่อมต่อใหม่
          </button>
          <button type="button" aria-label="Dismiss error" onClick={connection.onDismiss}>
            ×
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={event => {
          const box = event.currentTarget;
          following.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-44"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="w-full max-w-md text-center">
              <p className="mb-4 text-[10px] tracking-[.25em] text-muted-foreground">FRIDAY</p>
              <h1 id="page-title" className="text-2xl font-medium tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 truncate text-xs text-muted-foreground" title={subtitle}>
                  {subtitle}
                </p>
              )}
              {detail && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
            <h1 id="page-title" className="sr-only">
              {title}
            </h1>
            {messages.map(message => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`group/message flex min-w-0 flex-col gap-1 ${message.role === 'user' ? 'max-w-[80%] items-end' : 'w-full items-start'}`}
                >
                  <div
                    className={`text-sm leading-relaxed ${message.role === 'user' ? 'rounded-2xl bg-muted px-4 py-2.5' : 'flex w-full min-w-0 flex-col gap-3 px-1'}`}
                  >
                    {message.reasoning && <Reasoning reasoning={message.reasoning} />}
                    {message.plan && <Plan plan={message.plan} />}
                    {message.steps && message.steps.length > 0 && <ChainOfThought steps={message.steps} />}
                    {message.errors?.map((stack, index) => (
                      <StackTrace key={index} stack={stack} defaultOpen />
                    ))}
                    {message.files.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {message.files.map((name, index) => (
                          <span
                            key={`${name}-${index}`}
                            className="flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-xs"
                          >
                            <FileIcon className="size-3.5" aria-hidden="true" />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {message.role === 'assistant' ? (
                      !(message.running && message.plan) && <Markdown>{message.text}</Markdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.text}</p>
                    )}
                    {message.publish && (
                      <p
                        className={`text-xs ${message.publish.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
                      >
                        {message.publish.message}
                      </p>
                    )}
                    {message.sources && !message.running && <Sources sources={message.sources} />}
                    {message.role === 'assistant' && message.running && message.activity && (
                      <ActivityLine activity={message.activity} startedMs={message.startedMs} tokens={message.tokens} />
                    )}
                    {message.role === 'assistant' && !message.running && message.outcome && (
                      <TurnSummary outcome={message.outcome} elapsedMs={message.elapsedMs} tokens={message.tokens} />
                    )}
                  </div>
                  {message.text && <CopyMessageButton text={message.text} />}
                </div>
              </div>
            ))}
            {loading && (
              <p role="status" className="text-xs text-muted-foreground">
                กำลังโหลด session…
              </p>
            )}
            {/* The turn has started but nothing of it is on screen yet. */}
            {!loading && running && messages[messages.length - 1]?.role !== 'assistant' && (
              <ActivityLine activity="กำลังเริ่มทำงาน" />
            )}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-28 bg-gradient-to-t from-background/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl px-6 pb-4">
          <ConfirmationQueue items={pendingConfirmations} onResolve={onResolveConfirmation} />
          <PromptInput
            onSend={onSend}
            placeholder="พิมพ์ข้อความถึง Liam..."
            controls={controls}
            disabled={connection ? connection.status !== 'ready' || loading : false}
            running={running}
            onStop={onStop}
          />
          <p
            className="mt-2 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"
            data-testid="codex-status"
          >
            {connection?.label || 'UI preview'}
            {connection?.status === 'error' && (
              <button type="button" onClick={connection.onReconnect} className="underline">
                เชื่อมต่อใหม่
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
