// 累計アクティブ学習時間の会計（§9）。**サーバーが正準**。
//
// 設計の要点（なぜこの形か）:
//
// 1. クライアントは「経過した秒数」を送らない。送るのは「今生きている」という合図(heartbeat)だけ。
//    秒数を送らせると、改ざんで残り時間を増やせてしまう。
//    サーバーは **自分の時計で** 前回の合図からの差を測る。
//
// 2. 前回の合図からの差は `heartbeatSeconds` で頭打ちにする。
//    合図が届いた瞬間は「その時点に居た」ことしか証明していない。
//    次の合図までの空白は未証明なので課金しない。
//    → 通信が詰まった / タブが裏に回った / ブラウザを閉じた 場合の不当消費が
//      構造的に「最大1インターバル」に収まる（§9「network loading中の不当消費を避ける」）。
//
// 3. 未証明を課金しない方針だけだと、合図をわざと遅らせて時間を消費せずに学べてしまう。
//    そこで **問題を1問配る / 会話を1ターン返す** ような "content" イベントには最低課金を置く。
//    1万問を取り切るには最低課金の合計が予算を超える＝時間制の意味が保たれる。
//
// 4. 二重タブは `activeSessionId` で1つに絞る。ただしブラウザ強制終了で
//    永久ロックにならないよう、一定時間合図が無い枠は引き継げる（§9「切断時の猶予」）。
//
// 5. 離席の検出は**2段構え**。
//    - クライアント: 一定時間ユーザー操作が無ければ `pause` を送り、合図を止める（一次）
//    - サーバー: 合図が `idlePauseSeconds` 途切れたら自動pause（クライアントが消えた場合の後追い）
//    合図が正常に届き続けている間はサーバーからは離席が見えないので、一次側が必須。
//    なお「合図を送り続けて自分の時間を減らす」動機は利用者側に無いので、
//    ここを悪用する経路にはならない。
//
// この層は**純関数**。DB・時刻・乱数に触らない（`nowMs` は呼び出し側が渡す）。

export interface ActiveTimePolicy {
  /** 合図の間隔（秒）。未証明区間の課金上限でもある */
  heartbeatSeconds: number;
  /** 無操作でこの秒数を超えたら自動でpauseにする */
  idlePauseSeconds: number;
  /** 問題配信・会話ターンなど「中身を受け取った」ときの最低課金（秒） */
  minChargePerContentSeconds: number;
  /** 合図がこの秒数途切れた枠は、別のタブ/端末が引き継げる */
  takeoverAfterSeconds: number;
}

export const defaultActiveTimePolicy = (
  o: Partial<ActiveTimePolicy> & Pick<ActiveTimePolicy, 'heartbeatSeconds' | 'idlePauseSeconds'>,
): ActiveTimePolicy => ({
  minChargePerContentSeconds: 5,
  takeoverAfterSeconds: Math.max(o.heartbeatSeconds * 3, 60),
  ...o,
});

export type UsageSessionStatus = 'running' | 'paused' | 'closed';

/** サーバーに保存される利用枠の状態。これが唯一の正準 */
export interface ActiveTimeState {
  /** 使ってよい合計秒数（複数回購入の合算後。§11） */
  budgetSeconds: number;
  /** 使った合計秒数。**この値だけが残り時間を決める** */
  consumedSeconds: number;
  /** 今この枠を握っているタブ/端末の識別子。null なら誰も使っていない */
  activeSessionId: string | null;
  status: UsageSessionStatus;
  /** サーバー時計で記録した最後の合図の時刻（epoch ms） */
  lastTickAtMs: number;
}

export type ActiveTimeEventKind =
  /** 定期的な生存確認 */
  | 'heartbeat'
  /** 問題を配った・会話を1ターン返した等、中身を受け取った */
  | 'content'
  /** 本人が明示的に中断した */
  | 'pause'
  /** 中断から再開した */
  | 'resume'
  /** 本人が「今日はここまで」を押した */
  | 'close';

export interface ActiveTimeEvent {
  kind: ActiveTimeEventKind;
  sessionId: string;
  /** **サーバー時計**の現在時刻（呼び出し側が入れる。クライアントの時刻は使わない） */
  nowMs: number;
}

