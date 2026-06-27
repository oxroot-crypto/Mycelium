# @mycelium/orchestrator

> Mycelium 编排引擎 — 全局工作流调度中心，多 Agent 协调，检查点与恢复，Hook 扩展

## 架构定位

`@mycelium/orchestrator` 是 Mycelium 的**"大脑"**。它不直接写作、不直接审校、不直接管理知识——它**协调**所有子系统，将独立的组件编织为端到端的创作流程。它是依赖图中最顶层的业务包，依赖所有其他 `@mycelium/*` 包。

```
@mycelium/orchestrator（最顶层业务包）
  ↑
  ├── @mycelium/tui（TUI 通过 Orchestrator 控制一切）
  └── main/（CLI 入口聚合 Orchestrator）
```

## 核心职责

### 1. 全局状态机

```
                    ┌─────────────────┐
                    │  PROJECT_INIT   │ ← mycelium init
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   PRE_WRITING   │ ← 世界观/角色/大纲搭建
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
             ┌─────│   OUTLINING     │◄─── 人类反馈（大纲调整）
             │     └────────┬────────┘
             │              │
             │     ┌────────▼────────┐
             │  ┌─│  CHAPTER_GEN    │◄──┐
             │  │ └────────┬────────┘   │
             │  │          │            │
             │  │ ┌────────▼────────┐   │
             │  │ │    REVIEWING    │───┤(审校不通过→修订)
             │  │ └────────┬────────┘   │
             │  │          │            │
             │  │ ┌────────▼────────┐   │
             │  │ │  POST_WRITING   │   │
             │  │ │ (知识库更新)     │   │
             │  │ └────────┬────────┘   │
             │  │          │            │
             │  │ ┌────────▼────────┐   │
             │  │ │  HUMAN_REVIEW   │───┤(人类否决→修订)
             │  │ └────────┬────────┘   │
             │  │          │            │
             │  │ ┌────────▼────────┐   │
             │  │ │ MORE_CHAPTERS?  │───┘(是→下一章)
             │  │ └────────┬────────┘
             │  │          │(否)
             │  │ ┌────────▼────────┐
             │  │ │   FINALIZING    │
             │  │ └────────┬────────┘
             │  │          │
             │  │ ┌────────▼────────┐
             │  │ │    EXPORTING    │
             │  │ └─────────────────┘
             │  │
             └──┤(大纲重构→重新生成)
```

### 2. 多 Agent 协调

Orchestrator 管理 5 个专用 Agent 角色，每个都有独立职责：

```typescript
enum AgentRole {
  PLANNER = 'planner', // 决策"写什么"
  WRITER = 'writer', // 执行"怎么写"
  REVIEWER = 'reviewer', // 验证"写得怎样"
  KNOWLEDGE = 'knowledge', // 更新知识库
  EDITOR = 'editor', // 根据审校报告修订
}
```

**Agent 调度流程（一章的完整生命周期）**：

```typescript
async writeNextChapter(session: WorkflowSession): Promise<WriteNextResult> {
  // 1. Planner: 获取下一章 Brief 和约束
  const plan = await this.dispatch(AgentRole.PLANNER, async () => {
    const brief = await session.outline.getNextChapter();
    const constraints = await session.outline.getConstraints(brief);
    const pendingFS = await session.outline.getPendingForeshadowing();
    return { brief, constraints, pendingFS };
  });

  // 2. Knowledge: 组装上下文
  const context = await this.dispatch(AgentRole.KNOWLEDGE, async () => {
    return await session.knowledge.assembleContext({
      chapterBrief: plan.brief,
      maxTokens: session.config.contextBudget,
      stages: ['always', 'on_demand', 'staged'],
    });
  });

  // 3. Writer: 生成章节
  const result = await this.dispatch(AgentRole.WRITER, async () => {
    return await session.writer.writeChapter({
      chapterBrief: plan.brief,
      assembledContext: context,
      styleGuide: session.styleGuide,
      mode: 'first_draft',
    });
  });

  // 4. Reviewer: 审校
  const review = await this.dispatch(AgentRole.REVIEWER, async () => {
    return await session.review.reviewChapter(
      result.chapter,
      session.knowledge,
      session.outline,
    );
  });

  // 5. 如果需要修订: Editor 介入
  let finalChapter = result.chapter;
  if (!review.summary.passed) {
    finalChapter = await this.dispatch(AgentRole.EDITOR, async () => {
      return await session.writer.reviseChapter(result.chapter, review);
    });

    // 修订后再次审校（增量检查）
    const reReview = await this.dispatch(AgentRole.REVIEWER, async () => {
      return await session.review.quickCheck(finalChapter, session.knowledge);
    });

    if (reReview.summary.errors > 0) {
      // 仍有硬错误 → 上报人类
      return { status: 'needs_human_input', chapter: finalChapter, review: reReview };
    }
  }

  // 6. Knowledge: 更新知识库
  await this.dispatch(AgentRole.KNOWLEDGE, async () => {
    await session.knowledge.ingestChapter(finalChapter, result.metadata);
  });

  // 7. 保存检查点
  await this.saveCheckpoint(session);

  return { status: 'completed', chapter: finalChapter, review };
}
```

### 3. 检查点与恢复

```typescript
interface Checkpoint {
  id: string;
  timestamp: Date;
  chapterIndex: number;
  state: {
    knowledgeVersion: number;
    outlineSnapshot: string;
    tokenUsage: TokenUsageSummary;
    completedChapters: number;
  };
}
```

