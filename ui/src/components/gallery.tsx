import { useState, type ReactNode } from 'react';
import { ChainOfThought } from '@/components/chat/chain-of-thought';
import { Confirmation, type ConfirmationRequest } from '@/components/chat/confirmation';
import { ConfirmationQueue, type QueuedConfirmation } from '@/components/chat/confirmation-queue';
import { ModelSelector } from '@/components/chat/model-selector';
import { NewProjectDialog } from '@/components/dialogs/new-project-dialog';
import { Plan } from '@/components/chat/plan';
import { Markdown } from '@/components/chat/markdown';
import { PromptInput } from '@/components/chat/prompt-input';
import { Reasoning } from '@/components/chat/reasoning';
import { SandboxRun } from '@/components/chat/sandbox-run';
import { SaveSkillDialog } from '@/components/dialogs/save-skill-dialog';
import { SettingsDialog } from '@/components/dialogs/settings-dialog';
import { Sources } from '@/components/chat/sources';
import { StackTrace } from '@/components/chat/stack-trace';
import { ActivityLine, TurnSummary } from '@/components/chat/turn-activity';
import { ProfileDetails } from '@/components/dialogs/gateway-account';
import { ContextView } from '@/components/panels/session-overview';
import { RightPanel } from '@/components/panels/right-panel';
import { TerminalPanel } from '@/components/panels/terminal-panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { models, type Effort } from '@/lib/models';
import { buildSkillDraft } from '@/lib/skills';
import { sampleCharts, sampleReply } from '@/lib/sample-markdown';

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b py-8 last:border-b-0">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {note && <p className="mt-0.5 text-sm text-muted-foreground">{note}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      {children}
    </div>
  );
}

const stackSample = [
  "Error: ENOENT: no such file or directory, open 'bench/results.csv'",
  'at readResults (src/bench/read.ts:14:22)',
  'at runBenchmark (src/bench/run.ts:31:9)',
  'at Object.openSync (node:fs:573:18)',
  'at Module._compile (node_modules/ts-node/dist/index.js:1621:23)',
].join('\n');

function QueueDemo() {
  const make = (id: string, command: string): QueuedConfirmation => ({
    messageId: 'm',
    request: { id, command, state: 'requested', cwd: 'E:/Projects/test/work-logs' },
  });
  const [items, setItems] = useState<QueuedConfirmation[]>([
    make('a', 'powershell.exe -Command "Get-ChildItem -Force E:/Projects/test/work-logs | Select-Object Name, Length"'),
    make('b', 'powershell.exe -Command "Get-Content C:/Users/me/.liam/skills/liam-nextjs-project/SKILL.md"'),
    make('c', 'powershell.exe -Command "Test-Path E:/Projects/test/work-logs/node_modules"'),
  ]);
  return items.length ? (
    <ConfirmationQueue
      items={items}
      onResolve={(_, id) => setItems(current => current.filter(item => item.request.id !== id))}
    />
  ) : (
    <Button
      variant="outline"
      size="sm"
      className="w-fit"
      onClick={() => setItems([make('a', 'pnpm ui:check'), make('b', 'git status'), make('c', 'ls')])}
    >
      Reset
    </Button>
  );
}

