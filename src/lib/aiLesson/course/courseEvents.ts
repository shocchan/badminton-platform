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
  | 'battle_completed'
  /* ── 2026-08-26 追加: 購入→活性化→継続→転換をつなぐ穴埋め ────────────
     いずれも**ログイン後**の出来事。ログイン前（LP表示・CTA・checkout開始）は
     ai_lp_views と ai_plan_purchases（pending行）に既に残っているので、
     ここでは重複させない。
     購入時刻→初回セッションのTTFVも既存2表から出せるため、イベントにしない。 */
  /** 購入直後の自動ログインが成立した（メールを探さずに入れた） */
  | 'auth_completed'
  /** 自動ログインに失敗し、通常ログインへ倒した（reason を props に） */
  | 'auth_failed'
  /** 初回設定を開始した（onboarding_completed との差が離脱率になる） */
  | 'onboarding_start'
  /** 「体験を始める」を押して60分の時計が動き出した */
  | 'trial_started'
  /** 会話中に「言い方がわからない」を押した（詰まりの量が分かる） */
  | 'hint_requested'
  /** 会話後の学習レポートを実際に見た */
  | 'report_viewed'
  /** 60分の体験が終わり、続きの案内画面に到達した */
  | 'trial_completed'
  /** 続きのプラン提案が画面に出た */
  | 'upgrade_view'
  /** 続きのプランを選んだ（決済ページへ進む直前） */
  | 'upgrade_click'
  /**
   * 学習者の前で何かが失敗した（2026-08-26）。
   * props.where に場所（checkout / trial_start / mic / realtime / report / claim）、
   * props.code に判別できる理由を入れる。個人情報・本文は入れない。
   *
   * 種類ごとに enum を増やさないのは、増やしても配線されず
   * 「定義はあるが誰も送らない」になりやすいため。where で分ける。
   */
  | 'error_occurred';

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
