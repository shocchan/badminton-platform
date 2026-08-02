// 累計アクティブ時間の受入テスト（§9 §19 §20）。
//
// 固定したい不変条件:
//   - サーバー時計だけで測る（クライアントの申告を受け付ける口が無い）
//   - 実際に経過した以上に課金しない
//   - 離席・通信断・ブラウザ終了で残り時間が溶けない
//   - 二重タブで二重に減らない
//   - 再読込で続きから戻れる

import { describe, it, expect } from 'vitest';
import {
  newActiveTimeState, openUsageSession, applyActiveTimeEvent, defaultActiveTimePolicy,
  remainingSeconds, remainingMinutes, isExhausted, consumedRatio, remainingLabel,
  shouldWarnLowRemaining, type ActiveTimeState, type ActiveTimePolicy,
} from './activeTime';

const policy: ActiveTimePolicy = defaultActiveTimePolicy({ heartbeatSeconds: 20, idlePauseSeconds: 90 });
const T0 = 1_700_000_000_000;
const sec = (n: number) => n * 1000;

const start = (budgetMin = 60, at = T0): ActiveTimeState => {
  const s = newActiveTimeState(budgetMin * 60, at);
  return openUsageSession(s, 'tab-A', at, policy).state;
};

/** n回ぶんの正常なheartbeatを流す */
const beat = (s: ActiveTimeState, times: number, sessionId = 'tab-A', gapSec = 20) => {
  let st = s;
  let t = st.lastTickAtMs;
  for (let i = 0; i < times; i++) {
    t += sec(gapSec);
    st = applyActiveTimeEvent(st, { kind: 'heartbeat', sessionId, nowMs: t }, policy).state;
  }
  return st;
};

describe('基本の計測', () => {
  it('開始直後は課金0で、残りは満額', () => {
    const s = start();
    expect(s.consumedSeconds).toBe(0);
    expect(remainingSeconds(s)).toBe(3600);
    expect(remainingMinutes(s)).toBe(60);
    expect(s.status).toBe('running');
  });

  it('20秒間隔のheartbeatは実経過どおりに課金される', () => {
    const s = beat(start(), 3);            // 60秒
    expect(s.consumedSeconds).toBe(60);
    expect(remainingSeconds(s)).toBe(3540);
  });

  it('10分ぶん流すと残り50分', () => {
    const s = beat(start(), 30);           // 30 * 20 = 600秒
    expect(s.consumedSeconds).toBe(600);
    expect(remainingMinutes(s)).toBe(50);
  });
});

describe('クライアントを信用しない', () => {
  it('イベントに「経過秒数」を渡す口が無い（改ざん経路が存在しない）', () => {
    // ActiveTimeEvent は kind / sessionId / nowMs しか持たない。
    // nowMs は呼び出し側（サーバー）が入れる値で、ブラウザから来た値を入れない運用。
    const ev = { kind: 'heartbeat' as const, sessionId: 'tab-A', nowMs: T0 };
    expect(Object.keys(ev).sort()).toEqual(['kind', 'nowMs', 'sessionId']);
  });

  it('サーバー時刻が巻き戻っても、負の課金にならない', () => {
    const s = start();
    const r = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-A', nowMs: T0 - sec(600) }, policy);
    expect(r.chargedSeconds).toBe(0);
    expect(r.state.consumedSeconds).toBe(0);
  });

  it('合図をわざと遅らせても、未証明の時間は課金されない（利用者に不利にしない）', () => {
    const s = start();
    // 10分放置してから1回だけ合図
    const r = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-A', nowMs: T0 + sec(600) }, policy);
    expect(r.chargedSeconds).toBe(policy.heartbeatSeconds);   // 20秒だけ
  });

  it('合図を遅らせて時間を消費せずに学ぶ、はできない（content には最低課金がある）', () => {
    // 問題を100問配らせる。heartbeatを送らなくても、配信ごとに最低5秒は減る
    let s = start();
    let t = s.lastTickAtMs;
    for (let i = 0; i < 100; i++) {
      t += sec(600);   // 極端に間隔を空ける＝合図を送らない攻撃
      s = applyActiveTimeEvent(s, { kind: 'content', sessionId: 'tab-A', nowMs: t }, policy).state;
    }
    // 未証明区間の上限(20秒)が効くので 100 * 20 = 2000秒
    expect(s.consumedSeconds).toBe(2000);
    expect(s.consumedSeconds).toBeGreaterThanOrEqual(100 * policy.minChargePerContentSeconds);
  });

  it('pause中でも content が来たら計測を再開し、最低課金を取る（止めてから問題だけ取る経路を塞ぐ）', () => {
    let s = start();
    s = applyActiveTimeEvent(s, { kind: 'pause', sessionId: 'tab-A', nowMs: T0 + sec(20) }, policy).state;
    expect(s.status).toBe('paused');
    const r = applyActiveTimeEvent(s, { kind: 'content', sessionId: 'tab-A', nowMs: s.lastTickAtMs + sec(600) }, policy);
    expect(r.chargedSeconds).toBe(policy.minChargePerContentSeconds);
    expect(r.state.status).toBe('running');
  });

  it('content の最低課金は、実経過を超えない', () => {
    const s = start();
    // 1秒しか経っていないのに5秒課金しない
    const r = applyActiveTimeEvent(s, { kind: 'content', sessionId: 'tab-A', nowMs: T0 + sec(1) }, policy);
    expect(r.chargedSeconds).toBe(1);
  });
});

