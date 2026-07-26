// 復習カードの「なぜ今日この表現が出ているのか」1行理由（決定的・API/DB変更なし）。
// 復習間隔・登録・XPには一切触れない。表示文言の選択だけを行う。

import type { CourseMasteryState } from './types';

export type ReviewReasonKey = 'day1' | 'day3' | 'day7' | 'overdue' | 'general';

/**
 * 理由キーの決定:
 * - overdue: 予定日超過（責めない文言・§B-2）
 * - due: masteryState から「何日後の確認か」を導出
 *   （initial〜used_independently=翌日 / reviewed_day1=3日後 / reviewed_day3以上=別の日の自力確認）
 * - それ以外（もう一度タブ等）・不正データ: general（安全なfallback）
 */
export const reviewReasonKey = (item: { reasons: string[]; masteryState: CourseMasteryState | string }): ReviewReasonKey => {
  const reasons = Array.isArray(item.reasons) ? item.reasons : [];
  if (reasons.includes('overdue')) return 'overdue';
  if (!reasons.includes('due')) return 'general';
  switch (item.masteryState) {
    case 'initial':
    case 'understood':
    case 'used_with_hint':
    case 'used_independently':
      return 'day1';
    case 'reviewed_day1':
      return 'day3';
    case 'reviewed_day3':
    case 'retained_day7':
    case 'retained_day30':
      return 'day7';
    default:
      return 'general'; // 未知の状態でも落ちない
  }
};
