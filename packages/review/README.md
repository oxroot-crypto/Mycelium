# @mycelium/review

> Mycelium 一致性审校系统 — 五层金字塔检查体系，质量保障层

## 架构定位

`@mycelium/review` 是 Mycelium 的**"编辑之眼"**。它在每章生成后对其进行五层递进式检查——从事实际面的硬规则验证，到叙事层面的软质量评判。它是保障百万字长篇内容质量的最后一道防线。

```
@mycelium/review
  ↑
  └── @mycelium/orchestrator（调度审校任务、接收审校报告）
```

## 核心职责

### 五层检查体系

```
                        ┌─────────────┐
                        │ L5: Question│ ← 叙事问题追踪
                        ├─────────────┤
                        │ L4: Quality │ ← 重复/逻辑/语病
                        ├─────────────┤
                        │L3: Structural│← 大纲比对
                        ├─────────────┤
                        │L2: Narrative│ ← LLM 评判
                        ├─────────────┤
                        │ L1: Factual │ ← 规则引擎
                        └─────────────┘
```

#### L1: Factual Check（事实层 — 规则引擎，精确判断）

| 检查项           | 实现方式                           | 严重级别  |
| ---------------- | ---------------------------------- | --------- |
| **角色属性验证** | 提取实体名 → 查知识库 → 比对属性值 | `error`   |
| **战力体系验证** | 数值区间检查（境界/等级是否跨级）  | `error`   |
| **空间位置验证** | 跨章节追踪位置变化链               | `error`   |
| **时间线验证**   | 时间差分计算 + 事件排序检查        | `error`   |
| **知识范围验证** | 角色知识清单 vs 文中提及内容       | `warning` |

```typescript
class RuleBasedChecker implements ConsistencyChecker {
  readonly category = 'factual';

  async check(context: CheckContext): Promise<CheckResult> {
    const entities = await extractEntities(context.chapter.content);

    for (const entity of entities) {
      // 1. 角色属性验证
      const profile = await context.knowledge.getCharacter(entity.name);
      if (profile) {
        for (const [prop, value] of entity.mentionedProperties) {
          if (profile[prop]?.value !== value) {
            yield { type: 'entity_mismatch', entity, prop, expected: profile[prop], actual: value };
          }
        }
      }

      // 2. 战力体系验证
      if (entity.powerLevel && profile.powerLevel) {
        if (entity.powerLevel !== profile.powerLevel.value) {
          yield { type: 'power_inconsistency', entity, expected: profile.powerLevel, actual: entity.powerLevel };
        }
      }

      // 3. 空间位置验证
      if (entity.currentLocation && profile.currentLocation) {
        if (!canReach(entity.currentLocation, profile.currentLocation.value)) {
          yield { type: 'location_impossible', entity, location: entity.currentLocation };
        }
      }

      // 4. 知识范围验证
      const knownInfo = profile.knowledgeScope;
      const mentionedInfo = entity.mentionedConcepts;
      const unknownInfo = mentionedInfo.filter(i => !knownInfo.includes(i));
      if (unknownInfo.length > 0) {
        yield { type: 'knowledge_leak', entity, unknownInfo };
      }
    }

    return { passed: issues.length === 0, issues };
  }
}
```

#### L2: Narrative Check（叙事层 — LLM Judge，启发式）

| 检查项           | 实现方式                             | 严重级别  |
| ---------------- | ------------------------------------ | --------- |
| **情节连贯性**   | LLM 读取前 5 章 + 本章，评价逻辑承接 | `warning` |
| **角色一致性**   | LLM 对比角色档案 vs 行为/对话        | `warning` |
| **世界观一致性** | LLM 检测新设定与已有设定的冲突       | `warning` |

```typescript
class LLMJudgeChecker implements ConsistencyChecker {
  readonly category = 'narrative';

  async check(context: CheckContext): Promise<CheckResult> {
    const prompt = buildJudgmentPrompt({
      currentChapter: context.chapter,
      previousChapters: context.previousChapters.slice(-5),
      characterProfiles: context.activeCharacters,
      worldRules: context.worldRules,
      dimensions: ['plot_coherence', 'character_consistency', 'world_rule_consistency'],
    });

    const response = await context.llm.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
    });

    return parseJudgeResponse(response);
  }
}
```

#### L3: Structural Check（结构层 — 规则引擎，大纲比对）

| 检查项           | 实现方式                                         | 严重级别  |
| ---------------- | ------------------------------------------------ | --------- |
| **章节目标达成** | 比对 ChapterBrief.plotPointsAdvanced vs 实际内容 | `warning` |
| **伏笔追踪**     | 伏笔种植/回收状态机验证                          | `warning` |
| **节奏匹配**     | 实际 pacing metrics vs 目标 pacing target        | `info`    |

#### L4: Quality Check（质量层 — 规则 + 向量）

| 检查项       | 算法                                              | 严重级别  |
| ------------ | ------------------------------------------------- | --------- |
| **重复检测** | N-gram (3-7 gram) 窗口扫描 + Embedding 余弦相似度 | `warning` |
| **逻辑矛盾** | 同章内前后声明矛盾检测（规则 + LLM）              | `error`   |
| **语病检测** | 指代不明/主谓不一致/语序错乱（规则引擎）          | `info`    |

