# @mycelium/outline

> Mycelium 大纲规划系统 — 分层故事结构、伏笔管理、节奏控制、约束生成

## 架构定位

`@mycelium/outline` 是 Mycelium 的**"蓝图层"**。它管理故事从宏观到微观的完整规划——Story → Act → Arc → Volume → Chapter → Scene，层层细化，逐级约束。它是解决"剧情擅自发散/乱展开"问题的核心组件。

```
@mycelium/outline
  ↑
  ├── @mycelium/writer（获取章节 Brief 和约束）
  ├── @mycelium/review（结构层检查：大纲覆盖、伏笔追踪）
  └── @mycelium/orchestrator（获取工作计划）
```

## 核心职责

### 1. 分层大纲结构

```
Story（故事）
├── premise: string               // 一句话梗概
├── metadata: StoryMetadata       // 类型、基调、主题、目标读者
├── characters: CharacterArcRef[] // 角色弧引用
└── acts: ActOutline[]
    └── Act
        ├── summary: string
        ├── purpose: string       // 本幕在故事中的作用
        ├── emotionalArc: string  // 情感弧线
        └── arcs: ArcOutline[]    // 情节弧
            └── Arc
                ├── summary: string
                ├── beats: StoryBeat[]       // 关键节拍
                ├── characterArcs: string[]  // 涉及的角色弧
                └── volumes: VolumeOutline[] // 卷
                    └── Volume
                        ├── summary: string
                        ├── pacingTarget: PacingTarget
                        └── chapters: ChapterBrief[] // 章
                            └── ChapterBrief
                                ├── index: number
                                ├── title: string
                                ├── synopsis: string
                                ├── pov: string
                                ├── location: string
                                ├── time: string
                                ├── scenes: SceneBrief[]
                                ├── plotPointsAdvanced: string[]
                                ├── foreshadowing: Plant[] | Resolve[]
                                └── constraints: Constraint[]
```

### 2. 约束系统

每层大纲向下一层自动生成约束，确保写作不偏离规划：

```typescript
type ConstraintType = 'MustInclude' | 'MustNotContradict' | 'MustAdvance' | 'MustResolveBefore';

interface Constraint {
  type: ConstraintType;
  description: string; // 人类可读的约束描述
  source: OutlineLevel; // 约束来源层级
  target: OutlineLevel; // 约束目标层级
  priority: 'hard' | 'soft'; // 硬约束（不可违反）vs 软约束（建议遵守）
}
```

约束示例：

- `MustInclude("主角获得新功法")` — 本章必须包含此事件
- `MustNotContradict("主角不应在此时间点知道反派的真实身份")` — 知识范围约束
- `MustAdvance("感情线：主角与女主关系应有进展")` — 支线推进约束
- `MustResolveBefore("伏笔#42", chapter=60)` — 伏笔回收截止

### 3. 伏笔管理系统

伏笔状态机：`Planted → Hinted → Revealed → Resolved`

```typescript
interface Foreshadowing {
  id: string;
  type: 'prophecy' | 'object' | 'dialogue' | 'event' | 'character';
  description: string;
  plantedChapter: number;
  expectedResolutionWindow: { start: number; end: number };
  actualResolutionChapter?: number;
  status: ForeshadowingStatus;
  relatedForeshadowing?: string[]; // 关联伏笔（连环伏笔）
}
```

关键功能：

- **逾期提醒**：接近回收窗口末尾但未回收的伏笔自动告警
- **冲突检测**：新种伏笔是否与已有伏笔的目的冲突
- **回收验证**：回收章节是否真的满足了伏笔的预期

### 4. 节奏管理

```typescript
interface PacingTarget {
  tensionCurve: number[]; // 目标紧张度曲线（0-10）
  targetWordCount: number; // 目标字数
  dialogRatio: number; // 对话占比
  actionRatio: number; // 动作占比
  descriptionDensity: number; // 描写密度
}

interface PacingReport {
  chapterId: string;
  actual: PacingMetrics;
  target: PacingTarget;
  deviation: PacingDeviation; // 偏离度
  suggestions: string[]; // 调整建议
}
```

### 5. 三种工作模式

| 模式             | 说明                               | 适用场景             |
| ---------------- | ---------------------------------- | -------------------- |
| **Tight Mode**   | 严格按大纲生成，偏离即告警         | 结构严谨的悬疑/推理  |
| **Loose Mode**   | 大纲为参考，生成后自动比对更新大纲 | 大多数创作场景       |
| **Pantser Mode** | 自由写作，系统反向从文本提取大纲   | 灵感型创作、自由探索 |

### 6. 支线/Subplot 管理

```typescript
interface Subplot {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'resolved';
  lastChapterAdvanced: number;
  remainingBeats: StoryBeat[];
  priority: number;
}
```

- 多条情节线并行追踪，防止某条线长期不推进
- 支线交织建议：系统检测可融合的支线点
- 支线健康度评分

## 对外主要接口

```typescript
class OutlineBase {
  // 读取
  getStory(): Promise<StoryOutline>;
  getChapterBrief(chapterId: string): Promise<ChapterBrief>;
  getNextChapter(): Promise<ChapterBrief | null>;
  getConstraints(targetLevel: OutlineLevel): Promise<Constraint[]>;

  // 写入
  createArc(def: ArcDefinition): Promise<ArcOutline>;
  updateChapterBrief(id: string, update: Partial<ChapterBrief>): Promise<void>;
  markPlotPointCompleted(chapterId: string, plotPointId: string): Promise<void>;

  // 伏笔
  plantForeshadowing(fs: Foreshadowing): Promise<void>;
  resolveForeshadowing(id: string, chapterId: string): Promise<void>;
  getPendingForeshadowing(): Promise<Foreshadowing[]>;
  getOverdueForeshadowing(currentChapter: number): Promise<Foreshadowing[]>;

  // 分析
  getPacingReport(): Promise<PacingReport>;
  analyzeCoverage(): Promise<CoverageReport>;
  suggestChapterOrder(): Promise<ChapterBrief[]>;
}
```

## 设计原则

1. **规划与执行分离**：大纲是"做什么"的规划，Writer 是"怎么做"的执行。
2. **灵活不僵化**：三种模式覆盖从严格规划到自由探索的完整光谱。
3. **约束可追溯**：每个约束都有来源层级，用户可理解"为什么有这个限制"。
4. **大纲是活的**：随写作进展，大纲可以也应该被更新和完善。

## 依赖

- `@mycelium/core` — 使用其领域类型和配置接口

## 未来扩展

- AI 辅助大纲生成（从一句话梗概展开完整大纲）
- 大纲版本管理（对比不同版本的大纲变化）
- 可视化大纲编辑器（TUI 中的树形图 + 甘特图）
- 大纲模板市场（经典三幕式、英雄之旅、起承转合等）
