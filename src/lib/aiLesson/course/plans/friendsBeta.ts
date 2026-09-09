/**
 * Friends Beta（2026-09-09 P1-4）と100人チャレンジ（P1-7）の原価モデル。
 *
 * 【この module が答える問い】
 * 「100人に1か月無料で配って、AIの可変費を¥10,000以内に収められるか」
 *
 * 【いちばん大事な前置き】
 * ここで出す金額は **推定であって実請求ではない**。
 * 音声会話はブラウザが OpenAI へ直接つなぐので、こちら側は usage を受け取れず、
 * 取れるのは分数だけ。だから金額は必ず「分数 × 仮定した単価」になる。
 * （2026-08-24 の監査で、この推定値を「実測」と呼んでいた循環参照が見つかっている。
 *   同じ間違いを繰り返さないため、型でも `estimated` と名前を付ける）
 * 実請求との突合は scripts/ai-course/reconcile-openai-cost.mjs。
 *
 * 単価は planAiBudget / aiModelPricing の1か所から取る（ここで数字を作らない）。
 */

import {
  VOICE_USD_PER_MINUTE, TEXT_USD_PER_SESSION, COST_SAFETY_MARGIN,
  JPY_PER_USD, VOICE_SESSION_MAX_SECONDS,
} from './planAiBudget';

/** Friends Beta の受講権に付ける plan_id。カタログ商品ではない（売り物ではない） */
export const FRIENDS_BETA_PLAN_ID = 'friends-beta';
/** ai_course_access.source に入れる値 */
export const FRIENDS_BETA_SOURCE = 'friends_beta';
/** 無料で使える日数 */
export const FRIENDS_BETA_DAYS = 30;

/**
 * Friends Beta の会話枠。migration 20260909120000 が ai_config へ入れる値と同じ。
 * ズレたら friendsBeta.test.ts が落ちる。
 */
export const FRIENDS_BETA_BUDGET = {
  voiceSessionsTotal: 3,
  voiceSessionsPerDay: 1,
  textSessionsPerDay: 3,
} as const;

/** 音声会話1回（上限4分）の原価（USD・推定） */
export const voiceUsdPerSession = (): number =>
  VOICE_USD_PER_MINUTE * (VOICE_SESSION_MAX_SECONDS / 60);

/** 円に直す。**円安側に倒した固定レート**を使う（実レートだと円安の月に黙って赤字へ入る） */
export const toJpy = (usd: number): number => Math.round(usd * JPY_PER_USD);

export interface UsageAssumption {
  /** 招待した人のうち、実際に学習を始める割合（0〜1） */
  activationRate: number;
  /** 始めた人が30日で行う音声会話の回数 */
  voiceSessionsPerActive: number;
  /** その1回あたりの平均の長さ（分） */
  voiceMinutesPerSession: number;
  /** 始めた人が30日で行うテキスト会話の回数 */
  textSessionsPerActive: number;
}

export interface Scenario {
  key: 'low' | 'expected' | 'high';
  labelJa: string;
  /** なぜこの仮定なのか。実測に基づくものは出どころを書く */
  basisJa: string;
  assumption: UsageAssumption;
}

/**
 * 本番の実測（2026-09-09 時点）。
 *   ・受講権13件のうち会話を1回でも始めたのは6人（46%）
 *   ・会話は51回・合計4,124秒＝1回あたり平均80.9秒（voiceだけなら108.6秒＝1.81分）
 *   ・voice 33回 / text 18回
 * 「始めた6人」の1人あたりは voice 5.5回・text 3.0回だが、これは**開講から通算**で、
 * 30日ぶんではない。だから expected では控えめに置く。
 */
export const OBSERVED = {
  grantedAccounts: 13,
  startedAccounts: 6,
  activationRate: 6 / 13,
  voiceSessions: 33,
  textSessions: 18,
  avgVoiceMinutes: 108.6 / 60,
} as const;

