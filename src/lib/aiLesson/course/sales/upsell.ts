// アップセルの提示判断（§12 §13）。**純関数**。
//
// この層の存在理由は「売らないこと」を仕様として書けるようにすること。
//
//   - 購入直後には出さない。**価値を体験したあとの条件しか用意しない**
//   - 同じセッションで2回出さない
//   - 閉じられたら一定期間出さない
//   - 生涯の上限がある（無限に出る経路を作らない）
//   - 値引きで釣らず、「続きがそのまま使える」ことを言う
//
// 表示側の都合ではなく、ここが唯一の判断者。
// componentが自前で「そろそろ出そう」と決める経路を作らない。

import {
  salesPlanById, type SalesPlanId, type UpsellRule, type UpsellTriggerRule,
} from './planConfig';

/** 判断に使う、学習者の今の状態 */
export interface UpsellContext {
  sessionId: string;
  nowMs: number;

  /** 今持っている主プラン */
  currentPlanId: SalesPlanId;

  // ── 60分 → 1か月 の判断材料（§12） ──
  firstAdventureCompleted: boolean;
  /** 累計で使ったアクティブ分数 */
  activeMinutesUsed: number;
  /** 残りアクティブ分数 */
  remainingMinutes: number;
  entitlementExhausted: boolean;

  // ── 1か月 → 6か月 の判断材料（§13） ──
  /** 学習した日数 */
  activeDays: number;
  /** 同じ苦手が繰り返し出ている回数 */
  repeatedWeaknessCount: number;
  /** N2/N3合格を目標に選んでいるか */
  examGoalDeclared: boolean;
  /** 弱点のある技能の数 */
  weakSkillCount: number;
  /** 本人が人への相談を希望した */
  humanHelpRequested: boolean;
}

export type ImpressionOutcome = 'shown' | 'dismissed' | 'accepted';

export interface UpsellImpression {
  ruleId: string;
  sessionId: string;
  shownAtMs: number;
  outcome: ImpressionOutcome;
}

export type UpsellSuppression =
  | 'no_rule'              // このプランにアップセルが無い
  | 'no_trigger'           // まだ価値を体験していない
  | 'session_cap'          // このセッションでは出し終えた
  | 'cooldown'             // 閉じられた直後
  | 'lifetime_cap'         // 生涯の上限
  | 'already_accepted';    // すでに受け入れている

export interface UpsellDecision {
  show: boolean;
  rule: UpsellRule | null;
  targetPlanId: SalesPlanId | null;
  /** どの条件で出したか（分析と、あとから「なぜ出たか」を説明するため） */
  matchedTrigger: UpsellTriggerRule | null;
  suppressedBy: UpsellSuppression | null;
}

const DAY_MS = 86_400_000;

const suppressed = (by: UpsellSuppression): UpsellDecision =>
  ({ show: false, rule: null, targetPlanId: null, matchedTrigger: null, suppressedBy: by });

/** 条件を満たしているか。しきい値の意味は kind ごとに違う */
const triggerMet = (t: UpsellTriggerRule, c: UpsellContext): boolean => {
  switch (t.kind) {
    case 'first_adventure_completed': return c.firstAdventureCompleted;
    case 'active_minutes_reached':    return c.activeMinutesUsed >= (t.threshold ?? 0);
    // 残りが少ないことを条件にするのは、使い切ってから初めて気づくのを避けるため。
    // ただし「まだ1分も使っていない」状態は除く（買った直後に出さない）
    case 'remaining_minutes_below':   return c.activeMinutesUsed > 0 && c.remainingMinutes <= (t.threshold ?? 0);
    case 'entitlement_exhausted':     return c.entitlementExhausted;
    case 'active_days_reached':       return c.activeDays >= (t.threshold ?? 0);
    case 'repeated_weakness':         return c.repeatedWeaknessCount >= (t.threshold ?? 0);
    case 'exam_goal_declared':        return c.examGoalDeclared;
    case 'multi_skill_weakness':      return c.weakSkillCount >= (t.threshold ?? 0);
    case 'human_help_requested':      return c.humanHelpRequested;
    default:                          return false;
  }
};

/**
 * 今アップセルを出してよいかを決める。
 *
 * 順序が大事。**まず頻度制限を見て、そのあとに条件を見る**。
 * 逆にすると「条件は満たしたが上限だった」ケースで
 * 分析上は出したことになってしまい、実態とずれる。
 */