export type ActiveTimeRejection =
  /** 別のタブ/端末が使用中 */
  | 'session_conflict'
  /** 残り時間が無い */
  | 'exhausted'
  /** 枠が閉じられている */
  | 'closed';

export interface ActiveTimeResult {
  state: ActiveTimeState;
  /** 今回の課金秒数（0以上） */
  chargedSeconds: number;
  /** 自動pauseが起きたか（画面に「離席していたので止めました」と出すため） */
  autoPaused: boolean;
  /** 受け付けなかった理由。null なら成功 */
  rejected: ActiveTimeRejection | null;
}

export const remainingSeconds = (s: ActiveTimeState): number =>
  Math.max(s.budgetSeconds - s.consumedSeconds, 0);

export const remainingMinutes = (s: ActiveTimeState): number =>
  Math.floor(remainingSeconds(s) / 60);

export const isExhausted = (s: ActiveTimeState): boolean => remainingSeconds(s) <= 0;

/** 使った割合（0〜1）。予算0なら1（使い切り扱い） */
export const consumedRatio = (s: ActiveTimeState): number =>
  s.budgetSeconds <= 0 ? 1 : Math.min(s.consumedSeconds / s.budgetSeconds, 1);

export const newActiveTimeState = (budgetSeconds: number, nowMs: number): ActiveTimeState => ({
  budgetSeconds,
  consumedSeconds: 0,
  activeSessionId: null,
  status: 'closed',
  lastTickAtMs: nowMs,
});

const unchanged = (state: ActiveTimeState, rejected: ActiveTimeRejection): ActiveTimeResult =>
  ({ state, chargedSeconds: 0, autoPaused: false, rejected });

/**
 * 枠を開く（学習を始める / 再読込で戻ってくる）。
 *
 * 同じ sessionId なら常に成功（再読込での復帰。§9「reload復帰」）。
 * 別の sessionId のときは、前の枠が `takeoverAfterSeconds` 以上沈黙していれば引き継ぐ。
 * そうでなければ `session_conflict`（二重タブ対策）。
 */
export const openUsageSession = (
  state: ActiveTimeState,
  sessionId: string,
  nowMs: number,
  policy: ActiveTimePolicy,
): ActiveTimeResult => {
  if (isExhausted(state)) return unchanged(state, 'exhausted');

  const holder = state.activeSessionId;
  const silentFor = (nowMs - state.lastTickAtMs) / 1000;
  const heldByOther = holder !== null && holder !== sessionId && state.status !== 'closed';
  if (heldByOther && silentFor < policy.takeoverAfterSeconds) {
    return unchanged(state, 'session_conflict');
  }

  return {
    // 引き継ぎ・復帰いずれも「今から測り直す」。空白期間は課金しない
    state: { ...state, activeSessionId: sessionId, status: 'running', lastTickAtMs: nowMs },
    chargedSeconds: 0,
    autoPaused: false,
    rejected: null,
  };
};

/**
 * 合図を受け取り、経過ぶんを課金する。
 *
 * 課金額 = min(実経過, heartbeatSeconds) … 未証明の時間は課金しない
 *        ただし content イベントは min(実経過, minChargePerContentSeconds) を下回らない
 *
 * 実経過が `idlePauseSeconds` を超えていたら離席とみなして自動pause。
 * それでも課金は上の式のままなので、離席で残り時間が溶けることはない。
 */
