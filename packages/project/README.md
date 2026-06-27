# @mycelium/project

> Mycelium 项目管理 — 项目生命周期管理、脚手架创建、配置读写、导入导出

## 架构定位

`@mycelium/project` 是 Mycelium 项目的**大门**。它负责项目的完整生命周期——从 `mycelium init` 创建新项目，到 `mycelium export` 导出成品。它是用户与 Mycelium 系统交互的第一触点。

```
@mycelium/project
  ↑
  └── @mycelium/orchestrator（通过 Project 对象获取各子系统）
```

## 核心职责

### 1. 项目脚手架

```bash
mycelium init my-novel
```

执行流程：

1. 创建项目根目录 `my-novel/`
2. 初始化 `.mycelium/` 目录结构（见下方）
3. 交互式引导：小说名称 → 类型（仙侠/玄幻/都市/科幻/悬疑/历史...）→ 目标读者 → 叙事风格
4. 生成 `mycelium.config.json`
5. 初始化空的 Knowledge Base 和 Outline
6. 可选：从模板快速开始

### 2. `.mycelium/` 目录结构

```
.mycelium/
├── config.json                # 项目配置
├── knowledge/                 # RAG 知识库数据
│   ├── entities/              # 结构化实体存储
│   │   ├── characters.jsonl
│   │   ├── locations.jsonl
│   │   ├── items.jsonl
│   │   └── concepts.jsonl
│   ├── timeline.jsonl         # 时间线事件
│   ├── summaries/             # 分层摘要
│   │   ├── chapters/          # 每章摘要
│   │   ├── volumes/           # 每卷聚合摘要
│   │   └── global.json        # 全局概要
│   ├── snapshots/             # 快照
│   └── vectors/               # 向量索引（sqlite-vec）
│       └── index.db
├── outline/                   # 大纲数据
│   ├── story.json             # 故事顶层
│   ├── acts/                  # Act 大纲
│   ├── arcs/                  # Arc 大纲
│   ├── volumes/               # Volume 大纲
│   ├── chapters/              # 章节 Brief
│   └── foreshadowing.jsonl    # 伏笔注册表
├── chapters/                  # 章节正文
│   ├── chapter_001.md
│   ├── chapter_002.md
│   └── ...
├── checkpoints/               # 检查点快照
└── exports/                   # 导出产物
```

### 3. 配置管理

```typescript
class ProjectManager {
  // 生命周期
  create(location: string, config: ProjectConfig): Promise<Project>;
  open(location: string): Promise<Project>;
  close(project: Project): Promise<void>;

  // 配置
  getConfig(project: Project): MyceliumConfig;
  updateConfig(project: Project, patch: Partial<MyceliumConfig>): Promise<void>;
  validateConfig(config: MyceliumConfig): ValidationReport;

  // 导入导出
  export(project: Project, format: ExportFormat, target: string): Promise<void>;
  import(source: string, format: ImportFormat): Promise<ProjectConfig>;
}

interface Project {
  readonly root: string;
  readonly config: MyceliumConfig;
  readonly novel: Novel;
}
```

### 4. 导出格式

| 格式     | 说明                                  | 用途                   |
| -------- | ------------------------------------- | ---------------------- |
| Markdown | 章节级 .md 文件，含元数据 frontmatter | Git 版本管理、协作编辑 |
| EPUB     | 标准电子书格式                        | 电子书阅读器           |
| TXT      | 纯文本（GBK/UTF-8）                   | 中文网文平台上传       |
| HTML     | 单文件网页                            | Web 阅读               |

导出插件接口：

```typescript
interface ExportPlugin {
  readonly format: ExportFormat;
  readonly extension: string;
  export(novel: Novel, chapters: Chapter[], target: string): Promise<void>;
}
```

### 5. 项目完整性校验

```typescript
validate(project: Project): Promise<ValidationReport>;

interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}
```

校验项目：

- `.mycelium/` 目录结构完整性
- `config.json` Schema 合规
- 知识库数据一致性（实体引用完整性）
- 大纲与章节的对应关系
- 章节序号连续性与版本一致性

## 设计原则

1. **人类可读**：`.mycelium/` 下的 JSON/Markdown 文件可直接用文本编辑器查看和修改。
2. **Git 友好**：所有数据以文本格式存储（JSONL + Markdown），便于版本控制和 diff。
3. **渐进复杂度**：新项目只需 `config.json`；随着创作推进，知识库和大纲逐步丰富。

## 依赖

- `@mycelium/core` — 使用其配置接口和项目结构常量

## 未来扩展

- Git 集成（自动 commit、分支管理）
- 云同步（项目数据远程备份）
- 协作模式（多人同时编辑知识库和大纲）
- 模板市场（社区共享的类型模板和风格指南）
