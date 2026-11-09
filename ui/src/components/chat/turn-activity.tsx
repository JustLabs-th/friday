import { useEffect, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import type { TokenBreakdown } from '@/lib/codex';

/** 12.3k, 812, 1.2M. */
export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** 17s, 1m 05s, 1h 02m: the running counter. */
export function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** 3 min 12 s, for the summary. */
export function words(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [h > 0 ? `${h} h` : '', m > 0 ? `${m} min` : '', s > 0 || seconds === 0 ? `${s} s` : ''].filter(Boolean);
  return parts.join(' ');
}

/** Four dots in a square that light up one after another. */
function DotsSpinner() {
  return (
    <span className="grid size-3.5 shrink-0 grid-cols-2 gap-[3px]" role="img" aria-label="Working">
      {[0, 1, 3, 2].map((delay, index) => (
        <span
          key={index}
          className="size-1.5 animate-pulse rounded-full bg-orange-500 motion-reduce:animate-none"
          style={{ animationDelay: `${delay * 0.25}s`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

/**
 * The bar shown while the agent works: a dots spinner, what it is working on (the plan's current step, else what
 * it is doing), and the time; the arrow opens the details (what it is doing, time, tokens so far).
 */
export function ActivityLine({
  activity,
  label,
  startedMs,
  tokens,
}: {
  /** What the agent is doing right now (thinking, running a command...). */
  activity: string;
  /** The task it is working on, usually the current step of the plan. Falls back to `activity`. */
  label?: string;
  startedMs?: number;
  tokens?: TokenBreakdown;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (startedMs === undefined) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedMs]);

  const title = label || activity;
  const time = startedMs !== undefined ? clock(now - startedMs) : undefined;
  const used = tokens && tokens.total > 0 ? tokens : undefined;

  return (
    <div role="status" className="flex min-w-0 flex-col gap-1 text-sm">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-3 rounded-md py-1 text-left"
      >
        <DotsSpinner />
        <span className="shimmer min-w-0 flex-1 truncate" title={title}>
          {title}
        </span>
        {time && <span className="shrink-0 tabular-nums text-muted-foreground">{time}</span>}
        <ChevronRightIcon
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <dl className="ml-[26px] grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <dt>Doing</dt>
          <dd className="text-foreground">{activity}</dd>
          {time && (
            <>
              <dt>Time</dt>
              <dd className="tabular-nums text-foreground">{time}</dd>
            </>
          )}
          <dt>Tokens</dt>
          <dd className="tabular-nums text-foreground">
            {used ? `${formatTokens(used.total)} (in ${formatTokens(used.input)}, out ${formatTokens(used.output)})` : '— (reported after each step finishes)'}
          </dd>
        </dl>
      )}
    </div>
  );
}

/** The line at the end of a turn: how it ended, how long it took, how many tokens it used. */
export function TurnSummary({ outcome, elapsedMs, tokens }: { outcome: 'completed' | 'failed' | 'interrupted'; elapsedMs?: number; tokens?: TokenBreakdown }) {
  const time = elapsedMs !== undefined ? words(elapsedMs) : '';
  const used = tokens && tokens.total > 0 ? tokens : undefined;
  if (!time && !used) return null;
  const label = { completed: 'Finished', interrupted: 'Stopped', failed: 'Stopped by an error' }[outcome];
  const parts = [
    time ? `${label} ${outcome === 'completed' ? 'in' : 'after'} ${time}` : label,
    used ? `used ${formatTokens(used.total)} tokens (in ${formatTokens(used.input)}, out ${formatTokens(used.output)})` : '',
  ].filter(Boolean);
  return <p className={`text-xs ${outcome === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{parts.join(' · ')}</p>;
}