export const applyActiveTimeEvent = (
  state: ActiveTimeState,
  ev: ActiveTimeEvent,
  policy: ActiveTimePolicy,
): ActiveTimeResult => {
  if (state.status === 'closed' && ev.kind !== 'resume') return unchanged(state, 'closed');
  if (state.activeSessionId !== null && state.activeSessionId !== ev.sessionId) {
    return unchanged(state, 'session_conflict');
  }

  if (ev.kind === 'close') {
    return {
      state: { ...state, status: 'closed', activeSessionId: null, lastTickAtMs: ev.nowMs },
      chargedSeconds: 0, autoPaused: false, rejected: null,
    };
  }

  if (ev.kind === 'pause') {
    // 明示的な中断。中断を押すまでの区間は課金する（席にはいた）
    const charged = chargeFor(state, ev, policy);
    return {
      state: commit(state, charged, ev.nowMs, 'paused'),
      chargedSeconds: charged, autoPaused: false, rejected: null,
    };
  }

  if (ev.kind === 'resume') {
    if (isExhausted(state)) return unchanged(state, 'exhausted');
    // 中断していた間は課金しない
    return {
      state: { ...state, status: 'running', activeSessionId: ev.sessionId, lastTickAtMs: ev.nowMs },
      chargedSeconds: 0, autoPaused: false, rejected: null,
    };
  }

  // heartbeat / content
  if (isExhausted(state)) return unchanged(state, 'exhausted');
  if (state.status === 'paused') {
    if (ev.kind === 'heartbeat') {
      // 止まっている間の合図では課金しない（裏に回ったタブが時間を溶かさない）
      return {
        state: { ...state, lastTickAtMs: ev.nowMs },
        chargedSeconds: 0, autoPaused: false, rejected: null,
      };
    }
    // content は「今まさに中身を受け取った」＝在席の証拠。計測を再開し、最低課金だけ取る。
    // ここを 0 課金にすると、pauseしてから問題だけ取り続ける経路ができてしまう。
    const resumeCharge = chargeFloor(state, ev, policy);
    return {
      state: commit(state, resumeCharge, ev.nowMs, 'running'),
      chargedSeconds: resumeCharge, autoPaused: false, rejected: null,
    };
  }

  const elapsed = Math.max((ev.nowMs - state.lastTickAtMs) / 1000, 0);
  // 自動pauseは heartbeat が途切れたときの後追い判定。
  // content が来ているあいだは「使っている」ので止めない。
  const autoPaused = ev.kind === 'heartbeat' && elapsed > policy.idlePauseSeconds;
  const charged = chargeFor(state, ev, policy);
  return {
    state: commit(state, charged, ev.nowMs, autoPaused ? 'paused' : 'running'),
    chargedSeconds: charged,
    autoPaused,
    rejected: null,
  };
};

/** content の最低課金だけを取る（実経過を超えない） */
const chargeFloor = (state: ActiveTimeState, ev: ActiveTimeEvent, policy: ActiveTimePolicy): number => {
  const elapsed = Math.max((ev.nowMs - state.lastTickAtMs) / 1000, 0);
  return Math.min(Math.round(Math.min(policy.minChargePerContentSeconds, elapsed)), remainingSeconds(state));
};

/** 課金秒数の計算。**実経過を超えて課金しない**のが不変条件 */
const chargeFor = (state: ActiveTimeState, ev: ActiveTimeEvent, policy: ActiveTimePolicy): number => {
  const elapsed = Math.max((ev.nowMs - state.lastTickAtMs) / 1000, 0);
  const proven = Math.min(elapsed, policy.heartbeatSeconds);
  const floor = ev.kind === 'content' ? Math.min(policy.minChargePerContentSeconds, elapsed) : 0;
  const charge = Math.max(proven, floor);
  // 残りを超えて課金しない（マイナス残時間を作らない）
  return Math.min(Math.round(charge), remainingSeconds(state));
};

const commit = (
  state: ActiveTimeState,
  charged: number,
  nowMs: number,
  status: UsageSessionStatus,
): ActiveTimeState => ({
  ...state,
  consumedSeconds: Math.min(state.consumedSeconds + charged, state.budgetSeconds),
  lastTickAtMs: nowMs,
  status,
});

/**
 * 残り時間の表示文言（§9）。
 * 「一度に使い切らないと損」に見せないため、**残りだけを淡々と言う**。急かす語を入れない。
 */
export const remainingLabel = (s: ActiveTimeState, lang: 'ja' | 'zh'): string => {
  const min = remainingMinutes(s);
  if (remainingSeconds(s) <= 0) return lang === 'zh' ? '已用完' : '使い切りました';
  if (min < 1) return lang === 'zh' ? '还可以使用不到1分钟' : 'あと1分未満使えます';
  return lang === 'zh' ? `还可以使用${min}分钟` : `あと${min}分使えます`;
};

/** 残り少なくなったら知らせるか（PlanConfig の usageWarningThresholdMinutes） */
export const shouldWarnLowRemaining = (s: ActiveTimeState, thresholdMinutes: number): boolean =>
  thresholdMinutes > 0 && remainingSeconds(s) > 0 && remainingMinutes(s) < thresholdMinutes;
