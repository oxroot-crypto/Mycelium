# @mycelium/writer

> Mycelium 章节生成引擎 — 多步 Agent 写作循环、NCI 工具集、风格控制、连续性管理

## 架构定位

`@mycelium/writer` 是 Mycelium 的**"写作之手"**。它负责所有与"写文字"相关的操作——从接收章节 Brief 到产出完整草稿。它采用多步 Agent 循环模式，每个阶段可独立重试和验证，确保生成质量。

```
@mycelium/writer
  ↑
  └── @mycelium/orchestrator（调度写作任务）
```

## 核心职责

### 1. 写作 Agent 循环

```
┌─────────────────────────────────────────────────────┐
│                 Chapter Writing Loop                 │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ 1. PLAN Phase（场景规划）                     │   │
│  │    Input: ChapterBrief + Constraints         │   │
│  │    → 分析 Brief，拆解为 3-5 个 ScenePlan      │   │
│  │    → 确定每个场景的目标、出场角色、情感节拍    │   │
│  │    Output: ScenePlan[]                       │   │
│  └──────────────────────────────────────────────┘   │
│                    ↓                                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ 2. WRITE Phase（逐场景生成 + 自编辑）         │   │
│  │    For each ScenePlan:                       │   │
│  │    → 查询知识库获取场景相关上下文              │   │
│  │    → 生成场景初稿                              │   │
│  │    → 自编辑：检查风格/语气/节奏                │   │
│  │    → 验证：场景是否达到 Brief 预期？            │   │
│  │    Output: Scene[]                           │   │
│  └──────────────────────────────────────────────┘   │
│                    ↓                                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ 3. ASSEMBLE Phase（场景拼接）                 │   │
│  │    → 将各场景拼接为完整章节                    │   │
│  │    → 检查场景间过渡和衔接                      │   │
│  │    → 统一章节格式（标题、分段）                │   │
│  │    Output: Chapter draft                     │   │
│  └──────────────────────────────────────────────┘   │
│                    ↓                                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ 4. POST-WRITE Phase（后处理）                 │   │
│  │    → 生成结构化章节摘要                        │   │
│  │    → 提取角色状态变化                          │   │
│  │    → 检测本章新种植的伏笔                      │   │
│  │    → 生成 continuity hooks（连续性钩子）       │   │
│  │    Output: Chapter + Metadata                │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2. NCI 工具集（Agent-Novel Interface）

借鉴 Claude Code 的 ACI 设计理念，为 Writer Agent 定义专用工具集：

| 工具名                      | 功能                     | 类比         |
| --------------------------- | ------------------------ | ------------ |
| `novel_query_knowledge`     | RAG 检索知识库           | 查文档       |
| `novel_read_chapter`        | 读取已写章节全文         | 读代码       |
| `novel_read_outline`        | 读取大纲约束和 Brief     | 看需求       |
| `novel_write_scene`         | 写入一个场景             | 写代码       |
| `novel_edit_scene`          | 编辑已有场景             | 改代码       |
| `novel_check_style`         | 检查当前文本的风格一致性 | Lint         |
| `novel_get_continuity`      | 获取上下章连续性信息     | 读上下文     |
| `novel_plant_foreshadowing` | 种植新伏笔               | 标记 TODO    |
| `novel_search_similar`      | 搜索相似场景/描写        | 搜索相似代码 |

### 3. 风格控制系统

```typescript
interface StyleGuide {
  // 叙事层面
  narrativeVoice: 'first_person' | 'third_person' | 'third_limited' | 'third_omniscient';

  // 文风层面
  proseStyle: 'literary' | 'conversational' | 'cinematic' | 'minimal';

  // 量化参数
  dialogRatio: number; // 对话占比 0-1
  descriptionLevel: number; // 描写密度 1-5
  sentencePreference: 'simple' | 'varied' | 'complex';
  paragraphLength: 'short' | 'medium' | 'long' | 'varied';

  // 内容约束
  tabooTopics: string[];
  vocabularyPreferences: string[];
  forbiddenPhrases: string[];

