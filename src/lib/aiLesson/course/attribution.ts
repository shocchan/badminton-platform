// 流入元をブラウザに覚えさせ、購入まで持ち回る（2026-08-26 CEO指示 Phase S1）。
//
// 【なぜ要るか】
// 実測で、記録された LP 閲覧はすべて UTM なし＝流入元が1件も分からない。
// 小紅書から来たのか、WeChat から来たのか、広告から来たのかが区別できないまま
// 8月に Meta 広告へ ¥1,992 を使い、申込0件だった。
// 何が効いたのか永久に判断できない状態を、まずここで終わらせる。
//
// 【first-touch と last-touch の両方を持つ理由】
// 中国語圏の導線は「小紅書で知る → 何日か考える → WeChat のリンクから買う」が普通で、
// last-touch だけ見ると常に WeChat が全部の手柄を持っていく。
// 最初に見つけてもらった場所（first）と、最後に背中を押した場所（last）は別物として残す。
//
// 【個人情報を持たない】
// 保存するのは UTM・referrer の**ホスト名だけ**・パス・自分で作った乱数ID。
// 氏名・メール・IP・UserAgent・URL全体は保存も送信もしない。
// GA4 へ渡すのも source/campaign までで、anon_id は送らない。
import { supabase } from '../../../services/supabaseClient';
import { isProdHost, isTrackingOptedOut } from '../../analytics';

const ANON_KEY = 'kb_anon_id_v1';
const TOUCH_KEY = 'kb_touch_v1';
const LINKED_KEY = 'kb_attr_linked_v1';

/** ファネルの出来事。DB側の kind ホワイトリストと**同じ綴り**にすること */
export type FunnelKind =
  | 'lp_view'
  | 'cta_click'
  | 'trial_checkout_start'
  | 'monthly_checkout_start'
  | 'six_month_checkout_start'
  | 'purchase'
  | 'trial_activated'
  | 'lesson_started'
  | 'lesson_completed'
  | 'review_scheduled'
  | 'review_completed'
  | 'upgrade_cta_view'
  | 'upgrade_cta_click';

export interface Touch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrerHost: string | null;
  landingPath: string | null;
  atISO: string;
}

interface TouchStore { v: 1; first: Touch; last: Touch }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** ブラウザ単位の匿名ID。個人を指すものではなく、同じブラウザの出来事をつなぐためだけの乱数 */
export const anonId = (): string | null => {
  try {
    const saved = localStorage.getItem(ANON_KEY);
    if (saved && UUID_RE.test(saved)) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(ANON_KEY, fresh);
    return fresh;
  } catch {
    return null;   // ストレージが使えない環境では計測しない（画面は動かす）
  }
};

/** referrer は**ホスト名だけ**。自サイト内の移動は流入ではないので null */
export const referrerHostOf = (referrer: string, ownHost: string): string | null => {
  if (!referrer) return null;
  try {
    const h = new URL(referrer).hostname;
    return !h || h === ownHost ? null : h;
  } catch { return null; }
};

/** URL と referrer から、いまの流入元を読む（保存はしない・テストしやすいよう純関数） */
export const readTouch = (
  search: string, referrer: string, ownHost: string, path: string, nowISO: string,
): Touch => {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  const g = (k: string) => {
    const v = q.get(k);
    return v && v.trim() ? v.trim().slice(0, 120) : null;
  };
  return {
    source: g('utm_source'),
    medium: g('utm_medium'),
    campaign: g('utm_campaign'),
    content: g('utm_content'),
    term: g('utm_term'),
    referrerHost: referrerHostOf(referrer, ownHost),
    landingPath: path.slice(0, 120),
    atISO: nowISO,
  };
};

/** 流入元と言えるものが何か入っているか。landingPath は常に入るので判定に使わない */
export const hasTouch = (t: Touch): boolean =>
  !!(t.source || t.medium || t.campaign || t.content || t.term || t.referrerHost);

/**
 * 保存済みの touch に今回の来訪を重ねる。
 * first は**流入元が分かる最初の来訪**で確定し、以後変えない。
 * 直接流入（UTMもreferrerも無い）で first を埋めてしまうと、
 * 「直接流入が全部の手柄を持つ」という一番よくある壊れ方になる。
 */
