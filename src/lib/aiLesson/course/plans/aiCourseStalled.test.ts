// 学習が途切れた人への1通（2026-09-07）。
//
// ここで固定するのは「送る／送らない」の境界と、**文面に入れてはいけないもの**。
// 実在の生徒はすべて手動付与で購入行が無いため、本番DBに検証用の行を置けない
// （aiCourseLifecycle.test.ts と同じ事情）。純粋関数の側で決めきる。
import { describe, it, expect } from 'vitest';
import {
  stalledDecision, stalledDedupeKey, buildStalledMail,
  STALL_AFTER_DAYS, STALL_MAX_DAYS, isDeliverableEmail,
  type LifecycleLearnerRow,
} from '../../../../../supabase/functions/_shared/aiCourseLifecycle';

const row = (over: Partial<LifecycleLearnerRow> = {}): LifecycleLearnerRow => ({
  user_id: 'u1',
  email: 'x@example.com',
  locale: 'zh',
  last_active_day: '2026-09-01',
  is_test: false,
  is_active: true,
  ...over,
});

const TODAY = '2026-09-07';

describe('誰に送るか', () => {
  it(`${STALL_AFTER_DAYS}日あいたら送る`, () => {
    expect(stalledDecision([row({ last_active_day: '2026-09-04' })], TODAY)).toHaveLength(1);
  });

  it(`${STALL_AFTER_DAYS}日未満では送らない（毎日つついたりしない）`, () => {
    expect(stalledDecision([row({ last_active_day: '2026-09-05' })], TODAY)).toHaveLength(0);
    expect(stalledDecision([row({ last_active_day: TODAY })], TODAY)).toHaveLength(0);
  });

  it(`${STALL_MAX_DAYS}日を超えた人には送らない（掘り起こしはしない）`, () => {
    expect(stalledDecision([row({ last_active_day: '2026-01-01' })], TODAY)).toHaveLength(0);
  });

  it('テスト用アカウント・停止中の人には送らない', () => {
    expect(stalledDecision([row({ is_test: true })], TODAY)).toHaveLength(0);
    expect(stalledDecision([row({ is_active: false })], TODAY)).toHaveLength(0);
  });

  it('一度も学習していない人はここでは対象にしない（要る文面が別物）', () => {
    expect(stalledDecision([row({ last_active_day: null })], TODAY)).toHaveLength(0);
  });

  it('宛先が無ければ送らない', () => {
    expect(stalledDecision([row({ email: null })], TODAY)).toHaveLength(0);
  });

  it('IDログインの内部ドメインには送らない（不達になるだけで、ログも汚れる）', () => {
    expect(stalledDecision([row({ email: 'li@id.badminton-platform.pages.dev' })], TODAY))
      .toHaveLength(0);
    expect(isDeliverableEmail('someone@gmail.com')).toBe(true);
  });

  it('壊れた日付でも落ちない・送らない', () => {
    expect(stalledDecision([row({ last_active_day: 'こわれた' })], TODAY)).toHaveLength(0);
  });

  it('空いた日数を実測で返す', () => {
    expect(stalledDecision([row({ last_active_day: '2026-08-31' })], TODAY)[0].daysAway).toBe(7);
  });
});

describe('冪等キー', () => {
  it('1回の途切れにつき1通（日がたっても同じキー）', () => {
    const a = stalledDecision([row({ last_active_day: '2026-09-01' })], '2026-09-07')[0];
    const b = stalledDecision([row({ last_active_day: '2026-09-01' })], '2026-09-20')[0];
    expect(stalledDedupeKey(a)).toBe(stalledDedupeKey(b));
  });

  it('再開してまた空いたら別の1通になる', () => {
    const a = stalledDecision([row({ last_active_day: '2026-09-01' })], '2026-09-07')[0];
    const c = stalledDecision([row({ last_active_day: '2026-09-10' })], '2026-09-16')[0];
    expect(stalledDedupeKey(a)).not.toBe(stalledDedupeKey(c));
  });
});

describe('文面', () => {
  const t = stalledDecision([row({ last_active_day: '2026-09-01', locale: 'ja' })], TODAY)[0];
  const zh = stalledDecision([row({ last_active_day: '2026-09-01', locale: 'zh' })], TODAY)[0];

  it('責める言葉・喪失の言葉を入れない', () => {
    for (const m of [buildStalledMail(t), buildStalledMail(zh)]) {
      const all = `${m.subject}\n${m.text}`;
      for (const ng of ['サボ', '途切れ', '失われ', '怠', '荒废', '中断了']) {
        expect(all.includes(ng), `${ng} が入っている`).toBe(false);
      }
    }
  });

  it('金額・プランの売り込みを混ぜない（これは営業ではない）', () => {
    for (const m of [buildStalledMail(t), buildStalledMail(zh)]) {
      const all = `${m.subject}\n${m.text}`;
      expect(all).not.toMatch(/円|日元|元\b|プランを見る|查看方案/);
    }
  });

  it('実測の日数と、続きから入れるURLが入る', () => {
    const m = buildStalledMail(t);
    expect(m.subject).toContain('6日');
    expect(m.text).toContain('https://study.kawabado.com/ja/ai-course/login');
  });

  it('中国語の人には中国語で届く', () => {
    const m = buildStalledMail(zh);
    expect(m.subject).toContain('6天');
    expect(m.text).toContain('/zh/ai-course/login');
    expect(m.text).not.toMatch(/[぀-ゟ]/);
  });
});
