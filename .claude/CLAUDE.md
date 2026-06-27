# CLAUDE.md — Mycelium 项目编码规范

## 项目概述

**Mycelium** — AI 智能体网文创作平台，以 CLI 工具形式发布。

- **仓库**: `https://github.com/oxroot-crypto/mycelium`
- **作者**: `oxroot <oxrootnsexypig@gmail.com>`
- **许可证**: MIT
- **架构**: pnpm workspace monorepo（`main` + `packages/*`）

---

## 技术栈

| 层         | 技术                              | 版本要求          |
| ---------- | --------------------------------- | ----------------- |
| 语言       | TypeScript                        | 6.0+              |
| 运行时     | Node.js                           | >= 22             |
| 包管理器   | pnpm                              | >= 11             |
| 测试       | Vitest                            | 4.x               |
| Lint       | ESLint                            | 9.x (flat config) |
| 格式化     | Prettier                          | 3.x               |
| 构建       | tsc -b (project references)       | —                 |
| 文档       | TypeDoc                           | —                 |
| 拼写检查   | cspell                            | 10.x              |
| 死代码检测 | knip                              | 6.x               |
| 依赖同步   | syncpack                          | 15.x              |
| Git hooks  | lefthook                          | 2.x               |
| 版本管理   | changesets                        | —                 |
| 提交规范   | commitlint (conventional commits) | —                 |

---

## Monorepo 结构

```
mycelium/
├── main/                        # CLI 入口包 → npm 发布为 "mycelium"
│   ├── src/
│   │   └── index.ts             # 入口文件（导出 bin 命令）
│   ├── package.json             # name: "mycelium", bin: { "mycelium": "./dist/index.js" }
│   └── tsconfig.json            # extends ../tsconfig.base.json
├── packages/                    # 业务子包（@mycelium/* 命名空间）
│   └── (当前为空，按需创建)
├── tsconfig.base.json           # 所有子包共享的 TS 基础配置
├── tsconfig.json                # 根 project references（新增 packages 需手动添加引用）
├── eslint.config.mjs            # 全局 ESLint 扁平配置
├── prettier.config.mjs          # 全局 Prettier 配置
├── vitest.config.ts             # 全局 Vitest 配置
└── package.json                 # 根 workspace（private: true）
```

### 新建子包规范

1. 在 `packages/` 下创建目录（如 `packages/core`）
2. `package.json` 中 `name` 使用 `@mycelium/<name>` 格式
3. `tsconfig.json` 必须 `extends "../tsconfig.base.json"`（注意路径层级）
4. 在根 `tsconfig.json` 的 `references` 数组中添加 `{ "path": "packages/<name>" }`
5. 在 `knip.config.ts` 中添加 workspace 入口配置
6. 运行 `pnpm install` 重新链接依赖

---

## 编码规范（核心）

### 1. JSDoc 注释强制（🎯 最关键，仅作用于导出对象）

> ⚠️ **作用域说明**：以下所有 JSDoc 规范**仅对 `export` 导出的公开 API 强制生效**。包内部私有的函数、类、接口、类型等不受规范约束，JSDoc 可写可不写，按需自由决定。

ESLint 配置了 **三层 JSDoc 强制**，不遵守将导致 lint 失败（全部 `error` 级别）：

#### 1a. 文件头注释（`file-header/require-file-header`）

**每个 `src/**/\*.ts` 文件必须以标准 JSDoc 文件头开头\*\*，包含 7 个必需标签：

```typescript
/**
 * @file 文件用途简述
 * @description 详细功能说明
 * @module 模块路径（如 mycelium 或 @mycelium/core）
 * @author oxroot <oxrootnsexypig@gmail.com>
 * @date YYYY-MM-DD
 * @since v1.0.0
 * @license MIT
 */
```

文件头必须是文件的第一个有效内容（shebang、`'use strict'`、空行、单行注释可出现在之前）。

#### 1b. 所有 JSDoc 必需标签（`core-tags/require-core-tags`）

**每个 `export` 导出声明上的 JSDoc 注释块**（除文件头外）必须包含：

| 标签           | 适用范围                   | 说明                                |
| -------------- | -------------------------- | ----------------------------------- |
| `@description` | 所有 JSDoc                 | 功能说明                            |
| `@example`     | 所有 JSDoc                 | 使用示例，**必须用 ``` 代码块包裹** |
| `@since`       | 类/接口/类型别名/枚举/函数 | 起始版本                            |

**`@example` 必须包含代码块**，否则 lint 报错：

````typescript
// ✅ 正确
/**
 * @description 计算两个数的和。
 * @param a - 第一个数
 * @param b - 第二个数
 * @returns 两数之和
 * @example
 * ```ts
 * add(1, 2); // 3
 * ```
 */
export function add(a: number, b: number): number {
  return a + b;
}

// ❌ 错误 — @example 缺少 ``` 代码块
/**
 * @description 计算两个数的和。
 * @example
 * add(1, 2);
 */
