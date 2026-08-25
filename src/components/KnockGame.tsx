// 30秒ノック（ゲーム設計案B）。Canvas + requestAnimationFrame + WebAudio だけで完結する。
// 外部アセット・追加ライブラリはゼロ（体育館のモバイル回線で開く前提）。
//
// 実際のバド練習「6点ノック」をそのまま画面に置いた。
// コート手前側の6点のどれかが光る → 触る → 即座に次。30秒で何本打てたか、それだけ。
//
// ■ 旧ラリーゲームとの決定的な違い
//   ・負けが存在しない。時間切れ以外で終わらないので、**必ず結果画面に到達する**
//   ・難易度は「点灯時間」1つだけ（1200→900→700ms）
//   ・狙う＋タイミングの2軸を1軸にした。光っている間に触るだけ
//   ・スコアが線形（打った本数）なので、下手でも毎回数字が動く
//
// ■ 描画と更新を分けてある理由
//   更新（tickKnock）は 2D コンテキストが取れない環境でも必ず回す。
//   こうしておかないと「描けない端末では時間が進まない＝結果に到達しない」が起きうるし、
//   jsdom のテストから 30秒ぶんを早送りして結果画面を確かめることもできない。

import { useEffect, useRef, useState } from 'react';
import {
  H,
  W,
  beep,
  clamp,
  drawAiBot,
  drawCourt,
  drawNet,
  drawShuttle,
  project,
  shareScoreImage,
} from '../lib/courtRender';
import {
  KNOCK_DURATION_MS,
  KNOCK_TARGETS,
  NO_MISS_STREAK,
  createKnockState,
  elapsedMs,
  shiftKnockClock,
  getKnockBestLocal,
  getKnockLastLocal,
  hitFeedback,
  knockResult,
  pickTargetAt,
  prefersReducedMotion,
  rankForKnock,
  remainingMs,
  resolveBest,
  scoreDelta,
  setKnockLastLocal,
  tapKnock,
  tickKnock,
  updateKnockBestLocal,
  vibrateIfAllowed,
  type KnockResult,
  type KnockState,
} from '../lib/knockGame';

type Phase = 'ready' | 'playing' | 'over';

/** タップ位置がここまで離れていても、いちばん近い点を狙ったとみなす */
const TAP_RADIUS = 130;
/** リザルト表示直後の誤タップで即リスタートしないための保護。0.5秒より十分短い */
const RESTART_GUARD_MS = 250;
/** 読み上げの間隔。30秒に対して5秒刻み＝6回。1秒刻みだと読み上げが途切れず邪魔になる */
const SR_ANNOUNCE_MS = 5_000;

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
interface Fx {
  popups: Popup[];
  particles: Particle[];
  /** 画面の揺れ。reduced-motion では常に0のまま */
  shakeUntil: number;
  shakePx: number;
  /** ヒットストップ（この時刻まで的の縮小アニメを止め、白い衝撃を出す） */
  hitStopUntil: number;
  hitAt: { x: number; y: number } | null;
  /** 的が点いた瞬間のシャトル落下アニメ用 */
  litSpawnAt: number;
  banner: { text: string; start: number } | null;
  /** 前フレームの時刻。粒の速度を実時間で積むために持つ */
  lastTs: number;
}

const SCREEN_POINTS = KNOCK_TARGETS.map((t) => {
  const p = project(t.x, t.d);
  return { id: t.id, x: p.x, y: p.y, scale: p.scale };
});

function newFx(): Fx {
  return {
    popups: [],
    particles: [],
    shakeUntil: 0,
    shakePx: 0,
    hitStopUntil: 0,
    hitAt: null,
    litSpawnAt: 0,
    banner: null,
    lastTs: 0,
  };
}

// ── 描画 ──

