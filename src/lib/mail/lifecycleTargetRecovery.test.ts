// 本番で「フォローメールが1通も送られていなかった」原因を、実データの形で固定する。
//
// 2026-08-24 の実測:
//   ai_course_mail_log … 0行
//   ai_course_access   … source=purchase の行は1件だけ。その purchase_id
//                        '560b3eee-…' は **ai_plan_purchases のどこにも無い**
//                        （バックアップ全56表を横断しても access にしか現れない）
//   ai_plan_purchases  … 同じ user_id の provisioned な購入 '6cd2f108-…' は実在し、
//                        buyer_email も持っている
//
// つまり抽出条件の前段で宛先を引けず、送信対象が0件になっていた。
// cron も Resend も本文も無関係（同じ時間帯に動く ai-course-monitor は
// 2026-08-22 00:00 UTC に同じ鍵・同じ差出人でメールを送れている）。
import { describe, it, expect } from 'vitest';
import {
  selectLifecycleTargets, lifecycleDedupeKey, findOrphanAccess, resolvePurchase,
  MAX_EVENT_AGE_DAYS,
  type LifecycleAccessRow, type LifecyclePurchaseRow,
} from '../../../supabase/functions/_shared/aiCourseLifecycle';

const USER = '7c63a736-2282-4641-82c9-3ba1a27d0beb';
const DANGLING = '560b3eee-9699-488e-b6f9-286e712d1f25';
const REAL = '6cd2f108-6700-4277-9d61-5895a4d30b13';

/** 本番の ai_course_access（source=purchase の唯一の行）をそのまま写したもの */
const productionAccess: LifecycleAccessRow = {
  user_id: USER,
  plan_id: 'ai-trial-pass',
  valid_until: '2026-08-19T17:20:51.880866+00:00',
  trial_started_at: '2026-08-19T16:20:51.880866+00:00',
  trial_window_minutes: 60,
  purchase_id: DANGLING,
};

/** 本番の ai_plan_purchases のうち、この人の provisioned な行 */
const productionPurchase: LifecyclePurchaseRow & { user_id: string } = {
  id: REAL,
  user_id: USER,
  buyer_email: 'shocchance3@gmail.com',
  locale: 'ja',
  provisioned_at: '2026-08-19T14:43:50.913+00:00',
  status: 'provisioned',
};

/** cron が実際に走る時刻（体験終了の5日後） */
const CRON_NOW = Date.parse('2026-08-24T01:30:00Z');
const byId = { [REAL]: productionPurchase };
const byUser = { [USER]: productionPurchase };

describe('本番で0通だった理由', () => {
  it('**purchase_id が宙に浮いているだけで、唯一の対象者が丸ごと選外になる**', () => {
    expect(selectLifecycleTargets([productionAccess], byId, CRON_NOW)).toEqual([]);
  });

  it('宙に浮いた参照は「宛先を引けない受講権」として数えられる（黙って消えない）', () => {
    expect(findOrphanAccess([productionAccess], byId)).toEqual([USER]);
  });
});

describe('user_id でも引き当てる（修正後）', () => {
  it('同じ人の購入台帳へ落として、体験終了の案内を送る', () => {
    const t = selectLifecycleTargets([productionAccess], byId, CRON_NOW, byUser);
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('trial_ended');
    expect(t[0].email).toBe('shocchance3@gmail.com');
    expect(t[0].userId).toBe(USER);
  });

  it('冪等キーは**実在する購入**のIDで組む（宙に浮いたIDを鍵にしない）', () => {
    const [t] = selectLifecycleTargets([productionAccess], byId, CRON_NOW, byUser);
    expect(t.purchaseId).toBe(REAL);
    expect(lifecycleDedupeKey(t)).toBe(`trial_ended:${REAL}`);
  });

  it('宙に浮いた参照があとで直っても鍵は変わらない＝2通目が飛ばない', () => {
    const repaired: LifecycleAccessRow = { ...productionAccess, purchase_id: REAL };
    const [before] = selectLifecycleTargets([productionAccess], byId, CRON_NOW, byUser);
    const [after] = selectLifecycleTargets([repaired], byId, CRON_NOW, byUser);
    expect(lifecycleDedupeKey(after)).toBe(lifecycleDedupeKey(before));
  });

  it('引き当てられれば orphan として数えない', () => {
    expect(findOrphanAccess([productionAccess], byId, byUser)).toEqual([]);
  });

  it('purchase_id で直接引ける行は、user_id 側を見に行かない', () => {
    const other = { ...productionPurchase, id: 'other', buyer_email: 'other@example.com' };
    const direct = resolvePurchase(
      { ...productionAccess, purchase_id: REAL }, byId, { [USER]: other },
    );
    expect(direct?.id).toBe(REAL);
  });
});

describe('古い出来事を今さら送らない', () => {
  it(`きっかけから${MAX_EVENT_AGE_DAYS}日を過ぎたら送らない（直した瞬間に過去分が一斉に飛ぶのを防ぐ）`, () => {
    const late = Date.parse('2026-08-19T17:20:51.880866Z') + (MAX_EVENT_AGE_DAYS + 1) * 86_400_000;
    expect(selectLifecycleTargets([productionAccess], byId, late, byUser)).toEqual([]);
  });

  it(`${MAX_EVENT_AGE_DAYS}日以内ならまだ送る`, () => {
    const ok = Date.parse('2026-08-19T17:20:51.880866Z') + (MAX_EVENT_AGE_DAYS - 1) * 86_400_000;
    expect(selectLifecycleTargets([productionAccess], byId, ok, byUser).map((t) => t.kind))
      .toEqual(['trial_ended']);
  });
});

describe('返金・宛先なしは修正後も送らない', () => {
  it('返金済みには user_id で引き当てても送らない', () => {
    const refunded = { ...productionPurchase, status: 'refunded' };
    expect(selectLifecycleTargets(
      [productionAccess], {}, CRON_NOW, { [USER]: refunded },
    )).toEqual([]);
  });

  it('どちらでも引けなければ送らない', () => {
    expect(selectLifecycleTargets([productionAccess], {}, CRON_NOW, {})).toEqual([]);
  });
});