describe('離席・通信断・ブラウザ終了（§9）', () => {
  it('idleを超えた空白は自動pauseになり、課金は1インターバルに収まる', () => {
    const s = start();
    const r = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-A', nowMs: T0 + sec(300) }, policy);
    expect(r.autoPaused).toBe(true);
    expect(r.state.status).toBe('paused');
    expect(r.chargedSeconds).toBe(20);
  });

  it('pause中のheartbeatは課金しない（裏に回ったタブが時間を溶かさない）', () => {
    let s = start();
    s = applyActiveTimeEvent(s, { kind: 'pause', sessionId: 'tab-A', nowMs: T0 + sec(20) }, policy).state;
    expect(s.consumedSeconds).toBe(20);
    const r = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-A', nowMs: T0 + sec(3600) }, policy);
    expect(r.chargedSeconds).toBe(0);
    expect(r.state.consumedSeconds).toBe(20);
  });

  it('resume は中断していた間を課金しない', () => {
    let s = beat(start(), 3);                                  // 60秒使った
    s = applyActiveTimeEvent(s, { kind: 'pause', sessionId: 'tab-A', nowMs: s.lastTickAtMs + sec(10) }, policy).state;
    const paused = s.consumedSeconds;
    s = applyActiveTimeEvent(s, { kind: 'resume', sessionId: 'tab-A', nowMs: s.lastTickAtMs + sec(86400) }, policy).state;
    expect(s.consumedSeconds).toBe(paused);
    expect(s.status).toBe('running');
  });

  it('ブラウザを閉じて何日も経ってから戻っても、残り時間は保たれる', () => {
    const before = beat(start(), 30);                          // 10分使用
    // 閉じる操作は無く、単に消えたケース（合図が来ない）
    const later = openUsageSession(before, 'tab-A', before.lastTickAtMs + sec(86400 * 3), policy);
    expect(later.rejected).toBeNull();
    expect(remainingMinutes(later.state)).toBe(50);
    expect(later.chargedSeconds).toBe(0);
  });

  it('「今日はここまで」で閉じても、残り時間はそのまま', () => {
    let s = beat(start(), 15);                                 // 5分
    s = applyActiveTimeEvent(s, { kind: 'close', sessionId: 'tab-A', nowMs: s.lastTickAtMs }, policy).state;
    expect(s.status).toBe('closed');
    expect(s.activeSessionId).toBeNull();
    expect(remainingMinutes(s)).toBe(55);
  });
});

describe('複数回の利用と再開（§9 §19）', () => {
  it('3回に分けて使っても、合計は正しく積み上がる', () => {
    let s = start();
    for (let day = 0; day < 3; day++) {
      s = openUsageSession(s, `tab-day${day}`, s.lastTickAtMs + sec(86400), policy).state;
      s = beat(s, 15, `tab-day${day}`);                        // 各回5分
      s = applyActiveTimeEvent(s, { kind: 'close', sessionId: `tab-day${day}`, nowMs: s.lastTickAtMs }, policy).state;
    }
    expect(s.consumedSeconds).toBe(900);                        // 15分
    expect(remainingMinutes(s)).toBe(45);
  });

  it('reload（同じsessionIdで開き直し）は常に受け付ける', () => {
    const s = beat(start(), 5);
    const r = openUsageSession(s, 'tab-A', s.lastTickAtMs + sec(2), policy);
    expect(r.rejected).toBeNull();
    expect(r.state.consumedSeconds).toBe(s.consumedSeconds);
  });
});

