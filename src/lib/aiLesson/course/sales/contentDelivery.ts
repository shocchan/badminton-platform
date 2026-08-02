// 教材の限定配信（§6 §7 §8）。**サーバー側の強制層**。
//
// contentGuard.ts が「何を渡してよいか」の方針、ここが「この要求に答えてよいか」の判断。
// 分けているのは、方針だけあって呼ばれていない状態（＝画面を隠しただけ）を
// テストで見分けられるようにするため。
//
// この層は worker（dist/_worker.js）から呼ばれる。クライアントには教材が渡らないので、
// **ここを通らずに教材へ到達する経路が無い**ことが安全性の根拠になる。

import type { ContentRole } from './contentGuard';
import { toDeliverable, type InternalItem, type DeliverableItem } from './contentGuard';
import { resolveTrial, type TrialGrant } from './trialActivation';

/** 学習者が要求できる教材の種類 */
export type ContentKind = 'grammar' | 'vocab' | 'reading' | 'listening';

/** ステージの開放状態。locked は**本文を返さない** */
export type StageState = 'completed' | 'current' | 'available' | 'locked';

export interface ContentRequest {
  /** 認証済みの利用者。未認証は呼び出し側で弾く（ここへは null で来る） */
  userId: string | null;
  role: ContentRole;
  kind: ContentKind;
  /** 要求しているステージ */
  stageId: string;
  /** そのステージ内の何番目のstepか。連番で全件取得できないよう上限を持つ */
  stepIndex: number;
  /** 1回で欲しい件数。方針の上限を超えたら上限へ丸める（エラーにしない） */
  count: number;
  /** 学習セッション。別利用者のtokenを弾くために使う */
  sessionId: string;
}

export interface DeliveryContext {
  /** 現在の利用権。無ければ null */
  trial: TrialGrant | null;
  consumedActiveSeconds: number;
  /** 期間制プラン（1か月・6か月）が有効か。時間制と併用されうる */
  hasPeriodAccess: boolean;
  /** そのステージの開放状態。サーバー側の進捗台帳から引く */
  stageState: StageState;
  /** セッションの持ち主。要求者と一致しなければ拒否 */
  sessionOwnerId: string | null;
  serverNowMs: number;
}

export type DeliveryDenial =
  | 'unauthenticated'
  | 'no_entitlement'
  | 'trial_not_started'
  | 'trial_expired'
  | 'trial_consumed'
  | 'stage_locked'
  | 'session_not_owned'
  | 'step_out_of_range'
  | 'rate_limited';

export interface DeliveryDecision {
  allowed: boolean;
  denial?: DeliveryDenial;
  /** 許可されたときに返してよい件数 */
  count?: number;
}

/**
 * 1ステージあたりのstep上限。
 * これを超えるstepIndexを拒否することで、stepIndex を増やし続けて
 * バンク全体を引き出す経路を塞ぐ（§8「APIを順番に叩いて全件取得できないように」）。
 */
export const MAX_STEP_INDEX = 40;
/** 1回の要求で返す最大件数 */
export const MAX_ITEMS_PER_REQUEST = 5;

/**
 * 答えてよいかを判断する。**この関数だけが許可を出す。**
 *
 * 順番に意味がある: 認証 → 利用権 → セッション所有 → ステージ開放 → 範囲。
 * 先に「ステージが鍵」と答えると、利用権が無い人にステージ構成を教えてしまう。
 */
