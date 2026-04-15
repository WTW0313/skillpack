import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import type { SkillMetadata } from './models/index.js';

export interface ParsedSkillMd {
  name: string;
  description: string;
  body: string;
  metadata: Partial<SkillMetadata>;
  raw: Record<string, unknown>;
}

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseSkillMd(content: string): ParsedSkillMd {
  const match = content.match(FRONTMATTER_RE);
  const data: Record<string, unknown> = match ? (yamlParse(match[1]) ?? {}) : {};
  const body = match ? content.slice(match[0].length) : content;

  return {
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    body: body.trim(),
    metadata: {
      license: typeof data.license === 'string' ? data.license : undefined,
      author: typeof data.author === 'string' ? data.author : undefined,
      tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
    },
    raw: data,
  };
}

function kebabToTitle(s: string): string {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function generateSkillMd(template: {
  name: string;
  description: string;
  metadata?: Partial<SkillMetadata>;
}): string {
  const frontmatter: Record<string, unknown> = {
    name: template.name,
    description: template.description,
  };
  if (template.metadata?.license) frontmatter.license = template.metadata.license;
  if (template.metadata?.author) frontmatter.author = template.metadata.author;
  if (template.metadata?.tags) frontmatter.tags = template.metadata.tags;

  const fm = yamlStringify(frontmatter).trim();
  const title = kebabToTitle(template.name);

  return `---
${fm}
---

# ${title}

## When to Use This Skill

<!-- Describe trigger conditions -->

## Instructions

<!-- Core instructions for the agent -->
`;
}