export const mergeTouch = (prev: TouchStore | null, now: Touch): TouchStore => {
  if (!prev) return { v: 1, first: now, last: now };
  const firstIsBlank = !hasTouch(prev.first);
  return {
    v: 1,
    first: firstIsBlank && hasTouch(now) ? now : prev.first,
    last: hasTouch(now) ? now : prev.last,
  };
};

const loadTouch = (): TouchStore | null => {
  try {
    const raw = localStorage.getItem(TOUCH_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as TouchStore;
    return p && p.v === 1 && p.first && p.last ? p : null;
  } catch { return null; }
};

/** いまのURLから流入元を取り込む。**アプリ起動時に1回だけ**呼ぶ */
export const captureTouch = (): TouchStore | null => {
  try {
    const now = readTouch(
      window.location.search, document.referrer, window.location.hostname,
      window.location.pathname, new Date().toISOString(),
    );
    const merged = mergeTouch(loadTouch(), now);
    localStorage.setItem(TOUCH_KEY, JSON.stringify(merged));
    return merged;
  } catch { return null; }
};

/** 購入に焼き付ける用（first-touch）。checkout に渡す */
export const firstTouch = (): Touch | null => loadTouch()?.first ?? null;

export interface FunnelContext {
  planId?: string | null;
  locale?: string | null;
  loggedIn?: boolean | null;
  /** not_purchased / not_started / active / expired など。分かる範囲で */
  trialState?: string | null;
}

/**
 * ファネルの出来事を1件記録する。
 * **失敗しても画面には何も起こさない**（計測のために商品が壊れてはいけない）。
 *
 * staging と本番は同じDBを共有しているので、本番ホスト以外は is_test を立てて
 * 集計から外す（記録自体は行う＝staging で経路そのものを確認できる）。
 */
export const recordFunnel = (kind: FunnelKind, ctx: FunnelContext = {}): void => {
  try {
    if (isTrackingOptedOut()) return;
    const id = anonId();
    if (!id) return;
    const store = loadTouch() ?? captureTouch();
    const t = store?.last ?? null;
    void supabase.rpc('ai_record_funnel_event', {
      p_anon_id: id,
      p_kind: kind,
      p_plan_id: ctx.planId ?? null,
      p_locale: ctx.locale ?? null,
      p_logged_in: ctx.loggedIn ?? null,
      p_trial_state: ctx.trialState ?? null,
      p_source: t?.source ?? null,
      p_medium: t?.medium ?? null,
      p_campaign: t?.campaign ?? null,
      p_content: t?.content ?? null,
      p_term: t?.term ?? null,
      p_referrer_host: t?.referrerHost ?? null,
      p_landing_path: t?.landingPath ?? null,
      p_is_test: !isProdHost(),
    }).then(() => undefined, () => undefined);
  } catch { /* 計測は失敗してよい */ }
};

/**
 * ログインしたら、このブラウザの流入元を本人に紐付ける。
 * 1ブラウザにつき1回で足りるので印を付ける（毎回叩かない）。
 * 付け替えはサーバー側で拒否される（最初に付いた人のまま）。
 */
export const linkAttributionToUser = (): void => {
  try {
    const id = anonId();
    if (!id) return;
    if (localStorage.getItem(LINKED_KEY) === id) return;
    void supabase.rpc('ai_link_attribution', { p_anon_id: id })
      .then(() => { try { localStorage.setItem(LINKED_KEY, id); } catch { /* noop */ } },
        () => undefined);
  } catch { /* noop */ }
};

/** GA4 に付ける流入元（個人情報は含めない）。値が無いキーは落とす */
export const analyticsTouchParams = (): Record<string, string> => {
  const t = loadTouch()?.first ?? null;
  const out: Record<string, string> = {};
  if (t?.source) out.attr_source = t.source;
  if (t?.medium) out.attr_medium = t.medium;
  if (t?.campaign) out.attr_campaign = t.campaign;
  return out;
};
