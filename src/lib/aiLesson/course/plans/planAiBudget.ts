// プランごとのAI利用枠と、その枠が赤字にならないかの検算（2026-08-23 CEO指示）。
//
// なぜ要るか:
//   「1か月使い放題」のまま売ると、上限まで使われた月は原価が売値を超える。
//   従来の上限（月6時間）は原価 $48 で、1か月プランの売値を超えていた
//   ＝**使われるほど赤字**だった。
//
// 設計の考え方（CEO指示そのまま）:
//   「AI会話を全部ずっとできる状態ではなくて、1日にできる数に制限をかけて、
//     それ以外の冒険やテストなどコストがかからないところで楽しませたい」
//   → 高いのは**音声会話だけ**（gpt-realtime）。テキスト会話は gpt-4o-mini で約1/14、
//     冒険・バトル・模試・答案は端末内で完結して原価ゼロ。
//   → 音声だけを希少にし、それ以外は広く開ける。
//
// **このファイルの本体は下の PLAN_AI_BUDGETS ではなく、planAiBudget.test.ts の検算。**
// 枠を緩めたり値下げしたりすると、テストが落ちて出荷できない。人の注意力に頼らない。
//
// ── 2026-08-24 WAVE 4-4 の訂正 ────────────────────────────────
// このファイルは以前ここに「実測 $8.11/時間（ai_usage_daily の累計 $9.25 ÷ 1.14時間）」と
// 書いていた。**それは実測ではなかった。**
//   ai_usage_daily.estimated_cost_usd を作っている式は estimateSessionCost(sec) で、
//   中身は「分数 × $0.1344」。その出力を時間で割り戻して $8.11 と呼んでいた＝循環参照。
//   バックアップ実データも 441秒 → $0.98784（= 441/60 × 0.1344）で誤差ゼロ、つまり式の出力。
//   OpenAI の実請求とは一度も突き合わせていない。
// → 「実測」の記述を全部消した。単価は aiModelPricing の1か所に集め、
//   出典（repo / list / derived）を単価ごとに書いた。実請求との突合は
//   scripts/ai-course/reconcile-openai-cost.mjs で行い、突合できた値だけを
//   ai_usage_events.source='billed' として残す。
// ────────────────────────────────────────────────────────────

import { planById, type PlanId } from './planCatalog';
import { costUsdForTokens, realtimeUsdPerMinute, DEFAULT_REALTIME_MODEL } from '../aiModelPricing';

/* ────────────────────────────────────────────────────────────
   原価のモデル
   ──────────────────────────────────────────────────────────── */

/**
 * 音声会話の1分あたり原価（USD）。単価は aiModelPricing の1か所から導く（二重管理しない）。
 * 値は $0.1344/分＝$8.06/時間。**これは実測ではなくモデル値**（1分あたりのトークン数を
 * 仮定して単価を掛けたもの）。音声は WebRTC でブラウザが OpenAI へ直接つなぐため、
 * こちら側では usage を受け取れず、取れるのは分数だけ。だから必ず推定になる。
 */
export const VOICE_USD_PER_MINUTE = realtimeUsdPerMinute(DEFAULT_REALTIME_MODEL);

/**
 * テキスト会話で実際に走るモデル。**env（AI_LESSON_CHAT_MODEL）で差し替えられる。**
 * ここを gpt-4o にすると原価は 16.67 倍（2.50/0.15 = 10/0.60）になる。
 * planAiBudget.test.ts が Edge Function のソースを読んで、既定値がこの想定と
 * 一致していることを固定する（黙って高いモデルへ動かせないようにする）。
 */
export const ASSUMED_TEXT_MODEL = 'gpt-4o-mini';

