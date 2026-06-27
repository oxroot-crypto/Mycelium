# @mycelium/core

> Mycelium 基础类型与工具 — 所有子包共享的领域模型、配置接口、错误层次

## 架构定位

`@mycelium/core` 位于依赖图的最底层，**零外部依赖**，是所有 `@mycelium/*` 子包的共享基础层。它只包含**纯类型定义**和**纯工具函数**，不涉及任何 I/O、网络、LLM 调用等副作用操作。

```
@mycelium/core
  ↑
  ├── @mycelium/llm
  ├── @mycelium/project
  ├── @mycelium/outline
  ├── @mycelium/knowledge
  ├── @mycelium/writer
  ├── @mycelium/review
  ├── @mycelium/orchestrator
  └── @mycelium/tui
```

## 核心职责

### 1. 领域模型（Domain Models）

定义网文创作领域的所有核心数据结构，均为纯数据对象（无行为方法）：

| 类型                | 说明                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `Novel`             | 小说元信息（标题、简介、类型、标签、目标读者、创作状态）                       |
| `Chapter`           | 章节实体（序号、标题、正文、字数、状态、版本号）                               |
| `CharacterProfile`  | 角色档案（姓名、别名、性格特征、外貌、能力体系、背景故事、关系网络、当前状态） |
| `LocationEntry`     | 地点档案（名称、描述、层级关系、重大事件、关联角色）                           |
| `WorldRule`         | 世界观规则（力量体系、社会制度、魔法规则、历史事件）                           |
| `ItemEntry`         | 物品/宝物档案（描述、功能、历史、当前持有者）                                  |
| `PlotArc`           | 情节弧（概要、节拍、角色弧、所属 Act）                                         |
| `VolumeOutline`     | 卷大纲（概要、章节列表、节奏目标）                                             |
| `ChapterBrief`      | 章节简报（POV、地点、时间、场景列表、约束、伏笔清单）                          |
| `SceneBrief`        | 场景简报（目标、角色、地点、情感节拍）                                         |
| `Foreshadowing`     | 伏笔（类型、种植章节、预期回收窗口、状态）                                     |
| `NarrativeQuestion` | 叙事悬疑（问题、状态、引入章节）                                               |

### 2. 配置体系（Configuration）

```typescript
// 全局配置
interface MyceliumConfig {
  llm: LLMProviderConfig; // LLM Provider 配置
  project: ProjectDefaults; // 项目默认值
  behavior: BehaviorConfig; // 行为参数
  tui: TuiPreferences; // TUI 偏好
  extensions: Record<string, unknown>; // 扩展槽
}

// 项目配置
interface ProjectConfig {
  novel: NovelMetadata; // 小说元信息
  mode: WritingMode; // 创作模式
  review: ReviewConfig; // 审校开关
  export: ExportDefaults; // 导出默认值
}

// 风格指南
interface StyleGuide {
  narrativeVoice: NarrativeVoice;
  proseStyle: ProseStyle;
  dialogRatio: number;
  descriptionLevel: number;
  sentencePreference: SentencePreference;
  tabooTopics: string[];
  vocabularyPreferences: string[];
}
```

### 3. 错误层次（Error Hierarchy）

```typescript
class MyceliumError extends Error {
  code: ErrorCode;
  severity: ErrorSeverity; // 'fatal' | 'error' | 'warning' | 'info'
  recoverable: boolean;
}

// 子类
class KnowledgeError extends MyceliumError {}
class OutlineError extends MyceliumError {}
class GenerationError extends MyceliumError {}
class ReviewError extends MyceliumError {}
class ConfigError extends MyceliumError {}
```

### 4. 常量与工具

- **项目结构常量**：`.mycelium/` 目录布局定义
- **章节状态枚举**：`pending | planned | drafting | in_review | needs_revision | approved | published`
- **伏笔状态枚举**：`planted | hinted | revealed | resolved`
- **通用工具类型**：`DeepPartial<T>`、`Result<T, E>`、`Timestamp`、`SemVer`

## 设计原则

1. **纯数据**：领域模型不含行为方法，只做数据载体。行为由各业务包提供。
2. **Discriminated Union**：所有可能扩展的枚举/状态使用 discriminated union，新类型不破坏现有代码。
3. **扩展槽**：`MyceliumConfig.extensions` 为插件提供无冲突的配置空间。
4. **不可变偏好**：所有接口属性使用 `readonly`，修改通过专门的 `update*` 函数。

## 依赖

无外部依赖，无 `@mycelium/*` 依赖。

## 未来扩展

- 配置 Schema 校验（Zod 或 TypeBox 集成）
- 领域模型的序列化/反序列化辅助函数
- 插件元数据接口 `PluginManifest`
