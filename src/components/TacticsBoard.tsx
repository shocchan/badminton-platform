// 戦術ボード（体育館でスマホ片手に使う前提）
//
// 設計方針（2026-08 全面改修）
// 1. 1画面で完結させる。スクロールを作らない。高さは 100dvh + safe-area で統一し、
//    コートの大きさは「余った領域を ResizeObserver で実測」して決める。
//    （旧: CSS は 100vh・コートは window.innerHeight*0.62 と計算元が2つあり、
//      iOS の URL バー表示で必ずズレて操作パネルが画面外へ潜っていた）
// 2. モードを持たない。指の動きだけで意味が決まる。
//    選手をドラッグ=移動 / タップ=選択 / →ハンドルをドラッグ=動きの矢印 /
//    コートをなぞる=シャトルの軌道 / コートをタップ=選択解除 /
//    矢印をタップ=選択 / ○をドラッグ=カーブ。
//    「今どのモードか分からないので触っても何も起きない」を構造的に消す。
// 3. 区別するのは「サーブ／レシーブ」ではなく「シャトルの軌道／人の動き」。
//    作戦を説明するときに必要な区別はこちら。
// 4. 下の常時ボタンは3つだけ（戻す / 作戦メニュー / 画像にする）。
//    一本道に要る「取り消し」と「持ち出し」以外は ☰ の中へ入れて、常に見える数を減らす。
//    どれを外してどれを残したかの理由は、ボタン帯の直前のコメントに書いた。
//
// 外部アセット・追加ライブラリはゼロ（体育館のモバイル回線を前提）。

import { useState, useRef, useCallback, useEffect } from "react";
import { ConfirmDialog } from "./ui/ConfirmDialog";

// ============================================================
// Types
// ============================================================
export type PlayerType = "male" | "female";
export type Team = "us" | "them";

/** シャトルの軌道（実線）か、人の動き（点線）か。旧 serve/receive を置き換える */
export type ArrowKind = "shuttle" | "move";

export interface Player {
  id: string;
  type: PlayerType;
  team: Team;
  x: number;
  y: number;
  label: string;
}

export interface Arrow {
  id: string;
  kind: ArrowKind;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  curveX: number;
  curveY: number;
  /** 明示的な色（🔴赤や旧データの色）。未指定なら kind と持ち主から決まる */
  color?: string;
  /** move のとき、その動きの主（色を合わせるため） */
  ownerId?: string;
}

/** 履歴・保存に載る盤面。flipped を必ず含める（旧形式は含めておらず読込で表記が逆になっていた） */
export interface Snapshot {
  players: Player[];
  arrows: Arrow[];
  flipped: boolean;
}

export interface BoardState extends Snapshot {
  selected: string | null;
}

export interface SaveSlot {
  name: string;
  /** 保存日時（epoch ms）。旧データには無いので null を許す */
  savedAt: number | null;
  data: Snapshot | null;
}

// ============================================================
// Constants
// ============================================================
const COURT_ASPECT = 13.4 / 6.1;

const MALE_COLOR = "#3B82F6";
const FEMALE_COLOR = "#EC4899";
const THEM_MALE_COLOR = "#F97316";
const THEM_FEMALE_COLOR = "#A855F7";

export const SHUTTLE_COLOR = "#FBBF24";
/** 持ち主のいない「動き」の色。旧レシーブ矢印と同じ緑にして、旧データの見た目を保つ */
export const LEGACY_MOVE_COLOR = "#10B981";
export const RED = "#EF4444";

export const LS_KEY = "tacticsBoard_slots";
export const LS_LAST = "tacticsBoard_last";
export const LS_SEEN = "tacticsBoard_seen";
const MAX_SLOTS = 5;
const MAX_HISTORY = 50;

/** タップとドラッグの境目（コート幅に対する%）。旧実装 (>2) をそのまま流用 */
export const DRAG_THRESHOLD = 2;

/** 盤面まわりの地色。浮かせたシートもこれで塗る（透けると2段が混ざって見える） */
const BOARD_BG = "#0B1120";
/** ヒント・チップ・ボタン帯の最大幅。PCで端から端まで伸びて間延びするのを防ぐ */
const BAND_MAX = 560;
const bandStyle: React.CSSProperties = { flexShrink: 0, width: "100%", maxWidth: BAND_MAX, margin: "0 auto" };
/** シート内の見出し。中身が3種類あるので、塊ごとに区切らないと「何のシートか」が読めない */
const sheetHeading: React.CSSProperties = { fontSize: 11, color: "#64748B", margin: "10px 0 6px" };

// ============================================================
// Utility（純粋関数。テストから直接呼ぶ）
// ============================================================
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function pct(val: number, total: number) {
  return total === 0 ? 0 : (val / total) * 100;
}

