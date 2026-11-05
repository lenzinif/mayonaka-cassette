import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Pure TypeScript layers (see AGENTS.md §2). They must never import React or the UI layer.
 * This rule turns the architectural invariant into a lint error instead of a convention.
 */
const PURE_LAYERS = [
  'src/core/**/*.ts',
  'src/engine/**/*.ts',
  'src/road/**/*.ts',
  'src/audio/**/*.ts',
  'src/entities/**/*.ts',
  'src/config/**/*.ts',
];

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'scripts', '**/*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: PURE_LAYERS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'Engine layers must stay React-free (AGENTS.md §2).',
            },
            {
              group: ['@src/ui', '@src/ui/*', '**/ui/*'],
              message: 'Engine layers must not depend on the React UI layer (AGENTS.md §2).',
            },
          ],
        },
      ],
    },
  },
);
