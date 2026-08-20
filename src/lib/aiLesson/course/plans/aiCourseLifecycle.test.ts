// 購入後フォローメールの「誰に何を送るか」を固定する。
//
// なぜローカルでテストするか: ai_course_access は auth.users への外部キーを持つため、
// 本番DBへ検証用の行を置けない（2026-08-21に実際に 23503 で弾かれた）。
// ロジックを純粋関数へ切り出して、ここで境界を固定する。
import { describe, it, expect } from 'vitest';
import {
  selectLifecycleTargets, lifecycleDedupeKey, buildLifecycleMail,
  NOT_STARTED_AFTER_HOURS, EXPIRING_WITHIN_DAYS,
  type LifecycleAccessRow, type LifecyclePurchaseRow,
} from '../../../../../supabase/functions/_shared/aiCourseLifecycle';
import { PLAN_CATALOG } from './planCatalog';

const NOW = Date.parse('2026-09-01T12:00:00Z');
const H = 3_600_000;
const D = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const purchase = (over: Partial<LifecyclePurchaseRow> = {}): LifecyclePurchaseRow => ({
  id: 'p1', buyer_email: 'buyer@example.com', locale: 'ja',
  provisioned_at: iso(NOW - 48 * H), status: 'provisioned', ...over,
});
const access = (over: Partial<LifecycleAccessRow> = {}): LifecycleAccessRow => ({
  user_id: 'u1', plan_id: 'ai-trial-pass', valid_until: iso(NOW + 20 * D),
  trial_started_at: null, trial_window_minutes: 60, purchase_id: 'p1', ...over,
});
const run = (rows: LifecycleAccessRow[], ps: LifecyclePurchaseRow[] = [purchase()]) =>
  selectLifecycleTargets(rows, Object.fromEntries(ps.map((p) => [p.id, p])), NOW);

describe('① 体験を始めていない人', () => {
  it('購入から24時間たっていれば送る', () => {
    const t = run([access({ trial_started_at: null })]);
    expect(t.map((x) => x.kind)).toEqual(['trial_not_started']);
  });

  it('**24時間たっていなければ送らない**（買った直後に催促しない）', () => {
    const t = run([access()], [purchase({ provisioned_at: iso(NOW - (NOT_STARTED_AFTER_HOURS - 1) * H) })]);
    expect(t).toEqual([]);
  });

  it('期限切れには送らない（もう開始できないのに開始を促さない）', () => {
    expect(run([access({ valid_until: iso(NOW - 1 * D) })])).toEqual([]);
  });
});

describe('② 体験が終わった人', () => {
  it('開始から60分たったら送る', () => {
    const t = run([access({ trial_started_at: iso(NOW - 61 * 60_000) })]);
    expect(t.map((x) => x.kind)).toEqual(['trial_ended']);
  });

  it('**まだ60分たっていなければ送らない**（利用中に終了メールを出さない）', () => {
    expect(run([access({ trial_started_at: iso(NOW - 30 * 60_000) })])).toEqual([]);
  });

  it('体験が終わった人に「期限間近」を重ねて送らない', () => {
    const t = run([access({
      trial_started_at: iso(NOW - 2 * D), valid_until: iso(NOW + 1 * D),
    })]);
    expect(t.map((x) => x.kind)).toEqual(['trial_ended']);
  });
});

describe('③ 期限が近い人', () => {
  it('残り3日以内なら送る', () => {
    const t = run([access({ plan_id: 'ai-month', trial_window_minutes: null, valid_until: iso(NOW + 2 * D) })]);
    expect(t.map((x) => x.kind)).toEqual(['expiring_soon']);
  });

  it(`残り${EXPIRING_WITHIN_DAYS}日より先なら送らない`, () => {
    const rows = [access({ plan_id: 'ai-month', trial_window_minutes: null, valid_until: iso(NOW + 10 * D) })];
    expect(run(rows)).toEqual([]);
  });

  it('期限切れには送らない', () => {
    const rows = [access({ plan_id: 'ai-month', trial_window_minutes: null, valid_until: iso(NOW - 1 * D) })];
    expect(run(rows)).toEqual([]);
  });
});

describe('送ってはいけない相手', () => {
  it('**返金済みには送らない**', () => {
    expect(run([access({ trial_started_at: iso(NOW - 2 * D) })], [purchase({ status: 'refunded' })])).toEqual([]);
  });

  it('宛先が分からない行には送らない（購入行を消したQA残骸など）', () => {
    expect(run([access({ purchase_id: 'missing' })])).toEqual([]);
    expect(run([access()], [purchase({ buyer_email: null })])).toEqual([]);
  });

  it('1人につき1回の実行で1通まで', () => {
    const t = run([access({ trial_started_at: iso(NOW - 2 * D), valid_until: iso(NOW + 1 * D) })]);
    expect(t).toHaveLength(1);
  });
});

describe('冪等キー', () => {
  it('用件と購入で一意（同じ用件は二度送らない）', () => {
    const [t] = run([access()]);
    expect(lifecycleDedupeKey(t)).toBe('trial_not_started:p1');
  });
});

describe('本文', () => {
  const kinds = ['trial_not_started', 'trial_ended', 'expiring_soon'] as const;

  it.each(kinds)('%s は ja/zh とも本文と件名がある', (kind) => {
    for (const locale of ['ja', 'zh'] as const) {
      const m = buildLifecycleMail(
        { kind, userId: 'u1', purchaseId: 'p1', email: 'a@b.c', locale, planId: 'ai-trial-pass', validUntil: iso(NOW + 2 * D) },
        NOW,
      );
      expect(m.subject.length).toBeGreaterThan(4);
      expect(m.text.length).toBeGreaterThan(60);
    }
  });

  it('**本文の金額はすべてカタログの値と一致する**（メールに金額を直書きしない）', () => {
    const catalogPrices = new Set(PLAN_CATALOG.flatMap((p) => (p.priceJpy === null ? [] : [p.priceJpy])));
    for (const kind of kinds) {
      for (const locale of ['ja', 'zh'] as const) {
        const m = buildLifecycleMail(
          { kind, userId: 'u1', purchaseId: 'p1', email: 'a@b.c', locale, planId: 'ai-trial-pass', validUntil: iso(NOW + 2 * D) },
          NOW,
        );
        for (const hit of `${m.subject}\n${m.text}`.matchAll(/([0-9][0-9,]*)\s*(円|日元)/g)) {
          const n = Number(hit[1].replace(/,/g, ''));
          expect(catalogPrices.has(n), `カタログに無い金額: "${hit[0]}" (${kind}/${locale})`).toBe(true);
        }
      }
    }
  });

  it('返金・解約の条件を断定しない（法務確認が未了のため）', () => {
    for (const kind of kinds) {
      for (const locale of ['ja', 'zh'] as const) {
        const m = buildLifecycleMail(
          { kind, userId: 'u1', purchaseId: 'p1', email: 'a@b.c', locale, planId: 'ai-month', validUntil: iso(NOW + 2 * D) },
          NOW,
        );
        expect(m.text).not.toMatch(/返金(いた)?しません|返金不可|返金には応じ|不予退款|不能退款/);
      }
    }
  });
});
