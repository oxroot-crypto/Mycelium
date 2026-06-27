# @mycelium/knowledge

> Mycelium RAG 知识库 — 长期记忆系统，混合检索（BM25 + 向量）、实体存储、分层摘要、上下文组装

## 架构定位

`@mycelium/knowledge` 是 Mycelium 的**"长期记忆"和"世界圣经"**。它是解决百万字级别长篇网文**一致性**问题的核心组件。以 **RAG（Retrieval-Augmented Generation）** 为架构核心，将隐性的"模型记住了什么"变为显性的"知识库记录了哪些事实"。

```
@mycelium/knowledge（RAG）
  ↑
  ├── @mycelium/writer（上下文组装、知识检索工具）
  ├── @mycelium/review（事实层检查：实体属性比对）
  └── @mycelium/orchestrator（知识更新调度）
```

## RAG 整体架构

```
┌──────────────────────────┐      ┌──────────────────────────┐
│     写入管线 (Ingest)      │      │     读取管线 (Retrieve)    │
│                          │      │                          │
│  Chapter Content ───────►│      │  Context Request ───────►│
│  + Writer Metadata ─────►│      │                          │
│                          │      │  ┌──────────────────┐    │
│  1. 实体提取             │      │  │ 混合检索          │    │
│  2. 摘要生成（LLM）      │      │  │ ├ BM25 (FTS5)     │    │
│  3. 文档分块             │      │  │ ├ Dense (vec)     │    │
│  4. Embedding 生成       │      │  │ └ RRF 融合        │    │
│  5. 向量索引更新         │      │  └──────────────────┘    │
│  6. FTS5 索引更新        │      │  ┌──────────────────┐    │
│                          │      │  │ 结构化查询        │    │
│         ▼                │      │  │ ├ 实体查找        │    │
│  ┌──────────────────┐    │      │  │ ├ 时间线查询      │    │
│  │   混合存储层       │    │      │  │ └ 时间旅行       │    │
│  │                   │    │      │  └──────────────────┘    │
│  │ ├ 结构化 (JSONL)  │    │      │  ┌──────────────────┐    │
│  │ ├ 向量 (sqlite-vec)│   │      │  │ 分层摘要聚合      │    │
│  │ └ 全文 (FTS5)     │    │      │  │ ├ Chapter摘要    │    │
│  └──────────────────┘    │      │  │ ├ Volume摘要     │    │
│                          │      │  │ └ Global概要     │    │
│                          │      │  └──────────────────┘    │
└──────────────────────────┘      └──────────────────────────┘
```

## 核心职责

### 1. 文档分块策略（Chunking）

```
章节文本分块:
  ├── Scene-level chunks（~1000-2000 字/块）
  │   • 以场景为自然边界，保持叙事完整性
  │   • 相邻 chunk 重叠 200 字（保证语义连续性）
  │   • 携带 metadata：chapterIndex、sceneIndex、characters、location、time
  │
  ├── Entity-profile chunks
  │   • 每个角色/地点/概念 = 1 个独立 document
  │   • 标题 + 结构化属性列表
  │   • 带版本号和时间戳
  │
  └── Summary chunks
      • 每章摘要 = 1 个 document
      • 每卷聚合摘要 = 1 个 document
      • 全局概要 = 1 个 document
```

### 2. 混合检索策略（Hybrid Retrieval）

```typescript
// 混合检索入口
interface HybridSearchOptions {
  query: string;
  topK: number;
  filter?: {
    chapterRange?: [number, number];
    entityTypes?: string[];
    characters?: string[];
    timeRange?: [Date, Date];
  };
  weights?: {
    bm25: number; // 默认 0.3
    vector: number; // 默认 0.7
  };
}
```

检索流程：

```
查询："主角在第50章的战力等级"
  │
  ├─ 1. BM25 关键词检索 (SQLite FTS5)
  │     → "主角" + "战力" + "第50章"
  │     → 精确匹配，按词频/逆文档频率排序
  │
  ├─ 2. Dense Vector 语义检索 (sqlite-vec)
  │     → embedding("主角的战力等级是什么")
  │     → 余弦相似度排序
  │
  ├─ 3. Reciprocal Rank Fusion (RRF)
  │     → 合并两路结果，k=60 参数混合
  │     → score = weight_bm25/(k+rank_bm25) + weight_vec/(k+rank_vec)
  │
  └─ 4. Metadata 过滤
        → chapter <= 50
        → entity_type = "character"
```

### 3. 分层检索策略（Context Assembly）

```typescript
interface ContextRequest {
  chapterBrief: ChapterBrief;
  maxTokens: number;
  stages: RetrievalStage[];
}

interface AssembledContext {
  alwaysLoaded: AlwaysLoadedContext; // P0-P1 内容
  onDemand: RetrievalToolkit; // 供 Agent 工具调用
  stagedCache: Map<Tier, StageContext>; // 按需层级缓存
}

// Always-loaded（每章必载，~8K tokens）
const alwaysLoaded = {
  currentArcSummary, // 当前 Arc 概要
  currentVolumeSummary, // 当前 Volume 概要
  recent5ChapterSummaries, // 近 5 章摘要
  activeCharacterProfiles, // 本章出场角色档案
  chapterBrief, // 当前章节 Brief
};

// Staged Tiers（按需提升）
const stagedTiers = {
  tier1: '当前 Volume 完整摘要 (~8K tokens)',
  tier2: '前一 Volume 压缩摘要 (~3K tokens)',
  tier3: '更早 Volumes 极致压缩 (~1K tokens)',
};
```

