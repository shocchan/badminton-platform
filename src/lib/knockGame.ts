// 30秒ノック（ゲーム設計案B）のコアロジック。描画・DOMに依存しない。
//
// ■ なぜラリーゲームを作り替えたか（2026-08 の実測）
//   ・中央値4ラリー、49%が3ラリー以下で終了。26%は1ラリーで終わる
//   ・44%が結果画面に到達していない（game_sessions 166開始 / 93完了）
//   ・0ラリーのプレイは記録すらされていなかった
//   ・判定窓300msに対し、横ブレなしで返せる実効窓は115ms（38%）。
//     窓の端で振ると deviation が OUT_X=0.98 を単独で超え、立ち位置に関係なくアウトになる。
//     「打てた音がしたのに死ぬ」ので、遊んだ人の中で学習が起きない
//   ・79%が1日しか遊ばない
//   ただし上達はしている（5回以上遊んだ9人中8人がラリー数を伸ばした）。見えていないだけ。
//
// ■ 中核の設計（ここを崩すと作り替えた意味がなくなる）
//   1. 負けが存在しない。30秒固定。触れなければカウントされないだけで、ゲームは続く
//   2. スコア = 打った本数。線形なので毎回数字が動く（Perfect本数と最大コンボは別枠の記録）
//   3. 難易度パラメータは「点灯時間」1つだけ。ラリー数依存で4つ同時に上げたりしない
//   4. 狙う＋タイミングの2軸同時を解消。光っている間に触るだけ
//   5. 必ず結果画面に到達する（時間切れ以外の終了条件を持たない）

import { createRng } from './rallyGame';

// ── 時間と難易度 ──

/** 1プレイの長さ。固定30秒 */
export const KNOCK_DURATION_MS = 30_000;
/** 難易度が1段上がる時刻 */
export const PHASE_2_AT_MS = 10_000;
export const PHASE_3_AT_MS = 20_000;
/** 点灯時間（唯一の難易度パラメータ） */
export const LIT_MS_PHASE_1 = 1200;
export const LIT_MS_PHASE_2 = 900;
export const LIT_MS_PHASE_3 = 700;

/**
 * 経過秒数 → 点灯時間。
 * 0-10秒=1200ms / 10-20秒=900ms / 20-30秒=700ms の3段だけ。
 * 上がるのはここだけで、位置の散らばりも点灯間隔も一定のまま。
 */
export function litDurationFor(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < PHASE_2_AT_MS) return LIT_MS_PHASE_1;
  if (elapsedMs < PHASE_3_AT_MS) return LIT_MS_PHASE_2;
  return LIT_MS_PHASE_3;
}

/** ヒット後、次が点くまでの間（ヒットストップ80ms＋わずかな余韻） */
export const HIT_GAP_MS = 140;
/** 取り逃し後、次が点くまでの間。止まった感じを出さないよう短くする */
export const MISS_GAP_MS = 90;
/** 残りがこれ未満なら新しく点けない（点いた瞬間に時間切れ、を防ぐ） */
export const MIN_SPAWN_REMAIN_MS = 200;
/** 点灯時間のうち、この割合以内に触れたら Perfect */
export const PERFECT_RATIO = 0.4;
/** この本数だけ連続で取ると「ノーミス！」 */
export const NO_MISS_STREAK = 10;

// ── ノックの6点（実際のバド練習「6点ノック」をコート手前側に置いたもの） ──

export interface KnockTarget {
  id: number;
  /** コート横位置 -1〜1 */
  x: number;
  /** 奥行き 0=自分のベースライン, 0.5=ネット */
  d: number;
  label: string;
}

export const KNOCK_TARGETS: KnockTarget[] = [
  { id: 0, x: -0.52, d: 0.42, label: '前左' },
  { id: 1, x: 0.52, d: 0.42, label: '前右' },
  { id: 2, x: -0.58, d: 0.24, label: '中左' },
  { id: 3, x: 0.58, d: 0.24, label: '中右' },
  { id: 4, x: -0.6, d: 0.07, label: '後左' },
  { id: 5, x: 0.6, d: 0.07, label: '後右' },
];

// ── 状態 ──

export interface KnockLit {
  id: number;
  litAt: number;
  litMs: number;
}

