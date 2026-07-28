// 学習アプリの計測（GA4/gtag が存在するときだけ発火・無ければ何もしない）。
// 命名は既存LP（view_ai_course_lp / begin_ai_course_consultation）に合わせて
// {verb}_ai_course_{noun} で統一。個人情報（名前・メール・発話内容）は送らない。
//
// 検証モード（初回学習を安全に試す・CEO指示 2026-07-28 §9）:
// sandbox動作中は計測を送らない。検証操作が本物の学習データとして集計へ混ざるのを防ぐ。
import { isJourneySandboxActive } from './courseStorageRegistry';

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
}

/** 1セッション（ページ寿命）につき1回だけ送る（StrictMode二重実行にも安全） */
export function trackCourseOnce(event: string, params?: Record<string, string | number | boolean>) {
  if (onceSent.has(event)) return;
  if (inSandbox()) return;   // 検証中は「送信済み」印も付けない（終了後の正規操作を逃さない）
  onceSent.add(event);
  trackCourse(event, params);
}
