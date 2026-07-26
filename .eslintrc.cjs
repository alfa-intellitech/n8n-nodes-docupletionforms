module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module', project: './tsconfig.json' },
  plugins: ['@typescript-eslint', 'n8n-nodes-base'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  overrides: [
    {
      files: ['nodes/**/*.ts'],
      extends: ['plugin:@typescript-eslint/recommended', 'plugin:n8n-nodes-base/nodes'],
      rules: {
        // These two rules still expect the pre-NodeConnectionTypes string
        // literals ('main', 'ai_tool') for inputs/outputs. The official
        // @n8n/community-nodes verification scanner requires the opposite —
        // NodeConnectionTypes.Main etc. instead of string literals — so this
        // plugin's rule is outdated relative to what actually gates
        // verification; every node file here already uses NodeConnectionTypes.
        'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
        'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
      },
    },
    {
      files: ['credentials/**/*.ts'],
      extends: ['plugin:@typescript-eslint/recommended', 'plugin:n8n-nodes-base/credentials'],
      rules: {
        'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
      },
    },
  ],
  env: { node: true, es2020: true },
};