````

#### 1c. eslint-plugin-jsdoc 标准规则（`jsdoc/require-jsdoc` 等）

**以下 `export` 导出的声明必须带 JSDoc**（`require-jsdoc`）：

- `FunctionDeclaration` — 函数声明（`export function`）
- `MethodDefinition` — 类方法（`export class` 中的公开方法）
- `ClassDeclaration` — 类声明（`export class`）
- `TSInterfaceDeclaration` — 接口声明（`export interface`）
- `TSTypeAliasDeclaration` — 类型别名（`export type`）
- `TSEnumDeclaration` — 枚举声明（`export enum`）
- `TSPropertySignature` — 接口属性签名（`export interface` 的属性）
- `PropertyDefinition` — 类属性定义（`export class` 中的公开属性）

> 📌 非导出的私有声明（不带 `export` 的函数/类/接口等）**JSDoc 规范不强制**，可写可不写，按需自由决定。

**函数/方法额外强制**（`require-param` / `require-returns`）：

- `@param` — 每个参数必须有，且带描述（`require-param-description`）
- `@returns` — 有返回值时必须写，且带描述（`require-returns-description`）
- 参数类型和返回值类型**不需要写**在 JSDoc 中（由 TypeScript 类型提供，相关规则已关闭）

**箭头函数和函数表达式豁免** JSDoc 要求。

#### 1d. 完整示例

````typescript
/**
 * @file 用户服务模块
 * @description 提供用户创建、查询、更新等核心业务逻辑。
 * @module @mycelium/user
 * @author oxroot <oxrootnsexypig@gmail.com>
 * @date 2026-06-27
 * @since v1.0.0
 * @license MIT
 */

/**
 * @description 用户实体接口。
 * @since v1.0.0
 * @example
 * ```ts
 * const user: User = { id: "1", name: "Alice" };
 * ```
 */
export interface User {
  /**
   * @description 用户唯一标识。
   * @example
   * ```ts
   * "usr_abc123"
   * ```
   */
  id: string;

  /**
   * @description 用户显示名称。
   * @example
   * ```ts
   * "Alice"
   * ```
   */
  name: string;
}

/**
 * @description 根据 ID 查找用户。
 * @param id - 用户唯一标识。
 * @returns 找到的用户对象，若不存在则返回 undefined。
 * @since v1.0.0
 * @example
 * ```ts
 * const user = findUserById("usr_abc123");
 * ```
 */
export function findUserById(id: string): User | undefined {
  return getUserFromCache(id) ?? queryUserFromDb(id);
}

// ✅ 包内部私有函数 — JSDoc 不强制，可写可不写
function getUserFromCache(id: string): User | undefined {
  const cached = cache.get(id);
  return cached && !isExpired(cached) ? cached : undefined;
}

// ✅ 包内部私有函数 — JSDoc 不强制，可写可不写
function queryUserFromDb(id: string): User | undefined {
  // ...
}

// ✅ 包内部私有辅助 — JSDoc 不强制（写不写注释都行）
function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > TTL;
}
````

### 2. TypeScript 规范

- **严格模式**: `strict: true`，所有严格类型检查开启
- **模块系统**: `NodeNext`（ESM），导入必须写 `.js` 扩展名
- **类型导入**: 优先使用 `import type`（`@typescript-eslint/consistent-type-imports` 警告）
- **禁止隐式 any**: `@typescript-eslint/no-explicit-any` → `warn`，尽量避免使用
- **未使用变量**: 以 `_` 前缀开头的变量允许不报错
- **可选链/空值合并**: 推荐使用 `?.` 和 `??`（warn 级别）
- **Promise 安全**: `await-thenable`、`no-floating-promises`、`no-misused-promises` 均为 `error`
- **编译目标**: ES2022（Node 22 完整支持）
- **生成产物**: `.d.ts` + `.d.ts.map` + `.js.map` + `.tsbuildinfo`

### 3. 命名约定

| 类型      | 风格                              | 示例                                |
| --------- | --------------------------------- | ----------------------------------- |
| 接口      | PascalCase                        | `MyceliumConfig`、`UserProfile`     |
| 类型别名  | PascalCase                        | `UserId`、`NovelStatus`             |
| 类        | PascalCase                        | `NovelGenerator`、`AgentRunner`     |
| 枚举      | PascalCase                        | `OutputFormat`                      |
| 函数/方法 | camelCase                         | `createNovel`、`findUserById`       |
| 变量/常量 | camelCase                         | `apiClient`、`maxRetries`           |
| 文件      | PascalCase（模块入口 `index.ts`） | `UserService.ts`、`index.ts`        |
| 包名      | kebab-case（scoped）              | `@mycelium/core`、`@mycelium/agent` |

