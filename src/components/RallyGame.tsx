// バド対決ゲーム本体（一人称視点）。Canvas + requestAnimationFrame の軽量実装。
// 操作: 指/マウスでラケットをコート全面（前後左右）に動かし、タップ/クリックでスイング。
// スイングのタイミングが早い/遅いと返球が横に流れ、ラインを割ると「アウトミス」。
// 終了条件: 届かず着地（アウト）/ 空振り / 返球がラインを割る（アウトミス）。
// スコア送信・抽選はフェーズ②で onGameEnd から Supabase Edge Function に接続する。

import { useEffect, useRef, useState } from 'react';
import {
  LEGEND_RALLY,
  OUT_X,
  computeReturnX,
  createRng,
  difficultyForRally,
  evaluateSwingTiming,
  pickLanding,
  rankForRally,
  type ShotDifficulty,
} from '../lib/rallyGame';

// ── 論理座標系（描画は常に W×H、実ピクセルへは setTransform で拡大） ──
const W = 360;
const H = 560;
const NEAR_Y = 545;
const FAR_Y = 118;
const NEAR_HALF = 235;
const FAR_HALF = 60;
const FAR_D = 0.94; // AIの立ち位置（奥行き 0=自分ベースライン, 0.5=ネット, 1=相手ベースライン）
const RACKET_MIN_D = 0.03;
const RACKET_MAX_D = 0.44; // ネットより手前まで
const REACH = 0.3; // ラケットが届く距離（正規化コート座標）
const DEPTH_WEIGHT = 2.6; // 前後方向の距離の重み（実寸換算の近似）
const SWING_MS = 220;
const KEY_SPEED_X = 3.2; // キーボード移動速度（コート座標/秒）
const KEY_SPEED_D = 1.1;

type Phase = 'ready' | 'playing' | 'over';

interface Flight {
  mode: 'incoming' | 'returning';
  fromX: number;
  toX: number;
  fromD: number;
  toD: number;
  start: number;
  duration: number;
  arc: number;
}
interface Pause {
  mode: 'pause';
  until: number;
}
type Shuttle = Flight | Pause;

interface Popup {
  text: string;
  x: number;
  y: number;
  start: number;
  color: string;
  size: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  start: number;
  life: number;
  r: number;
}

interface Sim {
  rally: number;
  racketX: number;
  racketD: number;
  targetX: number;
  targetD: number;
  aiX: number;
  swingStart: number | null;
  attemptedSwing: boolean; // このシャトルに一度でもスイングしたか（終了メッセージの出し分け用）
  shuttle: Shuttle | null;
  /** 返球がラインを割ったとき: 着地後に表示する終了メッセージ */
  pendingEnd: string | null;
  rng: () => number;
  currentDiff: ShotDifficulty | null;
  popups: Popup[];
  particles: Particle[];
  trail: { x: number; y: number; s: number }[];
  legend: boolean;
  lastT: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 奥行きd(0〜1)と横位置x(-1〜1)をスクリーン座標へ（簡易パース投影）
function project(x: number, d: number) {
  const t = (d * 1.9) / (1 + 0.9 * d);
  const y = NEAR_Y + (FAR_Y - NEAR_Y) * t;
  const half = NEAR_HALF + (FAR_HALF - NEAR_HALF) * t;
  return { x: W / 2 + x * half, y, scale: half / NEAR_HALF };
}

// スクリーン座標 → コート座標（projectの逆変換。ラケット操作用）
function unproject(px: number, py: number) {
  const t = clamp((py - NEAR_Y) / (FAR_Y - NEAR_Y), 0, 0.99);
  const d = t / (1.9 - 0.9 * t);
  const half = NEAR_HALF + (FAR_HALF - NEAR_HALF) * t;
  return {
    x: clamp((px - W / 2) / half, -1.05, 1.05),
    d: clamp(d, RACKET_MIN_D, RACKET_MAX_D),
  };
}

// ── 効果音（WebAudioで合成。失敗してもゲームは止めない） ──
let audioCtx: AudioContext | null = null;
function beep(freq: number, durMs = 90, type: OscillatorType = 'triangle', gain = 0.05) {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000);
  } catch {
    /* 音なし環境は無視 */
  }
}