export interface KnockState {
  /** 最初のフレームで入る。null = まだ1フレームも回っていない */
  startedAt: number | null;
  now: number;
  lit: KnockLit | null;
  nextSpawnAt: number;
  lastId: number;
  hits: number;
  perfects: number;
  /** 点灯が消えるまで触れなかった回数。ゲームは終わらない */
  misses: number;
  combo: number;
  maxCombo: number;
  over: boolean;
  endedAt: number | null;
  rng: () => number;
}

export type KnockEvent =
  | { type: 'spawn'; id: number; litMs: number }
  | { type: 'miss'; id: number }
  | { type: 'end' };

export interface KnockResult {
  score: number;
  perfects: number;
  maxCombo: number;
  misses: number;
}

export function createKnockState(rng: () => number = createRng()): KnockState {
  return {
    startedAt: null,
    now: 0,
    lit: null,
    nextSpawnAt: 0,
    lastId: -1,
    hits: 0,
    perfects: 0,
    misses: 0,
    combo: 0,
    maxCombo: 0,
    over: false,
    endedAt: null,
    rng,
  };
}

export function elapsedMs(s: KnockState, now: number): number {
  if (s.startedAt == null) return 0;
  return Math.max(0, now - s.startedAt);
}

/**
 * 時計を awayMs だけ後ろへずらす（＝その時間はなかったことにする）。
 *
 * 画面を離れている間は requestAnimationFrame が止まる。戻ってきたときに空白を
 * そのまま経過時間に数えると、時計が一気に飛んで「何もしていないのに終わっていた」
 * になる。通知を見る・ホームに一瞬出るは普通の操作なので、そこで30秒を削らない。
 * 画面の「30秒はまるごとあなたのものです」を守るための処理。
 *
 * フレームの間隔から離席を推測はしない。重い端末のコマ落ちと区別がつかないため、
 * 呼び出し側が visibilitychange で実際に隠れていた時間を測って渡すこと。
 */
export function shiftKnockClock(s: KnockState, awayMs: number): void {
  if (s.startedAt == null || s.over || awayMs <= 0) return;
  s.startedAt += awayMs;
  s.nextSpawnAt += awayMs;
  if (s.lit) s.lit.litAt += awayMs;
}

export function remainingMs(s: KnockState, now: number): number {
  return Math.max(0, KNOCK_DURATION_MS - elapsedMs(s, now));
}

/** スコア = 打った本数。倍率も減点もない */
export function knockScore(s: KnockState): number {
  return s.hits;
}

export function knockResult(s: KnockState): KnockResult {
  return {
    score: s.hits,
    perfects: s.perfects,
    maxCombo: s.maxCombo,
    misses: s.misses,
  };
}

/** 直前と同じ場所は点けない（同じところを連打して稼げないようにする） */
function nextTargetId(s: KnockState): number {
  const n = KNOCK_TARGETS.length;
  if (s.lastId < 0) return Math.min(n - 1, Math.floor(s.rng() * n));
  // 直前を除いた n-1 個から選ぶ
  const pick = Math.min(n - 2, Math.floor(s.rng() * (n - 1)));
  return pick >= s.lastId ? pick + 1 : pick;
}

/**
 * 1フレーム進める。状態を書き換え、その間に起きたことを返す（演出用）。
 *
 * 終了条件は「30秒経った」だけ。取り逃してもゲームは続く＝負けが存在しない。
 * 描画できない環境（テストのjsdomなど）でも同じように進むよう、描画とは完全に分けてある。
 */
export function tickKnock(s: KnockState, now: number): KnockEvent[] {
  const events: KnockEvent[] = [];
  if (s.over) return events;
  if (s.startedAt == null) {
    s.startedAt = now;
    s.nextSpawnAt = now;
  }
  s.now = now;

  // 取り逃し（点灯が消えた）。コンボだけ切れて、ゲームは続く
  if (s.lit && now >= s.lit.litAt + s.lit.litMs) {
    events.push({ type: 'miss', id: s.lit.id });
    s.misses += 1;
    s.combo = 0;
    s.lit = null;
    s.nextSpawnAt = now + MISS_GAP_MS;
  }

  const remain = remainingMs(s, now);
  if (remain <= 0) {
    s.over = true;
    s.endedAt = now;
    s.lit = null;
    events.push({ type: 'end' });
    return events;
  }

  if (!s.lit && now >= s.nextSpawnAt && remain >= MIN_SPAWN_REMAIN_MS) {
    const id = nextTargetId(s);
    const litMs = litDurationFor(elapsedMs(s, now));
    s.lit = { id, litAt: now, litMs };
    s.lastId = id;
    events.push({ type: 'spawn', id, litMs });
  }
  return events;
}

