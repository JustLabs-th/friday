import { useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Message } from '@/components/chat/chat-view';
import type { ConfirmationRequest } from '@/components/chat/confirmation';
import type { PlanData } from '@/components/chat/plan';
import { derivePlan } from '@/lib/work-plan';
import type { ModelInfo, Effort } from '@/lib/models';

export interface EngineInfo { connectionId: number; binary: string; cwd: string; server: { userAgent?: string } }
export interface McpServer {
  name: string;
  /** notStarted, starting, connected, authenticationRequired, failed, cancelled or disabled. */
  status: string;
  /** unknown, unsupported, notLoggedIn, bearerToken or oAuth. */
  auth: string;
  origin?: string;
  toolCount: number;
  error?: string;
}
interface RawMcpServer { name: string; runtimeStatus?: string | null; authStatus: string; httpOrigin?: string | null; tools?: Record<string, unknown>; toolsError?: string | null }
/** What happened when the turn's changes were saved to the company Git server. */
export interface PublishNote { status: 'saved' | 'open' | 'skipped' | 'error'; message: string; url?: string }
export interface Connector { id: string; name: string; description?: string; logoUrl?: string; connected: boolean; enabled: boolean }
interface RawApp { id: string; name: string; description?: string | null; logoUrl?: string | null; isAccessible: boolean; isEnabled: boolean }
export interface CodexThread { id: string; name?: string | null; preview: string; cwd: string; updatedAt?: number; turns?: WireTurn[] }
interface Input { type: string; text?: string; url?: string; path?: string }
interface Item {
  id: string; type: string; text?: string; content?: Input[]; summary?: string[];
  command?: string; aggregatedOutput?: string; status?: string; exitCode?: number | null;
  changes?: { path: string; diff: string }[];
  server?: string; tool?: string; error?: { message: string }; result?: unknown;
  action?: { type: string; url?: string; query?: string; queries?: string[] };
}
interface WireTurn { id: string; status: string; items: Item[]; error?: { message: string } | null }
interface Turn extends WireTurn { plan?: PlanData; approvals?: ConfirmationRequest[]; publish?: PublishNote }
interface RpcMessage {
  id?: string | number; method: string;
  params: {
    threadId?: string; turnId?: string; itemId?: string; delta?: string; summaryIndex?: number;
    item?: Item; turn?: WireTurn; thread?: CodexThread; error?: { message: string }; willRetry?: boolean;
    explanation?: string; plan?: { step: string; status: string }[];
    command?: string; reason?: string; cwd?: string; kind?: string; requestId?: string | number;
  };
}
interface Envelope { connectionId: number; message: RpcMessage }
interface LiveModel {
  id: string; model: string; displayName: string; isDefault: boolean;
  defaultReasoningEffort: string; supportedReasoningEfforts: { reasoningEffort: string }[];
}
interface Snapshot {
  status: 'browser' | 'connecting' | 'ready' | 'error';
  info: EngineInfo | null; error: string; account: string;
  models: ModelInfo[]; defaultModel: string;
  threads: Record<string, CodexThread>; messages: Record<string, Message[]>;
  running: Record<string, string>; loading: Record<string, boolean>;
}

export function samePath(left: string, right: string) {
  const normalize = (path: string) => {
    const value = path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
    return /^[a-z]:/i.test(value) ? value.toLowerCase() : value;
  };
  return normalize(left) === normalize(right);
}

const rpc = <T>(method: string, params: unknown = {}) => invoke<T>('codex_request', { method, params });
const isActive = (status: string) => status === 'inProgress';
const failed = (status?: string) => ['failed', 'declined', 'interrupted'].includes(status || '');