describe('二重タブ（§9 §19）', () => {
  it('使用中の枠を別タブが奪えない', () => {
    const s = beat(start(), 2);
    const r = openUsageSession(s, 'tab-B', s.lastTickAtMs + sec(5), policy);
    expect(r.rejected).toBe('session_conflict');
    expect(r.state).toBe(s);
  });

  it('別タブのイベントは課金されない（二重に減らない）', () => {
    const s = beat(start(), 2);
    const r = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-B', nowMs: s.lastTickAtMs + sec(20) }, policy);
    expect(r.rejected).toBe('session_conflict');
    expect(r.state.consumedSeconds).toBe(s.consumedSeconds);
  });

  it('前のタブが沈黙して十分経てば、新しいタブが引き継げる（強制終了で永久ロックしない）', () => {
    const s = beat(start(), 2);
    const r = openUsageSession(s, 'tab-B', s.lastTickAtMs + sec(policy.takeoverAfterSeconds + 1), policy);
    expect(r.rejected).toBeNull();
    expect(r.state.activeSessionId).toBe('tab-B');
    expect(r.state.consumedSeconds).toBe(s.consumedSeconds);   // 引き継いでも消費は保たれる
  });

  it('2つのタブで同時に流しても、消費は片方ぶんだけ', () => {
    let s = start();
    let t = s.lastTickAtMs;
    for (let i = 0; i < 10; i++) {
      t += sec(20);
      s = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-A', nowMs: t }, policy).state;
      s = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-B', nowMs: t }, policy).state;
    }
    expect(s.consumedSeconds).toBe(200);
  });
});

describe('使い切り', () => {
  it('残りを超えて課金しない（マイナスにならない）', () => {
    let s = start(1);                                          // 1分だけ
    s = beat(s, 10);                                           // 200秒ぶん流す
    expect(s.consumedSeconds).toBe(60);
    expect(remainingSeconds(s)).toBe(0);
    expect(isExhausted(s)).toBe(true);
    expect(consumedRatio(s)).toBe(1);
  });

  it('使い切った枠は開けない', () => {
    let s = start(1);
    s = beat(s, 10);
    expect(openUsageSession(s, 'tab-C', s.lastTickAtMs + sec(10), policy).rejected).toBe('exhausted');
  });

  it('使い切った状態でheartbeatが来ても、状態が壊れない', () => {
    let s = start(1);
    s = beat(s, 10);
    const r = applyActiveTimeEvent(s, { kind: 'heartbeat', sessionId: 'tab-A', nowMs: s.lastTickAtMs + sec(20) }, policy);
    expect(r.rejected).toBe('exhausted');
    expect(r.state.consumedSeconds).toBe(60);
  });
});

describe('残り時間の見せ方（§9「一度に使い切らないと損」に見せない）', () => {
  it('残りを淡々と言うだけで、急かす語を含まない', () => {
    const s = beat(start(), 54);                               // 18分使用 → 残り42分
    expect(remainingLabel(s, 'ja')).toBe('あと42分使えます');
    expect(remainingLabel(s, 'zh')).toBe('还可以使用42分钟');
    for (const w of ['今すぐ', '急い', 'お早め', '損', '尽快', '抓紧']) {
      expect(remainingLabel(s, 'ja').includes(w)).toBe(false);
      expect(remainingLabel(s, 'zh').includes(w)).toBe(false);
    }
  });

  it('1分未満と使い切りを区別して言う', () => {
    let s = start(60);
    s = { ...s, consumedSeconds: 3570 };
    expect(remainingLabel(s, 'ja')).toBe('あと1分未満使えます');
    s = { ...s, consumedSeconds: 3600 };
    expect(remainingLabel(s, 'ja')).toBe('使い切りました');
  });

  it('しきい値を下回ったときだけ知らせる（0なら知らせない）', () => {
    let s = start(60);
    s = { ...s, consumedSeconds: 3600 - 9 * 60 };              // 残り9分
    expect(shouldWarnLowRemaining(s, 10)).toBe(true);
    expect(shouldWarnLowRemaining(s, 5)).toBe(false);
    expect(shouldWarnLowRemaining(s, 0)).toBe(false);
    // 使い切ったら「残りわずか」ではなく別の案内にする
    expect(shouldWarnLowRemaining({ ...s, consumedSeconds: 3600 }, 10)).toBe(false);
  });
});
