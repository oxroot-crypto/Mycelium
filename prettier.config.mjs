// ============================================================================
// Prettier 配置 — 代码格式化工具
// 详见: https://prettier.io/docs/options
// ============================================================================

export default {
  // 语句末尾加分号
  semi: true,

  // 使用单引号（JSX 中自动切换为双引号）
  singleQuote: true,

  // 多行时尽可能添加尾逗号（es5 兼容模式 + TypeScript）
  trailingComma: 'all',

  // 每行最大字符数
  printWidth: 100,

  // 缩进宽度（与 .editorconfig 保持一致）
  tabWidth: 2,

  // 使用空格缩进，不使用 Tab
  useTabs: false,

  // 换行符统一 LF（与 .editorconfig / .gitattributes 保持一致）
  endOfLine: 'lf',

  // 箭头函数参数永远加括号: (x) => x
  arrowParens: 'always',
};
