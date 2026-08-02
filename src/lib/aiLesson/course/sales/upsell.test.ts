// アップセルの受入テスト（§12 §13 §20）。
//
// 落としたいのは「うるさい売り込み」。
// だから通るケースより、**出ないケース**のほうを厚く固定する。

import { describe, it, expect } from 'vitest';
import {
  decideUpsell, upsellCopy, recordImpression, BANNED_UPSELL_WORDS,
  type UpsellContext, type UpsellImpression,
} from './upsell';
import { salesPlanById } from './planConfig';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

const hourCtx = (over: Partial<UpsellContext> = {}): UpsellContext => ({
  sessionId: 'sess-1',
  nowMs: T0,
  currentPlanId: 'ai-hour-pass',
  firstAdventureCompleted: false,
  activeMinutesUsed: 0,
  remainingMinutes: 60,
  entitlementExhausted: false,
  activeDays: 0,
  repeatedWeaknessCount: 0,
  examGoalDeclared: false,
  weakSkillCount: 0,
  humanHelpRequested: false,
  ...over,
});

const monthCtx = (over: Partial<UpsellContext> = {}): UpsellContext =>
  hourCtx({ currentPlanId: 'ai-month', remainingMinutes: 0, ...over });

const hourRule = salesPlanById('ai-hour-pass')!.upsellRules[0];
const monthRule = salesPlanById('ai-month')!.upsellRules[0];

describe('§12 購入直後には出さない', () => {
  it('買っただけ・まだ何もしていない状態では出ない', () => {
    const d = decideUpsell(hourCtx(), []);
    expect(d.show).toBe(false);
    expect(d.suppressedBy).toBe('no_trigger');
  });

  it('残り60分のまま（1分も使っていない）では「残りわずか」条件が効かない', () => {
    // remaining 60 は threshold 10 を下回らないが、
    // 仮に残りが少なくても使用実績0なら出さない、を明示的に固定する
    const d = decideUpsell(hourCtx({ remainingMinutes: 5, activeMinutesUsed: 0 }), []);
    expect(d.show).toBe(false);
  });

  it('全トリガーが「価値を体験したあと」の条件になっている', () => {
    // 購入時点で真になり得る条件が混ざっていないこと
    for (const t of hourRule.triggers) {
      expect(['first_adventure_completed', 'active_minutes_reached',
              'remaining_minutes_below', 'entitlement_exhausted']).toContain(t.kind);
    }
  });
});

describe('§12 60分 → 1か月：出てよい条件', () => {
  it('最初の冒険を終えたら出る', () => {
    const d = decideUpsell(hourCtx({ firstAdventureCompleted: true }), []);
    expect(d.show).toBe(true);
    expect(d.targetPlanId).toBe('ai-month');
    expect(d.matchedTrigger!.kind).toBe('first_adventure_completed');
  });

  it('20分以上使ったら出る', () => {
    expect(decideUpsell(hourCtx({ activeMinutesUsed: 20 }), []).show).toBe(true);
    expect(decideUpsell(hourCtx({ activeMinutesUsed: 19 }), []).show).toBe(false);
  });

  it('残り10分を切ったら出る（他の条件と混ざらないよう、使用分数は低く保って確かめる）', () => {
    const low = { activeMinutesUsed: 5 };   // 20分条件には届かない
    const hit = decideUpsell(hourCtx({ ...low, remainingMinutes: 10 }), []);
    expect(hit.show).toBe(true);
    expect(hit.matchedTrigger!.kind).toBe('remaining_minutes_below');
    expect(decideUpsell(hourCtx({ ...low, remainingMinutes: 15 }), []).show).toBe(false);
  });

  it('使い切ったら出る', () => {
    expect(decideUpsell(hourCtx({ entitlementExhausted: true, activeMinutesUsed: 60, remainingMinutes: 0 }), []).show).toBe(true);
  });
});

describe('§12 頻度制限（§20 Upsell Frequency Cap）', () => {
  const shown = (over: Partial<UpsellImpression> = {}): UpsellImpression =>
    ({ ruleId: hourRule.id, sessionId: 'sess-1', shownAtMs: T0, outcome: 'shown', ...over });

  it('同じセッションでは1回まで', () => {
    const ctx = hourCtx({ firstAdventureCompleted: true });
    const d = decideUpsell(ctx, [shown()]);
    expect(d.show).toBe(false);
    expect(d.suppressedBy).toBe('session_cap');
  });

  it('別のセッションなら出せる', () => {
    const ctx = hourCtx({ firstAdventureCompleted: true, sessionId: 'sess-2', nowMs: T0 + DAY });
    expect(decideUpsell(ctx, [shown()]).show).toBe(true);
  });

  it('閉じられたら冷却期間のあいだ出ない', () => {
    const dismissed = shown({ outcome: 'dismissed' });
    const inCooldown = hourCtx({ firstAdventureCompleted: true, sessionId: 'sess-2', nowMs: T0 + 2 * DAY });
    expect(decideUpsell(inCooldown, [dismissed]).suppressedBy).toBe('cooldown');

    const afterCooldown = hourCtx({ firstAdventureCompleted: true, sessionId: 'sess-3', nowMs: T0 + 4 * DAY });
    expect(decideUpsell(afterCooldown, [dismissed]).show).toBe(true);
  });

  it('生涯の上限を超えたら二度と出ない', () => {
    const many = Array.from({ length: hourRule.maxLifetime }, (_, i) =>
      shown({ sessionId: `s${i}`, shownAtMs: T0 - (i + 1) * 30 * DAY }));
    const ctx = hourCtx({ firstAdventureCompleted: true, sessionId: 'new', nowMs: T0 });
    const d = decideUpsell(ctx, many);
    expect(d.show).toBe(false);
    expect(d.suppressedBy).toBe('lifetime_cap');
  });

  it('生涯の上限が有限（無限に出る経路が無い）', () => {
    expect(Number.isFinite(hourRule.maxLifetime)).toBe(true);
    expect(hourRule.maxLifetime).toBeGreaterThan(0);
    expect(Number.isFinite(monthRule.maxLifetime)).toBe(true);
  });

  it('一度受け入れたら、もう出さない', () => {
    const accepted = shown({ outcome: 'accepted' });
    const ctx = hourCtx({ firstAdventureCompleted: true, sessionId: 'sess-9', nowMs: T0 + 90 * DAY });
    expect(decideUpsell(ctx, [accepted]).suppressedBy).toBe('already_accepted');
  });

  it('頻度制限は条件より先に見る（出せない状況を「出した」と数えない）', () => {
    // 条件を満たしていない かつ セッション上限にも達している場合、
    // 記録される抑制理由は上限側になる
    const d = decideUpsell(hourCtx(), [shown()]);
    expect(d.suppressedBy).toBe('session_cap');
  });
});

