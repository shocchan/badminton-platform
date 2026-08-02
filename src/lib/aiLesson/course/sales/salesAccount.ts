// 販売導線のアカウント（§3）。
//
// 本番は Supabase のメールOTP を使う。ただし現在の `ai-course-auth` は
// **初回登録に招待コードを要求する**ため、招待コードを持たない購入者は登録できない。
// これは Edge Function を直さないと解けない（デプロイにCEO承認が要る）。
//
// そこで、
//   - 実セッションがあればそれを使う（本番・staging 共通）
//   - 無い場合、**模擬決済モードのときだけ** 模擬アカウントを作れる
// という形にした。模擬アカウントは端末内だけの存在で、実DBには何も作らない。
//
// 重要なのは「アカウント無しでは購入・相談・体験開始へ進めない」という**判断**であって、
// 認証の実装方式ではない。判断は accountGate に集約し、ここは供給源だけを担う。

import type { AccountSession } from './accountGate';

const SIM_KEY = 'ai_course_sim_account_v1';

export interface SimulatedAccount {
  userId: string;
  email: string;
  /** 模擬OTP。実メールは送らない（画面に出して入力してもらう） */
  code: string;
  verified: boolean;
  createdAtMs: number;
}

export interface AccountStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** 模擬OTPは推測されても実害が無いが、固定値だと「認証した」と誤解されるので都度変える */
export const makeSimCode = (rand: () => number = Math.random): string =>
  String(Math.floor(rand() * 900_000) + 100_000);

export const startSimAccount = (
  store: AccountStore,
  email: string,
  nowMs: number,
  rand?: () => number,
): SimulatedAccount => {
  const acc: SimulatedAccount = {
    // 実 Supabase の user id と混ざらないよう、必ず接頭辞を付ける
    userId: `sim_${nowMs.toString(36)}_${Math.floor((rand ?? Math.random)() * 1e6).toString(36)}`,
    email: email.trim(),
    code: makeSimCode(rand),
    verified: false,
    createdAtMs: nowMs,
  };
  store.setItem(SIM_KEY, JSON.stringify(acc));
  return acc;
};

export const readSimAccount = (store: AccountStore): SimulatedAccount | null => {
  const raw = store.getItem(SIM_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SimulatedAccount;
    return typeof v?.userId === 'string' && typeof v?.email === 'string' ? v : null;
  } catch {
    return null;
  }
};

export type SimVerifyResult = { ok: true; account: SimulatedAccount } | { ok: false; error: 'no_account' | 'wrong_code' };

export const verifySimAccount = (store: AccountStore, code: string): SimVerifyResult => {
  const acc = readSimAccount(store);
  if (!acc) return { ok: false, error: 'no_account' };
  if (acc.code !== code.trim()) return { ok: false, error: 'wrong_code' };
  const verified = { ...acc, verified: true };
  store.setItem(SIM_KEY, JSON.stringify(verified));
  return { ok: true, account: verified };
};

export const clearSimAccount = (store: AccountStore): void => store.removeItem(SIM_KEY);

/**
 * いま使えるセッション。実セッションを優先する。
 * **未検証の模擬アカウントはセッションとして返さない**（OTPを飛ばせてしまう）。
 */
export const resolveSalesSession = (
  realSession: AccountSession | null,
  store: AccountStore,
  simAllowed: boolean,
): AccountSession | null => {
  if (realSession) return realSession;
  if (!simAllowed) return null;
  const acc = readSimAccount(store);
  return acc?.verified ? { userId: acc.userId, email: acc.email } : null;
};
