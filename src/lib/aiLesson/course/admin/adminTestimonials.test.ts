// 受講者の声の扱い（2026-08-26 Phase S7）。
//
// ここで守るのは1つだけ:
// **本人が「掲載してよい」と言っていないものは、どうやっても公開物にならない。**
// 架空の口コミを作らない方針は正しく、その方針を守るために
// 「集める仕組み」を作った。集めた以上、扱いを間違えないよう機械で固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isPublishable, bucketOf, sortForAdmin, type TestimonialRow } from './adminTestimonials';

const t = (o: Partial<TestimonialRow>): TestimonialRow => ({
  id: 'x', userId: 'u', learnerId: null, body: 'よかったです', locale: 'ja',
  context: 'report', consentPublish: false, displayName: null,
  approvedAtISO: null, createdAtISO: '2026-08-26T00:00:00Z', ...o,
});

describe('掲載できる条件', () => {
  it('許諾も承認も無ければ公開しない', () => {
    expect(isPublishable(t({}))).toBe(false);
  });

  it('許諾だけでは公開しない（自動公開しない）', () => {
    expect(isPublishable(t({ consentPublish: true }))).toBe(false);
  });

  it('承認だけでは公開しない（本人の同意なしに載せない）', () => {
    expect(isPublishable(t({ approvedAtISO: '2026-08-26T01:00:00Z' }))).toBe(false);
  });

  it('許諾と承認が揃って初めて公開できる', () => {
    expect(isPublishable(t({ consentPublish: true, approvedAtISO: '2026-08-26T01:00:00Z' }))).toBe(true);
  });
});

describe('管理画面での分類', () => {
  it('許諾済み・未承認は「確認待ち」', () => {
    expect(bucketOf(t({ consentPublish: true }))).toBe('awaiting_review');
  });
  it('許諾なしは「掲載不可」', () => {
    expect(bucketOf(t({ consentPublish: false }))).toBe('no_consent');
  });
  it('許諾済み・承認済みは「掲載中」', () => {
    expect(bucketOf(t({ consentPublish: true, approvedAtISO: 'x' }))).toBe('published');
  });

  it('手を打つ必要がある順に並ぶ', () => {
    const rows = sortForAdmin([
      t({ id: 'published', consentPublish: true, approvedAtISO: 'x' }),
      t({ id: 'no_consent' }),
      t({ id: 'awaiting', consentPublish: true }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['awaiting', 'no_consent', 'published']);
  });

  it('同じ分類の中では新しい順', () => {
    const rows = sortForAdmin([
      t({ id: 'old', consentPublish: true, createdAtISO: '2026-08-01T00:00:00Z' }),
      t({ id: 'new', consentPublish: true, createdAtISO: '2026-08-26T00:00:00Z' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
  });
});

describe('サーバー側でも同じ規律が効いている', () => {
  const SQL = readFileSync('supabase/migrations/20260826160000_ai_testimonials.sql', 'utf8');

  it('本人が送るRPCでは承認列に触れない（自動公開できない）', () => {
    const fn = /create or replace function public\.ai_submit_testimonial[\s\S]*?\n\$\$;/.exec(SQL);
    expect(fn, '送信RPCが見つからない').toBeTruthy();
    expect(fn![0], '本人の送信で approved_at を入れてはいけない').not.toContain('approved_at');
  });

  it('掲載の許諾が無い行は、管理者でも承認できない', () => {
    expect(SQL).toMatch(/if p_approve and not v_consent then[\s\S]{0,120}no_consent/);
  });

  it('既定は掲載しない（consent_publish のデフォルトが false）', () => {
    expect(SQL).toMatch(/consent_publish boolean not null default false/);
  });

  it('本人以外は他人の感想を読めない', () => {
    expect(SQL).toMatch(/ai_testimonials_own_read[\s\S]{0,140}user_id = auth\.uid\(\)/);
  });

  it('氏名・メールを保存していない', () => {
    // 保存するのは user_id と、本人が決めた呼び名だけ
    expect(SQL).not.toMatch(/\bemail\b/i);
    expect(SQL).not.toMatch(/\breal_name\b/i);
  });

  it('連投を止める（1日1件）', () => {
    expect(SQL).toMatch(/already_today/);
  });

  it('rollback は既定で表を落とさない（許諾の証跡を消さない）', () => {
    const rb = readFileSync('supabase/migrations/20260826160000_ai_testimonials.rollback.sql', 'utf8');
    expect(rb).toMatch(/^-- drop table if exists public\.ai_testimonials;/m);
  });
});

describe('画面側の約束', () => {
  const UI = readFileSync('src/components/ai-course/TestimonialPrompt.tsx', 'utf8');
  const code = UI.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('掲載の許諾が感想とは別のチェックになっている', () => {
    expect(code).toMatch(/type="checkbox"[\s\S]{0,120}checked=\{consent\}/);
  });

  it('既定はOFF', () => {
    expect(code).toMatch(/useState\(false\);\s*\/\/ 既定OFF|const \[consent, setConsent\] = useState\(false\)/);
  });

  it('自動公開しないことを、その場に書いている', () => {
    expect(UI).toContain('自動では公開されません');
    expect(UI).toContain('不会自动公开');
  });

  it('閉じられる（任意であることが操作でも分かる）', () => {
    expect(code).toContain('onClose');
    expect(UI).toContain('今回は書かない');
  });

  it('本名を求めていない', () => {
    expect(UI).toContain('空でもOK');
    expect(UI).not.toContain('お名前を入力');
  });
});
