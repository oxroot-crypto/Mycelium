// ============================================================================
// ESLint 扁平配置（Flat Config）
// 策略：复刻 oxlint 默认的 correctness 规则 + 增强 JSDoc 注释强制
// ============================================================================
//
// 规则分层说明：
//   Layer 1 — @eslint/js recommended        → JS 正确性（等价 oxlint eslint 插件）
//   Layer 2 — typescript-eslint recommended  → TS 正确性（等价 oxlint typescript 插件）
//   Layer 3 — eslint-plugin-import           → import 正确性（等价 oxlint import 插件）
//   Layer 4 — eslint-plugin-unicorn          → 最佳实践（等价 oxlint unicorn 插件）
//   Layer 5 — eslint-plugin-jsdoc + 自定义   → 🎯 注释强制（oxlint 做不到）
//
// 比较基准：oxlint v1.71.0 默认只启用 correctness 类别（~113 条规则）
// ============================================================================

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import importPlugin from 'eslint-plugin-import';
import unicorn from 'eslint-plugin-unicorn';

// ============================================================================
// 自定义插件：文件头注释强制
//
// 要求每个 .ts/.tsx 文件的第一个有效 JSDoc 块注释至少包含：
//   @file  — 文件用途简述
//   @description   — 详细说明
//   @module        — 模块路径
//   @author        — 作者
//   @date          — 创建日期
//   @since         — 起始版本
//   @license       — 许可证
// ============================================================================

/**
 * @returns {import("eslint").Rule.RuleModule}
 */
function createFileHeaderRule() {
  const REQUIRED_TAGS = ['file', 'description', 'module', 'author', 'date', 'since', 'license'];

  function extractTags(commentValue) {
    const re = /(?:^|\s)@(\w+)/gm;
    const tags = new Set();
    let m;
    while ((m = re.exec(commentValue)) !== null) {
      tags.add(m[1]);
    }
    return tags;
  }

  return {
    meta: {
      type: /** @type {const} */ ('suggestion'),
      docs: {
        description:
          '要求每个源码文件以包含 @file / @description / @module / @author / @date / @since / @license 的标准 JSDoc 文件头注释开头',
        recommended: true,
      },
      schema: [],
      messages: {
        missingHeader:
          '文件缺少标准 JSDoc 文件头注释，必须以 /** @file ... @description ... @module ... @author ... @date ... @since ... @license */ 开头。',
        missingTags: '文件头注释缺少必需的标签：{{missing}}。',
      },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode();

      return {
        Program(node) {
          const allComments = sourceCode.getAllComments();

          if (allComments.length === 0) {
            context.report({ node, messageId: 'missingHeader' });
            return;
          }

          // 第一个 JSDoc 块注释（/** ... */）
          const firstBlock = allComments.find((c) => c.type === 'Block' && c.value.startsWith('*'));

          if (!firstBlock) {
            context.report({ node, messageId: 'missingHeader' });
            return;
          }

          // 检查 JSDoc 块之前只有允许的内容（空行、shebang、strict 指令、单行注释）
          for (let i = 0; i < firstBlock.loc.start.line - 1; i++) {
            const line = sourceCode.lines[i]?.trim() ?? '';
            if (
              line === '' ||
              line.startsWith('#!') ||
              line.startsWith("'use strict'") ||
              line.startsWith('"use strict"') ||
              line === '// @ts-check' ||
              line.startsWith('//')
            ) {
              continue;
            }
            // 第一个有效行不是 JSDoc 块注释
            context.report({ node, messageId: 'missingHeader' });
            return;
          }

          // 检查必需标签
          const existingTags = extractTags(firstBlock.value);
          const missing = REQUIRED_TAGS.filter((t) => !existingTags.has(t));

          if (missing.length > 0) {
            context.report({
              node: firstBlock,
              messageId: 'missingTags',
              data: { missing: missing.map((t) => '@' + t).join('、') },
            });
          }
        },
      };
    },
  };
}

// ============================================================================
// 自定义插件：JSDoc 必要标签 + @example 代码块强制
//
// 所有 JSDoc 块注释（除文件头外）必须包含：
//   @description — 功能说明
//   @example     — 使用示例（必须用 ``` 代码块包裹）
//
// 类/接口/类型/枚举额外强制：
//   @since       — 起始版本
//
// 函数额外由 eslint-plugin-jsdoc 强制 @param / @returns
// ============================================================================

/**
 * @returns {import("eslint").Rule.RuleModule}
 */