### 4. 代码风格（Prettier 强制）

- **分号**: 必须加分号
- **引号**: 单引号（JSX 中自动切换双引号）
- **尾逗号**: 多行时总是添加
- **行宽**: 100 字符
- **缩进**: 2 空格，不用 Tab
- **换行符**: LF（Unix）
- **箭头函数**: 参数永远加括号 `(x) => x`
- **大括号**: 左大括号另起一行（当前代码风格，Prettier 未强制但请保持一致）

### 5. Import 规范

- **禁止未解析的导入** (`import/no-unresolved`: error)
- **禁止自导入** (`import/no-self-import`: error)
- **禁止循环依赖** (`import/no-cycle`: warn)
- **禁止重复导入** (`import/no-duplicates`: error)
- **禁止绝对路径** (`import/no-absolute-path`: error)
- **导入必须放在文件顶部** (`import/first`: warn)
- **ESM import/export 语法**，禁止 `require()`

### 6. Unicorn 最佳实践

以下规则为 `error`：

- `catch-error-name` — catch 的 error 参数必须命名为 `error`（不用 `e`、`err`）
- `no-useless-promise-resolve-reject` — 禁止无意义的 Promise 包装
- `no-new-array` — 用 `[]` 而非 `new Array()`
- `no-instanceof-array` — 用 `Array.isArray()` 而非 `instanceof Array`

以下为 `warn`：

- `prefer-array-some` — 用 `.some()` 而非 `.find()` 做存在检查
- `prefer-date-now` — 用 `Date.now()` 而非 `new Date().getTime()`
- `prefer-type-error` — 类型错误用 `TypeError` 而非 `Error`
- `throw-new-error` — throw 时必须 `new Error()`

### 7. 代码中的警告标记

以下标记会触发 `warn`：

- `TODO`、`FIXME`、`XXX`、`HACK`、`BUG`

---

## 测试规范

- **框架**: Vitest 4.x，全局 API 已启用（`describe`/`it`/`expect` 无需 import）
- **覆盖率**: V8 原生覆盖率，阈值 80%（lines/functions/branches/statements）
- **测试文件**: 与源文件同目录，命名为 `<name>.test.ts` 或 `<name>.spec.ts`
- **运行命令**:
  - `pnpm test` — 运行全部测试
  - `pnpm test:watch` — watch 模式
  - `pnpm test:coverage` — 生成覆盖率报告
- **开发模式**: Vitest 配置了 `conditions: ['development']`，测试直接运行 `.ts` 源码

```typescript
// ✅ 测试文件不需要 import describe/it/expect
describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
```

---

## 构建与开发命令

| 命令                | 说明                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| `pnpm build`        | 全量构建（tsc -b + tsc-alias 路径别名）                                  |
| `pnpm dev`          | watch 模式构建                                                           |
| `pnpm typecheck`    | 仅类型检查，不生成产物                                                   |
| `pnpm lint`         | ESLint 检查                                                              |
| `pnpm lint:fix`     | ESLint 自动修复                                                          |
| `pnpm format`       | Prettier 格式化                                                          |
| `pnpm format:check` | 格式检查                                                                 |
| `pnpm spellcheck`   | 拼写检查                                                                 |
| `pnpm test`         | 运行测试                                                                 |
| `pnpm check`        | 完整质量门（typecheck + lint + format:check + spellcheck + knip + test） |
| `pnpm docs`         | 生成 TypeDoc API 文档                                                    |
| `pnpm clean`        | 清理构建产物                                                             |

---

## Git 工作流

### Commit 规范（Conventional Commits）

**提交信息格式**：

```
<type>(<scope>): <subject>

- <修改项 1>
- <修改项 2>
- <修改项 3>

Co-Authored-By: Claude <noreply@anthropic.com>
```

**各字段说明**：

| 字段        | 要求     | 说明                                                                    |
| ----------- | -------- | ----------------------------------------------------------------------- |
| **type**    | 必填     | feat / fix / docs / style / refactor / perf / test / chore / ci / build |
| **scope**   | 可选     | 一般是包名（如 `main`、`core`）                                         |
| **subject** | 必填     | 不超过 120 字符，中文或英文，简要描述本次变更                           |
| **正文**    | **必填** | 以 `- ` 列表形式逐条列出本次修改明细                                    |
| **footer**  | 可选     | breaking change 用 `BREAKING CHANGE:`                                   |

**规则**：

