// @vitest-environment jsdom
// 戦術ボードの回帰テスト。
//
// 守りたいのは4つ。
//  1. 「触っても何も起きない」操作を作らない（旧実装はモードのせいで4通りあった）
//  2. すでに保存されている旧形式データ（5枠）を壊さない
//  3. 反転（flipped）が保存・復元される（旧実装は保存対象外でコート表記が逆になった）
//  4. 選手追加で座標が重ならない／ドラッグ直後に「戻す」が押せる
//  5. 下バーから ☰ の中へ移した操作が、ちゃんと押せて効く
//     （常時ボタンを3つに絞ったので、「奥に入れたら押せなくなった」が起きても
//      画面を見ない限り気づけない。ここで固定する）
//
// LLM・DB・ネットワークには触らない。localStorage のみ使う。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import TacticsBoard, {
  GESTURE_KINDS,
  applyGesture,
  applyFormation,
  applySnapshot,
  snapshotOf,
  sameSnapshot,
  normalizeSlots,
  migrateArrow,
  nextPlayerLabel,
  freeSpot,
  addPlayerTo,
  pushSnapshot,
  canUndo,
  canRedo,
  hintFor,
  seedBoard,
  loadInitialBoard,
  arrowColor,
  isTacticsBoardRoute,
  LEGACY_MOVE_COLOR,
  SHUTTLE_COLOR,
  LS_KEY,
  LS_LAST,
  LS_SEEN,
  DEFAULT_PLAYERS,
  type BoardState,
  type Gesture,
  type Player,
} from './TacticsBoard';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..');

// ------------------------------------------------------------
// 代表状態: 選手2人 + 矢印1本 + 選択あり
// ------------------------------------------------------------
const P: Player[] = [
  { id: 'a', type: 'male', team: 'us', x: 30, y: 70, label: 'M1' },
  { id: 'b', type: 'female', team: 'them', x: 60, y: 30, label: 'F1' },
];

