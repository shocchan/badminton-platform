// コースの調整用定数（難易度・定着重み・復習間隔・利用上限のデフォルト）
// 管理画面/Supabase(ai_config)から変更できるようUI・ロジックから分離。

import type { CourseMasteryState } from './types';

/** 定着状態の重み（進捗率算出用。初回学習だけでは100%にしない） */
export const COURSE_MASTERY_WEIGHTS: Record<CourseMasteryState, number> = {
  initial: 0.2,
  understood: 0.35,
  used_with_hint: 0.5,
  used_independently: 0.65,
  reviewed_day1: 0.75,
  reviewed_day3: 0.85,
  retained_day7: 0.95,
  retained_day30: 1,
};

/** 状態の昇格順（この順序より後ろへは進めるが、勝手に降格させない） */
export const COURSE_MASTERY_ORDER: CourseMasteryState[] = [
  'initial', 'understood', 'used_with_hint', 'used_independently',
  'reviewed_day1', 'reviewed_day3', 'retained_day7', 'retained_day30',
];

/** 復習間隔（日）。定着が弱いときの追加復習は 'extra' で2日後 */
export const REVIEW_INTERVALS = { day1: 1, day3: 3, day7: 7, day30: 30, extra: 2 } as const;

/** 「定着済み」とみなす状態（ロードマップ・レポート表示用） */
export const RETAINED_STATES: CourseMasteryState[] = ['retained_day7', 'retained_day30'];

/** 難易度5段階の説明（ゆい先生プロンプトにも渡す） */
export const DIFFICULTY_GUIDE: Record<number, { ja: string; promptJa: string }> = {
  1: { ja: '選択肢中心・短い復唱・中国語補助多め', promptJa: '選択肢を多めに出し、短い復唱を中心にする。中国語補助を多めに使う。' },
  2: { ja: '文の前半を提示・短い自由回答', promptJa: '文の前半を提示して続きを言わせる。短い自由回答を促す。' },
  3: { ja: '簡単な自由回答・必要時のみヒント', promptJa: '簡単な自由回答を基本にし、ヒントは詰まったときだけ出す。' },
  4: { ja: '理由や具体例を含む回答・日本語中心', promptJa: '理由や具体例を含む回答を促し、日本語中心で進める。' },
  5: { ja: '実際の会話に近い即興・言い換え', promptJa: '実際の会話に近い即興を求め、言い換えや複数表現を使わせる。' },
};

/** 難易度自動調整のしきい値 */
export const DIFFICULTY_ADJUST = {
  upSelfRate: 0.8,       // 自力成功率がこれ以上なら上げる候補
  downSelfRate: 0.6,     // これ未満なら下げる候補
  window: 3,             // 直近何セッションで判断するか
  minConsistent: 2,      // 連続で条件を満たす必要回数
} as const;

/** 診断期間（推定完了日をこの回数まで確定表示しない） */
export const COURSE_DIAGNOSIS_MIN_SESSIONS = 4;

/** 利用上限のデフォルト（ai_config.usage_limits で上書き可能） */
export const DEFAULT_USAGE_LIMITS = {
  session_max_seconds: 240,   // 1セッション最大4分
  daily_max_sessions: 5,      // 1日最大5セッション
  daily_max_seconds: 1200,    // 1日最大20分
  monthly_cost_warn_usd: 15,  // 月次コスト警告
} as const;

/** gpt-realtime-2.1 の概算単価（音声, per 1M tokens）。コスト記録用の目安 */
export const REALTIME_COST = {
  inputPerMillion: 32,
  outputPerMillion: 64,
  /** 3分レッスンの概算トークン（入力/出力）。実測で調整 */
  approxInputTokensPerMin: 1800,
  approxOutputTokensPerMin: 1200,
} as const;
