// 会話後「1回だけ言い直す」フロー（純関数・API呼び出しなし＝追加費用ゼロ）。
//
// - pickRetryTarget: レポートの corrections から学習価値が最も高い1件を選ぶ
// - judgeRetry: 学習者の言い直し入力を決定的な正規化で判定（完全一致を要求しない）
// 復習への接続は既存のミッション単位の復習（updateMasteryState が設定する
// nextReviewAt）に含まれるため、ここでは新規登録しない（二重登録なし）。

import type { LessonReport } from './types';

export interface RetryTarget {
  original: string;   // 学習者の実際の発話
  improved: string;   // 自然な言い方
  noteZh: string;     // 中国語の短い補足
  reason: 'target' | 'meaning' | 'general'; // 選定理由（表示はしない・テスト用）
}

/**
 * 言い直す1件を選ぶ。優先順位:
 *  1. 今日の目標表現に関する誤り（targetExpression を含む訂正）
 *  2. 先頭の訂正（レポート生成側が重要度順に最大2件へ絞っている）
 * corrections が無ければ null（言い直しカード自体を出さない）。
 */
export const pickRetryTarget = (report: LessonReport, targetExpression: string): RetryTarget | null => {
  const list = report.corrections.filter((c) => c.original.trim() && c.improved.trim());
  if (list.length === 0) return null;
  const core = targetExpression.replace(/[〜～]/g, '').trim();
  if (core) {
    const hit = list.find((c) => c.improved.includes(core) || c.original.includes(core));
    if (hit) return { ...hit, reason: 'target' };
  }
  return { ...list[0], reason: 'meaning' };
};

/** 判定用の正規化: 句読点・空白・全半角・軽微な文体差を吸収する */
export const normalizeJa = (s: string): string =>
  s
    .normalize('NFKC')                       // 全角英数・半角カナを統一
    .replace(/[\s\u3000]+/g, '')             // 空白（全角含む）除去
    .replace(/[、。，．,.!?！？「」『』…・]/g, '') // 句読点・記号除去
    .toLowerCase();

/** 文末の敬体/普通体の軽微な違いを丸める（です/ます ⇔ だ/る の完全変換はしない） */
const stripPoliteTail = (s: string): string =>
  s.replace(/(です|でした|ます|ました|ですね|ますね)$/u, '');

export type RetryJudgement = 'good' | 'close' | 'tryAgain';

/**
 * 言い直しの判定（決定的・LLM不使用）:
 *  - good: 正規化後に自然表現と一致、または自然表現の主要部分をすべて含む
 *  - close: 7割以上の文字が重なる（惜しい）
 *  - tryAgain: それ以外
 */
export const judgeRetry = (input: string, improved: string): RetryJudgement => {
  const a = stripPoliteTail(normalizeJa(input));
  const b = stripPoliteTail(normalizeJa(improved));
  if (!a) return 'tryAgain';
  if (a === b || a.includes(b) || b.includes(a)) return 'good';
  // 文字バイグラムの重なり率（順序の軽微な違いを許容）
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const ga = grams(a), gb = grams(b);
  if (gb.size === 0) return 'tryAgain';
  let hit = 0;
  gb.forEach((g) => { if (ga.has(g)) hit++; });
  const ratio = hit / gb.size;
  if (ratio >= 0.7) return 'good';
  if (ratio >= 0.45) return 'close';
  return 'tryAgain';
};