  // 特定场景风格覆盖
  sceneOverrides?: Map<string, Partial<StyleGuide>>;
  // 例："打斗场景" → proseStyle: 'cinematic', dialogRatio: 0.1
}
```

### 4. 写作模式

| 模式          | 输入                   | 输出       | 说明                     |
| ------------- | ---------------------- | ---------- | ------------------------ |
| `first_draft` | ChapterBrief + Context | 完整初稿   | 从零生成新章节           |
| `revision`    | Chapter + ReviewReport | 修订后章节 | 根据审校报告定点修改     |
| `polish`      | Chapter + StyleGuide   | 润色后章节 | 仅文字层面润色，不改情节 |
| `expand`      | Scene + targetWords    | 扩展后场景 | 将简短场景扩展为详细描写 |
| `condense`    | Chapter + targetWords  | 精简后章节 | 压缩冗余内容             |

### 5. 连续性管理

```typescript
interface ContinuityHook {
  id: string;
  chapterId: string;
  type: 'cliffhanger' | 'question' | 'foreshadowing' | 'emotional_beat';
  description: string;
  resolvedInChapter?: number;
}

// 每章结尾自动生成 hooks
const hooks = await writer.generateContinuityHooks(chapter);

// 下章开始时自动注入相关 hooks
const context = await knowledge.assembleContext({
  ...request,
  previousHooks: await outline.getUnresolvedHooks(),
});
```

## 对外主要接口

```typescript
class WriterEngine {
  // 核心方法
  writeChapter(context: WriteContext): Promise<WriteResult>;
  reviseChapter(chapter: Chapter, review: ReviewReport): Promise<Chapter>;
  polishText(text: string, style: StyleGuide): Promise<string>;

  // 场景级操作
  generateScene(brief: SceneBrief, context: WriteContext): Promise<Scene>;
  expandScene(scene: Scene, targetWords: number): Promise<Scene>;
  condenseScene(scene: Scene, targetWords: number): Promise<Scene>;

  // 辅助
  estimateComplexity(brief: ChapterBrief): Promise<ComplexityEstimate>;
  generateContinuityHooks(chapter: Chapter): Promise<ContinuityHook[]>;
  extractChapterSummary(chapter: Chapter): Promise<ChapterSummary>;
}

interface WriteContext {
  chapterBrief: ChapterBrief;
  assembledContext: AssembledContext; // 来自 @mycelium/knowledge
  styleGuide: StyleGuide;
  mode: WritingMode;
  previousChapter?: Chapter; // 用于连续性
  previousHooks?: ContinuityHook[]; // 待解决的钩子
}

interface WriteResult {
  chapter: Chapter;
  summary: ChapterSummary;
  characterChanges: StateChange[];
  newForeshadowing: Foreshadowing[];
  continuityHooks: ContinuityHook[];
  tokenUsage: TokenUsage;
}
```

## 设计原则

1. **分阶段可验证**：Plan → Write → Assemble → PostWrite，每个阶段产出可独立检查。
2. **Agent 驱动**：Writer 不是"一个 prompt 生成一章"，而是 Agent 使用多个工具协作完成。
3. **自编辑优先**：生成后立即自检，减少 Review 阶段的压力。
4. **元数据同生成**：摘要、伏笔、状态变化随正文一同产出，不做事后补救。
5. **风格可控不僵化**：风格指南是参考系而非牢笼，关键时刻允许突破。

## 依赖

- `@mycelium/core` — 领域类型、StyleGuide、WriteContext
- `@mycelium/llm` — LLM 生成、Token 管理、Prompt 模板
- `@mycelium/knowledge` — 上下文组装、知识检索
- `@mycelium/outline` — 章节 Brief、约束获取

## 未来扩展

- 多 POV 并行写作（同一事件从不同角色视角写）
- 对话专项优化（对话自然的专门策略）
- 动作场景专项优化（快节奏、短句、视觉化）
- 情感弧线自动检测与调整
- 自定义 NCI 工具扩展