/**
 * テキスト会話1回で流れるトークン数の**上限側の見積り**。
 * 魔法の数字を置かず、Edge Function 自身のガード定数から積み上げる
 * （= サーバーが物理的に許す最大。学習者がどう頑張ってもこれを超えられない）。
 *
 * 出典はすべて supabase/functions/ 配下のソース:
 *   - maxTurns 既定 8 / 上限 10        … ai-lesson-chat/index.ts MAX_TURNS_CAP
 *   - 出力 300 tokens/ターン           … ai-lesson-chat/index.ts MAX_OUTPUT_TOKENS
 *   - 履歴 16件 × 300字                … ai-lesson-chat/index.ts MAX_HISTORY_MSGS / MAX_MSG_CHARS
 *   - 学習者入力 500字                 … ai-lesson-chat/index.ts MAX_INPUT_CHARS
 *   - system prompt 約2,400字          … 同ファイルの sys 配列（実測の文字数）
 *   - レポート 入力60発話×200字 / 出力700 … ai-lesson-report/index.ts の slice と max_tokens
 * 日本語は概ね 1文字 ≒ 1トークンとして数える（かな漢字は英語より token/char が高い側）。
 */
export const TEXT_SESSION_TOKENS = {
  turnsPerSession: 8,
  systemPromptTokens: 2400,
  historyTokensPerMessage: 300,
  studentInputTokens: 500,
  outputTokensPerTurn: 300,
  reportInputTokens: 13500,   // 60発話 × 200字 + プロンプト約1,500
  reportOutputTokens: 700,
} as const;

/**
 * テキスト会話1回ぶんの入出力トークン数。
 * 履歴は毎ターン増えるので、ターンごとに積む（最終ターンだけ満杯という形を再現する）。
 */
export const textSessionTokenCounts = (): { inputTokens: number; outputTokens: number } => {
  const t = TEXT_SESSION_TOKENS;
  let input = 0;
  for (let turn = 1; turn <= t.turnsPerSession; turn += 1) {
    // turn 1 は履歴なし。以降は「学習者+先生」で2件ずつ増える
    const historyMsgs = Math.min((turn - 1) * 2, 16);
    input += t.systemPromptTokens + historyMsgs * t.historyTokensPerMessage + t.studentInputTokens;
  }
  return {
    inputTokens: input + t.reportInputTokens,
    outputTokens: t.turnsPerSession * t.outputTokensPerTurn + t.reportOutputTokens,
  };
};

/**
 * テキスト会話1回ぶんの原価（USD）。**単価表 × 上のトークン見積り**から出す。
 *
 * 以前はここが `0.004` という直書きだった。どのモデルの何トークンぶんなのか
 * 書かれておらず、検算のしようがなかった（そして実際 2.5 倍ずれていた）。
 */
export const textUsdPerSession = (model: string = ASSUMED_TEXT_MODEL): number =>
  costUsdForTokens(model, textSessionTokenCounts());

export const TEXT_USD_PER_SESSION = textUsdPerSession();

/**
 * サーバーが物理的に許す**絶対上限**（毎ターン履歴が満杯だった場合）。
 * 「この値を超える数字は gpt-4o-mini の実利用としてありえない」という判定に使う。
 */
export const textUsdPerSessionCeiling = (model: string = ASSUMED_TEXT_MODEL): number => {
  const t = TEXT_SESSION_TOKENS;
  const perTurnInput = t.systemPromptTokens + 16 * t.historyTokensPerMessage + t.studentInputTokens;
  return costUsdForTokens(model, {
    inputTokens: t.turnsPerSession * perTurnInput + t.reportInputTokens,
    outputTokens: t.turnsPerSession * t.outputTokensPerTurn + t.reportOutputTokens,
  });
};

/**
 * 監査（docs/ai-course/audit/GROWTH_FUNNEL_AUDIT.md:180）が「テキスト会話1回（6ターン）」
 * として載せた数字。**根拠がリポジトリのどこにも無い。**
 *
 * 上の textUsdPerSessionCeiling()（gpt-4o-mini の絶対上限・8ターン）より大きいので、
 * これは gpt-4o-mini のトークン実測ではありえない。考えられるのは:
 *   (a) 実際に走っていたモデルが gpt-4o-mini ではなかった（env 差し替え。gpt-4o なら16.67倍）
 *   (b) トークン実測ではなく手計算の見積りだった
 * **どちらなのかは、当時の記録にモデル名が無いので分からない。**
 * これを分かるようにするのが今回の ai_usage_events（model 列と source 列）。
 */
export const AUDIT_REPORTED_TEXT_USD_PER_SESSION = 0.069;