export const decideDelivery = (
  req: ContentRequest,
  ctx: DeliveryContext,
): DeliveryDecision => {
  if (!req.userId) return { allowed: false, denial: 'unauthenticated' };

  // 管理者QAは学習者の利用権を持たないので、別経路として先に分岐する（§8 権限の完全分離）
  if (req.role === 'admin_qa') {
    // 管理者はこのエンドポイントを使わない。学習者用の経路に混ぜない
    return { allowed: false, denial: 'no_entitlement' };
  }

  const trialResolution = ctx.trial
    ? resolveTrial(ctx.trial, ctx.consumedActiveSeconds, ctx.serverNowMs)
    : null;

  if (!ctx.hasPeriodAccess) {
    if (!trialResolution) return { allowed: false, denial: 'no_entitlement' };
    switch (trialResolution.state) {
      case 'unstarted':
        return { allowed: false, denial: 'trial_not_started' };
      case 'start_lapsed':
      case 'expired':
        return { allowed: false, denial: 'trial_expired' };
      case 'consumed':
        return { allowed: false, denial: 'trial_consumed' };
      case 'active':
        break;
    }
  }

  // セッションの持ち主でなければ拒否。別利用者のtokenを持ち込んでも通らない
  if (ctx.sessionOwnerId !== req.userId) {
    return { allowed: false, denial: 'session_not_owned' };
  }

  // 鍵付きステージの**本文**は返さない。名前・地域などのmetadataは別経路（§6）
  if (ctx.stageState === 'locked') {
    return { allowed: false, denial: 'stage_locked' };
  }

  if (!Number.isInteger(req.stepIndex) || req.stepIndex < 0 || req.stepIndex > MAX_STEP_INDEX) {
    return { allowed: false, denial: 'step_out_of_range' };
  }

  // 件数は丸める。エラーにすると、通常利用者が制限表示を頻繁に見ることになる（§8）
  const count = Math.max(1, Math.min(req.count, MAX_ITEMS_PER_REQUEST));
  return { allowed: true, count };
};

/** 返却する形。**内部IDもsourceも監査用の欄も入れない** */
export interface DeliveredStep {
  stageId: string;
  stepIndex: number;
  items: DeliverableItem[];
  /** 次のstepを取るための不透明なtoken。連番やoffsetを推測させない */
  nextStepToken: string | null;
}

/**
 * 不透明tokenを作る。
 * 中身は「誰の・どのセッションの・どのステージの・次は何番目か」を署名したもの。
 * 署名鍵はサーバーだけが持つので、利用者が番号を書き換えても通らない。
 */
export const buildNextStepToken = async (
  input: { userId: string; sessionId: string; stageId: string; nextStepIndex: number },
  secret: string,
  sign: (payload: string, secret: string) => Promise<string>,
): Promise<string | null> => {
  if (input.nextStepIndex > MAX_STEP_INDEX) return null;
  const payload = JSON.stringify(input);
  const sig = await sign(payload, secret);
  // base64url。中身は読めるが**書き換えると署名が合わない**
  return `${b64url(payload)}.${sig}`;
};

export interface ParsedStepToken {
  userId: string;
  sessionId: string;
  stageId: string;
  nextStepIndex: number;
}

export const parseNextStepToken = async (
  token: string,
  secret: string,
  sign: (payload: string, secret: string) => Promise<string>,
): Promise<ParsedStepToken | null> => {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let payload: string;
  try {
    payload = fromB64url(body);
  } catch {
    return null;
  }
  const expected = await sign(payload, secret);
  // 長さが違う時点で不一致。定数時間比較は下で行う
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const v = JSON.parse(payload) as ParsedStepToken;
    return typeof v?.userId === 'string' && typeof v?.stageId === 'string' ? v : null;
  } catch {
    return null;
  }
};

/** 許可された分だけ、渡してよい形に落とす */
export const buildDeliveredStep = (
  req: ContentRequest,
  internal: InternalItem[],
  count: number,
): DeliveredStep => ({
  stageId: req.stageId,
  stepIndex: req.stepIndex,
  items: internal.slice(0, count).map((it, i) => toDeliverable(it, req.sessionId, i)),
  nextStepToken: null, // 呼び出し側が署名して埋める
});

const b64url = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (s: string): string => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

/**
 * 短時間の連打を抑える（§8）。
 * 通常の学習は1問あたり数秒〜数十秒かかるので、この上限に当たらない。
 * 当たるのは自動化して引き抜こうとした場合だけ。
 */
export interface RateWindow {
  /** 直近の要求時刻（ミリ秒）。新しい順である必要はない */
  recentRequestMs: number[];
}
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_IN_WINDOW = 40;

export const isRateLimited = (w: RateWindow, nowMs: number): boolean =>
  // 未来の記録を数えない。`nowMs - t < WINDOW` だけだと差が負になる未来の記録も
  // 条件を満たしてしまい、まだ起きていない要求で制限がかかる
  w.recentRequestMs.filter((t) => {
    const age = nowMs - t;
    return age >= 0 && age < RATE_LIMIT_WINDOW_MS;
  }).length >= RATE_LIMIT_MAX_IN_WINDOW;