function drawPads(ctx: CanvasRenderingContext2D, litId: number | null, litRatio: number, now: number) {
  for (const p of SCREEN_POINTS) {
    const rx = 30 * p.scale;
    const ry = 11 * p.scale;
    const isLit = p.id === litId;
    // 消えているときの的（どこを触ればいいか常に見えている）
    ctx.fillStyle = isLit ? 'rgba(250,204,21,0.35)' : 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isLit ? '#facc15' : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = isLit ? 3 : 1.5;
    ctx.stroke();

    if (!isLit) continue;

    // 残り時間のリング（外から的まで縮んでくる）。残りが少ないと色が変わる
    const grow = litRatio * 46 * p.scale;
    ctx.strokeStyle = litRatio < 0.35 ? '#fb7185' : '#4ade80';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx + grow, ry + grow * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 光の脈動
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    ctx.fillStyle = `rgba(250,204,21,${0.12 + pulse * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx * 1.5, ry * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  s: KnockState,
  now: number,
  combo: number,
) {
  const remain = remainingMs(s, now);
  const ratio = clamp(remain / KNOCK_DURATION_MS, 0, 1);

  // 残り時間バー
  const barX = 22;
  const barW = W - 44;
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  ctx.beginPath();
  ctx.roundRect(barX, 14, barW, 8, 4);
  ctx.fill();
  ctx.fillStyle = remain < 5_000 ? '#fb7185' : remain < 10_000 ? '#fbbf24' : '#4ade80';
  ctx.beginPath();
  ctx.roundRect(barX, 14, Math.max(2, barW * ratio), 8, 4);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('打った本数', W / 2, 44);
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(s.hits), W / 2, 84);

  // 残り秒
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = remain < 5_000 ? '#fb7185' : 'rgba(255,255,255,0.7)';
  ctx.fillText(`のこり ${(remain / 1000).toFixed(1)}秒`, barX, 44);

  // コンボ
  if (combo >= 2) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = combo >= NO_MISS_STREAK ? '#facc15' : '#7dd3fc';
    ctx.fillText(`×${combo}`, W - barX, 46);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('コンボ', W - barX, 60);
  }
  ctx.textAlign = 'center';
}

// ── コンポーネント ──

export interface KnockGameProps {
  /** ゲーム開始時に通知 */
  onGameStart?: () => void;
  /** 30秒経って結果が出たときに通知（サーバー記録は親が行う） */
  onGameEnd?: (result: KnockResult) => void;
  /** サーバー（game_plays）の自己ベスト。あればこちらが正 */
  serverBest?: number | null;
}

export default function KnockGame({ onGameStart, onGameEnd, serverBest }: KnockGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<KnockState | null>(null);
  const fxRef = useRef<Fx>(newFx());
  const phaseRef = useRef<Phase>('ready');
  const reducedRef = useRef(false);
  const restartOkAtRef = useRef(0);
  const prevScoreRef = useRef<number | null>(null);
  const onGameEndRef = useRef(onGameEnd);
  const onGameStartRef = useRef(onGameStart);

  const [phase, setPhase] = useState<Phase>('ready');
  const [result, setResult] = useState<KnockResult | null>(null);
  const [prevScore, setPrevScore] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [localBest, setLocalBest] = useState(0);
  // 読み上げ用の経過秒。canvasの中は読めないので、ここだけがスクリーンリーダーの手がかりになる。
  // 毎フレーム更新すると再描画も読み上げもうるさいので5秒刻みにする
  const [srElapsed, setSrElapsed] = useState(0);
  const srBucketRef = useRef(-1);

  useEffect(() => {
    onGameEndRef.current = onGameEnd;
    onGameStartRef.current = onGameStart;
  }, [onGameEnd, onGameStart]);

  useEffect(() => {
    // localStorage は描画前に読まない（SSR/プライベートモード対策はlib側でしてある）
    prevScoreRef.current = getKnockLastLocal();
    setLocalBest(getKnockBestLocal());
  }, []);

  const best = resolveBest(serverBest, localBest);

  const start = () => {
    // 開始直後の連続イベント（pointerdown → click、キー長押し）で二重に始めない
    restartOkAtRef.current = performance.now() + RESTART_GUARD_MS;
    reducedRef.current = prefersReducedMotion();
    stateRef.current = createKnockState();
    fxRef.current = newFx();
    phaseRef.current = 'playing';
    srBucketRef.current = -1;
    setResult(null);
    setPhase('playing');
    beep(660, 80);
    onGameStartRef.current?.();
  };

  const finish = (now: number) => {
    const st = stateRef.current;
    if (!st || phaseRef.current !== 'playing') return;
    phaseRef.current = 'over';
    const r = knockResult(st);
    setResult(r);
    setPrevScore(prevScoreRef.current);
    setIsNewBest(updateKnockBestLocal(r.score));
    setKnockLastLocal(r.score);
    prevScoreRef.current = r.score;
    setLocalBest(getKnockBestLocal());
    restartOkAtRef.current = now + RESTART_GUARD_MS;
    setPhase('over');
    beep(392, 160, 'triangle', 0.05);
    beep(523, 260, 'triangle', 0.045);
    onGameEndRef.current?.(r);
  };

  /** 1本取れたときの手応え（ヒットストップ・揺れ・振動・粒） */
  const celebrateHit = (now: number, id: number, perfect: boolean, combo: number, milestone: boolean) => {
    const fx = fxRef.current;
    const fb = hitFeedback(reducedRef.current, perfect);
    const p = SCREEN_POINTS[id];
    fx.hitStopUntil = now + fb.hitStopMs;
    fx.hitAt = { x: p.x, y: p.y };
    if (fb.shakePx > 0) {
      fx.shakeUntil = now + 110;
      fx.shakePx = fb.shakePx;
    }
    vibrateIfAllowed(fb.vibrateMs, reducedRef.current);
    const colors = perfect
      ? ['#fde047', '#fbbf24', '#ffffff']
      : ['#4ade80', '#a7f3d0', '#ffffff'];
    for (let i = 0; i < fb.particles; i++) {
      const a = (Math.PI * 2 * i) / Math.max(1, fb.particles);
      const sp = 90 + Math.random() * 170;
      fx.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - 90,
        color: colors[i % colors.length],
        start: now,
        life: 420 + Math.random() * 320,
        r: 2 + Math.random() * 2.5,
      });
    }
    fx.popups.push({
      text: perfect ? 'Perfect!' : 'ナイス!',
      x: p.x,
      y: p.y - 34,
      start: now,
      color: perfect ? '#fde047' : '#86efac',
      size: perfect ? 20 : 17,
    });
    if (milestone) {
      fx.banner = { text: `${combo}連続 ノーミス！`, start: now };
      beep(880, 120);
      beep(1174, 180);
    }
    beep(perfect ? 780 : 620, 60, 'square', 0.035);
  };

  // メインループ（更新 → 描画。描けなくても更新は必ず回す）
  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const st = stateRef.current;
      const fx = fxRef.current;

      // ── 更新（描画に依存しない） ──
      if (st && phaseRef.current === 'playing') {
        const events = tickKnock(st, ts);
        for (const ev of events) {
          if (ev.type === 'spawn') {
            fx.litSpawnAt = ts;
            beep(420, 45, 'sine', 0.025);
          } else if (ev.type === 'miss') {
            const p = SCREEN_POINTS[ev.id];
            fx.popups.push({
              text: 'ぬけた',
              x: p.x,
              y: p.y - 26,
              start: ts,
              color: 'rgba(226,232,240,0.75)',
              size: 14,
            });
          }
        }
        const bucket = Math.floor(elapsedMs(st, ts) / SR_ANNOUNCE_MS);
        if (bucket !== srBucketRef.current) {
          srBucketRef.current = bucket;
          setSrElapsed(Math.round((bucket * SR_ANNOUNCE_MS) / 1000));
        }
        if (st.over) finish(ts);
      }

      // FXの寿命（ヒットストップ中は粒を止める＝止まって見える）
      // 速度は実時間で積む。120Hzの端末でも60Hzの端末でも同じ見え方にするため
      const dt = fx.lastTs === 0 ? 1 / 60 : Math.min((ts - fx.lastTs) / 1000, 0.05);
      fx.lastTs = ts;
      const frozen = ts < fx.hitStopUntil;
      fx.popups = fx.popups.filter((pp) => ts - pp.start < 700);
      fx.particles = fx.particles.filter((pt) => ts - pt.start < pt.life);
      if (!frozen) {
        for (const pt of fx.particles) {
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.vy += 420 * dt;
        }
      }
      if (fx.banner && ts - fx.banner.start > 900) fx.banner = null;

      // ── 描画（2Dコンテキストが取れないときは飛ばす） ──
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
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

      // 揺れで縁が透けないよう、先に暗色で塗ってからずらす
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (ts < fx.shakeUntil && fx.shakePx > 0) {
        const decay = (fx.shakeUntil - ts) / 110;
        ctx.translate(
          (Math.random() * 2 - 1) * fx.shakePx * decay,
          (Math.random() * 2 - 1) * fx.shakePx * decay,
        );
      }

      drawCourt(ctx);

      const lit = st?.lit ?? null;
      const litRatio = lit ? clamp(1 - (ts - lit.litAt) / lit.litMs, 0, 1) : 0;
      drawPads(ctx, lit ? lit.id : null, litRatio, ts);

      const aiP = project(0, 0.94);
      drawAiBot(ctx, aiP.x, aiP.y, aiP.scale, ts);
      drawNet(ctx);

      // 点いた的の上にシャトルを落とす（0.14秒で着地）
      if (lit) {
        const p = SCREEN_POINTS[lit.id];
        const dropT = clamp((ts - Math.max(fx.litSpawnAt, lit.litAt)) / 140, 0, 1);
        const yOff = (1 - dropT) * 70 * p.scale;
        drawShuttle(ctx, p.x, p.y - 10 * p.scale - yOff, p.scale * 1.05, true);
      }

      // ヒットの白い衝撃（ヒットストップ中だけ）
      if (frozen && fx.hitAt) {
        const t = 1 - (fx.hitStopUntil - ts) / 80;
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - t)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(fx.hitAt.x, fx.hitAt.y, 12 + t * 46, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const pt of fx.particles) {
        ctx.globalAlpha = clamp(1 - (ts - pt.start) / pt.life, 0, 1);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      for (const pp of fx.popups) {
        const age = (ts - pp.start) / 700;
        ctx.globalAlpha = clamp(1 - age, 0, 1);
        ctx.font = `bold ${pp.size}px sans-serif`;
        ctx.fillStyle = pp.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.strokeText(pp.text, pp.x, pp.y - age * 26);
        ctx.fillText(pp.text, pp.x, pp.y - age * 26);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (fx.banner) {
        const age = (ts - fx.banner.start) / 900;
        ctx.globalAlpha = clamp(1 - age * age, 0, 1);
        ctx.textAlign = 'center';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 4;
        ctx.strokeText(fx.banner.text, W / 2, 200);
        ctx.fillText(fx.banner.text, W / 2, 200);
        ctx.globalAlpha = 1;
      }

      if (st) drawHud(ctx, st, ts, st.combo);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleTapAt = (px: number, py: number, now: number) => {
    const st = stateRef.current;
    if (!st || phaseRef.current !== 'playing') return;
    const id = pickTargetAt(SCREEN_POINTS, px, py, TAP_RADIUS);
    const r = tapKnock(st, now, id);
    if (r.hit && id != null) {
      celebrateHit(now, id, r.perfect, r.combo, r.streakMilestone);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    handleTapAt(
      ((e.clientX - rect.left) / rect.width) * W,
      ((e.clientY - rect.top) / rect.height) * H,
      performance.now(),
    );
  };

  // 画面を離れて戻ったとき、離れていた時間ぶん時計を戻す。
  // rAFは非表示タブで止まるので、これが無いと戻った瞬間に30秒を使い切ったことにされる。
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        return;
      }
      const st = stateRef.current;
      if (hiddenAt > 0 && st && phaseRef.current === 'playing') {
        shiftKnockClock(st, performance.now() - hiddenAt);
        st.now = performance.now();
      }
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // PC用: 1〜6キーで6点、Space/Enterで開始・再開
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phaseRef.current === 'playing') {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= KNOCK_TARGETS.length) {
          e.preventDefault();
          const p = SCREEN_POINTS[n - 1];
          handleTapAt(p.x, p.y, performance.now());
        }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (phaseRef.current === 'over' && performance.now() < restartOkAtRef.current) return;
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
    // start / handleTapAt は ref 経由でしか状態を触らないので張り替え不要
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResultTap = () => {
    if (performance.now() < restartOkAtRef.current) return;
    start();
  };

  const rank = result ? rankForKnock(result.score) : null;
  const delta = result ? scoreDelta(result.score, prevScore) : null;
  const elapsedLabel = srElapsed;

  return (
    <div className="relative mx-auto h-full max-h-full w-auto max-w-full select-none overflow-hidden rounded-2xl shadow-lg md:h-auto md:max-h-none md:w-full md:max-w-[420px]">
      <canvas
        ref={canvasRef}
        className="block aspect-[9/14] w-full touch-none"
        onPointerDown={handlePointerDown}
        aria-label="30秒ノックのコート"
      />

      {/* スタート画面 */}
      {phase === 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/75 px-6 text-center backdrop-blur-[2px]">
          <p className="text-4xl">🏸</p>
          <h2 className="text-2xl font-bold text-white">30秒ノック</h2>
          <p className="text-sm leading-relaxed text-slate-200">
            コートの6点のうち
            <span className="font-bold text-amber-300">光ったところ</span>
            を触るだけ。
            <br />
            30秒で何本打てるか、それだけのゲームです。
          </p>
          <p className="text-xs leading-relaxed text-emerald-300">
            ミスしても終わりません。30秒はぜんぶあなたのものです。
          </p>
          <p className="text-[11px] text-slate-400">
            後半になるほど光っている時間が短くなります（PCは 1〜6キーでもOK）
          </p>
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-emerald-500 px-10 py-3 text-lg font-bold text-white shadow-md transition hover:bg-emerald-400 active:scale-95"
          >
            30秒スタート
          </button>
          {best > 0 && (
            <p className="text-xs text-slate-400">自己ベスト: {best}本</p>
          )}
        </div>
      )}

      {/* リザルト画面（どこを触っても即やり直せる） */}
      {phase === 'over' && result && rank && delta && (
        <div
          role="button"
          tabIndex={0}
          onPointerDown={handleResultTap}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleResultTap();
          }}
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 bg-slate-900/85 px-6 text-center backdrop-blur-[2px]"
        >
          <p className="text-xs text-slate-400">30秒で打った本数</p>
          <p className="text-7xl font-black leading-none text-white">{result.score}</p>

          {/* いちばん大きく出すのは「前回より何本増えたか」。毎回ここが動く */}
          <p
            className={`mt-1 text-3xl font-black leading-tight ${
              delta.kind === 'up'
                ? 'text-emerald-300'
                : delta.kind === 'down'
                  ? 'text-slate-300'
                  : 'text-amber-300'
            }`}
          >
            {delta.text}
          </p>

          {isNewBest && (
            <p className="toast-enter rounded-full bg-amber-400/90 px-4 py-1 text-xs font-black text-amber-950">
              🎉 自己ベスト更新！
            </p>
          )}

          <p className="mt-1 text-lg font-bold text-emerald-300">
            {rank.emoji} {rank.label}
          </p>
          <p className="text-xs leading-relaxed text-slate-300">{rank.message}</p>

          <div className="mt-2 flex items-center gap-4 text-xs text-slate-300">
            <span>
              Perfect <span className="font-bold text-amber-300">{result.perfects}</span>本
            </span>
            <span>
              最大コンボ <span className="font-bold text-sky-300">{result.maxCombo}</span>
            </span>
            {best > 0 && (
              <span>
                ベスト <span className="font-bold text-white">{best}</span>本
              </span>
            )}
          </div>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleResultTap}
            className="mt-3 rounded-full bg-emerald-500 px-10 py-3 text-lg font-bold text-white shadow-md transition hover:bg-emerald-400 active:scale-95"
          >
            もう1本いく
          </button>
          <p className="text-[11px] text-slate-400">画面のどこを触ってもすぐ再開します</p>
          <button
            type="button"
            // 親（オーバーレイ）の pointerdown は再開なので、共有ボタンでは止める
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              void shareScoreImage({
                title: '🏸 30秒ノック',
                valueLabel: '30秒で打った本数',
                value: result.score,
                rankLine: `${rank.emoji} ${rank.label}`,
                subLine: `最大コンボ ${result.maxCombo} / 自己ベスト ${Math.max(best, result.score)}本`,
                fileName: 'kawabado-knock-score.png',
                shareText: `30秒ノックで${result.score}本打てた！ #かわバド`,
              });
            }}
            className="rounded-full border border-white/30 px-6 py-2 text-xs font-bold text-white/90 transition hover:bg-white/10 active:scale-95"
          >
            📸 スコア画像をシェア
          </button>
        </div>
      )}

      {/* スクリーンリーダー向け（canvasの中は読めないため） */}
      <p className="sr-only" aria-live="polite">
        {phase === 'playing'
          ? `${elapsedLabel}秒経過`
          : phase === 'over' && result
            ? `結果 ${result.score}本`
            : ''}
      </p>
    </div>
  );
}