export const decideUpsell = (
  ctx: UpsellContext,
  impressions: UpsellImpression[],
): UpsellDecision => {
  const plan = salesPlanById(ctx.currentPlanId);
  const rule = plan?.upsellRules[0] ?? null;
  if (!rule) return suppressed('no_rule');

  const mine = impressions.filter((i) => i.ruleId === rule.id);

  if (mine.some((i) => i.outcome === 'accepted')) return suppressed('already_accepted');
  if (mine.length >= rule.maxLifetime) return suppressed('lifetime_cap');
  if (mine.filter((i) => i.sessionId === ctx.sessionId).length >= rule.maxPerSession) {
    return suppressed('session_cap');
  }

  // 「今はしない」を押されたあとの冷却期間
  const lastDismissed = mine
    .filter((i) => i.outcome === 'dismissed')
    .reduce((max, i) => Math.max(max, i.shownAtMs), 0);
  if (lastDismissed > 0 && ctx.nowMs - lastDismissed < rule.cooldownDays * DAY_MS) {
    return suppressed('cooldown');
  }

  const matched = rule.triggers.find((t) => triggerMet(t, ctx)) ?? null;
  if (!matched) return suppressed('no_trigger');

  return { show: true, rule, targetPlanId: rule.targetPlanId, matchedTrigger: matched, suppressedBy: null };
};

// ─────────────────────────────────────────────────────────
// 文言
// ─────────────────────────────────────────────────────────

export interface UpsellCopy {
  heading: string;
  /** 「続きがそのまま使える」を中心にした訴求（§12） */
  points: string[];
  acceptLabel: string;
  /** 「今はしない」を明確に出す（§12） */
  dismissLabel: string;
  /** 6か月は購入ではなく相談へ（§13） */
  acceptIsConsultation: boolean;
}

export const upsellCopy = (targetPlanId: SalesPlanId, lang: 'ja' | 'zh'): UpsellCopy => {
  if (targetPlanId === 'ai-month') {
    return lang === 'zh'
      ? {
          heading: '想接着这样继续下去吗',
          points: [
            '现在的学习进度会直接延续，不需要重新测评',
            '复习的安排会保留下来',
            '可以继续走1个月的攻略路线',
            'AI对话和每周报告也会继续',
          ],
          acceptLabel: '查看1个月计划',
          dismissLabel: '现在不用',
          acceptIsConsultation: false,
        }
      : {
          heading: 'このまま続けますか',
          points: [
            '今の進捗をそのまま引き継げます。診断のやり直しはありません',
            '復習の予定が残ります',
            '1か月の攻略ルートを続けられます',
            'AI会話と週次レポートも続きます',
          ],
          acceptLabel: '1か月プランを見る',
          dismissLabel: '今はしない',
          acceptIsConsultation: false,
        };
  }

  // 6か月伴走。§13 の文面に沿う。即時購入を強制せず相談へ
  return lang === 'zh'
    ? {
        heading: '通过AI学习，卡住的地方开始看得见了',
        points: [
          '在6个月陪伴课程中，老师会看着这些记录一起进行：',
          '学习方向的调整',
          '卡住原因的分析',
          'JLPT应试策略',
          '重要场景的会话练习',
        ],
        acceptLabel: '咨询陪伴课程',
        dismissLabel: '继续AI学习',
        acceptIsConsultation: true,
      }
    : {
        heading: 'AI学習で、苦手な場所が見えてきました',
        points: [
          '6か月伴走では、先生がこの記録を見ながら一緒に行います：',
          '学習方針の修正',
          '苦手原因の分析',
          'JLPT試験戦略',
          '重要な会話練習',
        ],
        acceptLabel: '伴走コースについて相談する',
        dismissLabel: 'AI学習を続ける',
        acceptIsConsultation: true,
      };
};

/** 表示を記録する（頻度制限の根拠になるので、出したら必ず残す） */
export const recordImpression = (
  rule: UpsellRule,
  ctx: UpsellContext,
  outcome: ImpressionOutcome = 'shown',
): UpsellImpression =>
  ({ ruleId: rule.id, sessionId: ctx.sessionId, shownAtMs: ctx.nowMs, outcome });

/** 値引きで釣っていないかの検査に使う語 */
export const BANNED_UPSELL_WORDS: readonly string[] = [
  '割引', '値引き', 'お得', '安く', '半額', 'キャンペーン', '特典', '今なら', '今だけ',
  '折扣', '优惠', '便宜', '半价', '活动', '赠品', '仅限',
] as const;