function createRequireCoreTagsRule() {
  const BASE_TAGS = ['description', 'example'];
  const EXTRA_TAGS_FOR = [
    'ClassDeclaration',
    'FunctionDeclaration',
    'TSInterfaceDeclaration',
    'TSTypeAliasDeclaration',
    'TSEnumDeclaration',
  ];

  /** @param {string} value */
  function hasTag(value, tag) {
    return new RegExp('(?:^|\\s)@' + tag + '\\b', 'm').test(value);
  }

  /**
   * 检查 @example 内容是否被 ``` 代码块包裹
   * @param {string} value
   * @returns {boolean}
   */
  function exampleHasCodeFence(value) {
    // 匹配 @example 之后到下一个 @tag 或注释结束之间的内容
    const m = value.match(/@example\b([\s\S]*?)(?=@\w|\*\/|$)/);
    if (!m) return false; // 没有 @example，由 missingTags 处理
    const body = m[1];
    return /```/.test(body);
  }

  /**
   * 根据 JSDoc 注释位置推断其归属的 AST 节点类型
   * @param {import("estree").Comment} comment
   * @param {ReturnType<import("eslint").SourceCode['getAllComments']>} allComments
   * @param {import("eslint").SourceCode} sourceCode
   */
  function getOwningNodeType(comment, allComments, sourceCode) {
    // 找到 JSDoc 注释后面最近的 AST 节点
    const commentEndLine = comment.loc.end.line;

    // 遍历所有 AST 节点，找到紧跟在注释之后的第一个声明
    let owningType = null;

    // 使用简单的启发式：检查注释结束行之后紧邻的代码行
    const lines = sourceCode.lines;
    for (let i = commentEndLine; i < Math.min(commentEndLine + 3, lines.length); i++) {
      const line = lines[i]?.trim() ?? '';
      if (line === '') continue;
      if (line.startsWith('export ')) {
        const rest = line.slice(7).trim();
        if (rest.startsWith('interface ')) return 'TSInterfaceDeclaration';
        if (rest.startsWith('type ')) return 'TSTypeAliasDeclaration';
        if (rest.startsWith('enum ')) return 'TSEnumDeclaration';
        if (rest.startsWith('class ')) return 'ClassDeclaration';
        if (rest.startsWith('function ')) return 'FunctionDeclaration';
        if (rest.startsWith('const ') || rest.startsWith('let ') || rest.startsWith('var '))
          return 'VariableDeclaration';
      }
      if (line.startsWith('interface ')) return 'TSInterfaceDeclaration';
      if (line.startsWith('type ')) return 'TSTypeAliasDeclaration';
      if (line.startsWith('enum ')) return 'TSEnumDeclaration';
      if (line.startsWith('class ')) return 'ClassDeclaration';
      if (line.startsWith('function ') || line.startsWith('async function '))
        return 'FunctionDeclaration';
      break; // 第一行非空非 export 就停
    }
    return null;
  }

  return {
    meta: {
      type: /** @type {const} */ ('suggestion'),
      docs: {
        description:
          '要求 JSDoc 包含 @description + @example（代码块），类/接口/类型/枚举额外需要 @since',
        recommended: true,
      },
      schema: [],
      messages: {
        missingTags: 'JSDoc 注释缺少必需的标签：{{missing}}。',
        exampleNeedsCodeFence: '@example 必须使用 ```（代码块）包裹示例代码。',
      },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode();

      return {
        Program() {
          const allComments = sourceCode.getAllComments();

          for (const comment of allComments) {
            if (comment.type !== 'Block') continue;
            if (!comment.value.startsWith('*')) continue;

            // 文件头（含 @file）豁免
            if (hasTag(comment.value, 'file')) continue;

            const trimmed = comment.value.trim();
            if (trimmed === '*' || trimmed === '') continue;

            // 1) 检查 @description + @example 是否存在
            const nodeType = getOwningNodeType(comment, allComments, sourceCode);
            const required = [...BASE_TAGS];
            if (nodeType && EXTRA_TAGS_FOR.includes(nodeType)) {
              required.push('since');
            }

            const missing = required.filter((t) => !hasTag(comment.value, t));
            if (missing.length > 0) {
              context.report({
                loc: comment.loc,
                messageId: 'missingTags',
                data: {
                  missing: missing.map((t) => '@' + t).join('、'),
                },
              });
            }

            // 2) 检查 @example 是否有代码块（只有存在 @example 才检查）
            if (hasTag(comment.value, 'example')) {
              if (!exampleHasCodeFence(comment.value)) {
                context.report({
                  loc: comment.loc,
                  messageId: 'exampleNeedsCodeFence',
                });
              }
            }
          }
        },
      };
    },
  };
}

// ============================================================================
// 导出
// ============================================================================

