// 30秒ノックのコアロジックの回帰テスト。
//
// いちばん守りたいのは **「必ず結果画面に到達する」** と **「負けが存在しない」** の2つ。
// 旧ラリーゲームは44%が結果画面に到達していなかった（166開始 / 93完了）。
// 作り替えの目的そのものなので、ここが壊れたら実装が間違っている。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HIT_GAP_MS,
  KNOCK_DURATION_MS,
  KNOCK_TARGETS,
  LIT_MS_PHASE_1,
  LIT_MS_PHASE_2,
  LIT_MS_PHASE_3,
  MISS_GAP_MS,
  NO_MISS_STREAK,
  PERFECT_RATIO,
  createKnockState,
  elapsedMs,
  shiftKnockClock,
  hitFeedback,
  knockResult,
  knockScore,
  litDurationFor,
  pickTargetAt,
  rankForKnock,
  remainingMs,
  resolveBest,
  resolveGameMode,
  scoreDelta,
  tapKnock,
  tickKnock,
  vibrateIfAllowed,
} from './knockGame';

/** 決定的な乱数（テストのたびに同じ順番で点く） */
const seqRng = () => {
  let i = 0;
  return () => {
    i += 1;
    return (i * 0.37) % 1;
  };
};

describe('難易度は「点灯時間」1つだけ', () => {
  it('経過秒数 → 点灯時間 の対応（0/9.9/10/19.9/20/29.9秒）', () => {
    expect(litDurationFor(0)).toBe(LIT_MS_PHASE_1);
    expect(litDurationFor(9_900)).toBe(LIT_MS_PHASE_1);
    expect(litDurationFor(10_000)).toBe(LIT_MS_PHASE_2);
    expect(litDurationFor(19_900)).toBe(LIT_MS_PHASE_2);
    expect(litDurationFor(20_000)).toBe(LIT_MS_PHASE_3);
    expect(litDurationFor(29_900)).toBe(LIT_MS_PHASE_3);
  });

  it('3段しかない（値は1200/900/700のいずれか）', () => {
    const seen = new Set<number>();
    for (let t = 0; t < KNOCK_DURATION_MS; t += 100) seen.add(litDurationFor(t));
    expect([...seen].sort((a, b) => b - a)).toEqual([1200, 900, 700]);
  });

  it('変な値でも落ちない（負・NaN）', () => {
    expect(litDurationFor(-1)).toBe(LIT_MS_PHASE_1);
    expect(litDurationFor(Number.NaN)).toBe(LIT_MS_PHASE_1);
  });

  it('点灯時間は経過とともに短くなるだけで、途中で戻らない', () => {
    let prev = Infinity;
    for (let t = 0; t <= 30_000; t += 250) {
      const lit = litDurationFor(t);
      expect(lit).toBeLessThanOrEqual(prev);
      prev = lit;
    }
  });
});

