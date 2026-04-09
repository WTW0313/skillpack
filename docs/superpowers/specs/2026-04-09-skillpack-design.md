# Skillpack — 统一 Agent Skill 管理器

## 概述

Skillpack 是一个 TUI（终端交互式界面）应用，用于统一管理分散在多个 agent 平台中的 skills。支持浏览、搜索、安装、卸载、更新、启停、编辑、创建 skills，并提供冲突检测能力。

**形态：** 终端内交互式界面（类似 lazygit / k9s）
**技术栈：** TypeScript + Ink (React for CLI)
**架构：** Core 库 + TUI 前端分离的 Monorepo

## 目标平台

当前需要管理的 agent 平台 skills 分布在以下位置：

| 平台 | 路径 | 说明 |
|------|------|------|
| Codex | `~/.codex/skills/` | 含 `.system/` 预装 skills |
| Cursor | `~/.cursor/skills-cursor/` | Cursor 管理的 skills |
| Claude | `~/.claude/plugins/cache/` | Claude 插件缓存 |
| skills.sh | `~/.agents/skills/` | 开放 agent skills 生态 |

架构设计为可扩展——新增平台只需实现 Provider 接口并注册。

## 安装来源

两个一等公民的远程安装通道，加上本地创建：

- **GitHub** — 从任意 GitHub repo 安装（公开 + 私有），支持 `owner/repo` + path 或完整 URL
- **skills.sh** — 通过 skills.sh registry 搜索和安装，委托 `npx skills add` 执行
- **本地创建** — 用户在 TUI 中选择平台、填写信息，生成模板后用 $EDITOR 编辑

## 项目结构

Monorepo，TypeScript project references 管理：

```
skillpack/
├── packages/
│   ├── core/                  # @skillpack/core
│   │   ├── src/
│   │   │   ├── providers/     # 平台适配器
│   │   │   │   ├── provider.ts        # ISkillProvider 接口
│   │   │   │   ├── codex.ts
│   │   │   │   ├── cursor.ts
│   │   │   │   ├── claude.ts
│   │   │   │   └── skillssh.ts
│   │   │   ├── sources/       # 安装来源
│   │   │   │   ├── github.ts
│   │   │   │   └── skillssh.ts
│   │   │   ├── models/        # 数据模型
│   │   │   ├── conflicts.ts   # 冲突检测引擎
│   │   │   └── index.ts
│   │   └── package.json
│   └── tui/                   # @skillpack/tui
│       ├── src/
│       │   ├── components/    # Ink 组件
│       │   ├── views/         # Tab / 页面视图
│       │   ├── hooks/         # React hooks
│       │   └── app.tsx        # 入口
│       └── package.json
├── package.json               # workspace root
└── tsconfig.json
```

**分层原则：**

- `core` 不依赖任何 UI 库，纯逻辑 + 文件系统操作
- `tui` 依赖 `core`，只负责渲染和用户交互
- `core` 的 API 可被 CLI 命令或 Web UI 复用

## 数据模型

### Skill

```typescript
interface Skill {
  name: string;
  description: string;
  provider: string;              // 来源平台 ID
  path: string;                  // 本地绝对路径
  version?: string;
  enabled: boolean;
  metadata: {
    license?: string;
    author?: string;
    tags?: string[];
  };
  source?: {
    type: 'github' | 'skillssh' | 'local';
    repo?: string;               // github: "owner/repo"
    ref?: string;                // github: branch/tag
    createdAt?: string;          // local: 创建时间
    installedAt?: string;        // 远程: 安装时间
  };
}
```

### ConflictInfo

```typescript
interface ConflictInfo {
  skillName: string;
  instances: Array<{
    provider: string;
    path: string;
    version?: string;
  }>;
}
```

### RemoteSkill

```typescript
interface RemoteSkill {
  name: string;
  description: string;
  source: 'github' | 'skillssh';
  identifier: string;            // "owner/repo@skill" 或包名
  stars?: number;
  installs?: number;
  version?: string;
}
```