### 4. 实体存储（带版本追踪）

```typescript
interface CharacterState {
  id: string;
  name: string;
  aliases: string[];
  traits: Versioned<TraitSnapshot[]>; // 性格快照，每个属性带版本
  abilities: Versioned<AbilitySnapshot[]>; // 能力快照
  relationships: Versioned<RelationSnapshot[]>; // 关系网络
  recentActions: ActionRecord[];
  currentLocation: string;
  knowledgeScope: string[]; // 角色当前知道什么
  arc: string; // 所属人物弧
  firstAppearedAt: number; // 首次出场章节
  lastUpdatedAt: number; // 最后更新章节
}

// 版本化属性 —— 支持"时间旅行查询"
interface Versioned<T> {
  value: T;
  version: number;
  updatedAtChapter: number;
  updatedAt: Date;
}
```

时间旅行查询示例：

```typescript
// 查询角色在第 50 章时的状态
const character = await knowledgeBase.getCharacter('叶凡', { atChapter: 50 });
```

### 5. 摘要存储（分层压缩）

```typescript
interface ChapterSummary {
  chapterId: string;
  chapterIndex: number;
  events: StoryEvent[]; // 事件列表
  characterChanges: StateChange[]; // 角色状态变化
  newEntities: NewEntity[]; // 新角色/地点/概念的引入
  plantedForeshadowing: ForeshadowingRef[];
  resolvedForeshadowing: string[];
  openQuestions: NarrativeQuestion[];
  proseSummary: string; // 200-500 字叙述性摘要
  keywords: string[];
}
```

压缩层级：Chapter (~300字) → Volume (~300-500字) → Arc (~200-300字) → Global (~500字)

### 6. 向量存储方案

```typescript
// 抽象接口，支持切换后端
interface VectorStore {
  insert(records: VectorRecord[]): Promise<void>;
  search(query: number[], options: VectorSearchOptions): Promise<SearchResult[]>;
  delete(filter: VectorDeleteFilter): Promise<number>;
}

// 阶段一：sqlite-vec（嵌入式，零运维）
class SqliteVecStore implements VectorStore {
  /* ... */
}

// 阶段二：LanceDB（更大规模）
class LanceDBStore implements VectorStore {
  /* ... */
}
```

### 7. Embedding 模型抽象

```typescript
interface EmbeddingModel {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}
```

## 对外主要接口

```typescript
class KnowledgeBase {
  // RAG 检索
  retrieve(query: string, filter?: RetrievalFilter): Promise<RetrievalResult[]>;
  hybridSearch(query: string, options?: HybridSearchOptions): Promise<HybridSearchResult[]>;

  // 结构化查询
  getCharacter(name: string, opts?: { atChapter?: number }): Promise<CharacterState>;
  getLocation(name: string): Promise<LocationEntry>;
  getTimeline(from?: number, to?: number): Promise<TimelineEntry[]>;

  // 上下文组装（供 Writer 调用）
  assembleContext(request: ContextRequest): Promise<AssembledContext>;

  // 写入管线
  ingestChapter(chapter: Chapter, metadata: ChapterMetadata): Promise<IngestReport>;
  updateEntity(type: string, id: string, changes: EntityChange[]): Promise<void>;

  // 快照
  createSnapshot(label: string): Promise<Snapshot>;
  rollback(snapshotId: string): Promise<void>;

  // 扩展
  registerChunkStrategy(strategy: ChunkStrategy): void;
  registerEmbeddingModel(model: EmbeddingModel): void;
}
```

## 设计原则

1. **写入时提取，读取时检索**：每次写入时充分提取元数据，检索时不依赖模型记忆。
2. **混合检索 > 纯向量检索**：关键词匹配对专有名词（人名、地名、功法名）更精确。
3. **分层压缩 > 粗暴截断**：保留每层的有损摘要作为索引，需要详情时按层深入。
4. **版本化 > 快照覆盖**：支持时间旅行查询，而非仅保留最新状态。
5. **嵌入式优先**：sqlite-vec 零运维，本地文件即数据库，与项目 Git 管理完美兼容。

## 依赖

- `@mycelium/core` — 领域类型、配置接口
- `@mycelium/llm` — 摘要生成、Embedding 模型调用

## 未来扩展

- 多模态知识（角色立绘、地图、关系图）
- 知识图谱查询（GraphRAG：实体间多跳关系推理）
- 增量 Embedding 更新（只对新内容生成向量，避免重复计算）
- 云端向量数据库支持（Pinecone、Weaviate）用于协作场景
