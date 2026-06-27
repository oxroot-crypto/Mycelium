# @mycelium/llm

> Mycelium LLM 抽象层 — 多 Provider 统一接口、Token 预算管理、上下文窗口组装

## 架构定位

`@mycelium/llm` 是 Mycelium 与外部 LLM 服务交互的**唯一入口**。它向上层屏蔽 Anthropic、OpenAI、本地模型等 Provider 差异，提供统一的生成接口，并管理最关键的资源——**上下文窗口 Token 预算**。

```
@mycelium/llm
  ↑
  ├── @mycelium/knowledge（摘要生成、Embedding）
  ├── @mycelium/writer（Agent 循环中的 LLM 调用）
  ├── @mycelium/review（LLM Judge 检查）
  └── @mycelium/orchestrator（全局 LLM 配置）
```

## 核心职责

### 1. 多 Provider 抽象

```typescript
interface LLMProvider {
  readonly name: string;
  readonly model: string;
  readonly maxContextTokens: number;

  generate(request: LLMRequest): Promise<LLMResponse>;
  generateStream(request: LLMRequest): AsyncIterable<LLMChunk>;
  countTokens(text: string): Promise<number>;
}

// 内置 Provider
class AnthropicProvider implements LLMProvider {
  /* ... */
}
class OpenAIProvider implements LLMProvider {
  /* ... */
}
class OpenAICompatibleProvider implements LLMProvider {
  /* ... */
}

// Provider 注册表
class ProviderRegistry {
  register(name: string, provider: LLMProvider): void;
  get(name: string): LLMProvider;
  getDefault(): LLMProvider;
}
```

### 2. Token 预算管理

四级优先级裁剪策略，在有限的上下文窗口中最大化有效信息量：

| 优先级 | 名称   | 内容                                      | 策略                                 |
| ------ | ------ | ----------------------------------------- | ------------------------------------ |
| **P0** | 不可裁 | System Prompt + 项目配置 + 当前章节 Brief | 始终保留，占用 ~3.5K tokens          |
| **P1** | 高优先 | 活跃角色档案 + 近 5 章摘要                | 尽量保留，占用 ~5K tokens            |
| **P2** | 可压缩 | RAG 检索到的相关知识                      | 超出预算时压缩为更短摘要 ~5K tokens  |
| **P3** | 可替换 | 历史文本 + 早期摘要                       | 超出预算时丢弃，Agent 可按需工具检索 |

```typescript
class TokenBudget {
  readonly total: number;
  readonly used: number;
  readonly allocations: Map<string, number>;

  allocate(category: string, tokens: number): boolean;
  truncate(targetTokens: number): TruncationReport;
  getRemaining(): number;
}
```

### 3. 上下文组装器（ContextAssembler）

将分散的知识来源智能组装为 LLM 可直接消费的 messages 数组：

```typescript
class ContextAssembler {
  assemble(request: AssembleRequest): Promise<AssemblyResult>;
}

interface AssembleRequest {
  chapterBrief: ChapterBrief;
  knowledgeContext: AssembledContext; // 来自 @mycelium/knowledge
  styleGuide: StyleGuide;
  outlineConstraints: Constraint[];
  previousChapterHooks?: ContinuityHook[];
  mode: WritingMode;
}

interface AssemblyResult {
  messages: Message[]; // 组装好的完整消息列表
  budget: TokenBudget; // 各部分的 Token 分配明细
  truncated: TruncationEntry[]; // 被裁剪的内容清单（供 Agent 工具检索回补）
}
```

### 4. Prompt 模板系统

```typescript
class PromptTemplate {
  readonly name: string;
  readonly template: string;

  render(variables: Record<string, string>): string;
  static fromFile(path: string): PromptTemplate;
}

// 内置模板
const templates = {
  'chapter-first-draft': '...', // 初稿生成
  'chapter-revise': '...', // 审校后修订
  'scene-plan': '...', // 场景规划
  'review-check': '...', // 审校检查
  'summary-generation': '...', // 摘要生成
};
```

### 5. 重试与回退

- 指数退避 + 随机 jitter（避免惊群效应）
- Provider 不可用时自动切换备用 Provider
- 所有 LLM 调用统一计入 Token 消耗统计

## 设计原则

1. **Provider 无关**：上层代码只依赖 `LLMProvider` 接口，不感知具体实现。
2. **预算透明**：每次调用的 Token 分配情况可追溯、可审计。
3. **裁剪可回补**：被裁剪的内容记录在 `TruncationEntry` 中，Agent 可通过工具调用主动检索回补。
4. **模板可组合**：模板支持继承和片段引用，避免 prompt 碎片化。

## 依赖

- `@mycelium/core` — 使用其配置接口和领域类型

## 未来扩展

- Token 消耗统计面板（按章节/按阶段/按 Agent）
- 更多的 Provider 实现（Google Gemini、国产大模型等）
- Prompt 版本管理与 A/B 测试
- 上下文缓存（Anthropic Prompt Caching 等）
