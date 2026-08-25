// バドミントンコートの描画（一人称視点）。
//
// もともと src/components/RallyGame.tsx の中にあった描画関数をそのまま切り出したもの。
// 30秒ノック（KnockGame）とラリーゲーム（RallyGame）の2つが同じコートを描くので、
// 座標系・投影・描画・効果音・シェア画像をここ1か所に置いて両方から使う。
//
// ⚠️ 外部アセットは一切読み込まない（体育館のモバイル回線を前提にしているため）。
//    画・音ともに Canvas / WebAudio でその場で合成する。

// ── 論理座標系（描画は常に W×H、実ピクセルへは setTransform で拡大） ──
export const W = 360;
export const H = 560;
export const NEAR_Y = 545;
export const FAR_Y = 118;
export const NEAR_HALF = 235;
export const FAR_HALF = 60;
/** AIの立ち位置（奥行き 0=自分ベースライン, 0.5=ネット, 1=相手ベースライン） */
export const FAR_D = 0.94;
/** ラケットが動ける奥行きの下限・上限（ネットより手前まで） */
export const RACKET_MIN_D = 0.03;
export const RACKET_MAX_D = 0.44;
/** ラケットが届く距離（正規化コート座標） */
export const REACH = 0.3;

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 奥行きd(0〜1)と横位置x(-1〜1)をスクリーン座標へ（簡易パース投影） */
export function project(x: number, d: number) {
  const t = (d * 1.9) / (1 + 0.9 * d);
  const y = NEAR_Y + (FAR_Y - NEAR_Y) * t;
  const half = NEAR_HALF + (FAR_HALF - NEAR_HALF) * t;
  return { x: W / 2 + x * half, y, scale: half / NEAR_HALF };
}

/** スクリーン座標 → コート座標（projectの逆変換。ラケット操作用） */
export function unproject(
  px: number,
  py: number,
  minD: number = RACKET_MIN_D,
  maxD: number = RACKET_MAX_D,
) {
  const t = clamp((py - NEAR_Y) / (FAR_Y - NEAR_Y), 0, 0.99);
  const d = t / (1.9 - 0.9 * t);
  const half = NEAR_HALF + (FAR_HALF - NEAR_HALF) * t;
  return {
    x: clamp((px - W / 2) / half, -1.05, 1.05),
    d: clamp(d, minD, maxD),
  };
}

// ── 効果音（WebAudioで合成。失敗してもゲームは止めない） ──
let audioCtx: AudioContext | null = null;

export function beep(
  freq: number,
  durMs = 90,
  type: OscillatorType = 'triangle',
  gain = 0.05,
) {
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

export function drawCourt(ctx: CanvasRenderingContext2D) {
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

export function drawNet(ctx: CanvasRenderingContext2D) {
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

/** 自分のラケット（一人称視点。コート上の位置に浮いて指に追従する） */
export function drawRacket(
  ctx: CanvasRenderingContext2D,
  x: number,
  d: number,
  swingT: number | null,
  reach: number = REACH,
) {
  const p = project(x, d);
  const s = p.scale;

  // 届く範囲のガイド（うっすら）
  const rx = reach * (NEAR_HALF + (FAR_HALF - NEAR_HALF) * ((d * 1.9) / (1 + 0.9 * d)));
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

/** AIロボ（対戦相手・正面）。30秒ノックではノッカー役として同じ絵を使う */
export function drawAiBot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  now: number,
) {
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

export function drawShuttle(
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

// ── シェア用スコア画像（Canvasで生成し、共有 or ダウンロード） ──

export interface ScoreImageOptions {
  /** 見出し（例: '🏸 バド対決ゲーム'） */
  title: string;
  /** 数字の上に出る小見出し（例: '到達ラリー数'） */
  valueLabel: string;
  /** どーんと出る数字 */
  value: number | string;
  /** ランク行（例: '🏆 カンスト級'） */
  rankLine: string;
  /** 補足行（例: '自己ベスト: 12ラリー'） */
  subLine: string;
  /** 保存ファイル名 */
  fileName: string;
  /** 共有シートに載る本文 */
  shareText: string;
}

/**
 * スコア画像を生成して共有（できなければPNGダウンロード）。
 * レイアウトは切り出し前の RallyGame.shareScoreImage と同一。文言だけ引数で差し替える。
 */
export async function shareScoreImage(opts: ScoreImageOptions) {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 900;
  const ctx = c.getContext('2d');
  if (!ctx) return;

  // 背景（夜の体育館グラデ）
  const bg = ctx.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#134e4a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);

  // コートライン風の装飾
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 4;
  ctx.strokeRect(60, 60, c.width - 120, c.height - 120);
  ctx.beginPath();
  ctx.moveTo(60, c.height / 2);
  ctx.lineTo(c.width - 60, c.height / 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#6ee7b7';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('KAWABADO MINI GAME', c.width / 2, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(opts.title, c.width / 2, 215);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(opts.valueLabel, c.width / 2, 330);
  ctx.fillStyle = '#fde047';
  ctx.font = 'black 200px sans-serif';
  ctx.fillText(String(opts.value), c.width / 2, 530);

  ctx.fillStyle = '#6ee7b7';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(opts.rankLine, c.width / 2, 620);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(opts.subLine, c.width / 2, 690);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('kawabado.com/ja/game', c.width / 2, 790);

  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], opts.fileName, { type: 'image/png' });
  // モバイルはOSの共有シートへ。使えなければPNGダウンロード
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'バド対決ゲーム',
        text: opts.shareText,
      });
      return;
    } catch {
      /* キャンセル時はダウンロードにフォールバックしない */
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * タイミングゲージ。着地点の少し上に横バーで「今どこか」を出す。
 *
 * 既存の縮むリングは着地点＝指を置く場所そのものに描かれるので、
 * スマホでは一番見たい瞬間を自分の指が隠す。同じ情報を指の当たらない
 * 位置に出すためのもので、リングは残したまま併用する。
 *
 * cx, cy は着地点。scale は遠近スケール。
 * remainMs / hitWindowMs は evaluateSwingTiming に渡すのと同じ値。
 * perfectZone は |err| < これ で Perfect になる閾値（rallyGame の PERFECT_ZONE）。
 */
export function drawTimingGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  remainMs: number,
  hitWindowMs: number,
  perfectZone: number,
): void {
  if (hitWindowMs <= 0) return;
  const gw = 96 * scale;
  const gh = 8 * scale;
  const gx = cx - gw / 2;
  const gy = cy - 62 * scale; // 指より上
  const r = 5 * scale;

  ctx.fillStyle = 'rgba(2,6,23,0.72)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(gx - 2, gy - 2, gw + 4, gh + 4, r);
  } else {
    ctx.rect(gx - 2, gy - 2, gw + 4, gh + 4);
  }
  ctx.fill();

  // Perfect帯。evaluateSwingTiming と同じ式から出すので、
  // 判定を変えたらこの帯も自動でついてくる（見た目と判定がずれない）
  const half = perfectZone * 0.55;
  const lo = 0.45 - half;
  const hi = 0.45 + half;
  ctx.fillStyle = 'rgba(253,224,71,0.85)';
  ctx.fillRect(gx + gw * lo, gy, gw * (hi - lo), gh);

  // 今の位置。残り時間が減るほど左へ進む
  const t = Math.max(0, Math.min(1, remainMs / hitWindowMs));
  ctx.fillStyle = '#fff';
  ctx.fillRect(gx + gw * t - 1.5 * scale, gy - 3 * scale, 3 * scale, gh + 6 * scale);
}