- 正文必须存在（不允许空正文），必须以 `- ` 开头的列表形式描述每个修改点
- 列表项简洁明确，一项一条，不说废话
- subject 和正文之间空一行
- **如果代码由 Claude 编写，footer 必须添加**：`Co-Authored-By: Claude <noreply@anthropic.com>`（人类独立编写的提交无需此 footer）

**示例**：

```text
feat(main): 新增用户登录功能

- 新增 UserLogin 接口和 login 函数
- 添加 JWT token 生成与验证逻辑
- 添加登录相关的单元测试

Co-Authored-By: Claude <noreply@anthropic.com>
```

```text
fix(core): 修复并发请求下缓存失效的问题

- 将内存缓存改为 Map 实现，保证线程安全
- 添加缓存过期 TTL 清理机制
- 补充并发场景的回归测试

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Git Hooks（lefthook，自动执行）

| Hook         | 执行内容                                           | 行为                   |
| ------------ | -------------------------------------------------- | ---------------------- |
| `pre-commit` | lint（自动 stage 修复）+ format:check + spellcheck | 并行执行，失败阻止提交 |
| `commit-msg` | commitlint 校验                                    | 不通过阻止提交         |
| `pre-push`   | typecheck + test                                   | 运行但不阻塞推送       |

### 版本管理（changesets）

- 使用 `pnpm exec changeset` 创建变更记录
- 发布前通过 changesets 自动计算版本号并生成 CHANGELOG

---

## 质量门（CI 级别）

提交前建议运行完整检查：

```bash
pnpm check
```

等价于依次执行：

1. `pnpm typecheck` — 零编译错误
2. `pnpm lint` — 零 lint 错误
3. `pnpm format:check` — 格式合规
4. `pnpm spellcheck` — 拼写正确
5. `pnpm knip` — 无死代码/未使用依赖
6. `pnpm test` — 全部测试通过（覆盖率 >= 80%）

---

## 常见模式与反模式

### ✅ 正确

```typescript
// 类型导入用 import type
import type { UserConfig } from './types.js';

// 可选链 + 空值合并
const name = user?.profile?.name ?? 'Unknown';

// Array.isArray 而非 instanceof
if (Array.isArray(data)) {
  /* ... */
}

// catch 参数命名为 error
try {
  /* ... */
} catch (error) {
  /* ... */
}

// 显式 Promise 处理
async function fetch(): Promise<void> {
  await client.get();
}
```

### ❌ 错误

```typescript
// 缺少 JSDoc（lint error）
export interface Config {
  name: string;
}

// @example 缺少代码块
/**
 * @description 做某事。
 * @example
 * doSomething();
 */

// 隐式 any
function process(data) {
  return data;
}

// catch 参数简写
try {
  /* ... */
} catch (e) {
  /* ... */
}

// 无意义的 Promise 包装
return new Promise((resolve) => resolve(value));

// 使用 require()
const fs = require('fs');
```

---

## 环境变量

项目使用 `.env` 文件管理环境变量（已加入 `.gitignore`，不应提交）：

```
MYCELIUM_API_KEY=sk-xxx
```

⚠️ 当前 `.env` 存在于仓库中（尚未有 git 提交），请确保在首次提交前确认 `.gitignore` 已包含 `.env`。

---

## 拼写检查

cspell 配置了自定义词汇表（项目专用词），包括：`mycelium`、`oxroot`、`lefthook`、`knip`、`syncpack`、`vitest`、`changesets`、`monorepo`、`pnpm`、`anthropic`、`web-fiction`、`dedupe` 等。

遇到拼写报错时，遵循以下决策流程：

1. **先确认是否真的拼错了** — 查阅词典或搜索引擎确认正确拼写，区分是真的拼写错误还是项目专用词
2. **是拼写错误** → 修复错误的单词，不要无脑加入词典
3. **是项目专用词/技术术语/人名/缩写** → 在 `cspell.json` 的 `words` 数组中添加新词

**常见应加入词典的场景**：项目代号、用户名、工具名、领域缩写、拼接词。

**常见应修复的场景**：变量名拼错（如 `recieve` → `receive`）、注释英文拼错、面向用户的文案错误。

---

## 已知限制与注意事项

1. **TypeScript project references 不支持 glob**：新增 `packages/*` 子包后必须手动在根 `tsconfig.json` 的 `references` 中添加。
2. **ESLint 配置仅覆盖 `.ts`/`.tsx`**：JS 配置文件（`*.config.{js,mjs,cjs,ts}`）被全局忽略。
3. **文件头注释仅对 `src/**/\*.ts` 生效\*\*：配置文件、测试辅助文件等可豁免。
4. **构建产物（`dist/`）不要手动编辑**：全部由 `tsc` 生成。
5. **`pnpm` 版本锁定**：`packageManager` 字段指定 `pnpm@11.9.0`，CI 环境会使用 corepack 自动安装对应版本。