export default tseslint.config(
  // ==========================================================================
  // 全局忽略
  // ==========================================================================
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.tsbuildinfo',
      '**/coverage/**',
      '**/.git/**',
      'lefthook.yml',
      '*.config.{js,mjs,cjs,ts}',
    ],
  },

  // ==========================================================================
  // Layer 1: JavaScript 正确性（等价 oxlint eslint 插件）
  // ==========================================================================
  js.configs.recommended,

  // ==========================================================================
  // Layer 2: TypeScript 正确性（等价 oxlint typescript 插件）
  // ==========================================================================
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    },
  },

  // ==========================================================================
  // Layer 3: Import 正确性（等价 oxlint import 插件）
  // ==========================================================================
  {
    plugins: { import: importPlugin },
    files: [
      '**/src/**/*.ts',
      '**/src/**/*.tsx',
      '**/src/**/*.js',
      '**/src/**/*.jsx',
      '**/src/**/*.mjs',
    ],
    settings: {
      'import/resolver': { node: true },
    },
    rules: {
      'import/no-unresolved': 'error',
      'import/named': 'error',
      'import/namespace': 'error',
      'import/no-self-import': 'error',
      'import/no-cycle': 'warn',
      'import/no-duplicates': 'error',
      'import/no-mutable-exports': 'error',
      'import/export': 'error',
      'import/no-absolute-path': 'error',
      'import/no-useless-path-segments': 'warn',
      'import/first': 'warn',
      'import/no-named-as-default': 'warn',
      'import/no-named-as-default-member': 'warn',
      'import/no-dynamic-require': 'warn',
    },
  },

  // ==========================================================================
  // Layer 4: Unicorn 最佳实践（等价 oxlint unicorn 插件）
  // ==========================================================================
  {
    plugins: { unicorn },
    rules: {
      'unicorn/catch-error-name': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/no-new-array': 'error',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/prefer-array-some': 'warn',
      'unicorn/prefer-date-now': 'warn',
      'unicorn/prefer-type-error': 'warn',
      'unicorn/throw-new-error': 'warn',
    },
  },

  // ==========================================================================
  // Layer 5: JSDoc 注释强制（🎯 核心）
  //
  // 包含三个层次：
  //   5a — eslint-plugin-jsdoc 标准规则（全部 error）
  //   5b — 自定义规则：文件头注释（@file + ... 共 7 个标签）
  //   5c — 自定义规则：所有 JSDoc 必须有 @description 标签
  // ==========================================================================

  // ---- 5a: eslint-plugin-jsdoc 标准规则 ----
  {
    name: 'jsdoc-builtin',
    plugins: { jsdoc },
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // 强制写注释：函数/类/方法/接口/类型/枚举/属性
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: false,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'TSEnumDeclaration',
            'TSPropertySignature',
            'PropertyDefinition',
          ],
          exemptEmptyFunctions: false,
          exemptEmptyConstructors: true,
        },
      ],

      // 参数/返回值
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-description': 'error',

      // 内容校验
      'jsdoc/check-tag-names': [
        'error',
        {
          definedTags: [
            'date', // 自定义：创建日期
            'module', // 自定义：模块路径
          ],
        },
      ],
      'jsdoc/check-access': 'error',
      'jsdoc/check-property-names': 'error',
      'jsdoc/no-blank-blocks': 'error',

      // 类型由 TypeScript 提供，关闭
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/check-types': 'off',
      'jsdoc/no-defaults': 'off',
    },
  },

  // ---- 5b: 文件头注释强制 ----
  {
    plugins: {
      'file-header': {
        rules: {
          'require-file-header': createFileHeaderRule(),
        },
      },
    },
    files: ['**/src/**/*.ts', '**/src/**/*.tsx'],
    rules: {
      'file-header/require-file-header': 'error',
    },
  },

  // ---- 5c: @description + @example 标签强制（所有 JSDoc） ----
  {
    plugins: {
      'core-tags': {
        rules: {
          'require-core-tags': createRequireCoreTagsRule(),
        },
      },
    },
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'core-tags/require-core-tags': 'error',
    },
  },

  // ==========================================================================
  // 全局：警告注释检测（等价 oxlint no-warning-comments）
  // ==========================================================================
  {
    rules: {
      'no-warning-comments': [
        'warn',
        {
          terms: ['todo', 'fixme', 'xxx', 'hack', 'bug'],
          location: 'start',
        },
      ],
    },
  },

  // ==========================================================================
  // TypeScript 覆盖掉 JS 规则（避免冲突）
  // ==========================================================================
  {
    rules: {
      'no-undef': 'off',
    },
  },
);