function baseState(): BoardState {
  return {
    players: P.map((p) => ({ ...p })),
    arrows: [{ id: 'arr', kind: 'shuttle', fromX: 30, fromY: 70, toX: 60, toY: 30, curveX: 45, curveY: 50 }],
    flipped: false,
    selected: 'a',
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ============================================================
// 1. 「何も起きない」操作がゼロであること
// ============================================================
describe('ジェスチャ: 7通りすべてが必ず何かを起こす', () => {
  // 表の各行に対応する代表ジェスチャ。ここが空だと表の行が実装されていない
  const cases: Record<(typeof GESTURE_KINDS)[number], Gesture> = {
    'player-move': { kind: 'player-move', playerId: 'a', x: 44, y: 55 },
    'player-select': { kind: 'player-select', playerId: 'b' },
    'player-arrow': { kind: 'player-arrow', playerId: 'a', toX: 40, toY: 50 },
    'shuttle-arrow': { kind: 'shuttle-arrow', fromX: 10, fromY: 90, toX: 80, toY: 20 },
    'clear-selection': { kind: 'clear-selection' },
    'arrow-select': { kind: 'arrow-select', arrowId: 'arr' },
    'arrow-curve': { kind: 'arrow-curve', arrowId: 'arr', x: 20, y: 20 },
  };

  it('表の7行がすべて実装されている', () => {
    expect(GESTURE_KINDS).toHaveLength(7);
    expect(Object.keys(cases).sort()).toEqual([...GESTURE_KINDS].sort());
  });

  for (const kind of GESTURE_KINDS) {
    it(`${kind} は盤面を変える`, () => {
      const before = baseState();
      const { next, changed } = applyGesture(before, cases[kind]);
      expect(changed, `${kind} が「何も起きない」になっている`).toBe(true);
      expect(next).not.toBe(before);
      expect(JSON.stringify(next)).not.toEqual(JSON.stringify(before));
    });
  }

  it('選手タップは選択トグル（2回目で解除）＝押して無反応にならない', () => {
    const s = baseState();
    const first = applyGesture(s, { kind: 'player-select', playerId: 'b' });
    expect(first.next.selected).toBe('b');
    const second = applyGesture(first.next, { kind: 'player-select', playerId: 'b' });
    expect(second.changed).toBe(true);
    expect(second.next.selected).toBeNull();
  });

  it('選手からドラッグすると、その選手の色の「動き」矢印になる', () => {
    const s = baseState();
    const { next } = applyGesture(s, { kind: 'player-arrow', playerId: 'a', toX: 40, toY: 50 });
    const arrow = next.arrows[next.arrows.length - 1];
    expect(arrow.kind).toBe('move');
    expect(arrow.ownerId).toBe('a');
    expect(arrow.fromX).toBe(30); // 選手の位置から始まる
    expect(arrow.fromY).toBe(70);
    expect(next.selected).toBe(arrow.id);
    expect(arrowColor(arrow, next.players)).toBe(arrowColor(arrow, next.players));
    expect(arrowColor(arrow, next.players)).not.toBe(SHUTTLE_COLOR);
  });

  it('空きコートをなぞるとシャトルの軌道（黄・実線）になる', () => {
    const { next } = applyGesture(baseState(), { kind: 'shuttle-arrow', fromX: 10, fromY: 90, toX: 80, toY: 20 });
    const arrow = next.arrows[next.arrows.length - 1];
    expect(arrow.kind).toBe('shuttle');
    expect(arrowColor(arrow, next.players)).toBe(SHUTTLE_COLOR);
  });
});

// ============================================================
// 2. 旧形式の保存データが読めること
// ============================================================
describe('旧形式の保存データ（互換）', () => {
  // 旧実装が localStorage["tacticsBoard_slots"] に書いていた形そのまま
  const legacy = [
    {
      name: 'スロット1',
      data: {
        players: [
          { id: 'p1', type: 'male', team: 'us', x: 35, y: 75, label: 'M1' },
          { id: 'p3', type: 'female', team: 'them', x: 65, y: 20, label: 'F2' },
        ],
        arrows: [
          { id: 'x1', type: 'serve', fromX: 60, fromY: 80, toX: 40, toY: 30, curveX: 50, curveY: 55 },
          { id: 'x2', type: 'receive', fromX: 30, fromY: 70, toX: 30, toY: 55, curveX: 30, curveY: 62 },
        ],
      },
    },
    { name: 'スロット2', data: null },
  ];

  it('5枠に正規化され、1枠目のデータが生きている', () => {
    const slots = normalizeSlots(legacy);
    expect(slots).toHaveLength(5);
    expect(slots[0].data?.players).toHaveLength(2);
    expect(slots[0].data?.arrows).toHaveLength(2);
    expect(slots[1].data).toBeNull();
    expect(slots[4].name).toBe('スロット5');
  });

  it('flipped を持たない旧データは false として読む', () => {
    expect(normalizeSlots(legacy)[0].data?.flipped).toBe(false);
  });

  it('日時を持たない旧データは savedAt=null（表示は「保存済み」）', () => {
    expect(normalizeSlots(legacy)[0].savedAt).toBeNull();
  });

  it('serve→シャトル / receive→人の動き（旧レシーブの緑を保って見た目を変えない）', () => {
    const slots = normalizeSlots(legacy);
    const [serve, receive] = slots[0].data!.arrows;
    expect(serve.kind).toBe('shuttle');
    expect(receive.kind).toBe('move');
    expect(receive.color).toBe(LEGACY_MOVE_COLOR);
  });

  it('壊れた値でも落ちずに空5枠を返す', () => {
    for (const bad of [null, undefined, 0, 'x', {}, [1, 2, 3], [{ name: 5, data: { players: 'no' } }]]) {
      const slots = normalizeSlots(bad);
      expect(slots).toHaveLength(5);
      expect(slots.every((s) => typeof s.name === 'string')).toBe(true);
    }
  });

  it('矢印1本ぶんの移行: 座標が欠けていたら捨てる', () => {
    expect(migrateArrow({ type: 'serve', fromX: 1, fromY: 2 })).toBeNull();
    expect(migrateArrow(null)).toBeNull();
    const ok = migrateArrow({ type: 'serve', fromX: 1, fromY: 2, toX: 3, toY: 4 });
    expect(ok?.curveX).toBe(2); // curve が無ければ中点で補う
    expect(ok?.curveY).toBe(3);
  });

  it('localStorage に旧形式が入っていても loadInitialBoard は落ちない', () => {
    localStorage.setItem(LS_KEY, JSON.stringify(legacy));
    localStorage.setItem(LS_SEEN, '1');
    localStorage.setItem(LS_LAST, '{{ broken');
    const { board } = loadInitialBoard();
    expect(board.players.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 3. flipped が保存・復元されること
// ============================================================
describe('反転（flipped）の保存と復元', () => {
  it('保存 → JSON往復 → 読込 で flipped が保たれる', () => {
    const flippedBoard: BoardState = { ...baseState(), flipped: true };
    const slots = normalizeSlots([{ name: 'スロット1', savedAt: 1_700_000_000_000, data: snapshotOf(flippedBoard) }]);
    const round = normalizeSlots(JSON.parse(JSON.stringify(slots)));
    expect(round[0].data?.flipped).toBe(true);
    expect(round[0].savedAt).toBe(1_700_000_000_000);

    const restored = applySnapshot({ ...baseState(), flipped: false, selected: null }, round[0].data!);
    expect(restored.flipped).toBe(true);
  });

  it('スナップショットは flipped を必ず含む', () => {
    expect(Object.keys(snapshotOf(baseState())).sort()).toEqual(['arrows', 'flipped', 'players']);
  });

  it('復元時、消えた選手を選択したままにしない', () => {
    const restored = applySnapshot({ ...baseState(), selected: 'zzz' }, snapshotOf(baseState()));
    expect(restored.selected).toBeNull();
  });
});

// ============================================================
// 4. 選手追加で重ならない・採番が重複しない
// ============================================================
describe('選手追加', () => {
  it('同じボタンを3回押しても座標が重ならない', () => {
    let s: BoardState = { players: [], arrows: [], flipped: false, selected: null };
    s = addPlayerTo(s, 'male', 'us');
    s = addPlayerTo(s, 'male', 'us');
    s = addPlayerTo(s, 'male', 'us');
    expect(s.players).toHaveLength(3);
    for (let i = 0; i < s.players.length; i++) {
      for (let j = i + 1; j < s.players.length; j++) {
        const d = Math.hypot(s.players[i].x - s.players[j].x, s.players[i].y - s.players[j].y);
        expect(d, `${s.players[i].label} と ${s.players[j].label} が重なっている`).toBeGreaterThan(6);
      }
    }
  });

  it('ラベルが重複しない（旧実装は M1(自)/M2(相) の状態で追加すると M2 が二重になった）', () => {
    let s: BoardState = { players: DEFAULT_PLAYERS.map((p) => ({ ...p })), arrows: [], flipped: false, selected: null };
    s = addPlayerTo(s, 'male', 'them');
    const labels = s.players.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain('M3');
  });

  it('nextPlayerLabel は空き番号を拾う', () => {
    const ps: Player[] = [
      { id: '1', type: 'male', team: 'us', x: 0, y: 0, label: 'M1' },
      { id: '2', type: 'male', team: 'them', x: 0, y: 0, label: 'M3' },
    ];
    expect(nextPlayerLabel(ps, 'male')).toBe('M2');
    expect(nextPlayerLabel(ps, 'female')).toBe('F1');
  });

  it('freeSpot は空いていればそのまま返す', () => {
    expect(freeSpot([], 50, 84)).toEqual({ x: 50, y: 84 });
  });
});

// ============================================================
// 5. 履歴（ドラッグ直後に「戻す」が押せる）
// ============================================================
describe('履歴', () => {
  it('1手積んだ時点で undo が有効になる', () => {
    const h0 = { stack: [snapshotOf(baseState())], index: 0 };
    expect(canUndo(h0)).toBe(false);
    const h1 = pushSnapshot(h0, snapshotOf({ ...baseState(), flipped: true }));
    expect(canUndo(h1)).toBe(true);
    expect(canRedo(h1)).toBe(false);
  });

  it('選択が変わっただけの手は積まない（sameSnapshot）', () => {
    const s = baseState();
    const onlySelection = applyGesture(s, { kind: 'player-select', playerId: 'b' }).next;
    expect(sameSnapshot(s, onlySelection)).toBe(true);

    const moved = applyGesture(s, { kind: 'player-move', playerId: 'a', x: 10, y: 10 }).next;
    expect(sameSnapshot(s, moved)).toBe(false);

    const drawn = applyGesture(s, { kind: 'shuttle-arrow', fromX: 1, fromY: 1, toX: 9, toY: 9 }).next;
    expect(sameSnapshot(s, drawn)).toBe(false);
  });

  it('戻したあとに新しい手を積むと、進む先は捨てられる', () => {
    let h = { stack: [snapshotOf(baseState())], index: 0 };
    h = pushSnapshot(h, snapshotOf({ ...baseState(), flipped: true }));
    h = { stack: h.stack, index: 0 };
    expect(canRedo(h)).toBe(true);
    // Snapshot に selected は含まれない（選択は履歴に残さない）。
    // ここで必要なのは「戻したあとに何か1手積む」ことだけなので、素の盤面を積む。
    h = pushSnapshot(h, snapshotOf(baseState()));
    expect(canRedo(h)).toBe(false);
    expect(h.stack).toHaveLength(2);
  });
});

// ============================================================
// 6. フォーメーション（初見の1手目）
// ============================================================
describe('フォーメーション', () => {
  it('選手がいない状態でも1タップで2対2が揃う', () => {
    const empty: BoardState = { players: [], arrows: [], flipped: false, selected: null };
    const s = applyFormation(empty, 'topback');
    expect(s.players.filter((p) => p.team === 'us')).toHaveLength(2);
    expect(s.players.filter((p) => p.team === 'them')).toHaveLength(2);
    const labels = s.players.map((p) => p.label);
    expect(new Set(labels).size).toBe(4);
  });

  it('サイド・バイ・サイドは左右に並ぶ', () => {
    const s = applyFormation({ players: [], arrows: [], flipped: false, selected: null }, 'side');
    const us = s.players.filter((p) => p.team === 'us');
    expect(us[0].y).toBe(us[1].y);
    expect(us[0].x).not.toBe(us[1].x);
  });

  it('1対1は各サイド1人になり、持ち主を失った矢印は残る', () => {
    const start: BoardState = {
      players: DEFAULT_PLAYERS.map((p) => ({ ...p })),
      arrows: [{ id: 'm', kind: 'move', ownerId: 'p2', fromX: 65, fromY: 80, toX: 60, toY: 60, curveX: 62, curveY: 70 }],
      flipped: false,
      selected: null,
    };
    const s = applyFormation(start, 'singles');
    expect(s.players.filter((p) => p.team === 'us')).toHaveLength(1);
    expect(s.players.filter((p) => p.team === 'them')).toHaveLength(1);
    expect(s.arrows).toHaveLength(1);
    expect(s.arrows[0].ownerId).toBeUndefined();
    expect(arrowColor(s.arrows[0], s.players)).toBe(LEGACY_MOVE_COLOR);
  });
});

// ============================================================
// 7. 初回訪問と1行ヒント
// ============================================================
describe('初回訪問と1行ヒント', () => {
  it('初回は矢印2本（サーブ＋カバー）が描かれた状態で開く', () => {
    const { board, firstVisit } = loadInitialBoard();
    expect(firstVisit).toBe(true);
    expect(board.arrows).toHaveLength(2);
    expect(board.arrows.map((a) => a.kind).sort()).toEqual(['move', 'shuttle']);
  });

  it('2回目以降は前回の状態を読む', () => {
    localStorage.setItem(LS_SEEN, '1');
    localStorage.setItem(LS_LAST, JSON.stringify(snapshotOf({ ...baseState(), flipped: true })));
    const { board, firstVisit } = loadInitialBoard();
    expect(firstVisit).toBe(false);
    expect(board.flipped).toBe(true);
    expect(board.players).toHaveLength(2);
  });

  it('ヒントは常に1行あり、状況で変わる', () => {
    const idle = hintFor({ ...baseState(), selected: null });
    const onPlayer = hintFor(baseState());
    const onArrow = hintFor({ ...baseState(), selected: 'arr' });
    const drawing = hintFor(baseState(), { drawing: 'shuttle' });
    for (const h of [idle, onPlayer, onArrow, drawing]) expect(h.length).toBeGreaterThan(0);
    expect(new Set([idle, onPlayer, onArrow, drawing]).size).toBe(4);
    expect(onPlayer).toContain('M1');
  });

  it('seedBoard は毎回きれいな盤面を返す（参照を共有しない）', () => {
    const a = seedBoard();
    const b = seedBoard();
    a.players[0].x = 1;
    expect(b.players[0].x).not.toBe(1);
  });
});

// ============================================================
// 8. chromeless ルート判定
// ============================================================
describe('App の chromeless 判定', () => {
  it('/ja|zh/tactics-board だけを対象にする', () => {
    expect(isTacticsBoardRoute('/ja/tactics-board')).toBe(true);
    expect(isTacticsBoardRoute('/zh/tactics-board/')).toBe(true);
    expect(isTacticsBoardRoute('/ja/tactics-boardxx')).toBe(false);
    expect(isTacticsBoardRoute('/ja/game')).toBe(false);
    expect(isTacticsBoardRoute('/ja/ai-course')).toBe(false);
  });

  it('App.tsx の chromeless 行が tactics-board を含む（フッターで画面の55%を失わない）', () => {
    const src = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    const line = src.split('\n').find((l) => l.includes('const chromeless'));
    expect(line).toBeDefined();
    expect(line).toContain('tactics-board');
  });
});

// ============================================================
// 9. 画面（jsdom）: 3ボタン・4チップ・ドラッグ直後の「戻す」
// ============================================================
describe('画面', () => {
  const COURT_SLOT = { w: 360, h: 600 };
  let originalRect: typeof Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    localStorage.clear();
    // jsdom はレイアウトしないので、コート枠と余り領域の寸法を与える
    originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const el = this as HTMLElement;
      const w = parseFloat(el.style?.width ?? '');
      const h = parseFloat(el.style?.height ?? '');
      const box = w && h ? { width: w, height: h } : { width: COURT_SLOT.w, height: COURT_SLOT.h };
      return { x: 0, y: 0, left: 0, top: 0, right: box.width, bottom: box.height, ...box, toJSON: () => ({}) } as DOMRect;
    };
    // erasableSyntaxOnly: パラメータプロパティは使えないので明示代入にする
    vi.stubGlobal('ResizeObserver', class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe() { this.cb([], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalRect;
    vi.unstubAllGlobals();
  });

  const undoButton = () => screen.getByRole('button', { name: /戻す/ }) as HTMLButtonElement;

  const pointerEvent = (type: string, x: number, y: number) => {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    return ev;
  };

  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /作戦メニュー/ }));
  const closeMenu = () => fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

  it('常時ボタンは3つ、フォーメーションチップは4つ', () => {
    render(<TacticsBoard />);
    for (const name of ['戻す', '作戦メニュー', '画像にする']) {
      expect(screen.getByRole('button', { name: new RegExp(name) }), name).toBeTruthy();
    }
    // 帯の中に4つ目を足さない（数が増えると初見は「機能が多い」で手が止まる）
    const bar = screen.getByRole('button', { name: /画像にする/ }).parentElement!;
    expect(bar.querySelectorAll('button')).toHaveLength(3);

    for (const chip of ['サイド・バイ・サイド', 'トップ＆バック', '前後ローテ', '1対1']) {
      expect(screen.getByRole('button', { name: chip }), chip).toBeTruthy();
    }
    // ☰ の中へ移した2つは、開くまで表に出ていない
    expect(screen.queryByRole('button', { name: /矢印/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /入れかえる/ })).toBeNull();
    // 旧UIのモード切替は消えている
    expect(screen.queryByRole('button', { name: /サーブ矢印/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /レシーブ矢印/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /選択・移動/ })).toBeNull();
  });

  it('☰ を開けば、隠した操作すべてに手が届く', () => {
    render(<TacticsBoard />);
    openMenu();
    // 下バーから移したもの＋もともとシートにあったもの。1つでも欠けたら機能が消えている
    for (const name of [
      /矢印をぜんぶ消す/, /コートの上下を入れかえる/, /やり直す/,
      /＋ 自分側（男）/, /＋ 自分側（女）/, /＋ 相手側（男）/, /＋ 相手側（女）/,
      /最初の状態に戻す/,
    ]) {
      expect(screen.getByRole('button', { name }), String(name)).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: '保存' })).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: '読込' })).toHaveLength(5);
  });

  it('☰ の「矢印をぜんぶ消す」は効いて、シートが閉じて、「戻す」で戻る', () => {
    const { container } = render(<TacticsBoard />);
    const arrows = () => container.querySelectorAll('[data-arrow-hit]').length;
    expect(arrows()).toBe(2); // 初回の見本（サーブ＋カバー）

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /矢印をぜんぶ消す/ }));
    // 結果はシートの後ろのコートに出る。閉じないと「効いたのか」が分からず二度押しになる
    expect(screen.queryByRole('button', { name: /矢印をぜんぶ消す/ })).toBeNull();
    expect(arrows()).toBe(0);

    fireEvent.click(undoButton());
    expect(arrows()).toBe(2);
  });

  it('☰ の「コートの上下を入れかえる」は表記を入れかえ、保存にも残る', () => {
    const { container } = render(<TacticsBoard />);
    const topLabel = () => container.querySelector('svg.composite text')!.textContent;
    expect(topLabel()).toBe('相手');

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /コートの上下を入れかえる/ }));
    expect(screen.queryByRole('button', { name: /コートの上下を入れかえる/ })).toBeNull();
    expect(topLabel()).toBe('自分たち');
    expect(JSON.parse(localStorage.getItem(LS_LAST)!).flipped).toBe(true);
  });

  it('☰ の「やり直す」がスマホからの唯一の redo 出口になっている', () => {
    render(<TacticsBoard />);
    const redoButton = () => screen.getByRole('button', { name: /やり直す/ }) as HTMLButtonElement;

    openMenu();
    expect(redoButton().disabled).toBe(true); // 戻していないので進めない
    closeMenu();

    fireEvent.click(screen.getByRole('button', { name: 'トップ＆バック' }));
    fireEvent.click(undoButton());
    expect(undoButton().disabled).toBe(true); // 1手ぶん戻り切っている

    openMenu();
    expect(redoButton().disabled).toBe(false);
    fireEvent.click(redoButton());
    // 押したらシートは閉じる。開いたままだと、結果が出る後ろのコートが
    // 暗幕とシートでほぼ隠れていて「効いたのか分からない」ままになるため
    expect(screen.queryByRole('button', { name: /やり直す/ })).toBeNull();
    expect(undoButton().disabled).toBe(false);
  });

  it('起動直後は「戻す」が押せない', () => {
    render(<TacticsBoard />);
    expect(undoButton().disabled).toBe(true);
  });

  it('フォーメーションを1回タップすると「戻す」が押せる', () => {
    render(<TacticsBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'トップ＆バック' }));
    expect(undoButton().disabled).toBe(false);
  });

  it('選手をドラッグした直後に「戻す」が押せる（旧実装は再レンダーが省略され押せなかった）', () => {
    const { container } = render(<TacticsBoard />);
    const hit = container.querySelector('[data-player-hit="p1"]');
    expect(hit).toBeTruthy();

    fireEvent(hit!, pointerEvent('pointerdown', 90, 430));
    act(() => { window.dispatchEvent(pointerEvent('pointermove', 150, 380)); });
    act(() => { window.dispatchEvent(pointerEvent('pointerup', 150, 380)); });

    expect(undoButton().disabled).toBe(false);
    // 動かした選手が選択され、→ハンドルが出ている
    expect(container.querySelector('[data-handle-hit="p1"]')).toBeTruthy();
  });

  it('タップして選択しただけでは履歴を積まない（押しても何も変わらない「戻す」を作らない）', () => {
    const { container } = render(<TacticsBoard />);
    const hit = container.querySelector('[data-player-hit="p1"]')!;
    fireEvent(hit, pointerEvent('pointerdown', 90, 430));
    act(() => { window.dispatchEvent(pointerEvent('pointerup', 90, 430)); });
    expect(container.querySelector('[data-handle-hit="p1"]')).toBeTruthy(); // 選択はされている
    expect(undoButton().disabled).toBe(true); // が、履歴は増えていない
  });

  it('選手をタップすると選択され、コートをタップすると解除される', () => {
    const { container } = render(<TacticsBoard />);
    const hit = container.querySelector('[data-player-hit="p1"]')!;
    fireEvent(hit, pointerEvent('pointerdown', 90, 430));
    act(() => { window.dispatchEvent(pointerEvent('pointerup', 90, 430)); });
    expect(container.querySelector('[data-handle-hit="p1"]')).toBeTruthy();

    const court = container.querySelector('svg.composite')!;
    fireEvent(court, pointerEvent('pointerdown', 20, 20));
    act(() => { window.dispatchEvent(pointerEvent('pointerup', 20, 20)); });
    expect(container.querySelector('[data-handle-hit="p1"]')).toBeNull();
  });

  it('コートをなぞるとシャトルの矢印が1本増える', () => {
    const { container } = render(<TacticsBoard />);
    const before = container.querySelectorAll('[data-arrow-hit]').length;
    const court = container.querySelector('svg.composite')!;
    fireEvent(court, pointerEvent('pointerdown', 40, 500));
    act(() => { window.dispatchEvent(pointerEvent('pointermove', 250, 120)); });
    act(() => { window.dispatchEvent(pointerEvent('pointerup', 250, 120)); });
    expect(container.querySelectorAll('[data-arrow-hit]').length).toBe(before + 1);
  });

  it('ルートは1画面ぶんの高さで、内側にスクロールを作らない', () => {
    const { container } = render(<TacticsBoard />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.height).toBe('100dvh');
    expect(root.style.overflow).toBe('hidden');
    expect(root.style.position).toBe('fixed');
  });
});