function px(pctVal: number, total: number) {
  return (pctVal / 100) * total;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function isCurved(arrow: Arrow) {
  const midX = (arrow.fromX + arrow.toX) / 2;
  const midY = (arrow.fromY + arrow.toY) / 2;
  return Math.abs(arrow.curveX - midX) > 0.5 || Math.abs(arrow.curveY - midY) > 0.5;
}

export function playerColor(p: Player) {
  if (p.type === "male") return p.team === "us" ? MALE_COLOR : THEM_MALE_COLOR;
  return p.team === "us" ? FEMALE_COLOR : THEM_FEMALE_COLOR;
}

/** 矢印の表示色。color が明示されていればそれ、無ければ種類と持ち主から決める */
export function arrowColor(arrow: Arrow, players: Player[]) {
  if (arrow.color) return arrow.color;
  if (arrow.kind === "shuttle") return SHUTTLE_COLOR;
  const owner = arrow.ownerId ? players.find((p) => p.id === arrow.ownerId) : undefined;
  return owner ? playerColor(owner) : LEGACY_MOVE_COLOR;
}

/**
 * 次の選手ラベル。
 * 旧実装は「同じ type × team の人数 + 1」だったため、
 * 相手側に男性を足すと既存の M2 と重複した（例: M1(自), M2(相) → 追加も M2）。
 * 使用中の番号を見て空き番号を返す。
 */
export function nextPlayerLabel(players: Player[], type: PlayerType): string {
  const prefix = type === "male" ? "M" : "F";
  const used = new Set<number>();
  for (const p of players) {
    const m = /^([MF])(\d+)$/.exec(p.label);
    if (m && m[1] === prefix) used.add(Number(m[2]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${n}`;
}

/**
 * 既存の選手と重ならない座標を返す。
 * 旧実装は追加位置が固定値 (50, 85/15) で、押すたびに同じ場所に積み上がっていた。
 */
export function freeSpot(players: Player[], x: number, y: number, minDist = 10): { x: number; y: number } {
  const taken = (nx: number, ny: number) =>
    players.some((p) => Math.hypot(p.x - nx, p.y - ny) < minDist);
  if (!taken(x, y)) return { x, y };
  for (let ring = 1; ring <= 6; ring++) {
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI * 2 * k) / 8 + (ring % 2 === 0 ? Math.PI / 8 : 0);
      const nx = clamp(x + Math.cos(a) * minDist * ring, 6, 94);
      const ny = clamp(y + Math.sin(a) * minDist * ring, 5, 95);
      if (!taken(nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x: clamp(x + minDist, 6, 94), y: clamp(y + minDist, 5, 95) };
}

export function addPlayerTo(state: BoardState, type: PlayerType, team: Team): BoardState {
  const base = { x: 50, y: team === "us" ? 84 : 16 };
  const spot = freeSpot(state.players, base.x, base.y);
  const p: Player = {
    id: uid(),
    type,
    team,
    x: spot.x,
    y: spot.y,
    label: nextPlayerLabel(state.players, type),
  };
  return { ...state, players: [...state.players, p], selected: p.id };
}

// ============================================================
// 旧データの読み込み（互換）
// ============================================================
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function migratePlayer(raw: unknown, index = 0): Player | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== "number" || typeof r.y !== "number") return null;
  const type: PlayerType = r.type === "female" ? "female" : "male";
  const team: Team = r.team === "them" ? "them" : "us";
  return {
    id: typeof r.id === "string" && r.id ? r.id : uid(),
    type,
    team,
    x: clamp(r.x, 0, 100),
    y: clamp(r.y, 0, 100),
    label: typeof r.label === "string" && r.label ? r.label : `${type === "male" ? "M" : "F"}${index + 1}`,
  };
}

/**
 * 旧矢印 → 新矢印。
 * serve(実線・黄) → shuttle。receive(点線・緑) → move（色を緑で固定）。
 * こうすると旧データの見た目が変わらないまま、意味だけ「シャトル / 人の動き」に載せ替わる。
 */
export function migrateArrow(raw: unknown): Arrow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.fromX !== "number" || typeof r.fromY !== "number") return null;
  if (typeof r.toX !== "number" || typeof r.toY !== "number") return null;

  let kind: ArrowKind;
  let color = typeof r.color === "string" ? r.color : undefined;
  if (r.kind === "shuttle" || r.kind === "move") {
    kind = r.kind;
  } else if (r.type === "receive") {
    kind = "move";
    color = color ?? LEGACY_MOVE_COLOR;
  } else {
    kind = "shuttle";
  }

  return {
    id: typeof r.id === "string" && r.id ? r.id : uid(),
    kind,
    fromX: r.fromX,
    fromY: r.fromY,
    toX: r.toX,
    toY: r.toY,
    curveX: num(r.curveX, (r.fromX + r.toX) / 2),
    curveY: num(r.curveY, (r.fromY + r.toY) / 2),
    color,
    ownerId: typeof r.ownerId === "string" ? r.ownerId : undefined,
  };
}

export function migrateSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.players)) return null;
  const players = r.players.map((p, i) => migratePlayer(p, i)).filter((p): p is Player => !!p);
  const arrows = Array.isArray(r.arrows)
    ? r.arrows.map(migrateArrow).filter((a): a is Arrow => !!a)
    : [];
  return { players, arrows, flipped: r.flipped === true };
}

/** 保存スロット5枠の正規化。旧形式（name/data のみ・flipped なし）もここで吸収する */
export function normalizeSlots(raw: unknown): SaveSlot[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: SaveSlot[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const r = (arr[i] ?? null) as Record<string, unknown> | null;
    const name =
      r && typeof r.name === "string" && r.name.trim() ? r.name : `スロット${i + 1}`;
    const data = r ? migrateSnapshot(r.data) : null;
    const savedAt = r && typeof r.savedAt === "number" ? r.savedAt : null;
    out.push({ name, savedAt, data });
  }
  return out;
}

export function loadSlots(): SaveSlot[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return normalizeSlots(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSlots(null);
  }
}

function persistSlots(slots: SaveSlot[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(slots));
  } catch { /* 描画用の任意機能なので失敗は握りつぶす */ }
}

export function snapshotOf(state: Snapshot): Snapshot {
  return { players: state.players, arrows: state.arrows, flipped: state.flipped };
}

/** 盤面（選択を除く）が同じか。ジェスチャは変更のない配列の参照を保つので参照比較で足りる */
export function sameSnapshot(a: Snapshot, b: Snapshot) {
  return a.players === b.players && a.arrows === b.arrows && a.flipped === b.flipped;
}

export function applySnapshot(state: BoardState, snap: Snapshot): BoardState {
  const ids = new Set<string>([...snap.players.map((p) => p.id), ...snap.arrows.map((a) => a.id)]);
  return {
    players: snap.players,
    arrows: snap.arrows,
    flipped: snap.flipped,
    selected: state.selected && ids.has(state.selected) ? state.selected : null,
  };
}

// ============================================================
// 履歴（純粋）
// ============================================================
export interface History {
  stack: Snapshot[];
  index: number;
}

export function pushSnapshot(h: History, snap: Snapshot): History {
  const stack = h.stack.slice(0, h.index + 1);
  stack.push(snap);
  if (stack.length > MAX_HISTORY) stack.shift();
  return { stack, index: stack.length - 1 };
}

export const canUndo = (h: History) => h.index > 0;
export const canRedo = (h: History) => h.index < h.stack.length - 1;

// ============================================================
// ジェスチャ（純粋）
// ------------------------------------------------------------
// 「何も起きない操作」を作らないため、指の動き7通りをすべてここに集約する。
// UI 側は座標をこの形に翻訳するだけ。
// ============================================================
export type Gesture =
  | { kind: "player-move"; playerId: string; x: number; y: number }
  | { kind: "player-select"; playerId: string }
  | { kind: "player-arrow"; playerId: string; toX: number; toY: number }
  | { kind: "shuttle-arrow"; fromX: number; fromY: number; toX: number; toY: number }
  | { kind: "clear-selection" }
  | { kind: "arrow-select"; arrowId: string }
  | { kind: "arrow-curve"; arrowId: string; x: number; y: number };

export const GESTURE_KINDS = [
  "player-move",
  "player-select",
  "player-arrow",
  "shuttle-arrow",
  "clear-selection",
  "arrow-select",
  "arrow-curve",
] as const;

function makeArrow(kind: ArrowKind, fromX: number, fromY: number, toX: number, toY: number, ownerId?: string): Arrow {
  return {
    id: uid(),
    kind,
    fromX,
    fromY,
    toX,
    toY,
    curveX: (fromX + toX) / 2,
    curveY: (fromY + toY) / 2,
    ownerId,
  };
}

export function applyGesture(state: BoardState, g: Gesture): { next: BoardState; changed: boolean } {
  switch (g.kind) {
    case "player-move": {
      const x = clamp(g.x, 1, 99);
      const y = clamp(g.y, 1, 99);
      const target = state.players.find((p) => p.id === g.playerId);
      if (!target) return { next: state, changed: false };
      if (target.x === x && target.y === y) return { next: state, changed: false };
      return {
        next: {
          ...state,
          players: state.players.map((p) => (p.id === g.playerId ? { ...p, x, y } : p)),
          selected: g.playerId,
        },
        changed: true,
      };
    }
    case "player-select": {
      // 同じ選手をもう一度タップしたら選択解除。どちらに転んでも必ず状態が動く
      const next = state.selected === g.playerId ? null : g.playerId;
      return { next: { ...state, selected: next }, changed: true };
    }
    case "player-arrow": {
      const owner = state.players.find((p) => p.id === g.playerId);
      if (!owner) return { next: state, changed: false };
      const arrow = makeArrow("move", owner.x, owner.y, clamp(g.toX, 0, 100), clamp(g.toY, 0, 100), owner.id);
      return { next: { ...state, arrows: [...state.arrows, arrow], selected: arrow.id }, changed: true };
    }
    case "shuttle-arrow": {
      const arrow = makeArrow("shuttle", g.fromX, g.fromY, clamp(g.toX, 0, 100), clamp(g.toY, 0, 100));
      return { next: { ...state, arrows: [...state.arrows, arrow], selected: arrow.id }, changed: true };
    }
    case "clear-selection": {
      if (state.selected === null) return { next: state, changed: false };
      return { next: { ...state, selected: null }, changed: true };
    }
    case "arrow-select": {
      const next = state.selected === g.arrowId ? null : g.arrowId;
      return { next: { ...state, selected: next }, changed: true };
    }
    case "arrow-curve": {
      const target = state.arrows.find((a) => a.id === g.arrowId);
      if (!target) return { next: state, changed: false };
      if (target.curveX === g.x && target.curveY === g.y) return { next: state, changed: false };
      return {
        next: {
          ...state,
          arrows: state.arrows.map((a) => (a.id === g.arrowId ? { ...a, curveX: g.x, curveY: g.y } : a)),
          selected: g.arrowId,
        },
        changed: true,
      };
    }
  }
}

// ============================================================
// フォーメーション（初見の1手目）
// ============================================================
export type FormationKey = "side" | "topback" | "rotate" | "singles";

export interface Formation {
  key: FormationKey;
  label: string;
  /** チップに出す2行の短縮名（375px幅でも4つ並ぶこと） */
  short: [string, string];
  note: string;
  /** 自陣（下側）2人ぶんの座標。相手側は上下反転して使う */
  us: { x: number; y: number }[];
  singles?: boolean;
}

export const FORMATIONS: Formation[] = [
  { key: "side", label: "サイド・バイ・サイド", short: ["サイド", "バイサイド"], note: "守りの形。左右に並ぶ", us: [{ x: 30, y: 76 }, { x: 70, y: 76 }] },
  { key: "topback", label: "トップ＆バック", short: ["トップ＆", "バック"], note: "攻めの形。前後に並ぶ", us: [{ x: 50, y: 62 }, { x: 50, y: 87 }] },
  { key: "rotate", label: "前後ローテ", short: ["前後", "ローテ"], note: "攻守の切り替え途中", us: [{ x: 38, y: 65 }, { x: 62, y: 86 }] },
  { key: "singles", label: "1対1", short: ["1対1", "シングルス"], note: "シングルスの基本位置", us: [{ x: 50, y: 80 }], singles: true },
];

/**
 * フォーメーションを当てる。
 * 足りない側の選手はここで作る（＝旧「選手追加4ボタン」の上位互換）。
 * 1対1 だけは各サイド1人に絞る（戻すで取り消せる）。
 */
export function applyFormation(state: BoardState, key: FormationKey): BoardState {
  const f = FORMATIONS.find((x) => x.key === key);
  if (!f) return state;
  const need = f.us.length;
  // 採番の重複を避けるため、両サイドで作った選手を1つの名簿に積んでいく
  const roster: Player[] = [];

  const place = (team: Team): Player[] => {
    const mine = state.players.filter((p) => p.team === team).slice(0, need);
    const out: Player[] = [];
    for (let i = 0; i < need; i++) {
      const slot = f.us[i];
      const x = team === "us" ? slot.x : 100 - slot.x;
      const y = team === "us" ? slot.y : 100 - slot.y;
      const existing = mine[i];
      if (existing) {
        out.push({ ...existing, x, y });
      } else {
        const type: PlayerType = i === 0 ? "male" : "female";
        out.push({ id: uid(), type, team, x, y, label: nextPlayerLabel([...state.players, ...roster, ...out], type) });
      }
    }
    roster.push(...out);
    return out;
  };

  const us = place("us");
  const them = place("them");
  const keptIds = new Set([...us, ...them].map((p) => p.id));
  // singles 以外は余った5人目以降をその場に残す
  const extras = f.singles ? [] : state.players.filter((p) => !keptIds.has(p.id));

  const players = [...us, ...them, ...extras];
  const alive = new Set(players.map((p) => p.id));
  return {
    ...state,
    players,
    // 消えた選手の「動き」矢印は持ち主を失う（色は既定にフォールバック）
    arrows: state.arrows.map((a) => (a.ownerId && !alive.has(a.ownerId) ? { ...a, ownerId: undefined } : a)),
    selected: null,
  };
}

// ============================================================
// 初期状態（選手の配置だけ。矢印は置かない）
// ============================================================
export const DEFAULT_PLAYERS: Player[] = [
  { id: "p1", type: "male", team: "us", x: 35, y: 74, label: "M1" },
  { id: "p2", type: "female", team: "us", x: 65, y: 86, label: "F1" },
  { id: "p3", type: "male", team: "them", x: 35, y: 26, label: "M2" },
  { id: "p4", type: "female", team: "them", x: 65, y: 14, label: "F2" },
];

/**
 * 初回訪問用。**選手を4人置くだけで、矢印は置かない**（CEO判断 2026-08-25）。
 *
 * 以前はサーブ1本＋カバー1本を描いておき「直すところから始められる」を狙っていたが、
 * 実際に使う順番は「まず人の位置を決める → そのあと自分で線を引く」だった。
 * 先に線が入っていると、消してから始めることになって手数が増える。
 * 空のコートにしないのは、0人だと何をする画面か分からないため（人だけ置く）。
 */
export function seedBoard(): BoardState {
  const players = DEFAULT_PLAYERS.map((p) => ({ ...p }));
  return { players, arrows: [], flipped: false, selected: null };
}

export function loadInitialBoard(): { board: BoardState; firstVisit: boolean } {
  try {
    const seen = localStorage.getItem(LS_SEEN);
    if (!seen) return { board: seedBoard(), firstVisit: true };
    const raw = localStorage.getItem(LS_LAST);
    const snap = raw ? migrateSnapshot(JSON.parse(raw)) : null;
    if (snap && snap.players.length > 0) return { board: { ...snap, selected: null }, firstVisit: false };
  } catch { /* 壊れていたら見本から始める */ }
  return { board: seedBoard(), firstVisit: false };
}

// ============================================================
// ヒント1行（凡例・ショートカット表示はここに統合した）
// ------------------------------------------------------------
// 出す場所は height 24・nowrap・ellipsis の帯なので、長い文は末尾から黙って切れる。
// 11px だと幅320pxの端末で全角24文字あたりが限界で、切れるのは一番言いたい語尾。
// どの文も全角24文字以内に収める。
// 既定文は「選手を動かす」と「コートをなぞる」の2つを教えていたが、選手の丸は触れば動くので
// 放っておいても見つかる。教えるべきは見つけにくい方（何もない緑をなぞる）だけ。
// ============================================================
export function hintFor(
  state: BoardState,
  opts: { drawing?: ArrowKind | null; firstVisit?: boolean } = {},
): string {
  if (opts.drawing === "shuttle") return "指を離すと、シャトルの軌道（黄の実線）になります";
  if (opts.drawing === "move") return "指を離すと、その選手の動き（点線）になります";
  const sel = state.selected;
  if (sel) {
    const p = state.players.find((x) => x.id === sel);
    if (p) return `${p.label} を選択中 — 横の「↗」を引くと動きの矢印`;
    const a = state.arrows.find((x) => x.id === sel);
    if (a) return "矢印を選択中 — 真ん中の「○」を引くと曲げられます";
  }
  if (opts.firstVisit) return "選手を動かして、コートをなぞると線が引けます";
  return "コートを指でなぞると、シャトルの軌道になります";
}

// ============================================================
// ルート判定（App.tsx の chromeless 判定と同じ式）
// ============================================================
export const isTacticsBoardRoute = (pathname: string) => /^\/(ja|zh)\/tactics-board(\/|$)/.test(pathname);

// ============================================================
// SVG: 矢印
// ============================================================
function ArrowShape({
  arrow, color, courtW, courtH, selected, onBodyDown, onCurveDown,
}: {
  arrow: Arrow;
  color: string;
  courtW: number;
  courtH: number;
  selected: boolean;
  onBodyDown: (e: React.PointerEvent) => void;
  onCurveDown: (e: React.PointerEvent) => void;
}) {
  const x1 = px(arrow.fromX, courtW);
  const y1 = px(arrow.fromY, courtH);
  const x2 = px(arrow.toX, courtW);
  const y2 = px(arrow.toY, courtH);
  const cpx = px(arrow.curveX, courtW);
  const cpy = px(arrow.curveY, courtH);
  const curved = isCurved(arrow);

  const tangentX = curved ? x2 - cpx : x2 - x1;
  const tangentY = curved ? y2 - cpy : y2 - y1;
  const angle = Math.atan2(tangentY, tangentX);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const arrowLen = Math.min(15, Math.max(7, len * 0.25));

  const b1x = x2 - arrowLen * Math.cos(angle - 0.42);
  const b1y = y2 - arrowLen * Math.sin(angle - 0.42);
  const b2x = x2 - arrowLen * Math.cos(angle + 0.42);
  const b2y = y2 - arrowLen * Math.sin(angle + 0.42);

  const pathD = curved ? `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`;
  const midX = curved ? cpx : (x1 + x2) / 2;
  const midY = curved ? cpy : (y1 + y2) / 2;

  return (
    <g>
      {/* 当たり判定（旧16px → 24px）。指で押せる太さを見た目と分ける */}
      <path
        d={pathD} stroke="transparent" strokeWidth={24} fill="none"
        data-arrow-hit={arrow.id}
        onPointerDown={onBodyDown} style={{ cursor: "pointer" }}
      />
      <path
        d={pathD} stroke={color} strokeWidth={selected ? 4.5 : 3}
        strokeDasharray={arrow.kind === "move" ? "9,6" : "none"}
        strokeLinecap="round" fill="none" pointerEvents="none"
      />
      <polygon points={`${x2},${y2} ${b1x},${b1y} ${b2x},${b2y}`} fill={color} pointerEvents="none" />
      {selected && (
        <>
          <circle cx={midX} cy={midY} r={22} fill="transparent" data-curve-hit={arrow.id} onPointerDown={onCurveDown} style={{ cursor: "grab" }} />
          <circle cx={midX} cy={midY} r={11} fill="#fff" stroke={color} strokeWidth={3} pointerEvents="none" />
        </>
      )}
    </g>
  );
}

// ============================================================
// SVG: 選手
// ============================================================
function PlayerToken({
  player, courtW, courtH, selected, radius, onBodyDown, onHandleDown,
}: {
  player: Player;
  courtW: number;
  courtH: number;
  selected: boolean;
  radius: number;
  onBodyDown: (e: React.PointerEvent) => void;
  onHandleDown: (e: React.PointerEvent) => void;
}) {
  const cx = px(player.x, courtW);
  const cy = px(player.y, courtH);
  const r = radius;
  const fill = playerColor(player);
  const hit = Math.max(r + 8, 22);

  // ハンドルはコートの内側に出す（端で画面外に逃げないように）
  const dirX = player.x > 78 ? -1 : 1;
  const dirY = player.y < 16 ? 1 : -1;
  const hx = cx + dirX * (r + 17) * 0.72;
  const hy = cy + dirY * (r + 17) * 0.72;

  return (
    <g style={{ userSelect: "none" }}>
      {selected && (
        <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#fff" strokeWidth={2.5} strokeDasharray="4,3" pointerEvents="none" />
      )}
      <circle cx={cx + 1.5} cy={cy + 2} r={r} fill="#000" opacity={0.25} pointerEvents="none" />
      <circle cx={cx} cy={cy} r={r} fill={fill} pointerEvents="none" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeWidth={2.5} pointerEvents="none" />
      <text
        x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fill="#fff" fontSize={Math.round(r * 0.85)} fontWeight="bold" pointerEvents="none"
      >
        {player.label}
      </text>
      {/* 本体の当たり判定（44px相当） */}
      <circle cx={cx} cy={cy} r={hit} fill="transparent" data-player-hit={player.id} onPointerDown={onBodyDown} style={{ cursor: "grab" }} />
      {selected && (
        <>
          <circle cx={hx} cy={hy} r={22} fill="transparent" data-handle-hit={player.id} onPointerDown={onHandleDown} style={{ cursor: "crosshair" }} />
          <circle cx={hx} cy={hy} r={12} fill="#fff" stroke={fill} strokeWidth={3} pointerEvents="none" />
          <text x={hx} y={hy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill={fill} fontWeight="bold" pointerEvents="none">↗</text>
        </>
      )}
    </g>
  );
}

// ============================================================
// SVG: コートの線
// ============================================================
function CourtLines({ width, height, flipped }: { width: number; height: number; flipped: boolean }) {
  const w = width;
  const h = height;
  const lc = "#ffffff";
  const lw = Math.max(1.2, w / 220);

  const TOTAL_H = 13.4;
  const TOTAL_W = 6.1;
  const net = 6.7 / TOTAL_H;
  const ssl_top = (6.7 - 1.98) / TOTAL_H;
  const ssl_bot = (6.7 + 1.98) / TOTAL_H;
  const lsl_top = 0.76 / TOTAL_H;
  const lsl_bot = (13.4 - 0.76) / TOTAL_H;
  const singles_L = 0.46 / TOTAL_W;
  const singles_R = 5.64 / TOTAL_W;
  const center_x = 3.05 / TOTAL_W;

  const topLabel = flipped ? "自分たち" : "相手";
  const botLabel = flipped ? "相手" : "自分たち";
  const fs = Math.max(10, Math.round(w / 22));

  return (
    <>
      <defs>
        <linearGradient id="courtGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a5c2a" />
          <stop offset="50%" stopColor="#1e6b30" />
          <stop offset="100%" stopColor="#1a5c2a" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="url(#courtGrad)" />
      <rect x={0} y={0} width={w} height={h} fill="none" stroke={lc} strokeWidth={lw * 1.5} />
      <line x1={w * singles_L} y1={0} x2={w * singles_L} y2={h} stroke={lc} strokeWidth={lw} opacity={0.4} />
      <line x1={w * singles_R} y1={0} x2={w * singles_R} y2={h} stroke={lc} strokeWidth={lw} opacity={0.4} />
      <line x1={w * center_x} y1={h * lsl_top} x2={w * center_x} y2={h * ssl_top} stroke={lc} strokeWidth={lw} />
      <line x1={w * center_x} y1={h * ssl_bot} x2={w * center_x} y2={h * lsl_bot} stroke={lc} strokeWidth={lw} />
      <line x1={0} y1={h * lsl_top} x2={w} y2={h * lsl_top} stroke={lc} strokeWidth={lw} />
      <line x1={0} y1={h * lsl_bot} x2={w} y2={h * lsl_bot} stroke={lc} strokeWidth={lw} />
      <line x1={0} y1={h * ssl_top} x2={w} y2={h * ssl_top} stroke={lc} strokeWidth={lw * 1.2} />
      <line x1={0} y1={h * ssl_bot} x2={w} y2={h * ssl_bot} stroke={lc} strokeWidth={lw * 1.2} />
      <line x1={0} y1={h * net} x2={w} y2={h * net} stroke={lc} strokeWidth={lw * 2.4} />
      <text x={w - 6} y={h * 0.055} textAnchor="end" fill="#fff" fontSize={fs} opacity={0.5} fontWeight="bold">{topLabel}</text>
      <text x={w - 6} y={h * 0.965} textAnchor="end" fill="#fff" fontSize={fs} opacity={0.5} fontWeight="bold">{botLabel}</text>
    </>
  );
}

// ============================================================
// ポインタ操作のセッション
// ============================================================
type Session =
  | { t: "player"; id: string; offX: number; offY: number; moved: boolean }
  | { t: "handle"; id: string; to: { x: number; y: number } }
  | { t: "court"; from: { x: number; y: number }; to: { x: number; y: number }; moved: boolean }
  | { t: "curve"; id: string; moved: boolean }
  | { t: "arrow"; id: string };

interface Preview {
  kind: ArrowKind;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}

// ============================================================
// 本体
// ============================================================
export default function TacticsBoard() {
  const [initial] = useState(loadInitialBoard);

  const [board, setBoardState] = useState<BoardState>(initial.board);
  const boardRef = useRef(board);
  const [firstVisit, setFirstVisit] = useState(initial.firstVisit);

  const histRef = useRef<History>({ stack: [snapshotOf(initial.board)], index: 0 });
  const [histMeta, setHistMeta] = useState({ undo: false, redo: false });

  const [slots, setSlots] = useState<SaveSlot[]>(loadSlots);
  const [sheet, setSheet] = useState<null | "menu">(null);
  const [resetPending, setResetPending] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const slotRef = useRef<HTMLDivElement>(null);
  const courtRef = useRef<HTMLDivElement>(null);
  const [courtSize, setCourtSize] = useState({ w: 320, h: 320 * COURT_ASPECT });

  const sessionRef = useRef<Session | null>(null);

  const setBoard = useCallback((next: BoardState) => {
    boardRef.current = next;
    setBoardState(next);
  }, []);

  const commit = useCallback((next: BoardState) => {
    boardRef.current = next;
    setBoardState(next);
    const h = pushSnapshot(histRef.current, snapshotOf(next));
    histRef.current = h;
    // canUndo を ref 読みではなく state にする。
    // 旧実装は同一参照を返す setState のせいで再レンダーが省略され、
    // ドラッグ直後に「戻す」が押せないままだった。
    setHistMeta({ undo: canUndo(h), redo: canRedo(h) });
    setFirstVisit(false);
    try {
      localStorage.setItem(LS_LAST, JSON.stringify(snapshotOf(next)));
      localStorage.setItem(LS_SEEN, "1");
    } catch { /* 保存できなくても操作は続行 */ }
  }, []);

  const run = useCallback((g: Gesture) => {
    const cur = boardRef.current;
    const { next, changed } = applyGesture(cur, g);
    if (!changed) return;
    // 選択が変わっただけなら履歴に積まない。
    // 積むと「戻す」が押せる状態になるのに、押しても盤面が何も変わらない
    //（＝消したはずの「何も起きない」がボタン側で復活してしまう）。
    if (sameSnapshot(next, cur)) setBoard(next);
    else commit(next);
  }, [commit, setBoard]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  // ---- 高さ: 余った領域を実測してコートを決める（vh と innerHeight の二重計算をやめる）
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const availW = Math.max(120, rect.width - 12);
      const availH = Math.max(160, rect.height - 12);
      const w = Math.min(availW, availH / COURT_ASPECT);
      setCourtSize({ w, h: w * COURT_ASPECT });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ---- 背面（body）のスクロールを止める。fixed の下で引っ張られるのを防ぐ
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const getPos = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = courtRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return { x: pct(e.clientX - rect.left, rect.width), y: pct(e.clientY - rect.top, rect.height) };
  }, []);

  const undo = useCallback(() => {
    const h = histRef.current;
    if (!canUndo(h)) return;
    const next = { stack: h.stack, index: h.index - 1 };
    histRef.current = next;
    setBoard(applySnapshot(boardRef.current, next.stack[next.index]));
    setHistMeta({ undo: canUndo(next), redo: canRedo(next) });
  }, [setBoard]);

  const redo = useCallback(() => {
    const h = histRef.current;
    if (!canRedo(h)) return;
    const next = { stack: h.stack, index: h.index + 1 };
    histRef.current = next;
    setBoard(applySnapshot(boardRef.current, next.stack[next.index]));
    setHistMeta({ undo: canUndo(next), redo: canRedo(next) });
  }, [setBoard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      else if (e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- ポインタ: 押す
  const onCourtDown = useCallback((e: React.PointerEvent) => {
    const pos = getPos(e);
    if (!pos) return;
    sessionRef.current = { t: "court", from: pos, to: pos, moved: false };
  }, [getPos]);

  const onPlayerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const pos = getPos(e);
    const p = boardRef.current.players.find((x) => x.id === id);
    if (!pos || !p) return;
    sessionRef.current = { t: "player", id, offX: pos.x - p.x, offY: pos.y - p.y, moved: false };
  }, [getPos]);

  const onHandleDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const pos = getPos(e);
    const p = boardRef.current.players.find((x) => x.id === id);
    if (!pos || !p) return;
    sessionRef.current = { t: "handle", id, to: pos };
    setPreview({ kind: "move", from: { x: p.x, y: p.y }, to: pos, color: playerColor(p) });
  }, [getPos]);

  const onArrowDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    sessionRef.current = { t: "arrow", id };
  }, []);

  const onCurveDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    sessionRef.current = { t: "curve", id, moved: false };
  }, []);

  // ---- ポインタ: 動かす／離す（window で拾ってコート外へ出ても切れないようにする）
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      const pos = getPos(e);
      if (!pos) return;
      if (s.t === "player") {
        const x = clamp(pos.x - s.offX, 1, 99);
        const y = clamp(pos.y - s.offY, 1, 99);
        const p = boardRef.current.players.find((q) => q.id === s.id);
        if (!p) return;
        if (Math.hypot(x - p.x, y - p.y) > 0.05) s.moved = true;
        setBoard({ ...boardRef.current, players: boardRef.current.players.map((q) => (q.id === s.id ? { ...q, x, y } : q)) });
      } else if (s.t === "curve") {
        s.moved = true;
        setBoard({ ...boardRef.current, arrows: boardRef.current.arrows.map((a) => (a.id === s.id ? { ...a, curveX: pos.x, curveY: pos.y } : a)) });
      } else if (s.t === "handle") {
        s.to = pos;
        const p = boardRef.current.players.find((q) => q.id === s.id);
        if (!p) return;
        setPreview({ kind: "move", from: { x: p.x, y: p.y }, to: pos, color: playerColor(p) });
      } else if (s.t === "court") {
        s.to = pos;
        if (Math.hypot(pos.x - s.from.x, pos.y - s.from.y) > DRAG_THRESHOLD) s.moved = true;
        if (s.moved) setPreview({ kind: "shuttle", from: s.from, to: pos, color: SHUTTLE_COLOR });
      }
    };

    const onUp = () => {
      const s = sessionRef.current;
      sessionRef.current = null;
      setPreview(null);
      if (!s) return;
      if (s.t === "player") {
        const p = boardRef.current.players.find((q) => q.id === s.id);
        if (!p) return;
        if (s.moved) commit({ ...boardRef.current, selected: s.id });
        else run({ kind: "player-select", playerId: s.id });
      } else if (s.t === "curve") {
        if (s.moved) commit(boardRef.current);
        else run({ kind: "arrow-select", arrowId: s.id });
      } else if (s.t === "handle") {
        const p = boardRef.current.players.find((q) => q.id === s.id);
        if (!p) return;
        if (Math.hypot(s.to.x - p.x, s.to.y - p.y) > DRAG_THRESHOLD) {
          run({ kind: "player-arrow", playerId: s.id, toX: s.to.x, toY: s.to.y });
        } else {
          showToast("「↗」は引っぱって離すと、動きの矢印になります");
        }
      } else if (s.t === "court") {
        if (s.moved) run({ kind: "shuttle-arrow", fromX: s.from.x, fromY: s.from.y, toX: s.to.x, toY: s.to.y });
        else if (boardRef.current.selected) run({ kind: "clear-selection" });
        else showToast("タップではなく、指で“なぞって”ください");
      } else if (s.t === "arrow") {
        run({ kind: "arrow-select", arrowId: s.id });
      }
    };

    const onCancel = () => { sessionRef.current = null; setPreview(null); };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [getPos, setBoard, commit, run, showToast]);

  // ---- 操作
  const flip = () => {
    const b = boardRef.current;
    commit({
      ...b,
      players: b.players.map((p) => ({ ...p, y: 100 - p.y })),
      arrows: b.arrows.map((a) => ({ ...a, fromY: 100 - a.fromY, toY: 100 - a.toY, curveY: 100 - a.curveY })),
      flipped: !b.flipped,
    });
  };

  const clearArrows = () => {
    const b = boardRef.current;
    if (b.arrows.length === 0) { showToast("矢印はまだありません"); return; }
    commit({ ...b, arrows: [], selected: b.players.some((p) => p.id === b.selected) ? b.selected : null });
  };

  const deleteSelected = () => {
    const b = boardRef.current;
    if (!b.selected) return;
    commit({
      ...b,
      players: b.players.filter((p) => p.id !== b.selected),
      arrows: b.arrows.filter((a) => a.id !== b.selected).map((a) => (a.ownerId === b.selected ? { ...a, ownerId: undefined } : a)),
      selected: null,
    });
  };

  const toggleArrowKind = (id: string) => {
    const b = boardRef.current;
    commit({
      ...b,
      arrows: b.arrows.map((a) => {
        if (a.id !== id) return a;
        const kind: ArrowKind = a.kind === "shuttle" ? "move" : "shuttle";
        // 赤は明示指定なので保つ。既定色だけ付け替える
        const color = a.color === RED ? RED : undefined;
        return { ...a, kind, color };
      }),
    });
  };

  const toggleRed = (id: string) => {
    const b = boardRef.current;
    commit({ ...b, arrows: b.arrows.map((a) => (a.id === id ? { ...a, color: a.color === RED ? undefined : RED } : a)) });
  };

  const onFormation = (key: FormationKey) => {
    commit(applyFormation(boardRef.current, key));
    const f = FORMATIONS.find((x) => x.key === key);
    if (f) showToast(`${f.label}：${f.note}`);
  };

  const addPlayer = (type: PlayerType, team: Team) => {
    commit(addPlayerTo(boardRef.current, type, team));
  };

  const doReset = () => {
    setResetPending(false);
    setSheet(null);
    const fresh = seedBoard();
    boardRef.current = fresh;
    setBoardState(fresh);
    histRef.current = { stack: [snapshotOf(fresh)], index: 0 };
    setHistMeta({ undo: false, redo: false });
    try { localStorage.setItem(LS_LAST, JSON.stringify(snapshotOf(fresh))); } catch { /* noop */ }
  };

  const saveToSlot = (i: number) => {
    const next = slots.map((s, k) => (k === i ? { ...s, savedAt: Date.now(), data: snapshotOf(boardRef.current) } : s));
    setSlots(next);
    persistSlots(next);
    showToast(`${i + 1}番に保存しました`);
  };

  const loadFromSlot = (i: number) => {
    const s = slots[i];
    if (!s.data) return;
    commit(applySnapshot({ ...boardRef.current, selected: null }, s.data));
    setSheet(null);
    showToast(`${i + 1}番を読み込みました`);
  };

  const saveImage = useCallback(() => {
    // 選択の破線・ハンドルが写らないよう、いったん選択を外してから撮る
    setBoard({ ...boardRef.current, selected: null });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const svgEl = courtRef.current?.querySelector("svg.composite") as SVGSVGElement | null;
      if (!svgEl) return;
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const xml = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([xml], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const scale = 2;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = courtSize.w * scale;
        canvas.height = courtSize.h * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); return; }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, courtSize.w, courtSize.h);
        URL.revokeObjectURL(url);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `tactics-${Date.now()}.png`;
        a.click();
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    }));
  }, [courtSize, setBoard]);

  // ---- 描画用の派生値
  const radius = clamp(courtSize.w * 0.075, 14, 26);
  const selectedPlayer = board.players.find((p) => p.id === board.selected);
  const selectedArrow = board.arrows.find((a) => a.id === board.selected);
  const hint = hintFor(board, { drawing: preview?.kind ?? null, firstVisit });

  const barBtn = (active = false): React.CSSProperties => ({
    flex: 1, minWidth: 0, height: 46, borderRadius: 10, border: "none",
    background: active ? "#2563EB" : "#1F2937", color: active ? "#fff" : "#E5E7EB",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
    fontFamily: "inherit", touchAction: "manipulation",
    boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, height: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        background: BOARD_BG, color: "#fff",
        fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
        display: "flex", flexDirection: "column", overflow: "hidden",
        overscrollBehavior: "none", WebkitTapHighlightColor: "transparent",
        zIndex: 40,
      }}
    >
      {/* ===== 上バー（chromeless のため戻る導線をここに持つ） ===== */}
      <div style={{
        height: 38, flexShrink: 0, display: "flex", alignItems: "center",
        gap: 8, padding: "0 8px", borderBottom: "1px solid #1F2937",
      }}>
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/"); }}
          aria-label="戻る"
          style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "6px 8px", fontFamily: "inherit" }}
        >
          ← 戻る
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#93C5FD" }}>🏸 戦術ボード</span>
      </div>

      {/* ===== コート（余りぜんぶ） ===== */}
      <div
        ref={slotRef}
        style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 6 }}
      >
        <div
          ref={courtRef}
          onPointerDown={onCourtDown}
          style={{
            width: courtSize.w, height: courtSize.h, position: "relative",
            borderRadius: 6, overflow: "hidden", flexShrink: 0,
            boxShadow: "0 8px 28px rgba(0,0,0,0.6)", touchAction: "none",
          }}
        >
          <svg
            className="composite"
            viewBox={`0 0 ${courtSize.w} ${courtSize.h}`}
            width={courtSize.w} height={courtSize.h}
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            <CourtLines width={courtSize.w} height={courtSize.h} flipped={board.flipped} />
            {board.arrows.map((a) => (
              <ArrowShape
                key={a.id}
                arrow={a}
                color={arrowColor(a, board.players)}
                courtW={courtSize.w}
                courtH={courtSize.h}
                selected={board.selected === a.id}
                onBodyDown={(e) => onArrowDown(e, a.id)}
                onCurveDown={(e) => onCurveDown(e, a.id)}
              />
            ))}
            {preview && (
              <line
                x1={px(preview.from.x, courtSize.w)} y1={px(preview.from.y, courtSize.h)}
                x2={px(preview.to.x, courtSize.w)} y2={px(preview.to.y, courtSize.h)}
                stroke={preview.color} strokeWidth={3} strokeLinecap="round"
                strokeDasharray={preview.kind === "move" ? "9,6" : "none"} opacity={0.75}
                pointerEvents="none"
              />
            )}
            {board.players.map((p) => (
              <PlayerToken
                key={p.id}
                player={p}
                courtW={courtSize.w} courtH={courtSize.h}
                selected={board.selected === p.id}
                radius={radius}
                onBodyDown={(e) => onPlayerDown(e, p.id)}
                onHandleDown={(e) => onHandleDown(e, p.id)}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* ===== ヒント1行（凡例とショートカット表示はここに統合） ===== */}
      <div
        role="status"
        style={{
          ...bandStyle, height: 24, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: toast ? "#FDE68A" : "#94A3B8", padding: "0 10px",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {toast ?? hint}
      </div>

      {/* ===== フォーメーション（初見の1手目）。4つとも常に見えていること ===== */}
      <div style={{ ...bandStyle, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: "0 8px 6px" }}>
        {FORMATIONS.map((f) => (
          <button
            key={f.key}
            onClick={() => onFormation(f.key)}
            aria-label={f.label}
            style={{
              minWidth: 0, height: 38, padding: "0 4px",
              borderRadius: 10, border: "1px solid #334155", background: "#111C33",
              color: "#CBD5E1", fontSize: 11, fontWeight: 700, lineHeight: 1.25, cursor: "pointer",
              fontFamily: "inherit", touchAction: "manipulation",
            }}
          >
            {f.short.map((line) => <div key={line}>{line}</div>)}
          </button>
        ))}
      </div>

      {/* ===== 選択中のシート（最大3つ） =====
          レイアウトに割り込ませるとコートが縮んで、触った選手が指の下から逃げる。
          常時ボタンの上に浮かせて、盤面の大きさを一定に保つ。 */}
      {(selectedPlayer || selectedArrow) && (
        <div style={{
          position: "absolute", left: 0, right: 0, margin: "0 auto",
          maxWidth: BAND_MAX, padding: "6px 8px",
          bottom: "calc(59px + env(safe-area-inset-bottom))",
          display: "flex", gap: 6, alignItems: "center", zIndex: 5,
          // 下のフォーメーション行の真上に重なる。透けると2段が混ざって
          // 「壊れている」ように見えるので、必ず塗りつぶす
          background: BOARD_BG,
        }}>
          {selectedPlayer && (
            <>
              {renaming === selectedPlayer.id ? (
                <>
                  <input
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value.slice(0, 4))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const b = boardRef.current;
                      commit({ ...b, players: b.players.map((p) => (p.id === selectedPlayer.id ? { ...p, label: renameText || p.label } : p)) });
                      setRenaming(null);
                    }}
                    autoFocus
                    style={{ flex: 1, minWidth: 0, height: 38, borderRadius: 9, border: "1px solid #475569", background: "#0F172A", color: "#fff", fontSize: 14, padding: "0 10px", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={() => {
                      const b = boardRef.current;
                      commit({ ...b, players: b.players.map((p) => (p.id === selectedPlayer.id ? { ...p, label: renameText || p.label } : p)) });
                      setRenaming(null);
                    }}
                    style={{ ...barBtn(true), flex: "0 0 72px", height: 38 }}
                  >決定</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setRenameText(selectedPlayer.label); setRenaming(selectedPlayer.id); }}
                    style={{ ...barBtn(), height: 38 }}
                  >✏️ 名前</button>
                  <button onClick={deleteSelected} style={{ ...barBtn(), height: 38, background: "#7F1D1D", color: "#FECACA" }}>🗑 削除</button>
                </>
              )}
            </>
          )}
          {selectedArrow && (
            <>
              <button onClick={() => toggleArrowKind(selectedArrow.id)} style={{ ...barBtn(), height: 38 }}>
                {selectedArrow.kind === "shuttle" ? "→ 人の動きにする" : "→ シャトルにする"}
              </button>
              <button
                onClick={() => toggleRed(selectedArrow.id)}
                style={{ ...barBtn(), height: 38, background: selectedArrow.color === RED ? RED : "#1F2937" }}
              >🔴 赤</button>
              <button onClick={deleteSelected} style={{ ...barBtn(), height: 38, background: "#7F1D1D", color: "#FECACA" }}>🗑 削除</button>
            </>
          )}
        </div>
      )}

      {/* ===== 常時ボタンは3つ =====
          初見がここでやり切るのは「1つ作戦を描いて、仲間に見せる」だけ。その一本道に要るのは
          ①失敗を取り消せること ②描いたものを渡せること の2つしかない。
          外した「矢印消す」「反転」は、同じ幅・同じ色で隣に並んでいたせいで
          初見が意味も分からず押せてしまう形だった（初回の盤面は見本の矢印2本を持っているので
          「矢印消す」は初回から効いてしまう。反転は盤面全体が上下に飛ぶので「壊した」に見える）。
          どちらも一括操作か初期設定で、描いている最中に押すものではないから ☰ の中へ移した。
          ラベルに「作戦」を残すのは、MyPage が「保存した作戦 N / 5」でこの機能を外から
          宣伝しているため（MyPage.tsx:369）。ここで語が消えると保存の入口を見失う。
          この帯の外寸は borderTop 1 + paddingTop 6 + 高さ46 + paddingBottom 8 = 61px。
          上に浮く選択シートの bottom は 59px で、2px ぶんは帯の上端の境界線に重なる。
          シートは不透明・zIndex 5 なのでボタンには掛からず、見た目も破綻しない。
          この余白はフォーメーション行の下 padding 6px に吸われている。
          帯の高さを変えるときは、59 を機械的に足し引きせず実機で見ること。 */}
      <div style={{
        ...bandStyle, display: "flex", gap: 6, padding: "0 8px",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        borderTop: "1px solid #1F2937", paddingTop: 6,
      }}>
        <button onClick={undo} disabled={!histMeta.undo} style={{ ...barBtn(), opacity: histMeta.undo ? 1 : 0.35 }}>
          <span style={{ fontSize: 17 }}>↩</span>戻す
        </button>
        <button onClick={() => setSheet("menu")} style={barBtn()}>
          <span style={{ fontSize: 17 }}>☰</span>作戦メニュー
        </button>
        {/* 「保存」と言い切らないのは、iOS Safari で <a download> がカメラロールに入るのか
            別タブで開くだけなのかを実機で確認できていないため。行き先は約束しない */}
        <button onClick={saveImage} style={barBtn(true)}>
          <span style={{ fontSize: 17 }}>📷</span>画像にする
        </button>
      </div>

      {/* ===== 「作戦メニュー」シート（この盤面・保存スロット・選手追加・初期化） =====
          並びは「この盤面 → 作戦の保存 → 選手を足す → 最初の状態に戻す」。
          下バーから外した2つを先頭に置くのは、消えた語と開いた直後に再会させて
          「どこへ行ったか分からない」を作らないため。危ないもの（初期化）は最後。 */}
      {sheet === "menu" && (
        <div
          onClick={() => setSheet(null)}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", zIndex: 10 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxHeight: "78%", overflowY: "auto",
              // 375x667 の実機で中身が約70px はみ出す。ボタンの高さを削れば収まるが、
              // 体育館で片手で押す面なので当たり判定は削らない。行間だけ詰めて、
              // 残りはスクロールを許す。
              // ファイル冒頭の原則1「スクロールを作らない」は**盤面の画面**の話で、
              // 自分で開いたときだけ出るこのシートには当てはめない。
              // ただし下に流れて出るのは「選手を足す」と「最初の状態に戻す」で、
              // どちらも初見が最初に使うものではない（危ないものが下なのは意図どおり）。
              // overscrollBehavior: シートの端まで来たときに後ろの盤面ごと動くのを止める。
              overscrollBehavior: "contain",
              background: "#0F172A", borderTop: "1px solid #334155",
              borderRadius: "14px 14px 0 0", padding: 12,
              paddingBottom: "max(12px, env(safe-area-inset-bottom))",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b style={{ fontSize: 14 }}>作戦メニュー</b>
              <button onClick={() => setSheet(null)} style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>閉じる</button>
            </div>

            {/* この盤面 — どれも押したらシートを閉じる。結果が出るのは後ろのコートで、
                このシートは 375x667 の実機で表示519px＋暗幕なので、開いたままだと
                コートは上端しか見えない。閉じないと「効いたのか分からない」で二度押しになる。
                「やり直す」も同じ。連打で取り返す用途では開き直す手間が増えるが、
                効いたか見えないまま連打させるほうが害が大きい（戻しすぎを2回以上
                取り返す場面はまれ）。
                redo はキーボード（⌘⇧Z / ⌘Y）にしか出口がなく、スマホから到達できなかった。
                3つに絞って「戻す」が目立つぶん押しすぎも増えるので、ここで出口を作る */}
            <div style={{ ...sheetHeading, marginTop: 0 }}>この盤面</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button onClick={() => { setSheet(null); clearArrows(); }} style={{ ...barBtn(), height: 40, lineHeight: 1.2 }}>
                ✕ 矢印をぜんぶ消す
              </button>
              <button onClick={() => { setSheet(null); flip(); }} style={{ ...barBtn(), height: 40, lineHeight: 1.2 }}>
                ↕ コートの上下を入れかえる
              </button>
            </div>
            <button
              onClick={() => { setSheet(null); redo(); }}
              disabled={!histMeta.redo}
              style={{ ...barBtn(), width: "100%", height: 40, marginTop: 6, opacity: histMeta.redo ? 1 : 0.35 }}
            >
              ↪ やり直す
            </button>

            <div style={sheetHeading}>作戦の保存</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {slots.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: s.data ? "#CBD5E1" : "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i + 1}. {s.data ? (s.savedAt ? formatSavedAt(s.savedAt) : "保存済み") : "空き"}
                  </span>
                  <button onClick={() => saveToSlot(i)} style={{ ...barBtn(), flex: "0 0 74px", height: 38 }}>保存</button>
                  <button onClick={() => loadFromSlot(i)} disabled={!s.data} style={{ ...barBtn(), flex: "0 0 74px", height: 38, opacity: s.data ? 1 : 0.35 }}>読込</button>
                </div>
              ))}
            </div>

            <div style={sheetHeading}>選手を足す</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {([
                { type: "male", team: "us", label: "＋ 自分側（男）" },
                { type: "female", team: "us", label: "＋ 自分側（女）" },
                { type: "male", team: "them", label: "＋ 相手側（男）" },
                { type: "female", team: "them", label: "＋ 相手側（女）" },
              ] as const).map((b) => (
                <button key={`${b.type}-${b.team}`} onClick={() => addPlayer(b.type, b.team)} style={{ ...barBtn(), height: 40 }}>
                  {b.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setResetPending(true)}
              style={{ ...barBtn(), width: "100%", height: 40, marginTop: 14, background: "#7F1D1D", color: "#FECACA" }}
            >
              最初の状態に戻す
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetPending}
        title="ボードを最初の状態に戻しますか？"
        message="いま並べた選手と矢印は消えて、見本の配置に戻ります。保存した作戦は消えません。"
        confirmLabel="戻す"
        danger
        onConfirm={doReset}
        onCancel={() => setResetPending(false)}
      />
    </div>
  );
}

function formatSavedAt(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
