/// <reference types="vitest/globals" />

/**
 * @file index.ts 单元测试
 * @description 测试 Mycelium CLI 入口与核心配置模块。
 * @module mycelium
 * @author oxroot <oxrootnsexypig@gmail.com>
 * @date 2026-06-27
 * @since v1.0.0
 * @license MIT
 */

/**
 * @description 验证模块可正常导入。
 * @since v1.0.0
 * @example
 * ```ts
 * await import('./index.js');
 * ```
 */
describe('index', () => {
  it('should export a valid module', async () => {
    const mod = await import('./index.ts');
    expect(mod).toBeDefined();
  });
});