export const SCENARIOS: Scenario[] = [
  {
    key: 'low',
    labelJa: '低め（配っても半分も始めない）',
    basisJa: '実測の起動率46%より少し低い40%。始めた人も音声1回・テキスト3回で止まる',
    assumption: {
      activationRate: 0.40,
      voiceSessionsPerActive: 1,
      voiceMinutesPerSession: OBSERVED.avgVoiceMinutes,
      textSessionsPerActive: 3,
    },
  },
  {
    key: 'expected',
    labelJa: '見込み（いまの使われ方が続く）',
    basisJa: '実測の起動率46%・音声1回108.6秒。始めた人は30日で音声2回・テキスト8回',
    assumption: {
      activationRate: OBSERVED.activationRate,
      voiceSessionsPerActive: 2,
      voiceMinutesPerSession: OBSERVED.avgVoiceMinutes,
      textSessionsPerActive: 8,
    },
  },
  {
    key: 'high',
    labelJa: '高め（全員が枠を使い切る）',
    basisJa: '起動率100%・音声3回すべてを上限4分まで・テキストは30日で60回',
    assumption: {
      activationRate: 1,
      voiceSessionsPerActive: FRIENDS_BETA_BUDGET.voiceSessionsTotal,
      voiceMinutesPerSession: VOICE_SESSION_MAX_SECONDS / 60,
      textSessionsPerActive: 60,
    },
  },
];

export interface CostEstimate {
  usdPerInvited: number;
  jpyPerInvited: number;
  usdTotal: number;
  jpyTotal: number;
  /** 予算に対する割合（1.0 = ちょうど使い切る） */
  ratioToBudget: number;
  withinBudget: boolean;
}

/**
 * 1人あたり・総額の推定。安全率（COST_SAFETY_MARGIN）を必ず掛ける
 * ——文字起こし・再接続・見積りに入れていない小口を吸収するため。
 */
export const estimateCost = (
  a: UsageAssumption, people: number, budgetJpy: number,
): CostEstimate => {
  const perActiveUsd =
    a.voiceSessionsPerActive * a.voiceMinutesPerSession * VOICE_USD_PER_MINUTE
    + a.textSessionsPerActive * TEXT_USD_PER_SESSION;
  const usdPerInvited = perActiveUsd * a.activationRate * COST_SAFETY_MARGIN;
  const usdTotal = usdPerInvited * people;
  const jpyTotal = toJpy(usdTotal);
  return {
    usdPerInvited,
    jpyPerInvited: toJpy(usdPerInvited),
    usdTotal,
    jpyTotal,
    ratioToBudget: budgetJpy > 0 ? jpyTotal / budgetJpy : 0,
    withinBudget: jpyTotal <= budgetJpy,
  };
};

/** 3シナリオまとめて */
export const estimateScenarios = (people: number, budgetJpy: number) =>
  SCENARIOS.map((s) => ({ ...s, estimate: estimateCost(s.assumption, people, budgetJpy) }));

/**
 * いまの消化額から、あと何人まで招待できるか（見込みシナリオで割る）。
 * **残席は席数ではなく「お金」で決まる**ので、招待を止める判断はここを見る。
 */
export const seatsAffordable = (
  spentJpy: number, budgetJpy: number, people = 100,
): number => {
  const expected = SCENARIOS.find((s) => s.key === 'expected')!;
  const perInvited = estimateCost(expected.assumption, people, budgetJpy).jpyPerInvited;
  if (perInvited <= 0) return 0;
  return Math.max(0, Math.floor((budgetJpy - spentJpy) / perInvited));
};

export type GuardLevel = 'ok' | 'warn70' | 'warn85' | 'over';

/**
 * 予算の使いかた警告（F-1 Cost Guard）。
 * **100%でも既存の利用者を自動で止めない。** 止めるのは「新しい招待の発行」だけで、
 * すでに始めた人の1か月を途中で奪うことはしない（それをやると信用がいちばん壊れる）。
 */
export const guardLevel = (spentJpy: number, budgetJpy: number): GuardLevel => {
  if (budgetJpy <= 0) return 'ok';
  const pct = (spentJpy / budgetJpy) * 100;
  if (pct >= 100) return 'over';
  if (pct >= 85) return 'warn85';
  if (pct >= 70) return 'warn70';
  return 'ok';
};

export const GUARD_MESSAGE: Record<GuardLevel, { ja: string; action: string }> = {
  ok: { ja: '予算内で回っています。', action: '招待を続けて構いません。' },
  warn70: {
    ja: '予算の70%を超えました。',
    action: '残り席数を確認して、招待のペースを落とすか予算を見直してください。',
  },
  warn85: {
    ja: '予算の85%を超えました。',
    action: '新しい招待はいったん止めるのが安全です。いま使っている人はそのまま続けられます。',
  },
  over: {
    ja: '予算を使い切りました。',
    action: '新しい招待の発行を止めてください。**いま使っている人の1か月は止めません**（途中で奪わない）。'
      + '続けるなら予算を積み増すか、音声の枠を減らすかを決めてください。',
  },
};
