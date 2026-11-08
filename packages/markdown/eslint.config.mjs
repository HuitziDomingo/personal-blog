// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Los imports relativos llevan `.ts`: sin extensión, el pre-empaquetado de
    // Vite en ng serve no los resuelve (BLOG-067).
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^\\.{1,2}/(?!.*\\.ts$)', message: 'Relative imports need the .ts extension (ng serve prebundling).' }] },
      ],
    },
  },
  { files: ['eslint.config.mjs'], extends: [tseslint.configs.disableTypeChecked] },
);