export function Gallery() {
  const [modelId, setModelId] = useState(models[0].id);
  const [effort, setEffort] = useState<Effort>(models[0].defaultEffort);
  const [dark, setDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [request, setRequest] = useState<ConfirmationRequest>({
    id: 'a',
    command: 'pnpm ui:build',
    state: 'requested',
  });

  function setTheme(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  }

  return (
    <TooltipProvider>
      <div className="h-svh overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pb-24">
          <header className="flex items-center justify-between py-6">
            <div>
              <p className="text-[10px] tracking-[.25em] text-muted-foreground">FRIDAY</p>
              <h1 className="text-2xl font-medium tracking-tight">Component gallery</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                ทุก component ที่ใช้ในแอป พร้อมทุกสถานะ (ข้อมูลทั้งหมดเป็นตัวอย่าง)
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setTheme(!dark)}>
              {dark ? 'Light' : 'Dark'}
            </Button>
          </header>

          <Group title="Prompt input + Model selector" note="Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่, ปุ่ม + แนบไฟล์">
            <PromptInput
              onSend={() => undefined}
              placeholder="พิมพ์ข้อความถึง Liam..."
              controls={
                <ModelSelector
                  modelId={modelId}
                  effort={effort}
                  onModelChange={next => {
                    setModelId(next.id);
                    if (!next.efforts.includes(effort)) setEffort(next.defaultEffort);
                  }}
                  onEffortChange={setEffort}
                />
              }
            />
          </Group>

          <Group title="Markdown reply" note="หัวข้อ ตัวหนา ตาราง รายการ code block (มีปุ่มคัดลอก) และกราฟ">
            <Markdown>{sampleReply}</Markdown>
          </Group>

          <Group title="Charts" note="บล็อก ```chart ที่เป็น JSON: bar, line, area, pie">
            <Markdown>{sampleCharts}</Markdown>
          </Group>

          <Group title="Reasoning" note="Thinking เปิดอัตโนมัติระหว่างคิด พอเสร็จแสดง Thought พร้อมเวลา">
            <State label="Thinking (running)">
              <Reasoning reasoning={{ running: true, text: 'Comparing the two harnesses on start-up time first…' }} />
            </State>
            <State label="Thinking, no text yet">
              <Reasoning reasoning={{ running: true, text: '' }} />
            </State>
            <State label="Thought (done, 12s)">
              <Reasoning
                reasoning={{ seconds: 12, text: 'List the candidates, run one benchmark on each, then summarise.' }}
              />
            </State>
          </Group>

          <Group title="Plan" note="หัวแผนบอกความคืบหน้า ขั้นตอนมีสถานะ เสร็จ / กำลังทำ / รอทำ">
            <State label="In progress">
              <Plan
                plan={{
                  title: 'compare harness speed',
                  steps: [
                    { id: '1', title: 'Collect the harness candidates', status: 'done' },
                    { id: '2', title: 'Run the same benchmark on each', status: 'running' },
                    { id: '3', title: 'Summarise the results', status: 'pending' },
                  ],
                }}
              />
            </State>
            <State label="All done">
              <Plan
                plan={{
                  title: 'fix the build',
                  steps: [
                    { id: '1', title: 'Reproduce the failure', status: 'done' },
                    { id: '2', title: 'Patch the import', status: 'done' },
                  ],
                }}
              />
            </State>
          </Group>

          <Group title="Chain of thought" note="สรุปงานที่ทำ กางดูแต่ละขั้น พร้อมป้ายผลที่พบและ output">
            <State label="Running (open while working)">
              <ChainOfThought
                steps={[
                  { id: '1', title: 'Read codex-rs/README.md' },
                  { id: '2', title: 'Searching for models.json', status: 'running' },
                ]}
              />
            </State>
            <State label="Done">
              <ChainOfThought
                steps={[
                  { id: '1', title: 'Read codex-rs/README.md' },
                  { id: '2', title: 'Searched the code for models.json', tags: ['models-manager', 'models.json'] },
                  { id: '3', title: 'Ran pnpm ui:check', output: '> tsc --noEmit\n\nNo errors.' },
                ]}
              />
            </State>
            <State label="With a failed step">
              <ChainOfThought
                steps={[
                  { id: '1', title: 'Read bench/run.py' },
                  {
                    id: '2',
                    title: 'Failed to read bench/results.csv',
                    status: 'error',
                    output: "ENOENT: no such file or directory, open 'bench/results.csv'",
                  },
                ]}
              />
            </State>
          </Group>

          <Group title="Settings > Account: ข้อมูลผู้ใช้" note="ข้อมูลจาก SSO แสดงเฉพาะช่องที่ directory ส่งมา">
            <State label="Signed in, with details">
              <div className="w-[28rem]">
                <ProfileDetails
                  status={{
                    signedIn: true,
                    username: '015298',
                    profile: {
                      name: 'Nobparat Bunchalor', employeeId: '015298', email: 'nobparat-b@sumitomorubber.co.th',
                      factory: 'fac2', section: 'FA', department: 'Digital Transformation',
                      groups: ['FA', 'bifrost-admins', 'llm-users', 'org-owners', 'ragflow-users'], roles: ['ai-user'],
                    },
                  }}
                />
              </div>
            </State>
            <State label="Signed in before details were kept">
              <div className="w-[28rem]">
                <ProfileDetails status={{ signedIn: true, username: '015298' }} />
              </div>
            </State>
          </Group>

          <Group title="สถานะขณะทำงาน, สรุปท้ายรอบ, Context" note="แถบสถานะ + เวลา + โทเค็นขณะ agent ทำงาน สรุปเมื่อจบ และกล่อง Context ในแผงขวา">
            <State label="Working (live timer)">
              <ActivityLine
                activity="Running a command"
                label="Switching the new status and panel texts to English"
                startedMs={Date.now() - 17_000}
                tokens={{ total: 18_300, input: 16_900, cached: 9_000, output: 1_400, reasoning: 0 }}
              />
            </State>
            <State label="Working, waiting for approval, no token report">
              <ActivityLine activity="Waiting for your approval" startedMs={Date.now() - 9_000} />
            </State>
            <State label="Finished">
              <TurnSummary outcome="completed" elapsedMs={192_000} tokens={{ total: 54_200, input: 49_800, cached: 30_000, output: 4_400, reasoning: 0 }} />
            </State>
            <State label="Stopped by the person">
              <TurnSummary outcome="interrupted" elapsedMs={41_000} tokens={{ total: 7_300, input: 6_900, cached: 0, output: 400, reasoning: 0 }} />
            </State>
            <State label="Failed, no token report">
              <TurnSummary outcome="failed" elapsedMs={12_000} />
            </State>
            <State label="Context box (right panel)">
              <div className="w-80 rounded-lg border">
                <ContextView
                  running={false}
                  compacting={false}
                  onCompact={() => undefined}
                  usage={{
                    window: 65_536,
                    total: { total: 54_200, input: 49_800, cached: 30_000, output: 4_400, reasoning: 0 },
                    last: { total: 26_800, input: 25_100, cached: 11_900, output: 1_700, reasoning: 0 },
                  }}
                />
              </div>
            </State>
            <State label="Context box, nothing reported yet">
              <div className="w-80 rounded-lg border">
                <ContextView running={false} compacting={false} onCompact={() => undefined} />
              </div>
            </State>
          </Group>

          <Group title="Confirmation queue" note="คำขอที่รออยู่ซ้อนกัน แสดงทีละใบเหนือช่องพิมพ์ กดแล้วใบถัดไปขึ้นมา">
            <State label="3 waiting (interactive)">
              <QueueDemo />
            </State>
            <State label="1 waiting">
              <ConfirmationQueue
                items={[
                  {
                    messageId: 'm',
                    request: { id: 'only', command: 'pnpm ui:check', state: 'requested', cwd: 'E:/Projects/test' },
                  },
                ]}
                onResolve={() => undefined}
              />
            </State>
          </Group>

          <Group title="Confirmation" note="ขออนุญาตรันคำสั่ง ตอบแล้วเหลือบรรทัดเดียว (ลองกดได้)">
            <State label="Requested (interactive)">
              <Confirmation
                request={request}
                onApprove={() => setRequest(current => ({ ...current, state: 'approved' }))}
                onDeny={() => setRequest(current => ({ ...current, state: 'denied' }))}
              />
              {request.state !== 'requested' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setRequest(current => ({ ...current, state: 'requested' }))}
                >
                  Reset
                </Button>
              )}
            </State>
            <State label="Approved">
              <Confirmation
                request={{ id: 'b', command: 'pnpm ui:check', state: 'approved' }}
                onApprove={() => undefined}
                onDeny={() => undefined}
              />
            </State>
            <State label="Denied">
              <Confirmation
                request={{ id: 'c', command: 'rm -rf dist', state: 'denied' }}
                onApprove={() => undefined}
                onDeny={() => undefined}
              />
            </State>
          </Group>

          <Group title="Sandbox run" note="คำสั่งที่รันแล้ว พร้อมแท็บ Code / Console">
            <State label="Completed">
              <SandboxRun
                run={{
                  id: '1',
                  title: 'Ran pnpm ui:check',
                  state: 'completed',
                  code: 'pnpm ui:check',
                  output: '> tsc --noEmit\n\nNo errors.',
                }}
              />
            </State>
            <State label="Running">
              <SandboxRun
                run={{
                  id: '2',
                  title: 'Running pnpm ui:build',
                  state: 'running',
                  code: 'pnpm ui:build',
                  output: 'vite v8.3.5 building for production...',
                }}
              />
            </State>
            <State label="Error">
              <SandboxRun
                run={{
                  id: '3',
                  title: 'Ran python bench/run.py',
                  state: 'error',
                  code: 'python bench/run.py',
                  output: 'FileNotFoundError: bench/results.csv',
                }}
              />
            </State>
          </Group>

          <Group title="Stack trace" note="frame ของไลบรารีเป็นสีจาง มีปุ่มคัดลอก">
            <StackTrace stack={stackSample} defaultOpen />
          </Group>

          <Group title="Sources" note="นับเฉพาะ URL ไม่ซ้ำ">
            <Sources
              sources={[
                { url: 'https://github.com/openai/codex', title: 'openai/codex on GitHub' },
                { url: 'https://tauri.app/start/' },
                { url: 'https://ui.shadcn.com/docs/components' },
              ]}
            />
          </Group>

          <Group title="Right panel" note="Overview; Preview แทนที่เมื่อเปิด">
            <div className="flex h-[28rem] justify-end overflow-hidden rounded-lg border">
              <RightPanel
                preview={preview}
                onClose={() => setPreview(false)}
                project={{ id: 'p', name: 'harness', prompt: '', path: 'E:\\Projects\\harness' }}
                runs={[
                  { id: '1', title: 'Running pnpm ui:build', state: 'running' },
                  { id: '2', title: 'Ran pnpm ui:check', state: 'completed' },
                  { id: '3', title: 'Ran python bench/run.py', state: 'error' },
                ]}
              />
            </div>
          </Group>

          <Group title="Terminal panel">
            <div className="overflow-hidden rounded-lg border">
              <TerminalPanel onClose={() => undefined} />
            </div>
          </Group>

          <Group title="Dialogs" note="กดเพื่อเปิด">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setProjectOpen(true)}>
                New project
              </Button>
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                Settings
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                Delete confirmation
              </Button>
              <Button variant="outline" onClick={() => setSkillOpen(true)}>
                Save as skill
              </Button>
            </div>
          </Group>
        </div>

        {skillOpen && (
          <SaveSkillDialog
            draft={buildSkillDraft('Weekly harness report', [
              { id: '1', role: 'user', text: 'สรุปผล benchmark ของ harness ทุกตัวให้หน่อย', files: [] },
              {
                id: '2',
                role: 'assistant',
                text: 'ได้ครับ',
                files: [],
                runs: [{ id: 'r', title: 'Ran pnpm ui:check', state: 'completed', code: 'pnpm ui:check' }],
              },
              { id: '3', role: 'user', text: 'แล้วส่งเป็นตารางพร้อมกราฟ', files: [] },
            ])}
            projectName="harness"
            projectPath="E:\\Projects\\harness"
            onClose={() => setSkillOpen(false)}
            onSchedule={() => undefined}
          />
        )}
        <NewProjectDialog open={projectOpen} onOpenChange={setProjectOpen} onCreate={() => undefined} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} dark={dark} onSetDark={setTheme} />
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ลบ project?</AlertDialogTitle>
              <AlertDialogDescription>
                ลบ "harness" และ session ทั้งหมดในนั้น การลบนี้ไม่สามารถย้อนกลับได้ (ไม่ลบไฟล์ในโฟลเดอร์)
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => setDeleteOpen(false)}>
                ลบ
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
