// @vitest-environment jsdom
// 紹介ループの土台（2026-08-23 監査P1-15）。
//
// 監査時点では referral の実装がゼロで、「広告以外の流入」を作る手段が無かった。
// **報酬額はCEO未確定なので金額は一切決めない**。ここで作るのは
// 「誰の紹介で来て、買ったか」を後から数えられる土台だけ。
//
// 設計:
//  - `?ref=<code>` を **localStorage** に保存（UTMと違いセッションを跨ぐ。数日後に買う人を落とさない）
//  - 最初に見たコードを優先（あとから別リンクで上書きしない＝取り合いを起こさない）
//  - 購入時は utm と同じ入れ物で送り、台帳の `utm` 列（jsonb）に入る＝**migration不要**
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

import { resolve } from 'node:path';

const root = process.cwd();
const ANALYTICS = readFileSync(resolve(root, 'src/lib/analytics.ts'), 'utf8');
const CHECKOUT = readFileSync(resolve(root, 'src/lib/aiLesson/course/plans/planCheckout.ts'), 'utf8');
const EDGE = readFileSync(resolve(root, 'supabase/functions/ai-course-checkout/index.ts'), 'utf8');

describe('紹介コードの受け取り', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('英数・ハイフン・アンダースコアの3〜32文字だけを受ける（そのままDBへ入るため）', () => {
    const m = /const REF_PATTERN = (\/.+\/);/.exec(ANALYTICS);
    expect(m, 'REF_PATTERN が見つからない').toBeTruthy();
    const re = new RegExp(m![1].slice(1, -1));
    expect(re.test('shocchan_01')).toBe(true);
    expect(re.test('ab')).toBe(false);                       // 短すぎる
    expect(re.test('a'.repeat(33))).toBe(false);             // 長すぎる
    expect(re.test('<script>')).toBe(false);                 // 記号
    expect(re.test('コード')).toBe(false);                    // 非ASCII
  });

  it('localStorage に保存する（セッションを跨ぐ）＋最初のコードを優先する', () => {
    expect(ANALYTICS).toMatch(/localStorage\.setItem\(REF_KEY, ref\)/);
    expect(ANALYTICS, '既存コードがあるときは上書きしない条件が要る')
      .toMatch(/!localStorage\.getItem\(REF_KEY\)/);
  });

  it('着地時に referral_visit を計測する', () => {
    expect(ANALYTICS).toMatch(/trackEvent\('referral_visit', \{ ref_code: ref \}\)/);
  });

  it('購入時に ref を一緒に送る（台帳の utm 列へ入る＝migration不要）', () => {
    expect(CHECKOUT).toMatch(/getReferralCode\(\)/);
    expect(CHECKOUT).toMatch(/\{ \.\.\.utm, ref \}/);
  });

  it('サーバー側の許可キーに ref が入っている（知らないキーは捨てる方針は維持）', () => {
    const m = /for \(const k of \[([^\]]+)\]\)/.exec(EDGE);
    expect(m, '許可キーの配列が見つからない').toBeTruthy();
    expect(m![1]).toContain('"ref"');
    expect(m![1]).toContain('"utm_source"');
  });

  it('個人情報を紹介の入れ物に入れていない（名前・メールを送らない）', () => {
    expect(CHECKOUT).not.toMatch(/utm.*email/i);
    expect(ANALYTICS).not.toMatch(/REF_KEY.*email/i);
  });
});