### SkillTemplate

```typescript
interface SkillTemplate {
  name: string;
  description: string;
  metadata?: Partial<Skill['metadata']>;
}
```

### InstallRequest

```typescript
interface InstallRequest {
  sourceType: 'github' | 'skillssh';
  identifier: string;              // "owner/repo@path" 或 skills.sh 包名
  tempDir: string;                 // 下载的临时目录路径
}
```

### DiffResult

```typescript
interface DiffResult {
  identical: boolean;
  changes: Array<{
    field: string;                 // "description", "content", "version" 等
    a: string;
    b: string;
  }>;
}
```

### UpdateInfo

```typescript
interface UpdateInfo {
  currentVersion?: string;
  latestVersion?: string;
  hasUpdate: boolean;
  changelog?: string;
}
```

## Provider 接口

```typescript
interface ISkillProvider {
  readonly id: string;
  readonly displayName: string;
  readonly basePaths: string[];

  scan(): Promise<Skill[]>;
  install(name: string, request: InstallRequest): Promise<void>;
  uninstall(name: string): Promise<void>;
  update(name: string): Promise<void>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  create(template: SkillTemplate): Promise<Skill>;

  readonly capabilities: {
    canInstall: boolean;
    canUninstall: boolean;
    canUpdate: boolean;
    canToggle: boolean;
    canCreate: boolean;
  };
}
```

`capabilities` 让 TUI 根据平台能力动态控制可用操作。例如 Claude plugins cache 为只读扫描，不支持直接安装或创建。

**新增平台的全部工作：**
1. 实现 `ISkillProvider`（一个文件，约 100-200 行）
2. 入口处 `manager.registerProvider(new MyProvider())`
3. TUI 自动在 Tab 栏显示新平台

## 安装源接口

```typescript
interface IInstallSource {
  readonly id: string;
  readonly displayName: string;

  search(query: string): Promise<RemoteSkill[]>;
  fetch(identifier: string): Promise<DownloadResult>;
  checkUpdate(skill: Skill): Promise<UpdateInfo | null>;
}
```

### GitHub Source

- 支持 `owner/repo` + path，支持完整 URL 粘贴
- 公开 repo 走 GitHub API 直接下载
- 私有 repo 走 git sparse checkout
- 依赖 `GITHUB_TOKEN` / `GH_TOKEN` 或本地 git 凭证

### skills.sh Source

- 搜索：调用 `npx skills find <query>` 或请求 skills.sh API
- 安装：委托 `npx skills add <package> -g -y`，安装后落盘到 `~/.agents/skills/`
- 安装完成后触发 `scan()` 刷新列表（不重新实现下载逻辑，保持和 skills.sh 生态兼容）

### 安装流程

```
TUI 触发安装
  -> 选择安装源 (GitHub / skills.sh)
  -> 搜索或输入标识符
  -> 选择目标平台
  -> Source.fetch() 下载到临时目录 (GitHub) 或 npx skills add (skills.sh)
  -> Provider.install() 移到最终位置 (GitHub) 或 scan() 刷新 (skills.sh)
  -> 更新列表
```

## 冲突检测

```typescript
class ConflictDetector {
  detect(skills: Skill[]): ConflictInfo[];
  diff(a: Skill, b: Skill): DiffResult;
}
```

- 在所有 Provider `scan()` 完成后，按 `skill.name` 聚合
- 同名 skill 出现在 2+ Provider 中即标记为冲突
- **非阻断**：TUI 中标黄 ⚠ 提示，不阻止任何操作
- 用户可选择：查看差异、保留其中一个、全部保留、忽略

## TUI 视图

### 主界面

```
┌─────────────────────────────────────────────────┐
│  skillpack                            ? help    │
├─────────────────────────────────────────────────┤
│  [All] [Codex] [Cursor] [skills.sh] [Claude]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ▸ gsap-core         skills.sh   installed      │
│  ▸ figma             codex       installed  ⚠   │
│  ▸ create-rule       cursor      installed      │
│  ...                                            │
│                                                 │
├─────────────────────────────────────────────────┤
│  ↑↓ navigate  Tab group  / search  i install    │
│  d delete  e edit  c create  u update  ? help   │
└─────────────────────────────────────────────────┘
```

