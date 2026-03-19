module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module', project: './tsconfig.json' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-unused-vars': 'off',
  },
  overrides: [
    {
      files: ['**/*.ts'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
  env: { node: true, es2020: true },
};
