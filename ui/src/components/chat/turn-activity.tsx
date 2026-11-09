import { useEffect, useState } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import type { TokenBreakdown } from '@/lib/codex';

/** 12.3k, 812, 1.2M. */
export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** 1:42 or 1:02:09, for a running counter. */
export function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** 3 นาที 12 วินาที, for the summary. */
export function words(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [h > 0 ? `${h} ชั่วโมง` : '', m > 0 ? `${m} นาที` : '', s > 0 || seconds === 0 ? `${s} วินาที` : ''].filter(Boolean);
  return parts.join(' ');
}

/** The line shown while the agent works: what it is doing, how long, how many tokens so far. */
export function ActivityLine({ activity, startedMs, tokens }: { activity: string; startedMs?: number; tokens?: TokenBreakdown }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedMs === undefined) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedMs]);

  return (
    <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span className="font-medium text-foreground">{activity}</span>
      {startedMs !== undefined && <span className="tabular-nums">· {clock(now - startedMs)}</span>}
      <span className="tabular-nums">· {tokens && tokens.total > 0 ? `${formatTokens(tokens.total)} โทเค็น` : '— โทเค็น'}</span>
    </p>
  );
}

/** The line at the end of a turn: how it ended, how long it took, how many tokens it used. */
export function TurnSummary({ outcome, elapsedMs, tokens }: { outcome: 'completed' | 'failed' | 'interrupted'; elapsedMs?: number; tokens?: TokenBreakdown }) {
  const time = elapsedMs !== undefined ? words(elapsedMs) : '';
  const used = tokens && tokens.total > 0 ? tokens : undefined;
  if (!time && !used) return null;
  const lead = outcome === 'completed' ? 'เสร็จใน' : outcome === 'interrupted' ? 'ถูกหยุดหลัง' : 'หยุดเพราะผิดพลาดหลัง';
  const parts = [
    time ? `${lead} ${time}` : lead === 'เสร็จใน' ? 'เสร็จ' : lead.replace(/หลัง$/, ''),
    used ? `ใช้ ${formatTokens(used.total)} โทเค็น (ส่งเข้า ${formatTokens(used.input)}, ตอบ ${formatTokens(used.output)})` : '',
  ].filter(Boolean);
  return <p className={`text-xs ${outcome === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{parts.join(' · ')}</p>;
}
