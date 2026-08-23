// 「検索結果に出さないURL」の一覧が、3か所でズレていないか。
//
// 【なぜ要るか】
// robots.txt は2026-08-23まで `Disallow: /admin` の1行だけだった。
// 実URLは `/ja/admin` に変わっていたので、管理画面もマイページも
// サブグループの管理画面も「インデックスしてよい」状態のまま置かれていた。
// 判定は今3か所にある:
//   ①画面（App.tsx が privateRoutes.ts を見て robots メタを出す・JS実行後）
//   ②Worker（X-Robots-Tag・JSを実行しないクローラーにも効く）
//   ③robots.txt（クロール自体を減らす）
// 3か所は必ずズレるので突き合わせる。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVATE_PATH_PATTERNS, isPrivatePath } from './privateRoutes';

const ROOT = join(__dirname, '../../..');
const workerSource = readFileSync(join(ROOT, 'scripts/generate-worker.mjs'), 'utf8');
const robotsTxt = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8');

const PRIVATE_SAMPLES = [
  '/ja/admin', '/zh/admin', '/ja/admin/tournaments',
  '/ja/mypage', '/zh/mypage',
  '/ja/ai-course/admin', '/ja/ai-course/login', '/ja/ai-course/purchase/complete',
  '/ja/login', '/zh/signup', '/ja/auth-landing',
  '/ja/password-reset', '/ja/password-reset-form',
  '/ja/ai-lesson-demo', '/ja/tactics-board',
  '/cancel', '/internal/qa/question-bank',
  '/chaoxianzu/ja/admin', '/assistant/ja/admin',
];

const PUBLIC_SAMPLES = [
  '/ja/', '/zh/', '/ja/activity', '/ja/activity/abc', '/zh/venues',
  '/ja/faq', '/ja/level-guide', '/ja/blog', '/ja/blog/12',
  '/ja/tournaments/28', '/ja/join', '/ja/contact', '/ja/cancel-policy',
  '/ja/ai-course', '/zh/ai-course', '/ja/ai-course/terms', '/ja/results/vol1',
];

describe('非公開URLの判定', () => {
  for (const p of PRIVATE_SAMPLES) {
    it(`${p} は非公開`, () => expect(isPrivatePath(p)).toBe(true));
  }
  for (const p of PUBLIC_SAMPLES) {
    it(`${p} は公開（塞ぎすぎていない）`, () => expect(isPrivatePath(p)).toBe(false));
  }

  it('AIコースのLPと法務ページを塞いでいない（売り物のページ）', () => {
    expect(isPrivatePath('/zh/ai-course')).toBe(false);
    expect(isPrivatePath('/zh/ai-course/tokushoho')).toBe(false);
  });
});

describe('Workerが同じ一覧を持っている', () => {
  it('WorkerにisPrivatePathがある', () => {
    expect(workerSource).toContain('const isPrivatePath =');
    expect(workerSource).toContain("X-Robots-Tag', 'noindex, nofollow'");
  });

  it('パターンの本数が一致する（片方に足して片方を忘れた、を検出）', () => {
    const block = /const PRIVATE_PATTERNS = \[([\s\S]*?)\n\];/.exec(workerSource);
    expect(block, 'WorkerのPRIVATE_PATTERNSが見つからない').not.toBeNull();
    const count = (block![1].match(/^\s+\//gm) || []).length;
    expect(count).toBe(PRIVATE_PATH_PATTERNS.length);
  });
});

describe('robots.txt が同じURLを塞いでいる', () => {
  it('/ja/admin と /zh/admin を明示している（実URLは接頭辞付き）', () => {
    expect(robotsTxt).toContain('Disallow: /ja/admin');
    expect(robotsTxt).toContain('Disallow: /zh/admin');
  });

  it('マイページ・受講者アプリの入口・サブグループを塞いでいる', () => {
    for (const rule of ['/ja/mypage', '/ja/ai-course/admin', '/chaoxianzu/', '/assistant/', '/internal/']) {
      expect(robotsTxt, `robots.txt に ${rule} が無い`).toContain('Disallow: ' + rule);
    }
  });

  it('sitemapを指している', () => {
    expect(robotsTxt).toContain('Sitemap: https://kawabado.com/sitemap.xml');
  });

  it('AIコースのLPを塞いでいない', () => {
    expect(robotsTxt).not.toMatch(/Disallow: \/(ja|zh)\/ai-course\s*$/m);
  });
});