// ── 描画 ──

function drawCourt(ctx: CanvasRenderingContext2D) {
  // 体育館の壁と床
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.14, '#1e293b');
  bg.addColorStop(0.15, '#8a6842');
  bg.addColorStop(1, '#a57d4f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // コート面（外周マット→緑面）
  const mat: [number, number][] = [
    [-1.12, -0.04],
    [1.12, -0.04],
    [1.12, 1.04],
    [-1.12, 1.04],
  ];
  ctx.fillStyle = '#155e46';
  ctx.beginPath();
  mat.forEach(([mx, md], i) => {
    const p = project(mx, md);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1e8a63';
  ctx.beginPath();
  const c1 = project(-1, 0);
  const c2 = project(1, 0);
  const c3 = project(1, 1);
  const c4 = project(-1, 1);
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.lineTo(c3.x, c3.y);
  ctx.lineTo(c4.x, c4.y);
  ctx.closePath();
  ctx.fill();

  // ライン
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  const line = (x1: number, d1: number, x2: number, d2: number) => {
    const a = project(x1, d1);
    const b = project(x2, d2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  line(-1, 0, 1, 0); // 手前ベースライン
  line(-1, 1, 1, 1); // 奥ベースライン
  line(-1, 0, -1, 1); // サイドライン
  line(1, 0, 1, 1);
  line(-0.82, 0, -0.82, 1); // シングルスライン風
  line(0.82, 0, 0.82, 1);
  line(-1, 0.34, 1, 0.34); // ショートサービスライン
  line(-1, 0.66, 1, 0.66);
  line(0, 0, 0, 0.34); // センターライン
  line(0, 0.66, 0, 1);
}

function drawNet(ctx: CanvasRenderingContext2D) {
  const left = project(-1.06, 0.5);
  const right = project(1.06, 0.5);
  const netH = 52 * left.scale;
  // ポール
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(left.x, left.y - netH);
  ctx.moveTo(right.x, right.y);
  ctx.lineTo(right.x, right.y - netH);
  ctx.stroke();
  // ネット本体
  ctx.fillStyle = 'rgba(226,232,240,0.28)';
  ctx.fillRect(left.x, left.y - netH, right.x - left.x, netH);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 6; i++) {
    const y = left.y - (netH * i) / 6;
    ctx.beginPath();
    ctx.moveTo(left.x, y);
    ctx.lineTo(right.x, y);
    ctx.stroke();
  }
  // 白帯
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(left.x, left.y - netH, right.x - left.x, 4 * left.scale);
}

// 自分のラケット（一人称視点。コート上の位置に浮いて指に追従する）
function drawRacket(
  ctx: CanvasRenderingContext2D,
  x: number,
  d: number,
  swingT: number | null,
) {
  const p = project(x, d);
  const s = p.scale;

  // 届く範囲のガイド（うっすら）
  const rx = REACH * (NEAR_HALF + (FAR_HALF - NEAR_HALF) * ((d * 1.9) / (1 + 0.9 * d)));
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, rx * 0.38, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 16 * s, 5.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(p.x, p.y - 12 * s);
  ctx.scale(s, s);
  // グリップを支点にスイングで振り抜く
  const rest = 0.3;
  const ang =
    swingT == null ? rest : rest - Math.sin(Math.min(swingT, 1) * Math.PI) * 2.1;
  ctx.rotate(ang);
  // グリップ
  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -14);
  ctx.stroke();
  // シャフト
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(0, -46);
  ctx.stroke();
  // ヘッド
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, -66, 17, 22, 0, 0, Math.PI * 2);
  ctx.stroke();
  // ガット
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.7;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 5.5, -46);
    ctx.lineTo(i * 5.5, -86);
    ctx.stroke();
  }
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-15, -66 + i * 5.5);
    ctx.lineTo(15, -66 + i * 5.5);
    ctx.stroke();
  }
  ctx.restore();

  // スイング軌跡
  if (swingT != null && swingT < 0.7) {
    ctx.strokeStyle = `rgba(125,211,252,${0.7 * (1 - swingT / 0.7)})`;
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 12 * s, 55 * s, -Math.PI * 0.9, 0.1, false);
    ctx.stroke();
  }
}