export interface KnockTapResult {
  hit: boolean;
  perfect: boolean;
  /** 点灯からタップまでの時間(ms)。ヒット時のみ意味を持つ */
  reactionMs: number;
  combo: number;
  /** NO_MISS_STREAK の倍数に到達した */
  streakMilestone: boolean;
}

const MISS_TAP: KnockTapResult = {
  hit: false,
  perfect: false,
  reactionMs: 0,
  combo: 0,
  streakMilestone: false,
};

/**
 * タップを処理する。id は「タップ位置に最も近い点」。null は的から遠いタップ。
 * 外しても減点もコンボ切れもしない（罰を与えない＝負けが存在しない設計の一部）。
 */
export function tapKnock(s: KnockState, now: number, id: number | null): KnockTapResult {
  if (s.over || !s.lit || id == null) return { ...MISS_TAP, combo: s.combo };
  if (id !== s.lit.id) return { ...MISS_TAP, combo: s.combo };
  const reactionMs = now - s.lit.litAt;
  if (reactionMs < 0 || reactionMs > s.lit.litMs) return { ...MISS_TAP, combo: s.combo };

  const perfect = reactionMs <= s.lit.litMs * PERFECT_RATIO;
  s.hits += 1;
  if (perfect) s.perfects += 1;
  s.combo += 1;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  s.lit = null;
  s.nextSpawnAt = now + HIT_GAP_MS;
  return {
    hit: true,
    perfect,
    reactionMs,
    combo: s.combo,
    streakMilestone: s.combo > 0 && s.combo % NO_MISS_STREAK === 0,
  };
}

// ── 当たり判定（画面座標。投影は courtRender 側が持つ） ──

export interface ScreenPoint {
  id: number;
  x: number;
  y: number;
}

/**
 * タップ位置にいちばん近い点を返す。maxDist より遠ければ null。
 * 「光っている間に触るだけ」を成立させるため、判定はかなり甘くしてある。
 */
export function pickTargetAt(
  points: ScreenPoint[],
  px: number,
  py: number,
  maxDist: number,
): number | null {
  let bestId: number | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const dx = p.x - px;
    const dy = p.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = p.id;
    }
  }
  return bestDist <= maxDist ? bestId : null;
}

// ── 演出の強さ（prefers-reduced-motion を尊重する） ──

export interface HitFeedback {
  /** ヒットストップ。動きを止めるだけなので reduced-motion でも残す */
  hitStopMs: number;
  /** 画面の揺れ幅(px)。reduced-motion では 0 */
  shakePx: number;
  /** navigator.vibrate に渡すms。reduced-motion では 0 = 振動させない */
  vibrateMs: number;
  /** パーティクル数。reduced-motion では 0 */
  particles: number;
}

export function hitFeedback(reducedMotion: boolean, perfect: boolean): HitFeedback {
  if (reducedMotion) {
    return { hitStopMs: 80, shakePx: 0, vibrateMs: 0, particles: 0 };
  }
  return {
    hitStopMs: 80,
    shakePx: perfect ? 5 : 3,
    vibrateMs: 15,
    particles: perfect ? 16 : 10,
  };
}

