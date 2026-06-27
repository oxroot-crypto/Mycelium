// ============================================================================
// Commitlint — Conventional Commits 提交信息校验
// 详见: https://github.com/conventional-changelog/commitlint
// ============================================================================

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 允许更长的 subject（默认 72，CLI 场景经常不够）
    'subject-max-length': [2, 'always', 120],

    // 强制正文与 subject 之间空一行
    'body-leading-blank': [2, 'always'],

    // 强制正文至少 10 个字符（禁止空正文提交）
    'body-min-length': [2, 'always', 10],
  },
};