重复检测算法详解：

```typescript
async detectRepetition(
  text: string,
  existingChapters: Chapter[],
  threshold = 0.85,
): Promise<RepetitionResult[]> {
  const results: RepetitionResult[] = [];

  // 1. N-gram 重叠检测（快速粗筛）
  const currentNGrams = extractNGrams(text, [3, 4, 5, 6, 7]);

  for (const chapter of existingChapters) {
    const chapterNGrams = extractNGrams(chapter.content, [3, 4, 5, 6, 7]);
    const overlap = computeOverlap(currentNGrams, chapterNGrams);

    if (overlap.ratio > 0.3) {
      // 候选：N-gram 重叠率高

      // 2. Embedding 相似度（精确验证）
      const currentEmbed = await embed(text);
      const chapterEmbed = await embed(chapter.content);
      const similarity = cosineSimilarity(currentEmbed, chapterEmbed);

      if (similarity > threshold) {
        results.push({
          chapterId: chapter.id,
          chapterIndex: chapter.index,
          overlapRatio: overlap.ratio,
          embeddingSimilarity: similarity,
          overlappingSpans: overlap.spans,
        });
      }
    }
  }

  return results;
}
```

#### L5: Question Check（叙事问题层）

追踪故事中的悬而未决问题：

- 本章引入了哪些新的 narrative questions？
- 之前的 questions 在本章有进展吗？
- 有没有被遗忘的 questions（超过 N 章无进展）？

### 审校报告结构

```typescript
interface ReviewReport {
  summary: {
    passed: boolean; // 总体是否通过（无 error 级别问题）
    totalChecks: number; // 执行的检查项总数
    errors: number; // error 数量
    warnings: number; // warning 数量
    infos: number; // info 数量
  };

  issues: ReviewIssue[];

  revisionSuggestions: RevisionSuggestion[];

  chapterQuality: {
    overall: number; // 0-100 综合评分
    prose: number; // 文笔
    pacing: number; // 节奏
    dialog: number; // 对话
    description: number; // 描写
    plotAdvancement: number; // 情节推进
    consistency: number; // 一致性
  };
}

interface ReviewIssue {
  id: string;
  type: IssueType;
  severity: 'error' | 'warning' | 'info';
  category: ReviewCategory;
  description: string; // 中文描述
  location: TextRange; // 问题位置
  evidence: string; // 原文引用
  knowledgeRef?: string; // 知识库引用
  suggestion: string; // 修复建议
}

interface RevisionSuggestion {
  targetRange: TextRange;
  replacementText: string; // 建议替换文本
  reasoning: string; // 为什么这样改
  confidence: number; // 0-1
  autoApplicable: boolean; // 是否可自动应用
}
```

## 对外主要接口

```typescript
class ReviewEngine {
  // 核心审校
  reviewChapter(
    chapter: Chapter,
    knowledge: KnowledgeBase,
    outline: OutlineBase,
  ): Promise<ReviewReport>;

  // 快速检查（仅 L1 规则引擎）
  quickCheck(chapter: Chapter, knowledge: KnowledgeBase): Promise<ReviewReport>;

  // 全本扫描（耗时较长）
  fullNovelScan(
    novel: Novel,
    knowledge: KnowledgeBase,
    outline: OutlineBase,
  ): Promise<ReviewReport>;

  // 专项检查
  detectRepetition(
    text: string,
    existing: Chapter[],
    threshold?: number,
  ): Promise<RepetitionResult[]>;
  checkForeshadowing(chapter: Chapter, outline: OutlineBase): Promise<ForeshadowingReport>;

  // 扩展
  registerChecker(checker: ConsistencyChecker): void;
  unregisterChecker(name: string): void;
}

// 可扩展的检查器接口
interface ConsistencyChecker {
  readonly name: string;
  readonly category: ReviewCategory;
  check(context: CheckContext): Promise<CheckResult>;
}
```

## 设计原则

1. **分层渐进**：L1（规则）快速、精确，用于硬错误；L2-L3（LLM/规则）用于软问题；L4-L5 用于深度分析。
2. **可组合**：每个检查器独立运行，可单独启用/禁用，可注册自定义检查器。
3. **可操作**：每个 issue 都附带具体位置、原文引用、修复建议、置信度。
4. **增量优先**：支持 quickCheck（仅 L1）处理高频场景，fullScan 用于里程碑节点。

## 依赖

- `@mycelium/core` — 领域类型、ReviewReport 接口
- `@mycelium/llm` — LLM Judge 检查
- `@mycelium/knowledge` — 实体知识查询
- `@mycelium/outline` — 大纲比对

## 未来扩展

- 自定义检查器市场（社区贡献的网文专项检查规则）
- 风格漂移检测（前后章节文风向量比对）
- 读者体验预测模型（悬念度、爽点密度、情感投入度）
- 多模态审校（角色名/地名音频一致性）
