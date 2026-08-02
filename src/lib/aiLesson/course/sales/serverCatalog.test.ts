// 決済サーバー用JSONの受入テスト。
//
// 狙いは1つ。**価格が2か所に存在する状態を作らせない。**
// PlanConfig を直して JSON を再生成し忘れると、
// 「料金ページは新価格・決済は旧価格」になる。それをここで落とす。

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildServerCatalog, serializeServerCatalog, SERVER_CATALOG_RELATIVE_PATH,
} from './serverCatalog';
import { SALES_PLAN_CATALOG, salesPlanById } from './planConfig';

const CATALOG_PATH = join(process.cwd(), SERVER_CATALOG_RELATIVE_PATH);

describe('サーバー用カタログ', () => {
  it('生成物がリポジトリに存在する', () => {
    expect(existsSync(CATALOG_PATH), `${SERVER_CATALOG_RELATIVE_PATH} が無い`).toBe(true);
  });

  it('PlanConfig と一致する（再生成し忘れを検出）', () => {
    const onDisk = readFileSync(CATALOG_PATH, 'utf8');
    expect(
      onDisk,
      '古い planCatalog.json です。`npm run generate:ai-course-plan-catalog` を実行してください',
    ).toBe(serializeServerCatalog());
  });

  it('全プランが含まれ、金額が正準と一致する', () => {
    const server = buildServerCatalog();
    expect(server.length).toBe(SALES_PLAN_CATALOG.length);
    for (const entry of server) {
      const canon = salesPlanById(entry.planId)!;
      expect(entry.priceAmount, entry.planId).toBe(canon.priceAmount);
      expect(entry.planVersion, entry.planId).toBe(canon.version);
      expect(entry.validityDays, entry.planId).toBe(canon.validityDays);
      expect(entry.voiceMinutesCap, entry.planId).toBe(canon.cost.voiceMinutesCap);
    }
  });

  it('表示文言をサーバーへ渡さない（文言の権威はフロント側の1か所に置く）', () => {
    const keys = new Set(Object.keys(buildServerCatalog()[0]));
    for (const k of ['nameJa', 'nameZh', 'featuresJa', 'featuresZh', 'ctaLabelJa', 'taglineJa']) {
      expect(keys.has(k), `サーバーへ ${k} を渡している`).toBe(false);
    }
  });
});

describe('Edge Function の安全弁', () => {
  const SRC = join(process.cwd(), 'supabase', 'functions', 'ai-course-checkout', 'index.ts');
  const src = existsSync(SRC) ? readFileSync(SRC, 'utf8') : '';

  it('test鍵でなければ起動しない', () => {
    expect(src).toContain("startsWith('sk_test_')");
    expect(src).toContain('checkout_disabled');
  });

  it('本番の秘密鍵の環境変数名を使っていない（既存のバドミントン決済と取り違えない）', () => {
    expect(src.includes('STRIPE_TEST_SECRET_KEY')).toBe(true);
    // 既存の本番決済が使う STRIPE_SECRET_KEY をこの関数から読まない
    expect(/Deno\.env\.get\(\s*'STRIPE_SECRET_KEY'/.test(src)).toBe(false);
  });

  it('金額をクライアントから受け取らない', () => {
    // payload.amount を読む箇所が無いこと
    expect(/payload\.amount/.test(src)).toBe(false);
    expect(src).toContain('String(plan.priceAmount)');
  });

  it('支払額と注文額の一致を確認してから付与する', () => {
    expect(src).toContain('paidAmount !== purchase.amount');
  });

  it('付与は purchase_id でべき等', () => {
    expect(src).toContain("onConflict: 'purchase_id'");
    expect(src).toContain('ignoreDuplicates: true');
  });

  it('既存アカウントがあれば作り直さない（進捗を切らない）', () => {
    expect(src).toContain("from('ai_learners')");
    expect(src).toContain('if (!learnerId)');
  });

  it('価格をこのファイルに直接書いていない（正準JSONから引く）', () => {
    const withoutComments = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const p of SALES_PLAN_CATALOG) {
      const re = new RegExp(`(?<![\\w\\-.])${p.priceAmount}(?![\\w])`);
      expect(re.test(withoutComments), `Edge Function に価格 ${p.priceAmount} が直書き`).toBe(false);
    }
  });
});
