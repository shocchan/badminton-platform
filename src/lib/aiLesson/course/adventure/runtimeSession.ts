// 60分パスの実行状態（Phase 3）。
//
// 役割:
//   - 利用権（TrialGrant）のローカル保存（模擬決済モード。本物はDB移行後にEdge Functionが持つ）
//   - サーバーへのセッション発行依頼と、失効時の再発行
//   - アクティブ時間の計測（画面が見えている間だけ数える。バックグラウンド・放置は数えない）
//   - 二重タブの検出（同時に2タブで消費しない）
//
// **時刻の正準はサーバー。** ここで数える consumedActiveSeconds は発行時の申告値で、
// サーバーは 24時間の絶対期限（activation.expiresAtMs）を毎リクエスト自分の時計で確かめる。
// 累計秒の完全なサーバー正準化は進捗DB（未適用migration）後に heartbeat で行う。

import { getAccessToken } from '../courseAuth';
import type { TrialGrant, TrialResolution } from '../sales/trialActivation';
import { resolveTrial, pickCurrentTrialGrant } from '../sales/trialActivation';
import type { RuntimeAuth } from './activityClient';

const TRIAL_KEY = 'ai_course_trial_grants_v1';
const CONSUMED_KEY = 'ai_course_active_seconds_v1';

// ── 利用権のローカル保存（模擬決済モード） ──────────────

interface TrialStore { grants: TrialGrant[] }

const readStore = (): TrialStore => {
  try {
    const raw = localStorage.getItem(TRIAL_KEY);
    return raw ? JSON.parse(raw) as TrialStore : { grants: [] };
  } catch {
    return { grants: [] };
  }
};

const writeStore = (s: TrialStore): void => {
  try { localStorage.setItem(TRIAL_KEY, JSON.stringify(s)); } catch { /* noop */ }
};

export const listTrialGrants = (): TrialGrant[] => readStore().grants;

export const saveTrialGrant = (grant: TrialGrant): void => {
  const s = readStore();
  if (!s.grants.some((g) => g.purchaseId === grant.purchaseId)) s.grants.push(grant);
  writeStore(s);
};

/** 開始の記録。発行後は書き換えない（開始し直しはできない） */
export const recordActivation = (grantId: string, activatedAtMs: number, expiresAtMs: number): boolean => {
  const s = readStore();
  const g = s.grants.find((x) => x.id === grantId);
  if (!g || g.activation) return false;
  g.activation = { grantId, learnerId: g.learnerId, activatedAtMs, expiresAtMs };
  writeStore(s);
  return true;
};

export const readConsumedSeconds = (): number => {
  try { return Math.max(0, Number(localStorage.getItem(CONSUMED_KEY)) || 0); } catch { return 0; }
};

const writeConsumedSeconds = (v: number): void => {
  try { localStorage.setItem(CONSUMED_KEY, String(Math.round(v))); } catch { /* noop */ }
};

/** 検証・review用: 状態を作り直す */
export const resetTrialStore = (): void => {
  try { localStorage.removeItem(TRIAL_KEY); localStorage.removeItem(CONSUMED_KEY); } catch { /* noop */ }
};

// ── 現在の利用状態 ───────────────────────────────────

export interface RuntimeEntitlementState {
  kind: 'none' | 'trial' | 'period';
  trial: { grant: TrialGrant; resolution: TrialResolution } | null;
  consumedActiveSeconds: number;
}

export const currentEntitlement = (nowMs = Date.now()): RuntimeEntitlementState => {
  const consumed = readConsumedSeconds();
  const picked = pickCurrentTrialGrant(listTrialGrants(), consumed, nowMs);
  if (!picked) return { kind: 'none', trial: null, consumedActiveSeconds: consumed };
  return { kind: 'trial', trial: picked, consumedActiveSeconds: consumed };
};

// ── アクティブ時間の計測 ─────────────────────────────
//
// 数える条件: タブが可視 && 直近 IDLE_MS 以内に操作があった && 学習画面にいる。
// loading・アプリ切替・放置は数えない。

const IDLE_MS = 90_000;