describe('スコアとコンボ', () => {
  it('スコア = 打った本数。連続ヒットでコンボが伸びる', () => {
    const s = createKnockState(seqRng());
    let t = 0;
    tickKnock(s, t);
    for (let i = 0; i < 5; i++) {
      const id = s.lit!.id;
      t += 200;
      const r = tapKnock(s, t, id);
      expect(r.hit).toBe(true);
      expect(r.combo).toBe(i + 1);
      t += HIT_GAP_MS;
      tickKnock(s, t);
    }
    expect(knockScore(s)).toBe(5);
    expect(s.maxCombo).toBe(5);
  });

  it('取り逃す（点灯が消える）とコンボがリセットされる。スコアは減らない', () => {
    const s = createKnockState(seqRng());
    let t = 0;
    tickKnock(s, t);
    // 2本取る
    for (let i = 0; i < 2; i++) {
      t += 150;
      tapKnock(s, t, s.lit!.id);
      t += HIT_GAP_MS;
      tickKnock(s, t);
    }
    expect(s.combo).toBe(2);
    // 1本見送る（点灯時間を過ぎるまで何もしない）
    t += s.lit!.litMs + 1;
    const ev = tickKnock(s, t);
    expect(ev.some((e) => e.type === 'miss')).toBe(true);
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(2);
    expect(knockScore(s)).toBe(2); // 減点しない
    expect(s.over).toBe(false); // 取り逃してもゲームは終わらない
  });

  it('的から遠いタップは何も起きない（外しても罰がない）', () => {
    const s = createKnockState(seqRng());
    tickKnock(s, 0);
    const before = { ...s };
    const r = tapKnock(s, 100, null);
    expect(r.hit).toBe(false);
    expect(s.hits).toBe(before.hits);
    expect(s.combo).toBe(before.combo);
    expect(s.misses).toBe(before.misses);
  });

  it('光っていない場所を触ってもコンボは切れない', () => {
    const s = createKnockState(seqRng());
    tickKnock(s, 0);
    tapKnock(s, 150, s.lit!.id);
    tickKnock(s, 150 + HIT_GAP_MS);
    const lit = s.lit!.id;
    const wrong = (lit + 3) % KNOCK_TARGETS.length;
    const r = tapKnock(s, 200 + HIT_GAP_MS, wrong);
    expect(r.hit).toBe(false);
    expect(s.combo).toBe(1);
  });

  it('Perfectは点灯時間の前半40%以内', () => {
    const s = createKnockState(seqRng());
    tickKnock(s, 0);
    const litMs = s.lit!.litMs;
    const r = tapKnock(s, litMs * PERFECT_RATIO - 1, s.lit!.id);
    expect(r.hit).toBe(true);
    expect(r.perfect).toBe(true);

    const s2 = createKnockState(seqRng());
    tickKnock(s2, 0);
    const r2 = tapKnock(s2, s2.lit!.litMs * PERFECT_RATIO + 1, s2.lit!.id);
    expect(r2.hit).toBe(true);
    expect(r2.perfect).toBe(false);
  });

  it(`${NO_MISS_STREAK}連続でノーミスの合図が出る`, () => {
    const s = createKnockState(seqRng());
    let t = 0;
    tickKnock(s, t);
    const milestones: number[] = [];
    for (let i = 0; i < NO_MISS_STREAK; i++) {
      t += 120;
      const r = tapKnock(s, t, s.lit!.id);
      if (r.streakMilestone) milestones.push(r.combo);
      t += HIT_GAP_MS;
      tickKnock(s, t);
    }
    expect(milestones).toEqual([NO_MISS_STREAK]);
  });

  it('同じ場所は連続で点かない（連打で稼げない）', () => {
    const s = createKnockState(seqRng());
    let t = 0;
    tickKnock(s, t);
    let prev = s.lit!.id;
    for (let i = 0; i < 30; i++) {
      t += 100;
      tapKnock(s, t, s.lit!.id);
      t += HIT_GAP_MS;
      tickKnock(s, t);
      if (!s.lit) break;
      expect(s.lit.id).not.toBe(prev);
      expect(s.lit.id).toBeGreaterThanOrEqual(0);
      expect(s.lit.id).toBeLessThan(KNOCK_TARGETS.length);
      prev = s.lit.id;
    }
  });
});

