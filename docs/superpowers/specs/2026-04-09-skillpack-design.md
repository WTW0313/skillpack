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

## 作用域：全局 vs 项目级

Skills 分为两个作用域：

### 全局 Skills

各 agent 平台目录下的 skills 作为全局默认加载项：

- `~/.codex/skills/`、`~/.cursor/skills-cursor/`、`~/.claude/plugins/cache/`、`~/.agents/skills/`
- 对所有项目生效
- 由 `skillpack.lock`（位于 `~/.config/skillpack/skillpack.lock`）锁定版本

### 项目级 Skills

运行时自动扫描当前工作目录，发现项目级 skill 定义：

- 扫描路径：`<cwd>/.skillpack/skills/`（项目本地 skills 目录）
- 项目级 lock 文件：`<cwd>/.skillpack/skillpack.lock`
- 项目级 skills 优先级高于全局同名 skill（覆盖）
- 适合团队共享的项目专属 skills（提交到 git）

```
my-project/
├── .skillpack/
│   ├── skills/              # 项目级 skills
│   │   └── my-project-lint/
│   │       └── SKILL.md
│   └── skillpack.lock       # 项目级版本锁定
└── ...
```

### TUI 中的体现

Tab 栏新增作用域指示：

```
[All] [Codex] [Cursor] [skills.sh] [Claude] [Project]
```

列表中通过标签区分 `global` / `project`。项目级 skills 在 Project tab 下集中展示。

## 版本锁定

### Lock 文件格式

`skillpack.lock` 记录每个远程安装的 skill 的精确版本，确保可复现：

```json
{
  "lockfileVersion": 1,
  "skills": {
    "gsap-core": {
      "source": "skillssh",
      "identifier": "vercel-labs/agent-skills@gsap-core",
      "version": "1.2.3",
      "installedAt": "2026-04-09T10:00:00Z",
      "integrity": "sha256-xxxx"
    },
    "figma": {
      "source": "github",
      "repo": "openai/skills",
      "ref": "main",
      "commit": "abc123def456",
      "path": "skills/.curated/figma",
      "installedAt": "2026-04-08T15:00:00Z",
      "integrity": "sha256-yyyy"
    }
  }
}
```

### Lock 文件行为

- **安装时**：写入精确的 commit SHA / version，计算内容 integrity hash
- **更新时**：更新 lock 文件中对应条目
- **校验**：启动时可选校验本地文件 integrity 是否与 lock 一致（检测手动篡改）
- **全局 lock**：`~/.config/skillpack/skillpack.lock`
- **项目 lock**：`<cwd>/.skillpack/skillpack.lock`（可提交到 git，团队共享）

## 更新机制

### 检查更新

- 启动时可选自动检查（配置项 `autoCheckUpdates: true`）
- 手动触发：主界面按 `U`（大写）批量检查所有 skill 的更新
- 单个 skill：详情页或列表中按 `u` 检查并更新

### 更新流程

```
检查更新
  -> Source.checkUpdate(skill) 对比 lock 中的 commit/version 与远程最新
  -> 有更新时显示：当前版本、最新版本、changelog（如果有）
  -> 用户确认后:
     -> GitHub: 下载新版本到临时目录 -> 替换本地文件 -> 更新 lock
     -> skills.sh: npx skills update <package> -> 更新 lock
  -> scan() 刷新列表
```

### 批量更新

```
按 U 触发
  -> 并行检查所有远程安装的 skills
  -> 列出可更新的 skills（版本对比表）
  -> 用户选择全部更新 / 逐个确认 / 取消
  -> 执行更新 -> 更新 lock 文件
```

## 安装来源

两个一等公民的远程安装通道，加上本地创建：

- **GitHub** — 从任意 GitHub repo 安装（公开 + 私有），支持 `owner/repo` + path 或完整 URL
- **skills.sh** — 通过 skills.sh registry 搜索和安装，委托 `npx skills add` 执行
- **本地创建** — 用户在 TUI 中选择平台、填写信息，生成模板后用 $EDITOR 编辑

## 可编辑性规则

只有本地创建的 skills（`source.type === 'local'`）可以被编辑。远程安装的 skills 为只读：

| 来源 | 浏览 | 编辑 | 卸载 | 更新 |
|------|------|------|------|------|
| `local` | Yes | Yes | Yes | N/A |
| `github` | Yes | **只读** | Yes | Yes（从远程拉取） |
| `skillssh` | Yes | **只读** | Yes | Yes（npx skills update） |