export interface ActiveTimeTracker {
  /** 学習画面に入ったら true にする */
  setLearning: (v: boolean) => void;
  /** 現在の累計消費秒 */
  consumedSeconds: () => number;
  stop: () => void;
}

export const startActiveTimeTracker = (onTick?: (consumed: number) => void): ActiveTimeTracker => {
  let learning = false;
  let lastInputMs = Date.now();
  let acc = readConsumedSeconds();

  const onInput = () => { lastInputMs = Date.now(); };
  window.addEventListener('pointerdown', onInput, { passive: true });
  window.addEventListener('keydown', onInput, { passive: true });
  window.addEventListener('touchstart', onInput, { passive: true });

  const timer = window.setInterval(() => {
    if (!learning) return;
    if (document.visibilityState !== 'visible') return;   // バックグラウンドは数えない
    if (Date.now() - lastInputMs > IDLE_MS) return;       // 放置は数えない
    acc += 1;
    if (acc % 5 === 0) writeConsumedSeconds(acc);          // 5秒ごとに保存（reload復帰）
    onTick?.(acc);
  }, 1000);

  return {
    setLearning: (v) => { learning = v; if (v) lastInputMs = Date.now(); },
    consumedSeconds: () => acc,
    stop: () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', onInput);
      window.removeEventListener('keydown', onInput);
      window.removeEventListener('touchstart', onInput);
      writeConsumedSeconds(acc);
    },
  };
};

// ── 二重タブ制御 ─────────────────────────────────────
//
// 同じ learner が2タブで開くと消費が二重になる。後から開いたタブが優先し、
// 先のタブは「別のタブで学習中」表示へ落ちる（takeover 方式。ロック待ちより事故が少ない）。

export interface TabGuard {
  /** このタブが学習してよいか */
  isActive: () => boolean;
  onTakeover: (fn: () => void) => void;
  stop: () => void;
}

export const startTabGuard = (): TabGuard => {
  const myId = crypto.randomUUID();
  let active = true;
  let handler: (() => void) | null = null;
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel('ai-course-learning-tab');
    ch.onmessage = (ev) => {
      if (ev.data?.type === 'claim' && ev.data.id !== myId && active) {
        active = false;
        handler?.();
      }
    };
    ch.postMessage({ type: 'claim', id: myId });
  } catch { /* BroadcastChannel の無い環境では単一タブとして動く */ }
  return {
    isActive: () => active,
    onTakeover: (fn) => { handler = fn; },
    stop: () => { try { ch?.close(); } catch { /* noop */ } },
  };
};

// ── セッション発行 ───────────────────────────────────

export interface IssuedSession {
  auth: RuntimeAuth;
  issuedAtMs: number;
}

/**
 * サーバーへセッションを発行してもらう。
 * allowedTargetIds は「開放済みステージの対象」。route と mastery から呼び出し側が計算する。
 * 発行できない（未ログイン・503）ときは null。
 */
export const issueRuntimeSession = async (input: {
  level: 'n2' | 'n3';
  allowedTargetIds: string[] | '*';
  /** N2の開放単元。文法IDへの展開はサーバーが行う */
  allowedN2Units?: number[];
  baseUrl?: string;
}): Promise<IssuedSession | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  const ent = currentEntitlement();
  const res = await fetch(`${input.baseUrl ?? ''}/api/ai-course/session/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      level: input.level,
      trial: ent.trial?.grant ?? null,
      hasPeriodAccess: ent.kind === 'period',
      consumedActiveSeconds: ent.consumedActiveSeconds,
      allowedTargetIds: input.allowedTargetIds,
      allowedN2Units: input.allowedN2Units ?? [],
    }),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = await res.json().catch(() => null) as { sessionToken?: string } | null;
  if (!body?.sessionToken) return null;
  return {
    auth: { getAccessToken, sessionToken: body.sessionToken },
    issuedAtMs: Date.now(),
  };
};

/** 残り表示用: 現在の trial 状態をサーバーと同じ計算で解決する */
export const trialView = (nowMs = Date.now()): TrialResolution | null => {
  const ent = currentEntitlement(nowMs);
  if (!ent.trial) return null;
  return resolveTrial(ent.trial.grant, ent.consumedActiveSeconds, nowMs);
};
