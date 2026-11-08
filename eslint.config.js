// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'dist-web/*', 'dist-web-single/*', '.expo/*', 'node_modules/*', 'coverage/*'],
  },
  {
    // React Native's Alert does nothing in the browser; @/ui/alert works on both.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Alert'],
              message: "Use `import { Alert } from '@/ui/alert'`: it also works in the web version.",
            },
          ],
        },
      ],
    },
  },
]);
