// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * SARkart lint config (ESLint 9 flat config).
 *
 * Scope is deliberately narrow: the Preact app source in `src/client` (linted
 * type-aware so the promise rules work) and the Node test suite in `test`
 * (linted without type info — the tests live outside the app's tsconfig).
 * The Express server JS, benchmarks, vendored `public/js`, and build output
 * are ignored — they are either CommonJS Node scripts or third-party bundles.
 *
 * The high-signal rules the review asked for are `no-floating-promises` and
 * `no-unsafe-optional-chaining` (the codebase is heavy on `await`ed bridge
 * work and optional-chained `window.*` globals). The full type-checked preset
 * is intentionally NOT enabled: the app's typed-`window` bridge pattern would
 * drown real findings in `no-unsafe-*` noise.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'bench/**',
      'src/app.js',
      'src/index.js',
      'src/ensure-build.js',
      'vite.config.ts',
      'eslint.config.mjs'
    ]
  },

  // -- Preact app source: type-aware ----------------------------------------
  {
    files: ['src/client/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // TypeScript already checks for undefined identifiers.
      'no-undef': 'off',

      // The two rules the review prioritized.
      '@typescript-eslint/no-floating-promises': 'error',
      'no-unsafe-optional-chaining': 'error',
      // Bonus: catches async handlers passed where a sync one is expected.
      '@typescript-eslint/no-misused-promises': 'error',

      // Empty `catch (_error) {}` around best-effort optional operations
      // (feature detection, storage access) is intentional here.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // The bridge layer intentionally reads a typed-but-loose `window.*`
      // surface, so `any`/non-null-assertion noise isn't actionable here.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],

      // Preact uses the same hook rules as React.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off'
    }
  },

  // -- Node test suite: no type info required -------------------------------
  {
    files: ['test/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  }
);
