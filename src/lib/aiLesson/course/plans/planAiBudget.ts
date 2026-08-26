// プランごとのAI利用枠と、その枠が赤字にならないかの検算（2026-08-23 CEO指示）。
//
// なぜ要るか:
//   「1か月使い放題」のまま売ると、上限まで使われた月は原価が売値を超える。
//   実測 $8.11/時間（ai_usage_daily の累計 $9.25 ÷ 1.14時間）。従来の上限（月6時間）は
//   原価 $48 で、1か月プランの売値を超えていた＝**使われるほど赤字**だった。
//
// 設計の考え方（CEO指示そのまま）:
//   「AI会話を全部ずっとできる状態ではなくて、1日にできる数に制限をかけて、
//     それ以外の冒険やテストなどコストがかからないところで楽しませたい」
//   → 高いのは**音声会話だけ**（gpt-realtime）。テキスト会話は gpt-4o-mini で約1/300、
//     冒険・バトル・模試・答案は端末内で完結して原価ゼロ。
//   → 音声だけを希少にし、それ以外は広く開ける。
//
// **このファイルの本体は下の PLAN_AI_BUDGETS ではなく、planAiBudget.test.ts の検算。**
// 枠を緩めたり値下げしたりすると、テストが落ちて出荷できない。人の注意力に頼らない。

import { planById, type PlanId } from './planCatalog';
import { REALTIME_COST } from '../courseConfig';

/* ────────────────────────────────────────────────────────────
   原価のモデル
   ──────────────────────────────────────────────────────────── */

/**
 * 音声会話の1分あたり原価（USD）。単価は courseConfig の REALTIME_COST から導く
 * （二重管理しない）。モデル値 $0.1344/分＝$8.06/時間は、本番実測 $8.11/時間と一致する。
 */
export const VOICE_USD_PER_MINUTE =
  (REALTIME_COST.approxInputTokensPerMin * REALTIME_COST.inputPerMillion
    + REALTIME_COST.approxOutputTokensPerMin * REALTIME_COST.outputPerMillion) / 1_000_000;

/**
 * テキスト会話1回ぶんの原価（USD）。gpt-4o-mini（$0.15/$0.60 per 1M）で
 * 10往復＋会話後レポート1本を見込んだ概算。音声の約1/300。
 */
export const TEXT_USD_PER_SESSION = 0.004;

/**
 * 見積りに掛ける安全率。文字起こし（gpt-4o-transcribe）・会話後レポート・
 * 再接続ぶんなど、上の2つに入れていない小口を吸収する。
 */
export const COST_SAFETY_MARGIN = 1.2;

/**
 * 円換算レート。**円安側に倒した固定値**を使う。
 * 実レートで計算すると、円安が進んだ月に黙って赤字へ入る。
 */
export const JPY_PER_USD = 155;

/** 音声会話1回の最長（秒）。DEFAULT_USAGE_LIMITS.session_max_seconds と同じ値 */
export const VOICE_SESSION_MAX_SECONDS = 240;

/* ────────────────────────────────────────────────────────────
   プランごとの枠
   ──────────────────────────────────────────────────────────── */

export interface PlanAiBudget {
  planId: PlanId;
  /** 利用期間ぜんぶで使える音声会話の回数。学習者に見せるのはこの数字 */
  voiceSessionsTotal: number;
  /** 1日に使える音声会話の回数（総枠を1日で燃やさせないための副次ガード） */
  voiceSessionsPerDay: number;
  /** 1日に使えるテキスト会話の回数。原価がほぼ無いので広く取る */
  textSessionsPerDay: number;
  /**
   * この商品で許すAI原価の対売上比。**商品ごとに違ってよい**。
   * 体験パスは集客商品なので高め、伴走コースは人件費が主なので低め。
   */
  maxAiCostRatio: number;
  /** なぜこの数字なのか。数字だけ残すと、次に触る人が根拠なく動かす */
  rationale: string;
}

/**
 * 冒険・文法バトル・ミニ模試・答案用紙・復習は**この枠の外**（原価ゼロ）。
 * 音声の枠を使い切っても、学習を続けられる状態を必ず残す。
 */
