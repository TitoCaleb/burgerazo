import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'client/dist/', 'coverage/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  { files: ['client/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
];