- TUI 中远程 skill 按 `e` 时提示"此 skill 为远程安装，不可编辑"
- 如需修改远程 skill，提供 **Fork to Local** 操作：复制到本地 skills 目录，`source.type` 改为 `local`，断开与远程的关联
- Fork 后的 skill 不再接收远程更新

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
  scope: 'global' | 'project';  // 作用域
  readonly: boolean;             // 是否只读 (remote=true, local=false)
  metadata: {
    license?: string;
    author?: string;
    tags?: string[];
  };
  source?: {
    type: 'github' | 'skillssh' | 'local';
    repo?: string;               // github: "owner/repo"
    ref?: string;                // github: branch/tag
    commit?: string;             // github: 精确 commit SHA
    createdAt?: string;          // local: 创建时间
    installedAt?: string;        // 远程: 安装时间
    forkedFrom?: {               // Fork to Local 时记录原始来源
      source: 'github' | 'skillssh';
      identifier: string;
    };
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

界面固定在终端视口内，列表内容超出时自动滚动。列表带有表头行标注各列含义。只读状态不在列表中显示，仅在详情页展示。冲突用 `!` 标记。

```
┌─────────────────────────────────────────────────────┐
│  skillpack — 49 skills  [1-10/49]                   │
├─────────────────────────────────────────────────────┤
│  [All]  Codex  Cursor  skills.sh  Claude  Project   │
├─────────────────────────────────────────────────────┤
│    Name                         Provider    Status   │
│  > figma                        codex       on       │
│    gh-address-comments          codex       on       │
│    gh-fix-ci                    codex       on       │
│    pdf                          codex       on       │
│    babysit                      cursor      on       │
│    create-rule                  cursor      on       │
│    ...                                               │
├─────────────────────────────────────────────────────┤
│  ↑↓:navigate  Tab:switch  /:search  Enter:detail    │
│  i:install  c:create  u:updates  q:quit             │
└─────────────────────────────────────────────────────┘
```

**列表行为：**
- Name 列固定宽度，超长名称以 `…` 截断
- 滚动位置在标题栏显示 `[起始-结束/总数]`
- `>` 指示当前选中行

### 快捷键

| 键 | 操作 | 说明 |
|----|------|------|
| `↑↓` | 导航 | 列表上下移动，自动滚动 |
| `Tab` | 切换分组 | All / 各平台 / Project |
| `/` | 搜索 | 模糊匹配 name + description |
| `Enter` | 详情 | 进入 skill 详情页 |
| `i` | 安装 | 选择源 -> 搜索 -> 选平台 -> 确认 |
| `d` | 卸载 | 确认后 Provider.uninstall()（仅 local skills） |
| `e` / `E` | 编辑 | 仅限 local skills；用 $EDITOR 打开 SKILL.md |
| `c` | 创建 | 选平台 -> 填名称/描述 -> 生成模板 -> $EDITOR |
| `u` | 更新 | 检查远程 skill 的更新 |
| `f` | Fork to Local | 复制远程 skill 为本地可编辑副本 |
| `q` | 退出 | |

### 详情页

描述区域超出视口时可用 `↑↓` 滚动，显示滚动位置指示器。只读状态和 Fork 提示仅在此页展示。

```
┌─────────────────────────────────────────────────┐
│  < Esc  figma                                   │
├─────────────────────────────────────────────────┤
│  Platform:  codex                               │
│  Path:      ~/.codex/skills/figma/              │
│  Version:   2.0.7                               │
│  Source:    github (openai/skills)               │
│  Status:    enabled                              │
│  Editable:  read-only (f to fork)                │
│                                                 │
│  ⚠ Conflicts                                    │
│    cursor: ~/.cursor/skills-cursor/figma/        │
├─────────────────────────────────────────────────┤
│  Description ▲ [1-8/12] ▼                       │
│  Use the Figma MCP server to fetch design       │
│  context, screenshots, variables, and assets... │
│                                                 │
├─────────────────────────────────────────────────┤
│  Esc:back  e:edit  d:delete  f:fork             │
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

### 编辑流程（仅限 local skills）

- `e` — 进入编辑模式：name、description、enabled 内联修改（写回 frontmatter）
- `E` — 用 `$EDITOR` 打开完整 SKILL.md
- 编辑器关闭后解析更新的 frontmatter 刷新视图
- 远程安装的 skill 按 `e`/`E` 时提示只读，并建议使用 `f` Fork to Local

### Fork to Local 流程

1. 按 `f` -> 选择目标 Provider（canCreate=true 的平台）
2. 复制 skill 目录到目标 Provider 的 basePath
3. 修改 `source.type` 为 `local`，记录 `forkedFrom` 信息
4. 断开与远程的关联（不再接收更新）
5. 新副本出现在列表中，可编辑

## 配置

skillpack 维护配置文件 `~/.config/skillpack/config.json`：

```json
{
  "editor": "$EDITOR",
  "autoCheckUpdates": true,
  "projectSkillsDir": ".skillpack/skills",
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
- `autoCheckUpdates`：启动时是否自动检查远程 skill 更新
- `projectSkillsDir`：项目级 skills 目录名（默认 `.skillpack/skills`）

## 关键设计决策

1. **core/tui 分离** — 核心逻辑可测试、可复用，未来可加 CLI 或 Web 前端
2. **Provider capabilities** — 不是所有平台都支持所有操作，TUI 动态适配
3. **skills.sh 委托** — 安装走 `npx skills add` 而非自行实现，保持生态兼容
4. **冲突非阻断** — 提示但不强制，用户有最终决定权
5. **Local 可编辑，Remote 只读** — 远程安装的 skill 不可直接修改，需 Fork to Local 后编辑；只读状态仅在详情页展示，列表中不显示
6. **版本锁定** — lock 文件记录精确版本/commit，确保环境可复现
7. **全局 + 项目级** — 全局 skills 默认加载，项目级 skills 自动扫描 cwd 并可覆盖同名全局 skill
8. **配置即发现** — 首次运行自动检测平台，零配置开箱即用
9. **固定视口** — TUI 固定在终端高度内，列表超出时自动滚动，避免终端输出无限增长
10. **箭头键导航** — 使用标准 `↑↓` 箭头键，不使用 vim 风格的 `j/k` 键，降低学习门槛
