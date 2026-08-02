// 実ブラウザE2E（P0後の実証）。
//
// 対象は wrangler dev（http://127.0.0.1:8787）＝**本物の Worker + local R2 + ビルド済みapp**。
// remote（Supabase・本番Cloudflare）には一切触れない:
//   - *.supabase.co は全リクエストをブロック（helpers.ts）
//   - 認証は local 専用の偽secretで自作したJWT（Workerの検証と同じ鍵）
//   - 決済は模擬決済モード・利用権はブラウザのローカル保存
//
// 事前準備（別ターミナル）:
//   npm run build:staging && npm run build:ai-course-content
//   npm run dev:worker
//   node scripts/ai-course/seed-local-r2.mjs
// 実行:
//   npx playwright test
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0,
  // 学習フローは状態を積み上げる（購入→開始→診断→バトル）ため直列で走らせる
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'on',
    screenshot: 'on',
    video: 'off',
  },
  outputDir: 'e2e-results',
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
});
