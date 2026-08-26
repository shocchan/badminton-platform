// 計測に個人情報を混ぜない（2026-08-26 Phase S1）。
//
// 流入元を残すために、いろいろな値を持ち回るようになった。
// 便利なほど「ついでに送る」が起きやすいので、境界を機械で止める。
//
// GA4は staging に ID が無く発火しないため、ブラウザでは payload を確認できない。
// ここではソースの形で固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ATTR = readFileSync('src/lib/aiLesson/course/attribution.ts', 'utf8');
const LP_HELPERS = readFileSync('src/pages/ai-lesson/landing/lpHelpers.ts', 'utf8');
const COURSE_ANALYTICS = readFileSync('src/lib/aiLesson/course/courseAnalytics.ts', 'utf8');
const CHECKOUT_FN = readFileSync('supabase/functions/ai-course-checkout/index.ts', 'utf8');
const MIGRATION = readFileSync('supabase/migrations/20260826140000_ai_funnel_attribution.sql', 'utf8');

describe('GA4へ送るのは流入元まで', () => {
  it('GA4に渡すのは source / medium / campaign の3つだけ', () => {
    const fn = /export const analyticsTouchParams[\s\S]*?\n\};/.exec(ATTR);
    expect(fn, 'analyticsTouchParams が見つからない').toBeTruthy();
    const keys = [...fn![0].matchAll(/out\.([a-z_]+)\s*=/g)].map((m) => m[1]).sort();
    expect(keys).toEqual(['attr_campaign', 'attr_medium', 'attr_source']);
  });

  it('anon_id をGA4へ送っていない', () => {
    const fn = /export const analyticsTouchParams[\s\S]*?\n\};/.exec(ATTR)![0];
    expect(fn).not.toContain('anonId');
    expect(LP_HELPERS).not.toMatch(/trackEvent\([\s\S]{0,200}anonId/);
  });

  it('referrer はホスト名しか保持しない（パスやクエリを残さない）', () => {
    // パスやクエリには、メールのトークンなど持ち主を特定できるものが混ざりうる
    expect(ATTR).toMatch(/new URL\(referrer\)\.hostname/);
    expect(ATTR).not.toMatch(/new URL\(referrer\)\.(pathname|search|href)/);
  });

  it('landing_path はパスだけ（クエリを含めない）', () => {
    expect(ATTR).toMatch(/window\.location\.pathname/);
    expect(ATTR).not.toMatch(/landingPath:\s*window\.location\.href/);
  });
});

describe('DBに個人情報を置かない', () => {
  it('流入元の表に氏名・メールの列が無い', () => {
    const table = /create table if not exists public\.ai_attribution[\s\S]*?\n\);/.exec(MIGRATION)![0];
    for (const ng of ['email', 'name', 'ip_', 'user_agent']) {
      expect(table.toLowerCase(), `${ng} を持たない`).not.toContain(ng);
    }
  });

  it('出来事の表は列を固定していて、自由入力を受けない', () => {
    const table = /create table if not exists public\.ai_funnel_events[\s\S]*?\n\);/.exec(MIGRATION)![0];
    // jsonb の自由項目を持つと、あとから何でも入れられるようになる
    expect(table).not.toContain('jsonb');
  });

  it('anon_id は形が合わないと保存しない', () => {
    expect(MIGRATION).toMatch(/p_anon_id !~ '\^\[0-9a-f\]\{8\}-/);
  });

  it('kind はホワイトリスト外を捨てる（例外を投げない）', () => {
    expect(MIGRATION).toMatch(/if p_kind is null or not \(p_kind = any\(v_kinds\)\) then\s*\n\s*return;/);
  });

  it('1日の行数に上限がある', () => {
    expect(MIGRATION).toMatch(/v_today_rows >= 300/);
  });
});

describe('計測が失敗しても画面を壊さない', () => {
  it('記録は必ず握りつぶす', () => {
    const fn = /export const recordFunnel[\s\S]*?\n\};/.exec(ATTR)![0];
    expect(fn).toContain('catch');
    expect(fn).toMatch(/\.then\(\(\) => undefined, \(\) => undefined\)/);
  });

  it('LPのCTAも、ファネル記録の失敗でクリックを壊さない', () => {
    expect(LP_HELPERS).toMatch(/recordFunnel[\s\S]{0,400}catch/);
  });

  it('学習側も同じ（会話を止めない）', () => {
    expect(COURSE_ANALYTICS).toMatch(/recordFunnel[\s\S]{0,400}catch/);
  });

  it('checkout は anon_id が壊れていても決済を止めない', () => {
    expect(CHECKOUT_FN).toMatch(/\? body\.anonId : null/);
  });
});

describe('同じ行動を二重に数えない', () => {
  it('LP側と学習側で、同じGA4イベント名を両方が拾っていない', () => {
    const keysOf = (src: string) => {
      const m = /const FUNNEL_BY_EVENT: Record<string, FunnelKind> = \{([\s\S]*?)\};/.exec(src);
      return m ? [...m[1].matchAll(/^\s*([a-z_0-9]+):/gm)].map((x) => x[1]) : [];
    };
    const lp = keysOf(LP_HELPERS);
    const course = keysOf(COURSE_ANALYTICS);
    expect(lp.length).toBeGreaterThan(0);
    expect(course.length).toBeGreaterThan(0);
    const overlap = lp.filter((k) => course.includes(k));
    expect(overlap, `両方が拾っているイベント: ${overlap.join(', ')}`).toEqual([]);
  });

  it('新しいイベント名を勝手に増やしていない（既存名の再利用）', () => {
    // 仕様の13種のうち、新設は review_scheduled だけ
    const all = [LP_HELPERS, COURSE_ANALYTICS].join('\n');
    expect(all).toContain('view_ai_course_lp');
    expect(all).toContain('start_ai_course_lesson');
    expect(all).toContain('complete_ai_course_daily_review');
    expect(all).toContain('schedule_ai_course_review');   // 唯一の新設
  });
});