describe('§13 1か月 → 6か月：利用開始直後には出さない', () => {
  it('始めたばかりでは出ない', () => {
    expect(decideUpsell(monthCtx({ activeDays: 1 }), []).show).toBe(false);
    expect(decideUpsell(monthCtx({ activeDays: 6 }), []).show).toBe(false);
  });

  it('7日以上使っていれば出る', () => {
    const d = decideUpsell(monthCtx({ activeDays: 7 }), []);
    expect(d.show).toBe(true);
    expect(d.targetPlanId).toBe('coach-6m');
  });

  it('同じ苦手が繰り返されているときに出る', () => {
    expect(decideUpsell(monthCtx({ repeatedWeaknessCount: 3 }), []).show).toBe(true);
    expect(decideUpsell(monthCtx({ repeatedWeaknessCount: 2 }), []).show).toBe(false);
  });

  it('試験を目標にしている人には出る', () => {
    expect(decideUpsell(monthCtx({ examGoalDeclared: true }), []).show).toBe(true);
  });

  it('複数技能に弱点があるときに出る', () => {
    expect(decideUpsell(monthCtx({ weakSkillCount: 2 }), []).show).toBe(true);
    expect(decideUpsell(monthCtx({ weakSkillCount: 1 }), []).show).toBe(false);
  });

  it('本人が人への相談を希望したら出る', () => {
    expect(decideUpsell(monthCtx({ humanHelpRequested: true }), []).show).toBe(true);
  });

  it('6か月コース中の人にはアップセルが無い（行き止まりにしない・売り先が無い）', () => {
    const d = decideUpsell(hourCtx({ currentPlanId: 'coach-6m' }), []);
    expect(d.show).toBe(false);
    expect(d.suppressedBy).toBe('no_rule');
  });
});

describe('文言（§12 §13）', () => {
  it('60分→1か月は「続きがそのまま使える」を中心にする', () => {
    for (const lang of ['ja', 'zh'] as const) {
      const c = upsellCopy('ai-month', lang);
      const text = [c.heading, ...c.points].join('\n');
      expect(text).toMatch(lang === 'zh' ? /进度/ : /進捗/);
      expect(text).toMatch(lang === 'zh' ? /不需要重新测评/ : /診断のやり直しはありません/);
    }
  });

  it('値引きで釣らない', () => {
    for (const target of ['ai-month', 'coach-6m'] as const) {
      for (const lang of ['ja', 'zh'] as const) {
        const c = upsellCopy(target, lang);
        const text = [c.heading, ...c.points, c.acceptLabel, c.dismissLabel].join('\n');
        for (const w of BANNED_UPSELL_WORDS) {
          expect(text.includes(w), `${target}/${lang} に「${w}」`).toBe(false);
        }
      }
    }
  });

  it('「今はしない」を必ず明確に出す（§12）', () => {
    for (const target of ['ai-month', 'coach-6m'] as const) {
      for (const lang of ['ja', 'zh'] as const) {
        expect(upsellCopy(target, lang).dismissLabel.length).toBeGreaterThan(0);
      }
    }
    expect(upsellCopy('ai-month', 'ja').dismissLabel).toBe('今はしない');
    expect(upsellCopy('coach-6m', 'ja').dismissLabel).toBe('AI学習を続ける');
  });

  it('6か月は即時購入ではなく相談申込へつなげる（§13）', () => {
    expect(upsellCopy('coach-6m', 'ja').acceptIsConsultation).toBe(true);
    expect(upsellCopy('coach-6m', 'ja').acceptLabel).toContain('相談');
    expect(upsellCopy('coach-6m', 'zh').acceptLabel).toContain('咨询');
    // 1か月は購入導線でよい
    expect(upsellCopy('ai-month', 'ja').acceptIsConsultation).toBe(false);
  });

  it('§13 の訴求内容を落とさない（方針修正・原因分析・試験戦略・会話練習）', () => {
    const points = upsellCopy('coach-6m', 'ja').points.join('\n');
    for (const w of ['学習方針の修正', '苦手原因の分析', 'JLPT試験戦略', '重要な会話練習']) {
      expect(points).toContain(w);
    }
  });
});

describe('表示の記録', () => {
  it('出したら記録が作られる（頻度制限の根拠になる）', () => {
    const ctx = hourCtx({ firstAdventureCompleted: true });
    const rec = recordImpression(hourRule, ctx);
    expect(rec.ruleId).toBe(hourRule.id);
    expect(rec.sessionId).toBe('sess-1');
    expect(rec.outcome).toBe('shown');
    // その記録で、同じセッションの2回目が止まる
    expect(decideUpsell(ctx, [rec]).suppressedBy).toBe('session_cap');
  });
});