// ============================================================
// 10. 高さの計算元がひとつであること（ソース検査）
// ------------------------------------------------------------
// jsdom は env() や dvh を評価しないので、ここだけは実装ソースを直接見る。
// 旧実装は CSS が 100vh・コートが window.innerHeight*0.62 と計算元が2つあり、
// iOS の URL バー表示で 110〜180px ズレて操作パネルが画面外へ潜っていた。
// ============================================================
describe('高さの計算元（回帰）', () => {
  const src = readFileSync(path.join(SRC, 'components/TacticsBoard.tsx'), 'utf8');
  // 設計メモのコメントに旧実装の値が出てくるので、コード行だけを見る
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('100dvh と safe-area を使う', () => {
    expect(code).toContain('100dvh');
    expect(code).toContain('env(safe-area-inset-top)');
    expect(code).toContain('env(safe-area-inset-bottom)');
  });

  it('100vh も window.innerHeight も使わない', () => {
    expect(code).not.toContain('100vh');
    expect(code).not.toContain('innerHeight');
    expect(code).not.toContain('innerWidth');
  });

  it('コートの大きさは実測（ResizeObserver）で決める', () => {
    expect(code).toContain("ResizeObserver");
    expect(code).toContain("getBoundingClientRect");
  });

  it('モード（Tool state）は残っていない', () => {
    expect(code).not.toMatch(/serve-arrow|receive-arrow/);
    expect(code).not.toMatch(/useState<Tool>/);
  });
});