describe('30秒で必ず終了し、必ず結果に到達する', () => {
  /** 16msフレームで30秒回す。tap の与え方だけ差し替える */
  const play = (onFrame: (s: ReturnType<typeof createKnockState>, t: number) => void) => {
    const s = createKnockState(seqRng());
    let overAt: number | null = null;
    for (let t = 0; t <= 40_000; t += 16) {
      const events = tickKnock(s, t);
      if (events.some((e) => e.type === 'end')) overAt = t;
      if (s.over) break;
      onFrame(s, t);
    }
    return { s, overAt };
  };

  it('ずっと全部取り続けても、30秒ちょうどで終わる', () => {
    const { s, overAt } = play((st, t) => {
      if (st.lit) tapKnock(st, t, st.lit.id);
    });
    expect(s.over).toBe(true);
    expect(s.endedAt).not.toBeNull();
    expect(overAt).toBeGreaterThanOrEqual(KNOCK_DURATION_MS);
    expect(overAt).toBeLessThan(KNOCK_DURATION_MS + 32);
    expect(knockScore(s)).toBeGreaterThan(0);
  });

  it('1回も触らなくても、30秒ちょうどで終わって結果が出る（0点でも記録される）', () => {
    const { s, overAt } = play(() => {});
    expect(s.over).toBe(true);
    expect(overAt).toBeGreaterThanOrEqual(KNOCK_DURATION_MS);
    expect(overAt).toBeLessThan(KNOCK_DURATION_MS + 32);
    const result = knockResult(s);
    expect(result.score).toBe(0);
    expect(result.misses).toBeGreaterThan(0);
  });

  it('フレームが飛んでも（重い端末を想定して1秒スキップ）ちゃんと終わる', () => {
    const s = createKnockState(seqRng());
    let ended = false;
    for (let t = 0; t <= 40_000; t += 1_000) {
      const events = tickKnock(s, t);
      if (events.some((e) => e.type === 'end')) ended = true;
      if (s.over) break;
      if (s.lit) tapKnock(s, t, s.lit.id);
    }
    expect(ended).toBe(true);
    expect(s.over).toBe(true);
  });

  it('終了後は何をしてもスコアが動かない（結果画面が書き換わらない）', () => {
    const { s } = play((st, t) => {
      if (st.lit) tapKnock(st, t, st.lit.id);
    });
    const frozen = knockResult(s);
    tickKnock(s, 60_000);
    tapKnock(s, 60_000, 0);
    expect(knockResult(s)).toEqual(frozen);
  });

  it('終了間際に点灯が始まらない（点いた瞬間に時間切れ、をしない）', () => {
    const s = createKnockState(seqRng());
    for (let t = 0; t <= 30_000; t += 16) {
      tickKnock(s, t);
      if (s.over) break;
      if (s.lit) {
        // 点いた以上、点灯時間の一部は必ず残り時間の中にある
        expect(remainingMs(s, t)).toBeGreaterThan(0);
        tapKnock(s, t, s.lit.id);
      }
    }
    expect(s.over).toBe(true);
  });
});

describe('負けが存在しない', () => {
  it('ずっと取り逃し続けても、30秒経つまで over にならない', () => {
    const s = createKnockState(seqRng());
    let missCount = 0;
    for (let t = 0; t < KNOCK_DURATION_MS; t += 16) {
      const events = tickKnock(s, t);
      missCount += events.filter((e) => e.type === 'miss').length;
      // 時間切れの瞬間を除き、途中で終わってはいけない
      expect(s.over).toBe(false);
    }
    expect(missCount).toBeGreaterThan(10);
    tickKnock(s, KNOCK_DURATION_MS);
    expect(s.over).toBe(true);
  });

  it('取り逃しても次がすぐ点く（手が止まる時間を作らない）', () => {
    const s = createKnockState(seqRng());
    tickKnock(s, 0);
    const litMs = s.lit!.litMs;
    tickKnock(s, litMs + 1);
    expect(s.lit).toBeNull();
    tickKnock(s, litMs + 1 + MISS_GAP_MS);
    expect(s.lit).not.toBeNull();
  });

  it('取り逃しても難易度は上がらない（点灯時間は時刻だけで決まる）', () => {
    const a = createKnockState(seqRng());
    const b = createKnockState(seqRng());
    tickKnock(a, 0);
    // a は全部取る / b は全部見送る、を5秒ぶん
    let t = 0;
    while (t < 5_000) {
      t += 16;
      tickKnock(a, t);
      if (a.lit) tapKnock(a, t, a.lit.id);
    }
    for (let u = 0; u <= 5_000; u += 16) tickKnock(b, u);
    tickKnock(a, 5_016);
    tickKnock(b, 5_016);
    expect(a.lit?.litMs ?? litDurationFor(5_016)).toBe(b.lit?.litMs ?? litDurationFor(5_016));
  });
});

