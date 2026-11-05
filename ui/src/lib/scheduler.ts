import { useEffect, useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface JobInput {
  id?: string; name: string; cwd: string; prompt: string; cron: string; timezone: string;
  enabled: boolean; model: string | null; effort: string | null;
  projectPrompt: string | null; timeoutMinutes: number;
  /** A skill the task runs explicitly; `path` is the skill's SKILL.md. */
  skill?: { name: string; path: string } | null;
}
export interface Job extends JobInput { id: string; nextRunAt: number | null; createdAt: number }
export interface ScheduledRun {
  id: string; jobId: string; jobName: string; cwd: string; status: string; trigger: string;
  startedAt: number; finishedAt: number | null; threadId: string | null; output: string; error: string | null;
}
let snapshot: { jobs: Job[]; runs: ScheduledRun[]; error: string | null; ready: boolean } = { jobs: [], runs: [], error: null, ready: false };
const listeners = new Set<() => void>();
function publish() { listeners.forEach(listener => listener()); }
let started = false;
let refreshVersion = 0;
export const scheduler = {
  async refresh() {
    if (!isTauri()) return;
    const version = ++refreshVersion;
    try {
      const result = await invoke<Omit<typeof snapshot, 'ready'>>('scheduler_list');
      if (version !== refreshVersion) return;
      snapshot = { ...result, ready: true };
    }
    catch (error) { if (version !== refreshVersion) return; snapshot = { ...snapshot, error: String(error), ready: true }; }
    publish();
  },
  async save(input: JobInput) { const job = await invoke<Job>('scheduler_save', { input }); await scheduler.refresh(); return job; },
  async remove(id: string) { await invoke('scheduler_delete', { id }); await scheduler.refresh(); },
  async run(id: string) { await invoke('scheduler_run', { id }); await scheduler.refresh(); },
  async stop(id: string) { await invoke('scheduler_stop', { id }); await scheduler.refresh(); },
  preview(cron: string, timezone: string) { return invoke<number[]>('scheduler_preview', { cron, timezone }); },
};
export function useScheduler() {
  useEffect(() => {
    if (started || !isTauri()) return;
    started = true;
    void Promise.all([
      listen('scheduler-changed', () => { void scheduler.refresh(); }),
      listen<string>('scheduler-error', event => { snapshot = { ...snapshot, error: event.payload }; publish(); }),
    ]).then(() => scheduler.refresh()).catch(error => { snapshot = { ...snapshot, error: String(error) }; publish(); });
  }, []);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => snapshot);
}
export function isRunActive(status: string) { return ['starting', 'running', 'waitingApproval', 'stopping'].includes(status); }
