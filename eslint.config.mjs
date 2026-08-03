// ESLint 9 flat config. Lints the TypeScript sources only; generated output,
// fixtures and the plain-JS asset scripts are excluded.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', 'scripts/**', 'fixtures/**', '*.mjs'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // The extension parses arbitrary user JSON; narrowing happens through
      // helper functions, so `any` escapes in a few well-contained places.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'multi-line'],
      'no-throw-literal': 'error',
    },
  }
);
