// 学習ファネルの穴埋めイベント（Phase 1 計測基盤 2026-08-21）。
//
// advAnalytics(GA4) との役割の違い:
// - GA4 は広告・流入の分析用。Google側にしか残らず、管理画面からは見えない
// - こちらは**自分のDB（ai_course_events）**に入り、管理画面のファネル・再訪率の材料になる
//
// 送信禁止: 会話本文・名前・メール・自由記述・音声（advAnalyticsと同じ規律）。
// props はバケツ化した小さなメタ情報だけ（サーバー側でも2KB上限・1日400件で頭打ち）。
import { supabase } from '../../../services/supabaseClient';

export type CourseEventKind =
  /** アプリを開いた（ログイン済みで学習画面に到達）。日次の再訪判定に使う */
  | 'app_open'
  /** 診断が終わりルートが生成された＝初回設定完了 */
  | 'onboarding_completed'
  /** 今日の冒険を1件完了（会話・教材・聴解などの種別は props.step に） */
  | 'quest_completed'
  /** バトルを1回完走 */
  | 'battle_completed';

/**
 * 失敗しても学習を止めない fire-and-forget。
 * オフライン・RLS拒否・上限超過はすべて黙って捨てる（計測のために体験を壊さない）。
 */
export const logCourseEvent = (kind: CourseEventKind, props: Record<string, string | number | boolean> = {}): void => {
  try {
    void supabase
      .rpc('ai_log_course_event', { p_kind: kind, p_props: props })
      .then(undefined, () => undefined);
  } catch { /* noop */ }
};
