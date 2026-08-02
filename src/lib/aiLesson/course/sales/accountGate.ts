// 「先に進むならアカウントが要る」の唯一の判断点（§3）。**純関数＋小さな保管庫**。
//
// なぜ1か所に集めるか:
//   購入ボタン・相談ボタン・体験開始ボタンがそれぞれで判定すると、
//   1つ直し忘れたところから匿名の利用権ができる。匿名の利用権が1件でもできると、
//   残り時間・進捗・再購入をどのアカウントに繋ぐかが永久に決まらない。
//   だから「進む前に必ずここを通す」形にして、通し忘れをテストで検出する。
//
// 料金ページの**閲覧**は未ログインで許す（§3）。止めるのは次の3つだけ:
//   60分パスの購入 / 1か月プランの購入 / 6か月伴走の相談申込

import type { SalesPlanId } from './planConfig';

/** アカウントが要る操作。ここに無い操作はゲートを通さない（＝閲覧は自由） */
export type GatedAction = 'purchase' | 'consultation' | 'trial_activation';

export interface AccountSession {
  userId: string;
  email: string | null;
}

export type GateDecision =
  | { kind: 'allow'; userId: string }
  /** アカウント作成／ログインへ送る。戻り先は intent に保存済み */
  | { kind: 'require_account' };

/**
 * 進んでよいか。**セッションが無ければ必ず require_account**。
 * 「メールを入力させて後で紐づける」は作らない（匿名購入になる）。
 */
export const decideGate = (
  action: GatedAction,
  session: AccountSession | null,
): GateDecision => {
  void action; // 今はどの操作でも同じ判断。将来分かれても呼び出し側を変えずに済むよう引数に残す
  return session ? { kind: 'allow', userId: session.userId } : { kind: 'require_account' };
};

/**
 * OTPの往復をまたいで持ち越す情報（§3「以前の入力へ戻れるように」）。
 *
 * **メールアドレス以外の個人情報は入れない。** ここは sessionStorage に載るので、
 * 端末を共有している場合に他人から読める前提で設計する。
 */
export interface PendingIntent {
  action: GatedAction;
  planId: SalesPlanId;
  locale: 'ja' | 'zh';
  /** 戻り先のパス。外部URLを入れさせない（オープンリダイレクト防止） */
  returnPath: string;
  /** 規約に同意済みだったか。同意そのものは戻った後にもう一度確認する */
  agreedBefore: boolean;
  createdAtMs: number;
}

const KEY = 'ai_course_pending_intent_v1';
/** 30分で捨てる。放置した端末で他人が続きを踏めないように */
const TTL_MS = 30 * 60_000;

/** 戻り先として許すのはアプリ内の絶対パスだけ */
export const isSafeReturnPath = (p: string): boolean =>
  p.startsWith('/') && !p.startsWith('//') && !p.includes('://');

export interface IntentStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const saveIntent = (store: IntentStore, intent: PendingIntent): boolean => {
  if (!isSafeReturnPath(intent.returnPath)) return false;
  store.setItem(KEY, JSON.stringify(intent));
  return true;
};

export const loadIntent = (store: IntentStore, nowMs: number): PendingIntent | null => {
  const raw = store.getItem(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as PendingIntent;
    if (typeof v?.returnPath !== 'string' || !isSafeReturnPath(v.returnPath)) return null;
    if (nowMs - v.createdAtMs > TTL_MS) {
      store.removeItem(KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
};

export const clearIntent = (store: IntentStore): void => store.removeItem(KEY);

/**
 * ログイン完了後にどこへ戻すか。
 * intent が無ければ料金ページへ（迷子にしない）。
 */
export const resumePathAfterLogin = (
  intent: PendingIntent | null,
  locale: 'ja' | 'zh',
): string => intent?.returnPath ?? `/${locale}/ai-course/plans`;

/**
 * 購入・相談・利用権を必ず userId へ紐づけるための形。
 * `learnerId` を optional にしないのは、**省略できると省略されるから**。
 */
export interface OwnedRecord {
  learnerId: string;
}

/** 匿名レコードが混ざっていないかを検査する（テストと、保存直前の確認で使う） */
export const isOwned = (r: Partial<OwnedRecord> | null | undefined): r is OwnedRecord =>
  typeof r?.learnerId === 'string' && r.learnerId.length > 0;