/** OSの「視差を減らす」設定。matchMedia が無い環境（SSR/テスト）では false */
export function prefersReducedMotion(): boolean {
  try {
    const mm = globalThis.matchMedia;
    if (typeof mm !== 'function') return false;
    return mm.call(globalThis, '(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * 対応端末だけ振動させる。reduced-motion のときは絶対に呼ばない。
 * 呼んだかどうかを返す（テストで「振動しないこと」を確かめるため）。
 */
export function vibrateIfAllowed(ms: number, reducedMotion: boolean): boolean {
  if (reducedMotion || ms <= 0) return false;
  try {
    const nav = globalThis.navigator as Navigator | undefined;
    if (!nav || typeof nav.vibrate !== 'function') return false;
    nav.vibrate(ms);
    return true;
  } catch {
    return false;
  }
}

// ── ランク（30秒でこれだけ打てた、という言い方だけをする） ──

export interface KnockRank {
  min: number;
  label: string;
  message: string;
  emoji: string;
}

// ⚠️ 閾値は実測ではなく見積もり（反応＋移動で1本あたり0.5〜0.8秒として置いた）。
//    staging で数プレイ取ったら、実データの分布に合わせて必ず引き直すこと。
export const KNOCK_RANKS: KnockRank[] = [
  { min: 52, label: 'カンスト級', message: 'ノッカーが息切れするレベル。もう本物です', emoji: '🏆' },
  { min: 42, label: 'エキスパート', message: '足も目もできてる。大会でも動ける反応です', emoji: '🔥' },
  { min: 32, label: '上級者', message: 'サークルのエース級。6点をちゃんと回せてます', emoji: '⚡' },
  { min: 20, label: '中級者', message: 'いい感じ！次は前後の切り替えを速く', emoji: '💪' },
  { min: 0, label: 'ビギナー', message: 'ここからが伸びしろ。もう1本いきましょう', emoji: '🏸' },
];

export function rankForKnock(score: number): KnockRank {
  return KNOCK_RANKS.find((r) => score >= r.min) ?? KNOCK_RANKS[KNOCK_RANKS.length - 1];
}

// ── 前回との差分（リザルトで最大文字にする値） ──

export interface ScoreDelta {
  kind: 'first' | 'up' | 'down' | 'same';
  /** 差分の絶対値 */
  amount: number;
  /** 大きく出す文字 */
  text: string;
}

export function scoreDelta(score: number, previous: number | null): ScoreDelta {
  if (previous == null) return { kind: 'first', amount: 0, text: '初プレイ' };
  const diff = score - previous;
  if (diff > 0) return { kind: 'up', amount: diff, text: `前回より +${diff}本` };
  if (diff < 0) return { kind: 'down', amount: -diff, text: `前回より −${-diff}本` };
  return { kind: 'same', amount: 0, text: '前回と同じ本数' };
}

// ── 自己ベスト（サーバーが正・localStorageは控え） ──

const BEST_KEY = 'kawabado_knock_best';
const LAST_KEY = 'kawabado_knock_last';

function readInt(key: string): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function writeInt(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.floor(value)));
  } catch {
    /* プライベートモード等は無視 */
  }
}

export function getKnockBestLocal(): number {
  return readInt(BEST_KEY);
}

/** スコアを記録し、自己ベストを更新したら true */
export function updateKnockBestLocal(score: number): boolean {
  const best = getKnockBestLocal();
  if (score > best) {
    writeInt(BEST_KEY, score);
    return true;
  }
  return false;
}

/** 直前のプレイのスコア（前回との差分表示に使う）。未プレイなら null */
export function getKnockLastLocal(): number | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (raw == null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  } catch {
    return null;
  }
}

export function setKnockLastLocal(score: number): void {
  writeInt(LAST_KEY, score);
}

/**
 * 表示する自己ベスト。サーバー（game_plays）に値があればそちらが正。
 * localStorage は「RPCが無い/落ちた」ときの控えとしてだけ使う。
 */
export function resolveBest(serverBest: number | null | undefined, localBest: number): number {
  if (typeof serverBest === 'number' && Number.isFinite(serverBest) && serverBest > 0) {
    return Math.floor(serverBest);
  }
  return localBest;
}

// ── モード切替（本番の既定は現行のラリーゲームのまま） ──

export type GameMode = 'rally' | 'knock';

/**
 * URLクエリ（?mode=knock / ?knock=1）と環境変数（VITE_GAME_MODE）から遊ぶモードを決める。
 * どちらも無ければ 'rally'。**本番の既定の挙動は変えない。**
 * クエリは環境変数より強い（staging で両方を見比べられるようにするため）。
 */
export function resolveGameMode(search: string, envMode?: string): GameMode {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? '');
  } catch {
    params = new URLSearchParams('');
  }
  const q = (params.get('mode') ?? '').toLowerCase();
  if (q === 'knock') return 'knock';
  if (q === 'rally') return 'rally';
  const knockFlag = (params.get('knock') ?? '').toLowerCase();
  if (knockFlag === '1' || knockFlag === 'true') return 'knock';
  if (knockFlag === '0' || knockFlag === 'false') return 'rally';
  return (envMode ?? '').toLowerCase() === 'knock' ? 'knock' : 'rally';
}
