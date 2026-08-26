// 学習アプリの計測（GA4/gtag が存在するときだけ発火・無ければ何もしない）。
// 命名は既存LP（view_ai_course_lp / begin_ai_course_consultation）に合わせて
// {verb}_ai_course_{noun} で統一。個人情報（名前・メール・発話内容）は送らない。
//
// 検証モード（初回学習を安全に試す・CEO指示 2026-07-28 §9）:
// sandbox動作中は計測を送らない。検証操作が本物の学習データとして集計へ混ざるのを防ぐ。
import { isJourneySandboxActive } from './courseStorageRegistry';
import { recordFunnel, type FunnelKind } from './attribution';

/**
 * GA4のイベント名 → 自前ファネルの kind（2026-08-26 Phase S1）。
 *
 * 仕様が求める13イベントのうち、学習側のものは**すでにGA4に同じ意味の名前がある**。
 * 新しい名前を並べると同じ行動が二重に数えられるので、既存名を正としてここで対応づける。
 * 対応表に無いイベントはGA4にだけ送られる（ファネルには積まれない）。
 */
const FUNNEL_BY_EVENT: Record<string, FunnelKind> = {
  start_ai_course_trial: 'trial_activated',
  start_ai_course_lesson: 'lesson_started',
  complete_ai_course_lesson: 'lesson_completed',
  schedule_ai_course_review: 'review_scheduled',
  complete_ai_course_daily_review: 'review_completed',
  view_ai_course_upsell: 'upgrade_cta_view',
  click_ai_course_trial_end_plan: 'upgrade_cta_click',
};

const onceSent = new Set<string>();

/** 検証モード中か（storage未初期化・非ブラウザ環境では常にfalse＝送信側に倒す） */
const inSandbox = (): boolean => {
  try { return isJourneySandboxActive(window.sessionStorage); } catch { return false; }
};

export function trackCourse(event: string, params?: Record<string, string | number | boolean>) {
  try {
    if (inSandbox()) return;   // 検証モードの操作は計測しない（§9）
    const w = window as unknown as { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
    if (typeof w.gtag === 'function') w.gtag('event', event, params || {});
    else if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event, ...(params || {}) });
  } catch { /* noop */ }
  try {
    if (inSandbox()) return;
    const kind = FUNNEL_BY_EVENT[event];
    if (!kind) return;
    recordFunnel(kind, {
      planId: typeof params?.plan === 'string' ? params.plan : null,
      locale: typeof params?.lang === 'string' ? params.lang : null,
      loggedIn: true,   // これらはすべてログイン後の画面から出る
      trialState: typeof params?.trial_state === 'string' ? params.trial_state : null,
    });
  } catch { /* 計測の失敗で学習を止めない */ }
}

/** 1セッション（ページ寿命）につき1回だけ送る（StrictMode二重実行にも安全） */
export function trackCourseOnce(event: string, params?: Record<string, string | number | boolean>) {
  if (onceSent.has(event)) return;
  if (inSandbox()) return;   // 検証中は「送信済み」印も付けない（終了後の正規操作を逃さない）
  onceSent.add(event);
  trackCourse(event, params);
}