/** Render only model-provided reasoning summaries, never raw reasoning content. */
function renderTurns(turns: Turn[]): Message[] {
  return turns.flatMap(turn => {
    const users: Message[] = turn.items.filter(item => item.type === 'userMessage').map(item => {
      const content = item.content || [];
      return {
        id: item.id, role: 'user', text: content.find(input => input.type === 'text')?.text || '',
        files: content.slice(1).map(input => input.type === 'text' ? input.text?.match(/^Attached file: (.+)\n/)?.[1] : 'Image').filter((name): name is string => !!name),
      };
    });
    const reasoning = turn.items.filter(item => item.type === 'reasoning');
    const runs = turn.items.filter(item => item.type === 'commandExecution' || item.type === 'fileChange').map(item => ({
      id: item.id,
      title: item.type === 'commandExecution' ? item.command || 'Command' : `File changes: ${(item.changes || []).map(change => change.path).join(', ')}`,
      code: item.type === 'commandExecution' ? item.command : (item.changes || []).map(change => `--- ${change.path}\n${change.diff}`).join('\n\n'),
      output: item.aggregatedOutput || (item.exitCode != null ? `Exit code: ${item.exitCode}` : undefined),
      state: isActive(item.status || '') && isActive(turn.status) ? 'running' as const : failed(item.status) || (item.exitCode != null && item.exitCode !== 0) ? 'error' as const : 'completed' as const,
      collapsed: true,
      files: item.type === 'fileChange' ? item.changes : undefined,
    }));
    const steps = turn.items.filter(item => ['mcpToolCall', 'webSearch', 'dynamicToolCall', 'collabAgentToolCall'].includes(item.type)).map(item => ({
      id: item.id,
      title: item.type === 'webSearch' ? `Web: ${item.action?.query || item.action?.queries?.join(', ') || item.action?.url || 'Search'}` : [item.server, item.tool || item.type].filter(Boolean).join(' / '),
      status: isActive(item.status || '') && isActive(turn.status) ? 'running' as const : failed(item.status) ? 'error' as const : undefined,
      output: item.error?.message,
    }));
    const sources = turn.items.filter(item => item.type === 'webSearch' && item.action?.url).map(item => ({ url: item.action!.url! }));
    const assistant: Message = {
      id: `turn:${turn.id}`, role: 'assistant', files: [],
      text: turn.items.filter(item => item.type === 'agentMessage').map(item => item.text || '').filter(Boolean).join('\n\n'),
      reasoning: reasoning.length ? { text: reasoning.flatMap(item => item.summary || []).join('\n\n'), running: isActive(turn.status) && !turn.items.some(item => item.type === 'agentMessage') } : undefined,
      // The model's own plan when it made one; otherwise one built from what it actually did.
      plan: turn.plan || derivePlan(turn.items, (users[users.length - 1]?.text || ''), isActive(turn.status)),
      publish: turn.publish,
      running: isActive(turn.status) || undefined,
      runs: runs.length ? runs : undefined,
      steps: steps.length ? steps : undefined,
      sources: sources.length ? sources : undefined,
      confirmations: turn.approvals,
      errors: turn.error ? [turn.error.message] : undefined,
    };
    return [...users, ...(assistant.text || reasoning.length || runs.length || steps.length || turn.plan || turn.error || turn.approvals?.length || turn.publish ? [assistant] : [])];
  });
}

