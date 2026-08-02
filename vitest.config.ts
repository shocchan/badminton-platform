// vitest の設定。e2e/（Playwright専用）を単体テストの走査から外す。
// これが無いと vitest が e2e/*.spec.ts を拾い、@playwright/test の読み込みで落ちる。
import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