### 快捷键

| 键 | 操作 | 说明 |
|----|------|------|
| `↑↓` / `j k` | 导航 | 列表上下移动 |
| `Tab` | 切换分组 | All / 各平台 |
| `/` | 搜索 | 模糊匹配 name + description |
| `Enter` | 详情 | 进入 skill 详情页 |
| `i` | 安装 | 选择源 -> 搜索 -> 选平台 -> 确认 |
| `d` | 卸载 | 确认后 Provider.uninstall() |
| `e` | 编辑 | 内联编辑 name/description，`E` 打开 $EDITOR |
| `c` | 创建 | 选平台 -> 填名称/描述 -> 生成模板 -> $EDITOR |
| `u` | 更新 | 检查远程更新并应用 |
| `Space` | 启/停 | toggle enable/disable |
| `q` | 退出 | |

### 详情页

```
┌─────────────────────────────────────────────────┐
│  ← Back    figma                                │
├─────────────────────────────────────────────────┤
│  Platform:  codex                               │
│  Path:      ~/.codex/skills/figma/              │
│  Version:   2.0.7                               │
│  Source:    github (openai/skills)               │
│  Status:    enabled                              │
│  ⚠ Conflict: also exists in cursor, claude       │
├─────────────────────────────────────────────────┤
│  # Figma MCP                                    │
│                                                 │
│  Use the Figma MCP server to fetch design       │
│  context, screenshots, variables, and assets... │
│                                                 │
├─────────────────────────────────────────────────┤
│  e edit  d delete  u update  Esc back           │
└─────────────────────────────────────────────────┘
```

## 编辑与创建

### 创建流程

1. 按 `c` -> 选择目标平台（列出 `canCreate=true` 的 Provider）
2. 输入 skill 名称（实时校验重名）
3. 输入简短描述
4. `Provider.create()` 生成目录和 SKILL.md 模板
5. 自动打开 `$EDITOR`
6. 编辑器关闭后 `scan()` 刷新列表

### SKILL.md 模板

```markdown
---
name: {{name}}
description: {{description}}
---

# {{Name}}

## When to Use This Skill

<!-- Describe trigger conditions -->

## Instructions

<!-- Core instructions for the agent -->
```

### 编辑流程

- `e` — 进入编辑模式：name、description、enabled 内联修改（写回 frontmatter）
- `E` — 用 `$EDITOR` 打开完整 SKILL.md
- 编辑器关闭后解析更新的 frontmatter 刷新视图

## 配置

skillpack 维护配置文件 `~/.config/skillpack/config.json`：

```json
{
  "editor": "$EDITOR",
  "providers": {
    "codex": { "enabled": true, "paths": ["~/.codex/skills"] },
    "cursor": { "enabled": true, "paths": ["~/.cursor/skills-cursor"] },
    "claude": { "enabled": true, "paths": ["~/.claude/plugins/cache"] },
    "skillssh": { "enabled": true, "paths": ["~/.agents/skills"] }
  },
  "sources": {
    "github": { "enabled": true },
    "skillssh": { "enabled": true }
  }
}
```

- 用户可禁用不关心的平台、自定义扫描路径
- 首次运行时自动检测已存在的平台目录生成默认配置

## 关键设计决策

1. **core/tui 分离** — 核心逻辑可测试、可复用，未来可加 CLI 或 Web 前端
2. **Provider capabilities** — 不是所有平台都支持所有操作，TUI 动态适配
3. **skills.sh 委托** — 安装走 `npx skills add` 而非自行实现，保持生态兼容
4. **冲突非阻断** — 提示但不强制，用户有最终决定权
5. **混合编辑** — 简单改动 TUI 内联，深度编辑跳 $EDITOR
6. **配置即发现** — 首次运行自动检测平台，零配置开箱即用