describe('prefers-reduced-motion を尊重する', () => {
  const originalVibrate = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (originalVibrate) Object.defineProperty(globalThis, 'navigator', originalVibrate);
  });

  it('reduced-motion では揺れも振動もパーティクルも0', () => {
    const fb = hitFeedback(true, true);
    expect(fb.shakePx).toBe(0);
    expect(fb.vibrateMs).toBe(0);
    expect(fb.particles).toBe(0);
    // ヒットストップは「動きを止める」演出なので残す
    expect(fb.hitStopMs).toBeGreaterThan(0);
  });

  it('通常時は揺れと振動が出る', () => {
    const fb = hitFeedback(false, false);
    expect(fb.shakePx).toBeGreaterThan(0);
    expect(fb.vibrateMs).toBeGreaterThan(0);
  });

  it('reduced-motion では navigator.vibrate を呼ばない', () => {
    const vibrate = vi.fn();
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate },
      configurable: true,
      writable: true,
    });
    expect(vibrateIfAllowed(15, true)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(vibrateIfAllowed(15, false)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it('vibrate 非対応端末でも落ちない', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(vibrateIfAllowed(15, false)).toBe(false);
  });
});

describe('当たり判定は甘くする', () => {
  const pts = [
    { id: 0, x: 100, y: 300 },
    { id: 1, x: 260, y: 300 },
    { id: 2, x: 68, y: 500 },
  ];

  it('いちばん近い点を返す', () => {
    expect(pickTargetAt(pts, 110, 310, 120)).toBe(0);
    expect(pickTargetAt(pts, 250, 290, 120)).toBe(1);
  });

  it('どの点からも遠いタップは null', () => {
    expect(pickTargetAt(pts, 180, 60, 60)).toBeNull();
  });

  it('点が無ければ null', () => {
    expect(pickTargetAt([], 100, 100, 999)).toBeNull();
  });
});

describe('リザルトの表示', () => {
  it('前回との差分', () => {
    expect(scoreDelta(30, null).kind).toBe('first');
    expect(scoreDelta(30, 25)).toMatchObject({ kind: 'up', amount: 5, text: '前回より +5本' });
    expect(scoreDelta(20, 25)).toMatchObject({ kind: 'down', amount: 5 });
    expect(scoreDelta(25, 25).kind).toBe('same');
  });

  it('ランクは全域で必ず1つ返る', () => {
    for (let n = 0; n <= 200; n++) expect(rankForKnock(n).label).toBeTruthy();
    expect(rankForKnock(0).label).toBe('ビギナー');
    expect(rankForKnock(999).label).toBe('カンスト級');
  });

  it('自己ベストはサーバー値が正。無ければlocalStorageを使う', () => {
    expect(resolveBest(41, 12)).toBe(41);
    expect(resolveBest(null, 12)).toBe(12);
    expect(resolveBest(0, 12)).toBe(12);
    expect(resolveBest(undefined, 0)).toBe(0);
  });
});

describe('モード切替（本番の既定は現行のラリーゲームのまま）', () => {
  it('何も指定しなければ rally', () => {
    expect(resolveGameMode('')).toBe('rally');
    expect(resolveGameMode('?foo=bar')).toBe('rally');
    expect(resolveGameMode('', undefined)).toBe('rally');
    expect(resolveGameMode('', '')).toBe('rally');
  });

  it('?mode=knock / ?knock=1 で新モード', () => {
    expect(resolveGameMode('?mode=knock')).toBe('knock');
    expect(resolveGameMode('?mode=KNOCK')).toBe('knock');
    expect(resolveGameMode('?knock=1')).toBe('knock');
    expect(resolveGameMode('?knock=true')).toBe('knock');
  });

  it('環境変数 VITE_GAME_MODE=knock で既定を切り替えられる', () => {
    expect(resolveGameMode('', 'knock')).toBe('knock');
    expect(resolveGameMode('', 'rally')).toBe('rally');
  });

  it('クエリは環境変数より強い（切り替え後も旧モードを見比べられる）', () => {
    expect(resolveGameMode('?mode=rally', 'knock')).toBe('rally');
    expect(resolveGameMode('?knock=0', 'knock')).toBe('rally');
  });
});

