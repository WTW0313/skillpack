# Skill 禁用功能设计

## 概述

在 skillpack 中添加 skill 的禁用/启用功能，允许用户快速关闭不需要的 skill，避免在特定场景下出现 skill 污染。禁用在文件系统层面生效，agent 平台会真正停止加载被禁用的 skill。

## 动机

同一个 agent 平台在不同项目中可能不需要所有 skill。例如在一个纯后端项目中，前端相关的 skill（gsap、figma 等）是不必要的，可能干扰 agent 的行为。需要一种快速切换 skill 状态的机制。

## 设计

### 核心机制：目录重命名

禁用一个 skill 时，将其目录名加上 `.disabled-` 前缀：

```
禁用:
~/.codex/skills/gsap-core/          →  ~/.codex/skills/.disabled-gsap-core/

启用:
~/.codex/skills/.disabled-gsap-core/  →  ~/.codex/skills/gsap-core/
```

所有 provider 的 `scan()` 已有 `entry.name.startsWith('.') → skip` 的逻辑，agent 平台扫描目录时也遵循忽略隐藏目录的 Unix 惯例。因此重命名后 agent 平台自动停止加载该 skill，无需额外配置。

### 作用域

全局禁用，对所有项目生效。禁用状态持久化在文件系统中（目录名本身就是状态），不依赖额外配置文件。

### 平台能力

| 平台 | canToggle | 原因 |
|------|-----------|------|
| Codex | true | 管理自己的 skills 目录 |
| skills.sh | true | 管理自己的 skills 目录 |
| Cursor | false | 只读平台，不应修改其管理的文件 |
| Claude | false | 只读平台，不应修改其管理的文件 |

### Symlink 兼容性

Node.js 的 `fs.rename()` 操作的是 symlink 本身而不是 follow 到目标。禁用/启用 symlink 类型的 skill 目录时，只有链接文件被重命名，目标内容不受影响。`readFile()` 读取 SKILL.md 时自动 follow symlink，行为正确。

## Provider 层变更

### BaseProvider.scan() 扩展

在现有的目录扫描逻辑之外，增加对 `.disabled-*` 目录的扫描：

```typescript
async scan(): Promise<Skill[]> {
  const skills: Skill[] = [];
  for (const basePath of this.basePaths) {
    // ... existing access check ...
    const entries = await readdir(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // 识别 disabled 状态
      const isDisabled = entry.name.startsWith('.disabled-');
      const skillDirName = isDisabled ? entry.name.slice('.disabled-'.length) : entry.name;

      // 跳过其他 dot 目录（非 .disabled-）
      if (entry.name.startsWith('.') && !isDisabled) continue;

      const skillDir = path.join(basePath, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      try {
        const content = await readFile(skillMdPath, 'utf-8');
        const parsed = parseSkillMd(content);
        skills.push({
          name: parsed.name || skillDirName,
          description: parsed.description,
          provider: this.id,
          path: skillDir,
          enabled: !isDisabled,
          // ... rest of fields
        });
      } catch { /* skip */ }
    }
  }
  return skills;
}
```

### BaseProvider.disable() / enable()

```typescript
async disable(name: string): Promise<void> {
  for (const basePath of this.basePaths) {
    const src = path.join(basePath, name);
    const dest = path.join(basePath, `.disabled-${name}`);
    try {
      await access(src);
      await access(dest).then(
        () => { throw new Error(`Target ${dest} already exists`); },
        () => { /* dest doesn't exist, good */ },
      );
      await rename(src, dest);
      return;
    } catch (err) {
      if ((err as Error).message?.includes('already exists')) throw err;
      // src not found in this basePath, try next
    }
  }
  throw new Error(`Skill "${name}" not found in ${this.displayName}`);
}

async enable(name: string): Promise<void> {
  for (const basePath of this.basePaths) {
    const src = path.join(basePath, `.disabled-${name}`);
    const dest = path.join(basePath, name);
    try {
      await access(src);
      await rename(src, dest);
      return;
    } catch {
      // not found in this basePath, try next
    }
  }
  throw new Error(`Disabled skill "${name}" not found in ${this.displayName}`);
}
```

### ClaudeProvider.scan() 适配

`ClaudeProvider` 有自己的 `scan()` override（遍历 `cache/<pub>/<plugin>/<ver>/skills/<name>/` 深层结构）。虽然 Claude 是 `canToggle: false`，但 scan 不涉及 `.disabled-*` 识别（Claude 目录不会出现被 skillpack 禁用的 skill）。因此 ClaudeProvider 无需修改。

若未来 Claude 开放 `canToggle`，需要在其 scan 的最内层 skill 目录遍历中增加 `.disabled-` 识别，逻辑与 BaseProvider 一致。

### Provider capabilities 更新

```typescript
// CodexProvider
readonly capabilities: ProviderCapabilities = {
  canInstall: true, canUninstall: true, canUpdate: true,
  canToggle: true,  // 新增
  canCreate: true,
};

// SkillsShProvider — 同样 canToggle: true
// CursorProvider, ClaudeProvider — 保持 canToggle: false
```

## SkillManager 层变更

新增 `toggleSkill` 方法：

```typescript
async toggleSkill(skill: Skill): Promise<void> {
  const provider = this.providers.get(skill.provider);
  if (!provider) throw new Error(`Provider not found: ${skill.provider}`);
  if (!provider.capabilities.canToggle) {
    throw new Error(`${provider.displayName} does not support toggle`);
  }

  if (skill.enabled) {
    await provider.disable(skill.name);
  } else {
    await provider.enable(skill.name);
  }
}
```

## TUI 变更

### 列表视图

- `Space` 键：对选中 skill 调用 `manager.toggleSkill()`，然后 `refresh()`
- 仅当 skill 所在平台 `canToggle: true` 时响应
- 状态列显示：
  - `on`（绿色）— 正常启用
  - `disabled`（黄色，名称暗淡）— 已禁用

```
  Name                         Provider    Status
> gsap-core                    codex       on
  figma                        codex       on
  colorize                     skillssh    disabled
```

### 详情页

- Status 字段显示 `enabled` / `disabled`
- `Space` 键可切换，底部快捷键动态显示 `Space:enable` 或 `Space:disable`

### 状态栏

列表视图快捷键增加 `Space:toggle`。

## 安全约束

1. 禁用前检查目标路径 `.disabled-<name>` 不存在，避免覆盖
2. `canToggle: false` 的平台（Cursor、Claude）TUI 中不响应 Space 键
3. Symlink 安全：rename 操作 symlink 本身，不 follow
4. 操作即时生效，无需确认（因为恢复同样只需一次 Space）
