// ============================================================================
// Vitest 配置 — Vite 驱动的单元测试框架
// 详见: https://vitest.dev/config/
// ============================================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // ---- 模块解析 ----
  resolve: {
    // 开发模式下优先命中 package.json exports 中的 development 条件
    // 使测试直接运行 .ts 源码，无需事先 tsc 编译
    conditions: ['development'],
  },

  // ---- 测试行为 ----
  test: {
    // 注入全局 API（describe / it / expect 等，无需手动 import）
    globals: true,

    // 排除构建产物目录，仅运行源码测试
    exclude: ['**/dist/**', '**/node_modules/**'],

    // ---- 覆盖率配置 ----
    coverage: {
      // 使用 V8 原生覆盖率引擎（零插桩，速度快）
      provider: 'v8',

      // 输出格式: 终端文本 + JSON + HTML
      reporter: ['text', 'json', 'html'],

      // 覆盖率统计范围（workspace 所有包的源码）
      include: ['packages/*/src/**/*.ts', 'main/src/**/*.ts'],

      // 排除项
      exclude: [
        'node_modules',
        'dist',
        '**/*.d.ts', // 声明文件
        '**/*.test.ts', // 测试文件本身
        '**/*.spec.ts', // spec 文件
      ],

      // 覆盖率阈值（不达标 CI 失败）
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
