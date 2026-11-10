import type { PlanData, PlanStep } from '@/components/chat/plan';

/** The parts of a work item that name what the agent is doing. */
export interface WorkItem {
  id: string;
  type: string;
  status?: string;
  command?: string;
  tool?: string;
  server?: string;
  changes?: { path: string }[];
}

const WORK_TYPES = ['commandExecution', 'fileChange', 'dynamicToolCall', 'mcpToolCall'];

/** The command inside the PowerShell wrapper the engine runs it with. */
function innerCommand(command = ''): string {
  const match = command.match(/-Command\s+(.*)$/is);
  return (match ? match[1] : command).replace(/^['"]|['"]$/g, '');
}

const READ =
  /\b(get-childitem|get-content|get-item|get-location|test-path|select-string|findstr|ls|dir|cat|type|rg|git (status|log|diff))\b/i;
const WRITE =
  /(set-content|add-content|out-file|new-item|copy-item|move-item|rename-item|\bmkdir\b|\[io\.file\]|writeall|@['"]|>>?\s)/i;
const REMOVE = /\b(remove-item|rm|del|rmdir)\b/i;

/** What the person would call this step: plain words, no commands. */
export function stepLabel(item: WorkItem): string {
  if (item.type === 'fileChange') {
    const names = (item.changes || []).map(change => change.path.split(/[\/]/).pop()).filter(Boolean);
    return names.length ? `แก้ไฟล์ ${names.slice(0, 2).join(', ')}${names.length > 2 ? ' …' : ''}` : 'แก้ไฟล์';
  }
  if (item.type === 'dynamicToolCall' || item.type === 'mcpToolCall') {
    const tool = item.tool || '';
    if (tool === 'Liam-new_nextjs_project') return 'สร้างโปรเจกต์ Next.js จากแบบของบริษัท';
    if (tool === 'Liam-check_packages') return 'ตรวจแพ็กเกจที่ใช้';
    if (tool.startsWith('Coolify-deploy')) return 'Deploy ขึ้น Coolify';
    if (tool.startsWith('Coolify-')) return 'ดูข้อมูลจาก Coolify';
    if (tool.startsWith('Homarr-')) return 'ดูข้อมูลจาก Homarr';
    return [item.server, tool].filter(Boolean).join(' / ') || 'ใช้เครื่องมือ';
  }
  const command = innerCommand(item.command);
  if (/start-process/i.test(command)) return 'เริ่มโปรแกรมทดสอบ';
  if (REMOVE.test(command)) return 'ลบไฟล์';
  if (WRITE.test(command)) return 'เขียนไฟล์';
  if (READ.test(command)) return 'ดูไฟล์ในโปรเจกต์';
  return 'รันคำสั่ง';
}

/**
 * A plan built from what the agent actually did, for turns where the model made no plan of its own.
 * Steps are grouped when the same kind of thing happens several times in a row.
 */
export function derivePlan(items: WorkItem[], request: string, turnActive: boolean): PlanData | undefined {
  const work = items.filter(item => WORK_TYPES.includes(item.type));
  const title = request.trim().replace(/\s+/g, ' ').slice(0, 48) || 'กำลังทำงาน';
  if (!work.length) {
    return turnActive ? { title, steps: [{ id: 'start', title: 'กำลังเริ่มงาน…', status: 'running' }] } : undefined;
  }
  const steps: PlanStep[] = [];
  const counts: number[] = [];
  for (const item of work) {
    const running = turnActive && item.status === 'inProgress';
    const label = stepLabel(item);
    const last = steps[steps.length - 1];
    if (last && last.title.replace(/ \(\d+ ครั้ง\)$/, '') === label && last.status !== 'pending') {
      counts[counts.length - 1] += 1;
      last.title = `${label} (${counts[counts.length - 1]} ครั้ง)`;
      if (running) last.status = 'running';
      continue;
    }
    steps.push({ id: item.id, title: label, status: running ? 'running' : 'done' });
    counts.push(1);
  }
  return { title, steps };
}
