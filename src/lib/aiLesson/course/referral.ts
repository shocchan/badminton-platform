/**
 * 紹介（2026-09-09 P1-5）。
 *
 * 【原則】
 * - ログイン直後には出さない。**「役に立った」と思える出来事のあと**にだけ出す（D-5）
 * - 自動送信はしない。文面とURLをコピーできるところまで
 * - 口コミ（感想）とは切り離す。書くことを割引や報酬の条件にしない（E-6）
 * - 割引が実際に効かない状態（Stripeのクーポン未設定）では、割引を約束する文言を出さない
 *
 * ここは判定と文面だけの純関数＋ブラウザ保存。DBの読み書きは referralApi.ts。
 */

import { formatLearningCode, normalizeLearningCode } from './learningCode';

export const REF_PARAM = 'ref';
const REF_KEY = 'kawabado.aiCourse.ref.v1';
/** 紹介コードは8桁（学習コードと同じ文字集合。読み上げ・書き写しで間違えない） */
const REF_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

export const isValidReferralCode = (raw: string): boolean =>
  REF_RE.test(normalizeLearningCode(raw));

/** URLから紹介コードを読む（保存はしない・テストしやすいよう純関数） */
export const readReferralFromSearch = (search: string): string | null => {
  try {
    const v = new URLSearchParams(search).get(REF_PARAM);
    if (!v) return null;
    const n = normalizeLearningCode(v);
    return isValidReferralCode(n) ? n : null;
  } catch {
    return null;
  }
};

/**
 * ブラウザ保存は差し替えられる形にする（advHomeVariant と同じ作り）。
 * テストは node 環境で走るので、localStorage を直接触ると落ちる。
 */
export type RefStorage = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): RefStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;   // private mode 等
  }
};

/**
 * 紹介コードを覚えておく。**上書きしない**——最初に紹介してくれた人の手柄にする
 * （あとから別のリンクを踏んでも、最初の紹介者を横取りしない）。
 */
export const rememberReferral = (code: string, storage: RefStorage | null = browserStorage()): void => {
  try {
    if (!isValidReferralCode(code) || !storage) return;
    if (storage.getItem(REF_KEY)) return;
    storage.setItem(REF_KEY, code);
  } catch { /* private mode では覚えないだけ */ }
};

export const storedReferral = (storage: RefStorage | null = browserStorage()): string | null => {
  try {
    const v = storage?.getItem(REF_KEY) ?? null;
    return v && isValidReferralCode(v) ? v : null;
  } catch {
    return null;
  }
};

/** 紹介リンク。中国語話者が主なので既定は zh */
export const referralUrl = (
  code: string, lang: 'ja' | 'zh' = 'zh', origin = 'https://kawabado.com',
): string => `${origin}/${lang}/ai-course?${REF_PARAM}=${normalizeLearningCode(code)}`;

/** 表示用（4桁区切り）。入力させる場面は無いが、読み上げやすさのため */
export const referralCodeDisplay = (code: string): string => formatLearningCode(code);

/**
 * WeChatにそのまま貼れる短文。
 * **割引が効かない状態では割引を書かない**（discountReady=false）。
 * 効かない約束をするのが、紹介でいちばんやってはいけないこと。
 */
export const referralMessage = (
  code: string, lang: 'ja' | 'zh', discountReady: boolean, discountPercent = 50,
): string => {
  const url = referralUrl(code, lang);
  if (lang === 'zh') {
    return discountReady
      ? `我在用一个练日语口语的AI课程，觉得挺好用的。\n从这个链接进去，第一个月可以便宜${discountPercent}%：\n${url}`
      : `我在用一个练日语口语的AI课程，觉得挺好用的。\n有兴趣的话可以看看：\n${url}`;
  }
  return discountReady
    ? `日本語の会話練習にAIのコースを使っています。よかったら。\nこのリンクからだと初月が${discountPercent}%オフになります：\n${url}`
    : `日本語の会話練習にAIのコースを使っています。よかったら。\n${url}`;
};

/**
 * 紹介を出してよい場面か（D-5）。
 *
 * 「役に立った」と本人が感じたあとにだけ出す。判定に使うのは実際の行動だけで、
 * 気持ちを勝手に推し量らない。どれか1つでも満たせば出す。
 */
export interface ReferralSignals {
  /** 完了したAI会話の回数 */
  completedConversations: number;
  /** 復習（間違い直し）を終えた回数 */
  completedReviews: number;
  /** 連続で学習した日数 */
  streakDays: number;
  /** 学習レポートを開いた回数 */
  reportsViewed: number;
  /** 本人が「もう出さない」を押した日時 */
  dismissedAtISO: string | null;
  nowISO: string;
}

/** 閉じられたら30日は出さない（毎回出して押し売りにしない） */
const DISMISS_DAYS = 30;

export const shouldShowReferral = (s: ReferralSignals): boolean => {
  if (s.dismissedAtISO) {
    const days = (Date.parse(s.nowISO) - Date.parse(s.dismissedAtISO)) / 86_400_000;
    if (Number.isFinite(days) && days < DISMISS_DAYS) return false;
  }
  // ログイン直後（何もしていない人）には絶対に出さない
  return s.completedConversations >= 2
    || s.completedReviews >= 1
    || s.streakDays >= 3
    || s.reportsViewed >= 2;
};

const DISMISS_KEY = 'kawabado.aiCourse.refDismissed.v1';

export const readReferralDismissedAt = (
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): string | null => {
  try { return storage?.getItem(DISMISS_KEY) ?? null; } catch { return null; }
};

export const writeReferralDismissedAt = (
  storage: Pick<Storage, 'setItem'> | null, iso: string,
): void => {
  try { (storage ?? browserStorage())?.setItem(DISMISS_KEY, iso); } catch { /* private mode */ }
};
