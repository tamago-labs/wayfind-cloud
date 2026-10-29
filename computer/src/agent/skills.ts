// Skills loader (mezo/opencode format): scans workspace/skills/**/SKILL.md,
// parses `name`/`description` front-matter, injects the catalog into the
// agent prompt. Full content loads on demand via the `skill` tool.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { WORKSPACE_DIR } from '../core/config.js';

import { guarded, type GuardOpts } from '../core/guard.js';
export interface Skill {
  name: string;
  description: string;
  path: string;
  content: string;
}

function parseFrontmatter(md: string): { name: string; description: string; body: string } {
  const match = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { name: '', description: '', body: md };
  const [, front, body] = match;
  const name = front.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? '';
  // description may be `>` folded across lines — join continuation lines.
  const descLines: string[] = [];
  let inDesc = false;
  for (const line of front.split('\n')) {
    if (/^description:\s*/.test(line)) {
      inDesc = true;
      const rest = line.replace(/^description:\s*>?\s*/, '');
      if (rest) descLines.push(rest);
    } else if (inDesc && /^\s+\S/.test(line)) {
      descLines.push(line.trim());
    } else {
      inDesc = false;
    }
  }
  return { name, description: descLines.join(' '), body };
}

function findSkillFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) findSkillFiles(full, out);
    else if (e === 'SKILL.md') out.push(full);
  }
  return out;
}

export function loadSkills(): Skill[] {
  const skills: Skill[] = [];
  for (const file of findSkillFiles(join(WORKSPACE_DIR, 'skills'))) {
    const raw = readFileSync(file, 'utf8');
    const { name, description, body } = parseFrontmatter(raw);
    if (!name) continue;
    skills.push({ name, description, path: file, content: body.trim() });
  }
  return skills;
}

export function skillCatalogPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
  return (
    `\n\nAvailable skills (use the skill tool to load one before relevant work):\n${lines.join('\n')}`
  );
}

export function createSkillTool(skills: Skill[], opts: GuardOpts): ReturnType<typeof tool> {
  return tool({
    name: 'skill',
    description: 'Load a skill by name to get its full workflow, then follow it.',
    parameters: z.object({ name: z.string().describe('Skill name from the catalog') }),
    execute: guarded('skill', (a: { name: string }) => a.name, async ({ name }: { name: string }) => {
      const s = skills.find((k) => k.name === name);
      if (!s) return `Unknown skill "${name}". Available: ${skills.map((k) => k.name).join(', ') || '(none)'}`;
      return `# Skill: ${s.name}\n\n${s.content}`;
    }, opts),
  });
}