/**
 * 見積りに掛ける安全率。文字起こし（gpt-4o-transcribe）・再接続ぶん・
 * 上のトークン見積りに入れていない小口を吸収する。
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
 * プランが「上限まで使われうる日数」。realtime 制のプランは実時間で終わる。
 *
 * 優先順は trialDays > realtimeWindowMinutes > accessDays。
 * **planEconomics と同じ計算をここに書かない**（2026-08-28）。
 * 統合の際、planEconomics だけが trialDays を見るようになり、こちらは accessDays を
 * 返したままだった。体験パスで 7日 のところ 30日 を返し、
 * maxAffordableTextUsdPerSession が約4.29倍きつい側へずれていた。
 * テストは落ちないので誰も気づけない類のずれなので、1か所に寄せる。
 */
export const budgetDays = (planId: PlanId): number => {
  const plan = planById(planId);
  if (!plan) throw new Error(`unknown plan: ${planId}`);
  if (plan.trialDays != null) return plan.trialDays;
  return plan.realtimeWindowMinutes !== null
    ? plan.realtimeWindowMinutes / (24 * 60)
    : (plan.accessDays ?? ASSUMED_DAYS_WHEN_UNSET);
};

/**
 * 「上限まで使われた」ときの原価を出す。**平均ではなく最悪値**で見る。
 * 平均で設計すると、いちばん熱心な生徒がいちばん損をさせる形になる。
 *
 * `opts.textUsdPerSession` はテキスト単価の差し替え。
 * 「もし実際の単価が監査の $0.069 だったら、この商品はどうなるか」を
 * 数字で答えられるようにするために開けてある（既定は現行モデル）。
 */
export const planEconomics = (
  planId: PlanId,
  opts: { textUsdPerSession?: number } = {},
): PlanEconomics => {
  const plan = planById(planId);
  if (!plan) throw new Error(`unknown plan: ${planId}`);
  const b = aiBudgetFor(planId);
  const textUsdPerSessionUsed = opts.textUsdPerSession ?? TEXT_USD_PER_SESSION;
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
  // budgetDays と同じ式を二度書かない（二重管理はずれる。上のコメント参照）
  const days = budgetDays(planId);

  const voiceMinutes = b.voiceSessionsTotal * (VOICE_SESSION_MAX_SECONDS / 60);
  const voiceUsd = voiceMinutes * VOICE_USD_PER_MINUTE;
  const textUsd = b.textSessionsPerDay * days * textUsdPerSessionUsed;
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

/* ────────────────────────────────────────────────────────────
   「テキストがいくらまでなら耐えられるか」

   単価が1つ動いただけで商品が赤字に入るかどうかを、毎回手計算しないで済むようにする。
   監査の $0.069 と、この境界を並べれば「危ないのか、余裕があるのか」が即分かる。
   ──────────────────────────────────────────────────────────── */

/**
 * そのプランで許せるテキスト1回あたりの単価（USD）。
 * @param limitRatio 判定に使う原価率。既定はプランが宣言した maxAiCostRatio。
 *                   1 を渡せば「赤字になる境界」になる。
 * 音声だけで既に上限を超えているプランは負の値を返す（＝テキストを1回も出せない）。
 */
export const maxAffordableTextUsdPerSession = (
  planId: PlanId,
  limitRatio?: number,
): number | null => {
  const plan = planById(planId);
  if (!plan) throw new Error(`unknown plan: ${planId}`);
  const priceJpy = plan.priceJpy;
  if (priceJpy === null || priceJpy === 0) return null;
  const b = aiBudgetFor(planId);
  const ratio = limitRatio ?? b.maxAiCostRatio;
  const days = budgetDays(planId);
  const textSessions = b.textSessionsPerDay * days;
  if (textSessions <= 0) return null;
  const voiceUsd = b.voiceSessionsTotal * (VOICE_SESSION_MAX_SECONDS / 60) * VOICE_USD_PER_MINUTE;
  const budgetUsd = (ratio * priceJpy) / JPY_PER_USD / COST_SAFETY_MARGIN;
  return (budgetUsd - voiceUsd) / textSessions;
};

/** 赤字になる境界（原価率 1.0）のテキスト単価 */
export const breakEvenTextUsdPerSession = (planId: PlanId): number | null =>
  maxAffordableTextUsdPerSession(planId, 1);
