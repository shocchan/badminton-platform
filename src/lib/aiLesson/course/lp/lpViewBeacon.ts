// 販売LPが何人に見られたかを自分のDBに1行だけ記録する（CEO依頼 2026-08-23）。
//
// 「このLPがどれだけの人に見られているか、管理ページから見たい」への答え。
// GA4も入っているが、管理ページから読むには別の認証情報とサーバーが要る。
// いま知りたいのは「誰かに見つかっているか」「どこから来たか」だけなので自前で数える。
//
// 送らないもの: IPアドレス・UserAgent・URL全体・個人を識別できるもの。
// 送るのは 日付／どのページ／言語／流入元の**ホスト名だけ**／utm。
//
// 数えかたの約束:
//   - **1ブラウザ1日1回**（延べ表示回数ではなく「見た人」に近づける）
//   - 自分（?notrack=1 のブラウザ）は数えない＝自分の動作確認で数字が膨らまない
//   - 本番ドメイン以外は数えない（staging の確認を本番の数字に混ぜない）
//   - 自動操作（navigator.webdriver）は数えない
//   - 2秒見てから送る。すぐ閉じた／先読みだけのアクセスを落とす
import { supabase } from '../../../../services/supabaseClient';
import { isTrackingOptedOut, isProdHost } from '../../../analytics';

const DAY_KEY_PREFIX = 'kb_lpview_';
const DWELL_MS = 2000;

/** その日そのページを、このブラウザでもう数えたか */
const alreadyCountedToday = (path: string): boolean => {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
    const key = `${DAY_KEY_PREFIX}${path}`;
    if (localStorage.getItem(key) === today) return true;
    localStorage.setItem(key, today);
    return false;
  } catch {
    return true;   // ストレージが使えない環境では数えない（重複より欠測を選ぶ）
  }
};

/** 流入元は**ホスト名だけ**取り出す。同じサイト内の移動は流入ではないので null */
export const referrerHostOf = (referrer: string, ownHost: string): string | null => {
  if (!referrer) return null;
  try {
    const h = new URL(referrer).hostname;
    return !h || h === ownHost ? null : h;
  } catch { return null; }
};

export interface LpViewInput {
  path: string;
  lang: string;
  variant?: string | null;
}

/**
 * 記録してよい状況か（テストしやすいよう純関数として切り出す）。
 * **今日もう数えたか**はここに含めない。あれは印をつける副作用があるので、
 * ここを通ったあとで最後に1回だけ呼ぶ。
 */
export const shouldRecord = (env: {
  prodHost: boolean; optedOut: boolean; webdriver: boolean;
}): boolean => env.prodHost && !env.optedOut && !env.webdriver;

/**
 * LP表示を記録する。**失敗しても画面には何も起こさない**
 * （計測のためにLPが壊れることがあってはならない）。
 */
export const recordLpView = (input: LpViewInput): void => {
  let webdriver = false;
  try { webdriver = navigator.webdriver === true; } catch { /* 参照できない環境は false のまま */ }

  if (!shouldRecord({ prodHost: isProdHost(), optedOut: isTrackingOptedOut(), webdriver })) return;
  if (alreadyCountedToday(input.path)) return;

  const send = () => {
    let q: URLSearchParams;
    try { q = new URLSearchParams(window.location.search); } catch { q = new URLSearchParams(); }
    void supabase.rpc('ai_record_lp_view', {
      p_path: input.path,
      p_lang: input.lang === 'zh' ? 'zh' : 'ja',
      p_variant: input.variant ?? null,
      p_referrer_host: referrerHostOf(document.referrer, window.location.hostname),
      p_utm_source: q.get('utm_source'),
      p_utm_medium: q.get('utm_medium'),
      p_utm_campaign: q.get('utm_campaign'),
    }).then(() => undefined, () => undefined);
  };

  // 2秒見てから送る。その前に離れたら送らない
  const timer = window.setTimeout(() => {
    if (document.visibilityState === 'visible') send();
  }, DWELL_MS);
  window.addEventListener('pagehide', () => window.clearTimeout(timer), { once: true });
};
