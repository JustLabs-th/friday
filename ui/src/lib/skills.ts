import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Message } from '@/components/chat-view';

export interface SkillDraft {
  name: string;
  description: string;
  /** The instructions that follow the front matter. */
  body: string;
}

export interface SavedSkill {
  name: string;
  dir: string;
  /** The written SKILL.md; a turn's skill input points at this. */
  path: string;
}

export type SkillScope = 'project' | 'global';

export const skillSavingAvailable = () => isTauri();

/** Same rule as the Rust side: lowercase letters, digits and single hyphens, 1-64 long. */
export function isValidSkillName(name: string) {
  return name.length >= 1 && name.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

const clip = (text: string, length: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

/**
 * Drafts a skill from a session: what the user asked for, and the commands that ran.
 * It is a starting point for the person to edit, not a finished skill.
 */
export function buildSkillDraft(title: string, messages: Message[]): SkillDraft {
  const requests = messages
    .filter(message => message.role === 'user')
    .map(message => clip(message.text, 240))
    .filter(Boolean)
    .slice(0, 8);
  const commands = Array.from(new Set(
    messages
      .flatMap(message => message.runs ?? [])
      .filter(run => run.state === 'completed' && run.code)
      .map(run => clip(run.code ?? '', 200)),
  )).slice(0, 10);

  const body = [
    `# ${clip(title, 80) || 'Workflow'}`,
    '',
    'Repeat the workflow from an earlier session. Adapt the steps to the new request instead of copying them blindly.',
    '',
    '## What the user asked for',
    ...(requests.length ? requests.map((text, index) => `${index + 1}. ${text}`) : ['- (nothing recorded)']),
    ...(commands.length ? ['', '## Commands that worked', ...commands.map(command => `- \`${command}\``)] : []),
    '',
    '## Notes',
    `- Drafted from a Friday session on ${new Date().toISOString().slice(0, 10)}. Tighten these instructions before relying on them.`,
    '',
  ].join('\n');

  return {
    name: slugify(title) || 'session-skill',
    description: `Repeat the workflow from the session "${clip(title, 80)}". Use when the user asks for the same kind of task again.`,
    body,
  };
}

/** The full SKILL.md. The description is written as a JSON string, which is valid YAML. */
export function composeSkill(draft: SkillDraft) {
  return `---\nname: ${draft.name}\ndescription: ${JSON.stringify(draft.description.replace(/\s+/g, ' ').trim())}\n---\n\n${draft.body.trim()}\n`;
}

export function saveSkill(input: { scope: SkillScope; projectPath: string | null; name: string; content: string; overwrite: boolean }) {
  return invoke<SavedSkill>('skill_save', { input });
}