describe('localStorage の自己ベスト（サーバーが無いときの控え）', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('更新したときだけ true', async () => {
    const { getKnockBestLocal, updateKnockBestLocal } = await import('./knockGame');
    expect(updateKnockBestLocal(20)).toBe(true);
    expect(getKnockBestLocal()).toBe(20);
    expect(updateKnockBestLocal(19)).toBe(false);
    expect(getKnockBestLocal()).toBe(20);
  });

  it('前回スコアは0でも記録される（0本のプレイも無かったことにしない）', async () => {
    const { getKnockLastLocal, setKnockLastLocal } = await import('./knockGame');
    expect(getKnockLastLocal()).toBeNull();
    setKnockLastLocal(0);
    expect(getKnockLastLocal()).toBe(0);
  });
});

// ============================================================
// 画面を離れて戻ったとき
//
// requestAnimationFrame は非表示タブで止まる。通知を見て戻る、ホーム画面に
// 一瞬出る、といった普通の操作でこれは起きる。空白をそのまま経過時間に
// 数えると「何もしていないのに終わっていた」になり、画面の
// 「30秒はまるごとあなたのものです」が嘘になる。
//
// 離席かどうかはフレーム間隔からは判定しない（重い端末のコマ落ちと区別が
// つかないため）。visibilitychange で測った実時間を shiftKnockClock に渡す。
// ============================================================
describe('画面を離れて戻っても30秒が削られない', () => {
  it('60秒離れて戻っても、その場で終了しない', () => {
    const s = createKnockState(() => 0.5);
    tickKnock(s, 0);
    tickKnock(s, 5_000); // 5秒プレイ
    expect(s.over).toBe(false);

    // タブが隠れ、60秒後に戻ってくる（その間rAFは1回も呼ばれない）
    shiftKnockClock(s, 60_000);
    tickKnock(s, 65_000);
    expect(s.over).toBe(false);
    expect(elapsedMs(s, 65_000)).toBeLessThan(5_100);
  });

  it('離れていた時間を挟んでも、遊んだ時間の合計が30秒で終わる', () => {
    const s = createKnockState(() => 0.5);
    tickKnock(s, 0);
    for (let t = 16; t <= 20_000; t += 16) tickKnock(s, t); // 20秒プレイ
    expect(s.over).toBe(false);

    const away = 120_000; // 2分離席
    shiftKnockClock(s, away);
    for (let t = 20_000 + away; t <= 20_000 + away + 9_000; t += 16) tickKnock(s, t);
    expect(s.over).toBe(false); // 遊んだのは合計29秒。まだ終わらない

    for (let t = 20_000 + away + 9_016; t <= 20_000 + away + 11_000; t += 16) tickKnock(s, t);
    expect(s.over).toBe(true); // 合計30秒を超えたら終わる
  });

  it('離れている間に点灯が取り逃し扱いにならない', () => {
    const s = createKnockState(() => 0.5);
    tickKnock(s, 0);
    expect(s.lit).not.toBeNull();
    const beforeMisses = s.misses;

    shiftKnockClock(s, 30_000); // 点灯時間をはるかに超える離席のあと復帰
    tickKnock(s, 30_000 + 16);
    expect(s.misses).toBe(beforeMisses);
    expect(s.lit).not.toBeNull();
  });

  it('離席を挟まない限り時計はそのまま（重い端末のコマ落ちは離席ではない）', () => {
    const s = createKnockState(() => 0.5);
    tickKnock(s, 0);
    tickKnock(s, 1_000); // 1秒スキップしても経過は1秒
    expect(elapsedMs(s, 1_000)).toBe(1_000);
  });

  it('開始前・終了後に呼んでも壊れない', () => {
    const notStarted = createKnockState(() => 0.5);
    shiftKnockClock(notStarted, 10_000);
    expect(notStarted.startedAt).toBeNull();

    const done = createKnockState(() => 0.5);
    tickKnock(done, 0);
    tickKnock(done, KNOCK_DURATION_MS + 1);
    expect(done.over).toBe(true);
    const at = done.startedAt;
    shiftKnockClock(done, 10_000);
    expect(done.startedAt).toBe(at);
  });
});