- **自动保存**：每章完成后自动创建检查点
- **手动保存**：用户可随时触发
- **恢复粒度**：可恢复到任意检查点，回滚知识库、大纲、章节
- **Dry-Run 模式**：预览下一步操作而不实际执行

### 4. 人机协作 Gate

```typescript
interface HumanReviewGate {
  // 触发条件
  trigger: 'every_chapter' | 'every_n_chapters' | 'on_error' | 'on_major_change' | 'never';
  n?: number; // 配合 every_n_chapters 使用

  // Gate 行为
  pauseForReview: boolean; // 暂停等待人类确认
  allowedActions: string[]; // 允许人类执行的操作
  timeout?: number; // 超时自动通过（秒）
}
```

人类审查时可执行的操作：

- `approve` — 批准，继续流程
- `reject` — 否决，带反馈进入修订
- `edit` — 手动编辑后再提交
- `skip` — 跳过本章审查
- `adjust_outline` — 调整大纲后重新生成
- `pause` — 暂停项目

### 5. 工作流事件系统

```typescript
type WorkflowEvent =
  // 写作事件
  | 'chapter:writing:start'
  | 'chapter:writing:progress' // { sceneIndex, totalScenes, preview }
  | 'chapter:writing:complete'
  // 审校事件
  | 'chapter:review:start'
  | 'chapter:review:complete' // { review }
  | 'chapter:review:failed' // { review }
  // 生命周期事件
  | 'chapter:approved'
  | 'chapter:rejected' // { feedback }
  | 'knowledge:updated' // { changes }
  | 'checkpoint:saved' // { checkpoint }
  | 'workflow:paused'
  | 'workflow:resumed'
  | 'workflow:error' // { error }
  | 'human:input:required'; // { prompt }
```

### 6. Hook 系统

```typescript
type HookPoint =
  | 'before:write'
  | 'after:write'
  | 'before:review'
  | 'after:review'
  | 'before:knowledge:update'
  | 'after:knowledge:update'
  | 'before:export';

interface HookHandler {
  (context: HookContext): Promise<void>;
}

// 注册示例
orchestrator.registerHook('after:write', async (ctx) => {
  // 自定义：每章写完后自动提交 Git
  await git.add(ctx.project.root);
  await git.commit(`chore: auto-commit chapter ${ctx.chapter.index}`);
});
```

## 对外主要接口

```typescript
class Orchestrator {
  // 会话管理
  startSession(project: Project): Promise<WorkflowSession>;
  resumeSession(project: Project): Promise<WorkflowSession>;
  getStatus(session: WorkflowSession): Promise<WorkflowStatus>;

  // 工作流操作
  writeNextChapter(session: WorkflowSession): Promise<WriteNextResult>;
  reviseChapter(
    session: WorkflowSession,
    chapterId: string,
    feedback: string,
  ): Promise<RevisionResult>;
  runFullReview(session: WorkflowSession): Promise<ReviewReport>;

  // 生命周期
  pause(session: WorkflowSession): Promise<void>;
  resume(session: WorkflowSession): Promise<void>;
  finalize(session: WorkflowSession): Promise<FinalizationReport>;

  // 事件与 Hook
  on(event: WorkflowEvent, handler: EventHandler): void;
  off(event: WorkflowEvent, handler: EventHandler): void;
  registerHook(hookPoint: HookPoint, handler: HookHandler): void;

  // 检查点
  saveCheckpoint(session: WorkflowSession, label?: string): Promise<Checkpoint>;
  restoreCheckpoint(session: WorkflowSession, checkpointId: string): Promise<void>;
  listCheckpoints(session: WorkflowSession): Promise<Checkpoint[]>;
}

interface WorkflowSession {
  id: string;
  project: Project;
  status: WorkflowStatus;
  orchestrator: Orchestrator;

  // 子系统访问（懒加载）
  getKnowledge(): Promise<KnowledgeBase>;
  getOutline(): Promise<OutlineBase>;
  getWriter(): Promise<WriterEngine>;
  getReview(): Promise<ReviewEngine>;
}

interface WorkflowStatus {
  phase: WorkflowPhase;
  currentChapterIndex: number;
  totalPlannedChapters: number;
  completedChapters: number;
  totalWordCount: number;
  tokenUsage: TokenUsageSummary;
  pendingIssues: number;
  estimatedNextChapterTokens: number;
}
```

## 设计原则

1. **调度者不执行**：Orchestrator 只协调，不直接操作 LLM、不直接修改知识库。
2. **状态可恢复**：任何中断后都能从最近检查点恢复，不丢失进度。
3. **人类在回路中**：关键决策点可配置人类审查，非关键步骤自动流转。
4. **事件驱动**：所有状态变更通过事件系统通知，TUI 可实时响应。
5. **Hook 可扩展**：生命周期 Hook 让插件和自定义脚本嵌入创作流程。

## 依赖

- `@mycelium/core` — 领域类型、配置接口
- `@mycelium/llm` — 全局 LLM 配置
- `@mycelium/project` — 项目接入
- `@mycelium/knowledge` — 知识库
- `@mycelium/outline` — 大纲
- `@mycelium/writer` — 写作引擎
- `@mycelium/review` — 审校引擎

## 未来扩展

- 并行章节生成（多 POV 章节同时写作）
- 创作分析仪表盘（进度/质量/节奏/伏笔覆盖度等统计）
- 协作编排（多人同时操作不同子系统）
- 自适应调度（根据 Token 消耗和目标字数动态调整写作策略）
