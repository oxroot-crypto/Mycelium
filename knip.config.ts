// ============================================================================
// knip — 死代码、未使用依赖、未使用导出检测
// 详见: https://github.com/webpro-nl/knip
// ============================================================================

import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Workspace 范围
  workspaces: {
    '.': {
      entry: ['lefthook.yml'],
      project: ['**/*.{ts,js,mjs,cjs}'],
    },
    main: {
      project: ['src/**/*.ts'],
    },
    'packages/core': {
      project: ['src/**/*.ts'],
    },
    'packages/llm': {
      project: ['src/**/*.ts'],
    },
    'packages/project': {
      project: ['src/**/*.ts'],
    },
    'packages/outline': {
      project: ['src/**/*.ts'],
    },
    'packages/knowledge': {
      project: ['src/**/*.ts'],
    },
    'packages/writer': {
      project: ['src/**/*.ts'],
    },
    'packages/review': {
      project: ['src/**/*.ts'],
    },
    'packages/orchestrator': {
      project: ['src/**/*.ts'],
    },
    'packages/tui': {
      project: ['src/**/*.ts'],
    },
  },

  // 忽略这些依赖（未在 package.json 声明但实际使用）
  ignoreDependencies: [
    // eslint.config.mjs 中 JSDoc 类型标注引用的 estree 类型
    'estree',
  ],

  // 忽略二进制文件检查（这些在 scripts 中使用但不在 dependencies 中）
  ignoreBinaries: ['typedoc'],

  // 规则关闭
  rules: {
    // 类型导入/导出在 TS 中可能被编译器消费，允许未在值层面使用
    types: 'warn',
    // enum 成员可能被外部引用，降低为 warn
    enumMembers: 'warn',
  },
};

export default config;
