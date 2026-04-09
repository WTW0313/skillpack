import { describe, it, expect } from 'vitest';
import { parseSkillMd, generateSkillMd } from '../src/parser.js';

describe('parseSkillMd', () => {
  it('parses valid SKILL.md with frontmatter', () => {
    const content = `---
name: my-skill
description: A test skill
---

# My Skill

## Instructions

Do the thing.
`;
    const result = parseSkillMd(content);
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('A test skill');
    expect(result.body).toContain('# My Skill');
    expect(result.body).toContain('Do the thing.');
  });

  it('parses optional metadata fields', () => {
    const content = `---
name: my-skill
description: A test skill
license: MIT
---

# Content
`;
    const result = parseSkillMd(content);
    expect(result.metadata.license).toBe('MIT');
  });

  it('returns empty description when missing', () => {
    const content = `---
name: my-skill
---

# Content
`;
    const result = parseSkillMd(content);
    expect(result.name).toBe('my-skill');
    expect(result.description).toBe('');
  });

  it('handles file with no frontmatter', () => {
    const content = `# Just Markdown

No frontmatter here.
`;
    const result = parseSkillMd(content);
    expect(result.name).toBe('');
    expect(result.body).toContain('# Just Markdown');
  });
});

describe('generateSkillMd', () => {
  it('generates SKILL.md from template', () => {
    const md = generateSkillMd({ name: 'test-skill', description: 'A skill' });
    expect(md).toContain('name: test-skill');
    expect(md).toContain('description: A skill');
    expect(md).toContain('# Test Skill');
  });
});