async function inputs(text: string, files: File[]): Promise<Input[]> {
  const result: Input[] = [{ type: 'text', text }];
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: รองรับไฟล์ขนาดไม่เกิน 10 MB`);
    if (file.type.startsWith('image/')) {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`อ่าน ${file.name} ไม่สำเร็จ`));
        reader.readAsDataURL(file);
      });
      result.push({ type: 'image', url });
    } else {
      let content: string;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error(`${file.name}: รอบนี้รองรับไฟล์ข้อความ UTF-8 และรูปภาพ`); }
      if (content.includes('\0')) throw new Error(`${file.name}: ไม่รองรับไฟล์ binary`);
      result.push({ type: 'text', text: `Attached file: ${file.name}\n\n${content}` });
    }
  }
  return result;
}

class CodexClient {
  private snapshot: Snapshot = { status: isTauri() ? 'connecting' : 'browser', info: null, error: '', account: '', models: [], defaultModel: '', threads: {}, messages: {}, running: {}, loading: {} };
  private listeners = new Set<() => void>();
  private unlisten: UnlistenFn[] = [];
  private connecting: Promise<EngineInfo> | null = null;
  /** Chats from another provider: shown for reading, with the reason they cannot be continued. */
  private readOnly = new Map<string, string>();
  private turns = new Map<string, Turn[]>();
  private loaded = new Set<string>();
  private resuming = new Map<string, Promise<void>>();
  private starting = new Map<string, Promise<{ turn: WireTurn }>>();
  private buffered = new Map<string, RpcMessage[]>();
  private approvals = new Map<string, RpcMessage>();
  private dirty = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private update(change: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.listeners.forEach(listener => listener());
  }
  report = (error: unknown) => this.update({ error: String(error) });
  clearError = () => this.update({ error: '' });

  private publish(threadId: string) {
    this.dirty.add(threadId);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const messages = { ...this.snapshot.messages };
      for (const id of this.dirty) messages[id] = renderTurns(this.turns.get(id) || []);
      this.dirty.clear();
      this.update({ messages });
    }, 16);
  }
  private turn(threadId: string, turnId: string): Turn {
    const turns = this.turns.get(threadId) || [];
    let turn = turns.find(item => item.id === turnId);
    if (!turn) { turn = { id: turnId, status: 'inProgress', items: [] }; turns.push(turn); }
    this.turns.set(threadId, turns);
    return turn;
  }
  private running(threadId: string, turnId: string | null) {
    const running = { ...this.snapshot.running };
    if (turnId) running[threadId] = turnId;
    else delete running[threadId];
    this.update({ running });
  }
  private event = (message: RpcMessage) => {
    const p = message.params || {};
    if (message.method === 'thread/started' && p.thread) {
      this.update({ threads: { ...this.snapshot.threads, [p.thread.id]: p.thread } });
      return;
    }
    const threadId = p.threadId;
    if (!threadId) return;
    const buffer = this.buffered.get(threadId);
    if (buffer) { buffer.push(message); return; }
    const turnId = p.turnId || p.turn?.id || this.snapshot.running[threadId];
    if (!turnId) return;
    const turn = this.turn(threadId, turnId);
    switch (message.method) {
      case 'turn/started':
        turn.status = 'inProgress';
        this.running(threadId, turnId);
        break;
      case 'item/started':
      case 'item/completed':
        if (p.item) {
          const index = turn.items.findIndex(item => item.id === p.item!.id);
          if (index < 0) turn.items.push(p.item);
          else turn.items[index] = { ...turn.items[index], ...p.item };
        }
        break;
      case 'item/agentMessage/delta': {
        let item = turn.items.find(item => item.id === p.itemId);
        if (!item) { item = { id: p.itemId!, type: 'agentMessage', text: '' }; turn.items.push(item); }
        item.text = (item.text || '') + (p.delta || '');
        break;
      }
      case 'item/commandExecution/outputDelta': {
        const item = turn.items.find(item => item.id === p.itemId);
        if (item) item.aggregatedOutput = ((item.aggregatedOutput || '') + (p.delta || '')).slice(-200_000);
        break;
      }
      case 'item/reasoning/summaryTextDelta': {
        let item = turn.items.find(item => item.id === p.itemId);
        if (!item) { item = { id: p.itemId!, type: 'reasoning', summary: [] }; turn.items.push(item); }
        const index = p.summaryIndex || 0;
        item.summary ||= [];
        item.summary[index] = (item.summary[index] || '') + (p.delta || '');
        break;
      }
      case 'turn/plan/updated':
        turn.plan = { title: p.explanation || 'Plan', steps: (p.plan || []).map((step, i) => ({ id: `${turnId}:${i}`, title: step.step, status: step.status === 'completed' ? 'done' : step.status === 'inProgress' ? 'running' : 'pending' })) };
        break;
      case 'turn/completed':
        turn.status = p.turn?.status || 'completed';
        turn.error = p.turn?.error;
        turn.approvals = turn.approvals?.map(a => a.state === 'requested' ? { ...a, state: 'resolved' } : a);
        this.running(threadId, null);
        for (const [key, request] of this.approvals) if (request.params.threadId === threadId && request.params.turnId === turnId) this.approvals.delete(key);
        if (turn.status === 'completed') void this.saveWork(threadId, turnId);
        break;
      case 'error':
        if (p.error) { turn.error = p.error; this.report(p.error.message); }
        if (!p.willRetry) { turn.status = 'failed'; this.running(threadId, null); }
        break;
      case 'serverRequest/resolved': {
        const key = JSON.stringify(p.requestId);
        this.approvals.delete(key);
        turn.approvals = turn.approvals?.map(a => a.id === key && a.state === 'requested' ? { ...a, state: 'resolved' } : a);
        break;
      }
      default: return;
    }
    this.publish(threadId);
  };

  /**
   * After a turn finishes, saves its changes to the company Git server (commit, pull request, merge).
   * People never have to touch git; the result is shown under the reply. Quiet only when there is
   * nothing to save; otherwise it says what happened or why nothing was saved.
   */
  private async saveWork(threadId: string, turnId: string) {
    const thread = this.snapshot.threads[threadId];
    if (!isTauri() || !thread?.cwd) return;
    const turn = this.turn(threadId, turnId);
    const request = (turn.items.find(item => item.type === 'userMessage')?.content || []).find(input => input.type === 'text')?.text || thread.name || thread.preview || 'Update';
    try {
      const result = await invoke<{ status: string; message: string; url?: string | null }>('publish_changes', { cwd: thread.cwd, summary: request });
      // Say why when nothing was saved (not connected, not on the company Git server); stay quiet only when there was nothing to save.
      if (result.status !== 'saved' && result.status !== 'open' && result.status !== 'skipped' && result.status !== 'error') return;
      turn.publish = { status: result.status, message: result.message, url: result.url || undefined };
    } catch (error) {
      turn.publish = { status: 'error', message: `บันทึกงานขึ้น Gitea ไม่สำเร็จ: ${String(error)}` };
    }
    this.publish(threadId);
  }

  private approval = (message: RpcMessage) => {
    const p = message.params;
    if (message.id == null || !p.threadId || !p.turnId) return;
    const key = JSON.stringify(message.id);
    this.approvals.set(key, message);
    const turn = this.turn(p.threadId, p.turnId);
    const item = turn.items.find(item => item.id === p.itemId);
    const changes = item?.changes?.map(change => `--- ${change.path}\n${change.diff}`).join('\n\n');
    const confirmation: ConfirmationRequest = {
      id: key, command: p.command || item?.command || changes || 'File changes', state: 'requested',
      kind: message.method === 'item/fileChange/requestApproval' ? 'files' : 'command',
      reason: p.reason, cwd: p.cwd || this.snapshot.threads[p.threadId]?.cwd,
    };
    turn.approvals = [...(turn.approvals || []).filter(a => a.id !== key), confirmation];
    this.running(p.threadId, p.turnId);
    this.publish(p.threadId);
  };

  /** MCP servers the engine knows, with their connection and sign-in state. */
  mcpServers = async (): Promise<McpServer[]> => {
    await this.connect();
    const servers: McpServer[] = [];
    let cursor: string | undefined;
    do {
      const page = await rpc<{ data: RawMcpServer[]; nextCursor?: string | null }>('mcpServerStatus/list', { cursor, limit: 100, detail: 'toolsAndAuthOnly' });
      servers.push(...page.data.map(server => ({
        name: server.name,
        status: server.runtimeStatus || 'notStarted',
        auth: server.authStatus,
        origin: server.httpOrigin || undefined,
        toolCount: Object.keys(server.tools || {}).length,
        error: server.toolsError || undefined,
      })));
      cursor = page.nextCursor || undefined;
    } while (cursor);
    return servers;
  };

  /** Reloads the MCP configuration so servers added or changed in the engine's config are picked up. */
  reloadMcp = async (): Promise<void> => {
    await this.connect();
    await rpc('config/mcpServer/reload');
  };

  /** Connectors (apps) the engine offers; empty when the account has none. */
  connectors = async (): Promise<Connector[]> => {
    await this.connect();
    const apps: Connector[] = [];
    let cursor: string | undefined;
    do {
      const page = await rpc<{ data: RawApp[]; nextCursor?: string | null }>('app/list', { cursor, limit: 100 });
      apps.push(...page.data.map(app => ({ id: app.id, name: app.name, description: app.description || undefined, logoUrl: app.logoUrl || undefined, connected: app.isAccessible, enabled: app.isEnabled })));
      cursor = page.nextCursor || undefined;
    } while (cursor);
    return apps;
  };

  /** Stops the engine and starts it again, so a changed gateway sign-in takes effect. */
  restart = async (): Promise<EngineInfo> => {
    await invoke('codex_disconnect');
    // The old connection is gone: forget it so connect() starts a new one instead of reusing it.
    this.loaded.clear();
    this.approvals.clear();
    this.update({ status: 'connecting', info: null, running: {}, error: '' });
    return this.connect();
  };

  connect = (): Promise<EngineInfo> => {
    if (this.snapshot.status === 'ready' && this.snapshot.info) return Promise.resolve(this.snapshot.info);
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  };
  private async open(): Promise<EngineInfo> {
    if (!isTauri()) throw new Error('เชื่อม Liam ได้ในแอป Friday Desktop เท่านั้น');
    this.update({ status: 'connecting', error: '' });
    try {
      if (!this.unlisten.length) {
        this.unlisten.push(await listen<Envelope>('codex-event', e => {
          if (e.payload.connectionId === this.snapshot.info?.connectionId) this.event(e.payload.message);
        }));
        this.unlisten.push(await listen<Envelope>('codex-approval', e => {
          if (e.payload.connectionId === this.snapshot.info?.connectionId) this.approval(e.payload.message);
        }));
        this.unlisten.push(await listen<Envelope>('codex-unsupported', e => {
          if (e.payload.connectionId === this.snapshot.info?.connectionId) this.report(`Friday ยังไม่รองรับ ${e.payload.message.method}; Liam ได้รับการปฏิเสธคำขอนี้แล้ว`);
        }));
        this.unlisten.push(await listen<{ connectionId: number }>('codex-disconnected', e => {
          if (e.payload.connectionId === this.snapshot.info?.connectionId) {
            for (const threadId of Object.keys(this.snapshot.running)) {
              const turn = this.turn(threadId, this.snapshot.running[threadId]);
              turn.status = 'failed'; turn.error = { message: 'Liam disconnected' }; this.publish(threadId);
            }
            this.loaded.clear();
            this.update({ status: 'error', running: {}, error: 'Liam disconnected. กดเชื่อมต่อใหม่เพื่อทำต่อ' });
          }
        }));
      }
      const previousId = this.snapshot.info?.connectionId;
      const info = await invoke<EngineInfo>('codex_connect');
      this.update({ info });
      if (previousId !== info.connectionId) { this.loaded.clear(); this.approvals.clear(); this.update({ running: {} }); }
      const [account, catalog] = await Promise.all([
        rpc<{ account: { email?: string; type?: string } | null }>('account/read', { refreshToken: false }),
        this.catalog(),
      ]);
      this.update({ status: 'ready', account: account.account?.email || account.account?.type || 'Liam configuration', models: catalog.models, defaultModel: catalog.defaultModel });
      const pending = await invoke<RpcMessage[]>('codex_pending');
      pending.forEach(this.approval);
      return info;
    } catch (error) { this.update({ status: 'error', error: String(error) }); throw error; }
  }

  private async catalog() {
    const data: LiveModel[] = [];
    let cursor: string | undefined;
    do {
      const page = await rpc<{ data: LiveModel[]; nextCursor?: string | null }>('model/list', { cursor, limit: 100 });
      data.push(...page.data); cursor = page.nextCursor || undefined;
    } while (cursor);
    const valid = new Set<string>(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
    const models: ModelInfo[] = data.map(model => ({
      id: model.model, name: model.displayName || model.model, family: model.model.split('-').slice(0, 2).join('-').toUpperCase(),
      defaultEffort: (valid.has(model.defaultReasoningEffort) ? model.defaultReasoningEffort : 'medium') as Effort,
      efforts: model.supportedReasoningEfforts.map(option => option.reasoningEffort).filter(e => valid.has(e)) as Effort[],
    }));
    return { models, defaultModel: data.find(model => model.isDefault)?.model || models[0]?.id || '' };
  }

  loadProject = async (path: string) => {
    if (!path) return;
    await this.connect();
    const threads = { ...this.snapshot.threads };
    let cursor: string | undefined;
    do {
      const page = await rpc<{ data: CodexThread[]; nextCursor?: string | null }>('thread/list', { cwd: path, limit: 100, cursor, sortKey: 'updated_at' });
      page.data.forEach(thread => { threads[thread.id] = thread; });
      cursor = page.nextCursor || undefined;
    } while (cursor);
    // Merge with threads created while the history request was in flight.
    this.update({ threads: { ...this.snapshot.threads, ...threads } });
  };

  start = async (path: string, prompt = '') => {
    if (!path) throw new Error('เลือกโฟลเดอร์ของ project ก่อนเริ่ม session');
    await this.connect();
    const result = await rpc<{ thread: CodexThread }>('thread/start', {
      cwd: path, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write',
      ...(prompt ? { developerInstructions: prompt } : {}),
    });
    if (!samePath(result.thread.cwd, path)) throw new Error(`Liam ใช้โฟลเดอร์ ${result.thread.cwd} ซึ่งไม่ตรงกับ ${path}; ยังไม่ได้ส่งข้อความ`);
    this.loaded.add(result.thread.id);
    this.turns.set(result.thread.id, []);
    this.update({ threads: { ...this.snapshot.threads, [result.thread.id]: result.thread } });
    return result.thread;
  };

  resume = (threadId: string): Promise<void> => {
    const existing = this.resuming.get(threadId);
    if (existing) return existing;
    const result = this.resumeThread(threadId).finally(() => this.resuming.delete(threadId));
    this.resuming.set(threadId, result);
    return result;
  };
  private async resumeThread(threadId: string) {
    await this.connect();
    if (this.loaded.has(threadId)) return;
    if (this.buffered.has(threadId)) return;
    this.buffered.set(threadId, []);
    this.update({ loading: { ...this.snapshot.loading, [threadId]: true } });
    try {
      let thread: CodexThread;
      try {
        thread = (await rpc<{ thread: CodexThread }>('thread/resume', { threadId, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write' })).thread;
        this.readOnly.delete(threadId);
      } catch (error) {
        // A chat made under another provider (OpenAI vs the company gateway) cannot be continued
        // here, but its history can still be read.
        const message = String(error);
        if (!/modelProviderMismatch|current provider/.test(message)) throw error;
        thread = (await rpc<{ thread: CodexThread }>('thread/read', { threadId, includeTurns: true })).thread;
        this.readOnly.set(threadId, message.match(/This chat uses [^,]+/)?.[0] || 'Chat นี้ใช้ provider อื่น');
        this.turns.set(threadId, (thread.turns || []).map(turn => ({ ...turn, items: turn.items || [] })));
        this.update({ threads: { ...this.snapshot.threads, [threadId]: thread } });
        this.publish(threadId);
        return;
      }
      this.turns.set(threadId, (thread.turns || []).map(turn => ({ ...turn, items: turn.items || [] })));
      this.loaded.add(threadId);
      this.update({ threads: { ...this.snapshot.threads, [threadId]: thread } });
      const live = thread.turns?.find(turn => isActive(turn.status));
      this.running(threadId, live?.id || null);
      const queued = this.buffered.get(threadId) || [];
      this.buffered.delete(threadId);
      queued.forEach(this.event);
      (await invoke<RpcMessage[]>('codex_pending')).filter(request => request.params.threadId === threadId).forEach(this.approval);
      this.publish(threadId);
    } finally {
      this.buffered.delete(threadId);
      this.update({ loading: { ...this.snapshot.loading, [threadId]: false } });
    }
  };

  send = async (threadId: string, text: string, files: File[], model: string, effort: Effort) => {
    await this.resume(threadId);
    const readOnly = this.readOnly.get(threadId);
    if (readOnly) throw new Error(`${readOnly} จึงส่งข้อความต่อที่นี่ไม่ได้ (ออกจากระบบ/เข้าสู่ระบบ gateway เพื่อสลับ provider) เปิดเริ่ม session ใหม่เพื่อคุยต่อ`);
    if (this.snapshot.running[threadId]) throw new Error('Session นี้กำลังทำงานอยู่');
    const input = await inputs(text, files);
    this.running(threadId, 'starting');
    try {
      const accepted = rpc<{ turn: WireTurn }>('turn/start', {
        threadId, input,
        ...(this.snapshot.models.some(m => m.id === model) ? { model, effort } : {}),
      });
      this.starting.set(threadId, accepted);
      const result = await accepted;
      // The completion event may precede the response on fast turns.
      if (this.snapshot.running[threadId]) this.running(threadId, result.turn.id);
      const thread = this.snapshot.threads[threadId];
      if (thread) this.update({ threads: { ...this.snapshot.threads, [threadId]: { ...thread, preview: thread.preview || text.slice(0, 80), updatedAt: Date.now() / 1000 } } });
    } catch (error) { this.running(threadId, null); throw error; }
    finally { this.starting.delete(threadId); }
  };

  stop = async (threadId: string) => {
    if (this.starting.has(threadId)) await this.starting.get(threadId);
    const turnId = this.snapshot.running[threadId];
    if (turnId && turnId !== 'starting') await rpc('turn/interrupt', { threadId, turnId });
  };
  respond = async (key: string, approved: boolean) => {
    const request = this.approvals.get(key);
    if (!request) throw new Error('คำขออนุมัตินี้หมดอายุแล้ว');
    await invoke('codex_respond', { id: request.id, decision: approved ? 'accept' : 'decline' });
    this.approvals.delete(key);
    const { threadId, turnId } = request.params;
    const turn = this.turn(threadId!, turnId!);
    turn.approvals = turn.approvals?.map(a => a.id === key ? { ...a, state: approved ? 'approved' : 'denied' } : a);
    this.publish(threadId!);
  };
  rename = async (threadId: string, name: string) => {
    await rpc('thread/name/set', { threadId, name });
    const thread = this.snapshot.threads[threadId];
    if (thread) this.update({ threads: { ...this.snapshot.threads, [threadId]: { ...thread, name } } });
  };
  archive = async (threadId: string) => {
    if (this.snapshot.running[threadId]) throw new Error('หยุด session ก่อนนำออกจากรายการ');
    await rpc('thread/archive', { threadId });
    const threads = { ...this.snapshot.threads }; delete threads[threadId];
    const messages = { ...this.snapshot.messages }; delete messages[threadId];
    this.turns.delete(threadId); this.loaded.delete(threadId);
    this.update({ threads, messages });
  };
  dispose = () => { this.unlisten.forEach(fn => fn()); if (this.flushTimer) clearTimeout(this.flushTimer); };
}

export const codex = new CodexClient();
export function useCodex() { return useSyncExternalStore(codex.subscribe, codex.getSnapshot); }
if (import.meta.hot) import.meta.hot.dispose(() => codex.dispose());