export const PLAN_AI_BUDGETS: Record<PlanId, PlanAiBudget> = {
  'ai-trial-pass': {
    planId: 'ai-trial-pass',
    voiceSessionsTotal: 3,
    // 2026-08-26（日数制へ移行）: 3→2。合計3回は変えず、初日に使い切って
    // 翌日の復習＝この商品の中心に出会えないのを防ぐための配分
    voiceSessionsPerDay: 2,
    // 10→5。テキストは1日あたりの上限しかないので、7日化で原価が伸びる。
    // 10のままだと原価率58.7%（上限60%まで余裕¥8）、5なら54.3%
    textSessionsPerDay: 5,
    maxAiCostRatio: 0.60,
    rationale:
      '集客商品。ここは原価率が高くてよい（買ってもらうための費用）。'
      + '60分の枠のあいだに音声3回＝最大12分。残りはテキスト会話と冒険で埋める。',
  },
  'ai-month': {
    planId: 'ai-month',
    voiceSessionsTotal: 10,
    voiceSessionsPerDay: 2,
    textSessionsPerDay: 8,
    maxAiCostRatio: 0.45,
    rationale:
      '音声10回（最大40分）で原価は上限でも売値の4割。'
      + '従来の「月6時間」は原価が売値を超え、上限まで使われると赤字だった。'
      + '毎日の練習はテキスト会話と冒険が受け持つ。',
  },
  'coach-6m': {
    planId: 'coach-6m',
    voiceSessionsTotal: 180,      // 6か月＝月30回＝ほぼ毎日1回
    voiceSessionsPerDay: 3,
    textSessionsPerDay: 8,
    maxAiCostRatio: 0.30,
    rationale:
      '原価の主役は人間レッスン24回なので、AIは控えめに置く。'
      + '月30回＝ほぼ毎日1回できる枠で、上限でも原価は約19,000円（19%）。',
  },
};

export const aiBudgetFor = (planId: PlanId): PlanAiBudget => {
  const b = PLAN_AI_BUDGETS[planId];
  if (!b) throw new Error(`unknown plan: ${planId}`);
  return b;
};

/* ────────────────────────────────────────────────────────────
   検算
   ──────────────────────────────────────────────────────────── */

/** 日数固定でないプラン（6か月コース）の想定日数。原価の見積りにだけ使う */
export const ASSUMED_DAYS_WHEN_UNSET = 180;

export interface PlanEconomics {
  planId: PlanId;
  priceJpy: number | null;
  /** 枠を上限まで使われたときのAI原価（USD・安全率込み） */
  worstCaseUsd: number;
  worstCaseJpy: number;
  /** 対売上比。price が null（未定）なら null */
  costRatio: number | null;
  /** 上限まで使われても黒字が残るか */
  profitable: boolean;
  /** 内訳（説明用） */
  breakdown: { voiceUsd: number; textUsd: number; days: number };
}

/**
 * 「上限まで使われた」ときの原価を出す。**平均ではなく最悪値**で見る。
 * 平均で設計すると、いちばん熱心な生徒がいちばん損をさせる形になる。
 */
export const planEconomics = (planId: PlanId): PlanEconomics => {
  const plan = planById(planId);
  if (!plan) throw new Error(`unknown plan: ${planId}`);
  const b = aiBudgetFor(planId);
  /**
   * 何日ぶん使われうるか。
   *
   * accessDays は「いつまでに開始できるか」の期限であって、使える日数ではない。
   * ここを取り違えると、実際には起こりえない原価を積んで商品を殺す
   * （最初の実装がそれで、体験パスが原価率87%と出た）。
   *
   * 優先順:
   *   trialDays            … 日数制の体験（2026-08-26〜。開始から7日）
   *   realtimeWindowMinutes … 実時間制の体験（2026-08-20〜08-26 の旧仕様）
   *   accessDays           … 通常プラン（購入日から暦日で数える商品）
   *
   * ⚠️ 音声は合計回数で頭打ちだが、**テキストは1日あたりの上限しかない**。
   * つまり期間を伸ばすとテキストぶんの原価は伸びる。日数を正しく入れること。
   */
  const days = plan.trialDays != null
    ? plan.trialDays
    : plan.realtimeWindowMinutes !== null
      ? plan.realtimeWindowMinutes / (24 * 60)
      : (plan.accessDays ?? ASSUMED_DAYS_WHEN_UNSET);

  const voiceMinutes = b.voiceSessionsTotal * (VOICE_SESSION_MAX_SECONDS / 60);
  const voiceUsd = voiceMinutes * VOICE_USD_PER_MINUTE;
  const textUsd = b.textSessionsPerDay * days * TEXT_USD_PER_SESSION;
  const worstCaseUsd = (voiceUsd + textUsd) * COST_SAFETY_MARGIN;
  const worstCaseJpy = worstCaseUsd * JPY_PER_USD;

  const priceJpy = plan.priceJpy;
  const costRatio = priceJpy === null || priceJpy === 0 ? null : worstCaseJpy / priceJpy;

  return {
    planId,
    priceJpy,
    worstCaseUsd,
    worstCaseJpy,
    costRatio,
    profitable: costRatio === null ? false : costRatio < 1,
    breakdown: { voiceUsd, textUsd, days },
  };
};