// AIロボ（対戦相手・正面）
function drawAiBot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, now: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const bob = Math.sin(now / 260) * 2; // ふわふわ待機モーション
  ctx.translate(0, bob);
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 2 - bob, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // 脚
  ctx.fillStyle = '#475569';
  ctx.fillRect(-10, -22, 7, 20);
  ctx.fillRect(3, -22, 7, 20);
  // ボディ
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.roundRect(-15, -56, 30, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AI', 0, -33);
  // 腕＋ラケット
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-13, -50);
  ctx.lineTo(-22, -60);
  ctx.stroke();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-24, -68, 6, 8, -0.4, 0, Math.PI * 2);
  ctx.stroke();
  // 頭（モニター顔）
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(-12, -76, 24, 18, 5);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(-9, -73, 18, 12, 3);
  ctx.fill();
  // 目（光る）
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(-4, -67, 2, 0, Math.PI * 2);
  ctx.arc(4, -67, 2, 0, Math.PI * 2);
  ctx.fill();
  // アンテナ
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -76);
  ctx.lineTo(0, -83);
  ctx.stroke();
  ctx.fillStyle = '#f87171';
  ctx.beginPath();
  ctx.arc(0, -85, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShuttle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  towardViewer: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (!towardViewer) ctx.rotate(Math.PI);
  // 羽（スカート）
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-7, -14);
  ctx.lineTo(7, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(0, -14);
  ctx.moveTo(0, 1);
  ctx.lineTo(-4.5, -14);
  ctx.moveTo(0, 1);
  ctx.lineTo(4.5, -14);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -14, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  // コルク
  ctx.fillStyle = '#f4c895';
  ctx.beginPath();
  ctx.arc(0, 4, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── ゲームコンポーネント ──

export interface RallyGameProps {
  /** ゲーム終了時に到達ラリー数を通知（抽選APIへの接続は親が行う） */
  onGameEnd?: (rallyCount: number) => void;
  /** 抽選1回に必要なラリー数。指定するとスタート画面・リザルトにチャンス表示を出す */
  drawEveryRallies?: number;
}

export default function RallyGame({ onGameEnd, drawEveryRallies }: RallyGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const keysRef = useRef(new Set<string>());
  const [phase, setPhase] = useState<Phase>('ready');
  const [finalRally, setFinalRally] = useState(0);
  const [endText, setEndText] = useState('');
  // rAFループやイベントリスナーから最新値を読むための参照
  const phaseRef = useRef<Phase>('ready');
  const onGameEndRef = useRef(onGameEnd);
  useEffect(() => {
    onGameEndRef.current = onGameEnd;
  }, [onGameEnd]);

  const start = () => {
    const now = performance.now();
    simRef.current = {
      rally: 0,
      racketX: 0,
      racketD: 0.15,
      targetX: 0,
      targetD: 0.15,
      aiX: 0,
      swingStart: null,
      attemptedSwing: false,
      shuttle: { mode: 'pause', until: now + 900 },
      pendingEnd: null,
      rng: createRng(),
      currentDiff: null,
      popups: [
        { text: 'AIサーブ!', x: W / 2, y: 240, start: now, color: '#fbbf24', size: 22 },
      ],
      particles: [],
      trail: [],
      legend: false,
      lastT: now,
    };
    phaseRef.current = 'playing';
    setPhase('playing');
    beep(660, 80);
    // 開発時のみ: 自動テストからシミュレーション状態を覗けるようにする
    if (import.meta.env.DEV) {
      (window as unknown as { __rallySim?: Sim }).__rallySim = simRef.current;
    }
  };

  const finish = (text: string) => {
    const sim = simRef.current;
    if (!sim || phaseRef.current !== 'playing') return;
    phaseRef.current = 'over';
    setFinalRally(sim.rally);
    setEndText(text);
    setPhase('over');
    beep(220, 260, 'sawtooth', 0.04);
    onGameEndRef.current?.(sim.rally);
  };

  const swing = (now: number) => {
    const sim = simRef.current;
    if (!sim || phaseRef.current !== 'playing') return;
    if (sim.swingStart != null && now - sim.swingStart < SWING_MS) return;
    sim.swingStart = now;

    const sh = sim.shuttle;
    // 相手コートにシャトルがある間、または既にヒットして返球済みの場合はノーカウント
    // （ヒット後は shuttle.mode が 'returning' に変わるので自然にブロックされる）
    if (!sh || sh.mode !== 'incoming') {
      beep(300, 50, 'sine', 0.02);
      return;
    }
    sim.attemptedSwing = true;

    const diff = sim.currentDiff;
    if (!diff) return; // 念のためのガード
    const remain = sh.start + sh.duration - now;
    const inWindow = remain <= diff.hitWindowMs && remain >= -40;
    const dx = sim.racketX - sh.toX;
    const dd = (sim.racketD - sh.toD) * DEPTH_WEIGHT;
    const reachOk = Math.hypot(dx, dd) <= REACH;

    if (!inWindow || !reachOk) {
      // 空振り確定。シャトルが落ちた時点でゲーム終了になる
      const p = project(sim.racketX, sim.racketD);
      sim.popups.push({
        text: '空振り…!',
        x: p.x,
        y: p.y - 120,
        start: now,
        color: '#f87171',
        size: 20,
      });
      beep(180, 140, 'square', 0.03);
      return;
    }

    // 当たった。タイミング精度で返球のブレが決まる
    const timing = evaluateSwingTiming(remain, diff.hitWindowMs);
    const returnX = computeReturnX(sim.racketX, timing.deviation);
    const hitP = project(sim.racketX, sim.racketD);
    sim.rally += 1;

    if (timing.perfect) {
      sim.popups.push({
        text: sim.rally % 5 === 0 ? 'Perfect!! 🎯' : 'Perfect!',
        x: hitP.x,
        y: hitP.y - 130,
        start: now,
        color: '#fde047',
        size: sim.rally % 5 === 0 ? 24 : 19,
      });
    } else {
      sim.popups.push({
        text: timing.err > 0 ? '早い！' : '遅い！',
        x: hitP.x,
        y: hitP.y - 130,
        start: now,
        color: '#fb923c',
        size: 19,
      });
    }
    beep(520 + Math.min(sim.rally * 18, 520), 80);

    // 節目演出
    if (sim.rally === 10 || sim.rally === 20) {
      sim.popups.push({
        text: `${sim.rally}ラリー突破!! 🔥`,
        x: W / 2,
        y: 250,
        start: now,
        color: '#fb923c',
        size: 26,
      });
    }
    if (sim.rally === LEGEND_RALLY) {
      sim.legend = true;
      sim.popups.push({
        text: '🏆 カンスト級!! 🏆',
        x: W / 2,
        y: 230,
        start: now,
        color: '#facc15',
        size: 30,
      });
      const colors = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#e879f9'];
      for (let i = 0; i < 44; i++) {
        sim.particles.push({
          x: W / 2,
          y: 250,
          vx: (sim.rng() * 2 - 1) * 260,
          vy: -sim.rng() * 300 - 60,
          color: colors[i % colors.length],
          start: now,
          life: 1400 + sim.rng() * 700,
          r: 2.5 + sim.rng() * 3,
        });
      }
      beep(880, 140);
      beep(1174, 200);
    }

    // ブレすぎてラインを割る → 着地後にアウトミスで終了
    if (Math.abs(returnX) > OUT_X) {
      sim.pendingEnd =
        timing.err > 0
          ? 'アウトミス…打点が早すぎて横に流れた！'
          : 'アウトミス…振り遅れて横に流れた！';
    }

    // 返球（自分 → AIコート。ブレた分だけ横に流れる）
    sim.shuttle = {
      mode: 'returning',
      fromX: sim.racketX,
      toX: returnX,
      fromD: sim.racketD,
      toD: 0.88,
      start: now,
      duration: Math.max(diff.flightMs * 0.8, 520),
      arc: 80,
    };
    sim.trail = [];
  };

  // メインループ
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 実ピクセルサイズ調整（レスポンシブ + Retina）
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw === 0) return;
      const bw = Math.round(cw * dpr);
      const bh = Math.round(ch * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      const k = bw / W;
      ctx.setTransform(k, 0, 0, k, 0, 0);

      const now = performance.now();
      const sim = simRef.current;
      const playing = phaseRef.current === 'playing';

      // ── 更新 ──
      if (sim && playing) {
        const dt = Math.min((now - sim.lastT) / 1000, 0.05);
        sim.lastT = now;

        // キーボード移動（前後左右）
        if (keysRef.current.has('ArrowLeft')) sim.targetX -= KEY_SPEED_X * dt;
        if (keysRef.current.has('ArrowRight')) sim.targetX += KEY_SPEED_X * dt;
        if (keysRef.current.has('ArrowUp')) sim.targetD += KEY_SPEED_D * dt;
        if (keysRef.current.has('ArrowDown')) sim.targetD -= KEY_SPEED_D * dt;
        sim.targetX = clamp(sim.targetX, -1.05, 1.05);
        sim.targetD = clamp(sim.targetD, RACKET_MIN_D, RACKET_MAX_D);
        sim.racketX = lerp(sim.racketX, sim.targetX, Math.min(1, dt * 16));
        sim.racketD = lerp(sim.racketD, sim.targetD, Math.min(1, dt * 16));

        // スイングアニメ終了
        if (sim.swingStart != null && now - sim.swingStart > SWING_MS) {
          sim.swingStart = null;
        }

        // シャトル状態遷移
        const sh = sim.shuttle;
        if (sh) {
          if (sh.mode === 'pause') {
            if (sim.pendingEnd && now >= sh.until) {
              finish(sim.pendingEnd);
            } else if (now >= sh.until) {
              const diff = difficultyForRally(sim.rally, sim.rng);
              sim.currentDiff = diff;
              const landing = pickLanding(sim.rng, diff);
              const speedT = (1500 - diff.flightMs) / 800;
              sim.shuttle = {
                mode: 'incoming',
                fromX: sim.aiX,
                toX: landing.x,
                fromD: FAR_D,
                toD: landing.d,
                start: now,
                duration: diff.flightMs,
                arc: lerp(95, 42, clamp(speedT, 0, 1)),
              };
              sim.attemptedSwing = false;
              sim.trail = [];
              beep(420, 60, 'sine', 0.03);
            }
          } else {
            const p = (now - sh.start) / sh.duration;
            if (sh.mode === 'returning') {
              // AIはインの返球にだけ反応して落下点へ移動
              if (!sim.pendingEnd) {
                sim.aiX = lerp(sim.aiX, clamp(sh.toX, -0.9, 0.9), Math.min(1, dt * 6));
              }
              if (p >= 1) {
                if (sim.pendingEnd) {
                  // ラインを割った。OUT表示を出して少し置いてから終了
                  const landP = project(sh.toX, sh.toD);
                  sim.popups.push({
                    text: 'OUT!!',
                    x: clamp(landP.x, 30, W - 30),
                    y: landP.y - 20,
                    start: now,
                    color: '#f87171',
                    size: 28,
                  });
                  beep(150, 200, 'square', 0.04);
                  sim.shuttle = { mode: 'pause', until: now + 750 };
                } else {
                  sim.aiX = clamp(sh.toX, -0.9, 0.9);
                  sim.shuttle = { mode: 'pause', until: now + 240 };
                }
              }
            } else if (p >= 1) {
              // 着地: 打ち返せなかった
              finish(sim.attemptedSwing ? '空振り…！' : 'アウト…届かなかった！');
            }
            // 軌跡を記録
            if (p < 1 && sim.trail.length < 200) {
              const cx = lerp(sh.fromX, sh.toX, p);
              const cd = lerp(sh.fromD, sh.toD, p);
              const pr = project(cx, cd);
              const yOff = Math.sin(Math.min(p, 1) * Math.PI) * sh.arc * pr.scale;
              sim.trail.push({ x: pr.x, y: pr.y - yOff, s: pr.scale });
              if (sim.trail.length > 7) sim.trail.shift();
            }
          }
        }

        // パーティクル
        sim.particles = sim.particles.filter((pt) => now - pt.start < pt.life);
        for (const pt of sim.particles) {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.vy += 420 * dt;
        }
        sim.popups = sim.popups.filter((pp) => now - pp.start < 850);
      }

      // ── 描画 ──
      drawCourt(ctx);

      const shuttlePos = (() => {
        const s = sim?.shuttle;
        if (!s || s.mode === 'pause') return null;
        const p = clamp((now - s.start) / s.duration, 0, 1);
        const cx = lerp(s.fromX, s.toX, p);
        const cd = lerp(s.fromD, s.toD, p);
        const pr = project(cx, cd);
        const yOff = Math.sin(p * Math.PI) * s.arc * pr.scale;
        return {
          x: pr.x,
          y: pr.y - yOff,
          scale: pr.scale,
          d: cd,
          toward: s.mode === 'incoming',
        };
      })();

      // 着地点マーカー＋タイミングリング（incoming時のみ）
      if (sim && playing && sim.shuttle && sim.shuttle.mode === 'incoming' && sim.currentDiff) {
        const sh = sim.shuttle;
        const diff = sim.currentDiff;
        const remain = sh.start + sh.duration - now;
        const m = project(sh.toX, sh.toD);
        const inWindow = remain <= diff.hitWindowMs;
        ctx.fillStyle = inWindow ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, 17 * m.scale, 6.5 * m.scale, 0, 0, Math.PI * 2);
        ctx.fill();
        const rr = 17 + Math.max(remain, 0) / sh.duration * 95;
        ctx.strokeStyle = inWindow ? '#4ade80' : 'rgba(255,255,255,0.65)';
        ctx.lineWidth = inWindow ? 3 : 2;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y, rr * m.scale, rr * 0.38 * m.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 奥のAI
      const aiP = project(sim?.aiX ?? 0, FAR_D);
      drawAiBot(ctx, aiP.x, aiP.y, aiP.scale, now);

      // ネットより奥のシャトル
      if (shuttlePos && shuttlePos.d > 0.5) {
        drawShuttle(ctx, shuttlePos.x, shuttlePos.y, shuttlePos.scale, shuttlePos.toward);
      }
      drawNet(ctx);
      // 軌跡（手前側）
      if (sim) {
        for (let i = 0; i < sim.trail.length; i++) {
          const t = sim.trail[i];
          ctx.fillStyle = `rgba(255,255,255,${(0.28 * (i + 1)) / sim.trail.length})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, 3 * t.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // ネットより手前のシャトル
      if (shuttlePos && shuttlePos.d <= 0.5) {
        drawShuttle(ctx, shuttlePos.x, shuttlePos.y, shuttlePos.scale, shuttlePos.toward);
      }

      // 自分のラケット
      const swingT =
        sim?.swingStart != null ? (now - sim.swingStart) / SWING_MS : null;
      drawRacket(ctx, sim?.racketX ?? 0, sim?.racketD ?? 0.15, swingT);

      // パーティクル・ポップアップ
      if (sim) {
        for (const pt of sim.particles) {
          ctx.globalAlpha = clamp(1 - (now - pt.start) / pt.life, 0, 1);
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        for (const pp of sim.popups) {
          const age = (now - pp.start) / 850;
          ctx.globalAlpha = clamp(1 - age, 0, 1);
          ctx.font = `bold ${pp.size}px sans-serif`;
          ctx.fillStyle = pp.color;
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 3;
          ctx.strokeText(pp.text, pp.x, pp.y - age * 34);
          ctx.fillText(pp.text, pp.x, pp.y - age * 34);
        }
        ctx.globalAlpha = 1;
      }

      // HUD（ラリーカウント）
      if (sim) {
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText('ラリー', W / 2, 30);
        ctx.font = 'bold 40px sans-serif';
        ctx.fillStyle = sim.legend
          ? `hsl(${(now / 6) % 360}, 95%, 65%)`
          : '#ffffff';
        ctx.fillText(String(sim.rally), W / 2, 68);
        ctx.font = 'bold 11px sans-serif';
        const flightMs = sim.currentDiff?.flightMs ?? 1500;
        const speedLabel =
          flightMs < 850 ? '⚡爆速!!' :
          flightMs < 1050 ? '🔥はやい!' :
          flightMs < 1300 ? 'ふつう' :
          '☁️ゆったり';
        ctx.fillStyle =
          flightMs < 850 ? '#fb923c' : 'rgba(255,255,255,0.55)';
        ctx.fillText(`今の球: ${speedLabel}`, W / 2, 86);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // キーボード操作（デスクトップ用: ←→↑↓移動 / Spaceスイング）
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        keysRef.current.add(e.key);
        if (phaseRef.current === 'playing') e.preventDefault();
      } else if (e.key === ' ' && phaseRef.current === 'playing') {
        e.preventDefault();
        swing(performance.now());
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const pointerToCourt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    return unproject(px, py);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (!sim || phaseRef.current !== 'playing') return;
    const c = pointerToCourt(e);
    if (c) {
      sim.targetX = c.x;
      sim.targetD = c.d;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (!sim || phaseRef.current !== 'playing') return;
    const c = pointerToCourt(e);
    if (c) {
      sim.targetX = c.x;
      sim.targetD = c.d;
      // タップ位置に即ワープしてからスイング（追従ラグで空振りしないように）
      sim.racketX = c.x;
      sim.racketD = c.d;
    }
    swing(performance.now());
  };

  const rank = rankForRally(finalRally);
  const isLegend = finalRally >= LEGEND_RALLY;

  return (
    <div className="relative mx-auto h-full max-h-full w-auto max-w-full select-none overflow-hidden rounded-2xl shadow-lg md:h-auto md:max-h-none md:w-full md:max-w-[420px]">
      <canvas
        ref={canvasRef}
        className="block aspect-[9/14] w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        aria-label="バド対決ゲームのコート"
      />

      {/* スタート画面 */}
      {phase === 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-slate-900/70 px-6 text-center backdrop-blur-[2px]">
          <p className="text-4xl">🏸</p>
          <h2 className="text-2xl font-bold text-white">バド対決!</h2>
          <p className="text-sm leading-relaxed text-slate-200">
            指でラケットをコート全面（前後左右）に動かして、
            <br />
            シャトルの落下点で
            <span className="font-bold text-emerald-300">緑リングが重なった瞬間</span>
            にタップ！
          </p>
          <p className="text-xs text-slate-400">
            早すぎ・遅すぎは打球が横に流れてアウトミスの危険…
            <br />
            Perfectを狙え！（PCは ←→↑↓ 移動 / Space スイング）
          </p>
          {drawEveryRallies != null && (
            <p className="text-xs font-bold text-amber-300">
              🎁 {drawEveryRallies}ラリーごとに無料券の抽選チャンス！
            </p>
          )}
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-emerald-500 px-10 py-3 text-lg font-bold text-white shadow-md transition hover:bg-emerald-400 active:scale-95"
          >
            対決スタート
          </button>
        </div>
      )}

      {/* リザルト画面 */}
      {phase === 'over' && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center backdrop-blur-[2px] ${
            isLegend
              ? 'bg-gradient-to-b from-amber-900/80 via-slate-900/80 to-slate-900/85'
              : 'bg-slate-900/75'
          }`}
        >
          <p className="text-sm font-medium text-slate-300">{endText}</p>
          <p className="text-xs text-slate-400">到達ラリー数</p>
          <p
            className={`text-6xl font-black leading-none ${
              isLegend ? 'text-amber-300' : 'text-white'
            }`}
          >
            {finalRally}
          </p>
          <div className="mt-1">
            <p
              className={`text-xl font-bold ${
                isLegend ? 'text-amber-300' : 'text-emerald-300'
              }`}
            >
              {rank.emoji} {rank.label} {rank.emoji}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{rank.message}</p>
          </div>
          {drawEveryRallies != null && finalRally < drawEveryRallies && (
            <p className="text-xs font-bold text-amber-300">
              あと{drawEveryRallies - finalRally}ラリーで抽選チャンス！🎁
            </p>
          )}
          <button
            type="button"
            onClick={start}
            className="mt-3 rounded-full bg-emerald-500 px-10 py-3 text-lg font-bold text-white shadow-md transition hover:bg-emerald-400 active:scale-95"
          >
            もう一度対決する
          </button>
        </div>
      )}
    </div>
  );
}
