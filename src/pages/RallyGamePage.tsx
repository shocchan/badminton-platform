// ミニゲームのページ: /:lang/game
//
// 2つのゲームが同居している。
//   ・rally（既定）: 現行の「バド対決ゲーム」。抽選（rally-lottery）付き
//   ・knock       : 新しい「30秒ノック」。作り替え中の検証用
//
// **本番の既定は rally のまま。** 切り替えは URL か環境変数で行う:
//   ・?mode=knock  … その場で30秒ノックになる（?mode=rally で戻す）
//   ・?knock=1     … 同上（?knock=0 で戻す）
//   ・VITE_GAME_MODE=knock … 既定そのものを差し替える（staging確認後にCEOが実施）
// クエリは環境変数より強いので、切り替えた後も ?mode=rally で旧モードを見比べられる。
//
// 【2026-08-28 統合メモ】security/rls-hardening-and-quality も練習球の案内文
// （🔰 最初のN球は練習球…）を、分割前のこのファイルに直接足していた。
// こちらは同じ文を RallyPanels / RallyHelp に持っており、さらに Perfect の
// 横バー説明と 30秒ノック（KnockGame）を載せている。両方を機械的に足すと
// 案内文が二重に出るため、こちら側の RallyPanels / RallyHelp を採用した。
// security 側の文言（練習球の 🔰 と ❌ の2行）は中身が同じなので落ちていない。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Gamepad2, Gift, Target, Trophy, ChevronRight, Timer } from 'lucide-react';
import RallyGame from '../components/RallyGame';
import KnockGame from '../components/KnockGame';
import RallyLotteryModal from '../components/RallyLotteryModal';
import { LEGEND_RALLY, RALLY_RANKS, WARMUP_RALLIES } from '../lib/rallyGame';
import { getRallyBest } from '../lib/rallyBest';
import {
  KNOCK_DURATION_MS,
  KNOCK_RANKS,
  getKnockBestLocal,
  resolveBest,
  resolveGameMode,
  type KnockResult,
} from '../lib/knockGame';
import { fetchKnockScores, recordKnockPlay, type KnockPlayRow } from '../services/knockScores';
import {
  RALLIES_PER_DRAW,
  drawRallyLottery,
  startRallySession,
  type LotteryResult,
} from '../services/rallyLottery';
import { useLanguage } from '../contexts/LanguageContext';

/** リザルト画面を見せてから抽選モーダルを出すまでの間 */
const LOTTERY_DELAY_MS = 1400;

const KNOCK_SECONDS = Math.round(KNOCK_DURATION_MS / 1000);

export default function RallyGamePage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const [lottery, setLottery] = useState<LotteryResult | null>(null);
  const best = getRallyBest();

  // 1回だけ解決する。プレイ中にモードが入れ替わらないようにするため
  const mode = useMemo(
    () =>
      resolveGameMode(
        typeof window === 'undefined' ? '' : window.location.search,
        import.meta.env.VITE_GAME_MODE as string | undefined,
      ),
    [],
  );

  const handleGameEnd = (rallyCount: number) => {
    // 0ラリーも必ず記録する。
    // 以前はここで捨てていたため「初球で空振りしてそのまま帰った人」が
    // 数字に一度も現れず、「166開始 / 93完了、44%が結果画面に未到達」の
    // 相当部分がこの取りこぼしだった可能性が高い。
    // サーバー側は rallyCount >= 0 を受理し、0本なら抽選0回・
    // dailyLimited も false を返す（supabase/functions/rally-lottery/index.ts）ので、
    // 記録だけが増えてモーダルは出ない。

    // プレイ記録と抽選はサーバーに任せる（15ラリー未満は抽選0回で記録のみ）
    const delay = new Promise((res) => setTimeout(res, LOTTERY_DELAY_MS));
    Promise.all([drawRallyLottery(rallyCount), delay])
      .then(([result]) => {
        const r = result as LotteryResult;
        // 抽選が回ったときだけモーダルを出す。
        // 抽選回数を稼いだのに1日上限で回らなかったときはその案内を出す
        if (r.drawCount > 0 || r.dailyLimited) setLottery(r);
      })
      .catch(() => {
        // 通信エラー時は静かにスキップ（ゲーム体験を邪魔しない）
      });
  };

  return (
    <main>
      <Helmet>
        {mode === 'knock' ? (
          <title>30秒ノック | かわバド</title>
        ) : (
          <title>バド対決ゲーム | かわバド</title>
        )}
        <meta
          name="description"
          content={
            mode === 'knock'
              ? `コートの6点のうち光ったところを触るだけ。${KNOCK_SECONDS}秒で何本打てるか挑戦できる、かわバドのミニゲームです。`
              : 'AIとバドミントンのラリー対決！タイミングよく打ち返してハイスコアを目指そう。15ラリーごとに抽選が回って、ごくまれに無料券が当たる！'
          }
        />
      </Helmet>

      {/* ゲーム本体：スマホはフルスクリーン、PCは3カラム */}
      <div className="flex h-[100dvh] flex-col overflow-hidden md:h-auto md:overflow-visible">
        {/* 薄いヘッダー（常に固定表示） */}
        <div className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-4 py-2">
          <a
            href={`/${locale}/`}
            className="text-xs text-emerald-700 underline-offset-2 hover:underline"
          >
            ← かわバド トップへ
          </a>
          <h1 className="text-sm font-bold text-slate-900">
            {mode === 'knock' ? `${KNOCK_SECONDS}秒ノック` : 'バド対決ゲーム'}
          </h1>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-start gap-6 px-3 pb-3 md:flex-none md:px-6 md:py-8">
          {mode === 'knock' ? (
            <KnockPage locale={locale} />
          ) : (
            <RallyPanels best={best} locale={locale} onGameEnd={handleGameEnd} />
          )}
        </div>
      </div>

      {/* 説明文・遊び方（モバイル/タブレットのみ。PCは左右パネルに集約） */}
      <div className="mx-auto max-w-2xl px-5 py-8 lg:hidden">
        {mode === 'knock' ? <KnockHelp /> : <RallyHelp />}
      </div>

      {lottery !== null && (
        <RallyLotteryModal result={lottery} onClose={() => setLottery(null)} />
      )}
    </main>
  );
}

// ── 現行のラリーゲーム（既定。ここは作り替え前と同じ） ──

function RallyPanels({
  best,
  locale,
  onGameEnd,
}: {
  best: number;
  locale: string;
  onGameEnd: (rallyCount: number) => void;
}) {
  return (
    <>
      {/* 左パネル: あそびかた（PCのみ） */}
      <aside className="hidden flex-1 lg:block">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Gamepad2 className="h-4 w-4 text-emerald-500" /> あそびかた
          </h2>
          <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
            <li>🏸 マウスでラケットをコート全面に移動（←→↑↓キーもOK）</li>
            <li>🎯 落下点に緑リングが縮んでくる。重なった瞬間にクリック / Space でスイング！</li>
            <li>📊 落下点の上に出る横バーの黄色い帯が「Perfect」。指で隠れません</li>
            <li>⚖️ 早い・遅いは打球が横に流れてアウトミスの危険</li>
            <li>🔰 最初の{WARMUP_RALLIES}球は練習球。外してもゲームは終わりません</li>
            <li>💨 ラリーが続くほどシャトルは速く、コースはライン際に</li>
          </ul>
        </div>
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Trophy className="h-4 w-4 text-amber-500" /> ランク表
          </h2>
          <ul className="mt-3 space-y-1.5">
            {RALLY_RANKS.map((r) => (
              <li
                key={r.min}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs odd:bg-slate-50"
              >
                <span className="font-bold text-slate-700">
                  {r.emoji} {r.label}
                </span>
                <span className="text-slate-400">{r.min}〜</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 中央: ゲーム本体 */}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center md:flex-none lg:w-[400px] lg:flex-initial">
        <RallyGame
          onGameStart={startRallySession}
          onGameEnd={onGameEnd}
          drawEveryRallies={RALLIES_PER_DRAW}
        />
      </div>

      {/* 右パネル: 抽選・自己ベスト（PCのみ） */}
      <aside className="hidden flex-1 lg:block">
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm ring-1 ring-amber-200">
          <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <Gift className="h-4 w-4" /> {RALLIES_PER_DRAW}ラリーごとに抽選チャンス
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-amber-900/80">
            <span className="font-bold">{RALLIES_PER_DRAW}ラリー続けるごとに抽選が1回</span>
            回ります。ごくまれに <span className="font-bold">🍜 ラーメン無料券</span> や{' '}
            <span className="font-bold">🏸 バド活動無料券</span> が当たるかも…！？
          </p>
        </div>
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Target className="h-4 w-4 text-blue-500" /> あなたの自己ベスト
          </h2>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {best > 0 ? best : '—'}
            {best > 0 && <span className="ml-1 text-sm font-bold text-slate-400">ラリー</span>}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {best >= LEGEND_RALLY
              ? 'カンスト級！あなたは本物です'
              : `まずは10ラリー、目指せ${LEGEND_RALLY}ラリー！`}
          </p>
          <a
            href={`/${locale}/mypage`}
            className="mt-3 inline-flex items-center text-xs font-bold text-blue-600 underline-offset-2 hover:underline"
          >
            当選クーポンはマイページで確認 <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </aside>
    </>
  );
}

function RallyHelp() {
  return (
    <>
      <div className="text-center">
        <p className="text-xs font-medium tracking-wide text-emerald-700">KAWABADO MINI GAME</p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-600">
          AIが打ってくるシャトルをタイミングよく打ち返すリアクションゲーム。
          ラリーが続くほどスピードとコースが鋭くなります。
          {LEGEND_RALLY}ラリー続けばカンスト級の実力者！
        </p>
      </div>

      {/* 抽選の告知（確率・上限は非公表） */}
      <div className="mt-6 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm ring-1 ring-amber-200">
        <h2 className="text-sm font-bold text-amber-900">
          🎁 {RALLIES_PER_DRAW}ラリーごとに抽選チャンス！
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
          <span className="font-bold">{RALLIES_PER_DRAW}ラリー続けるごとに抽選が1回</span>
          回ります（{RALLIES_PER_DRAW * 2}ラリーなら2回！）。 ごくまれに{' '}
          <span className="font-bold">🍜 ラーメン無料券</span> や{' '}
          <span className="font-bold">🏸 バド活動無料券</span> が当たるかも…！？
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">あそびかた</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
          <li>🏸 指（またはマウス）でラケットをコート全面に移動。前後左右どこでも動ける</li>
          <li>🎯 シャトルの落下点に緑のリングが縮んでくる。重なった瞬間にタップでスイング！</li>
          <li>
            📊 落下点の少し上に横バーが出る。白い印が黄色い帯に入っている間が「Perfect」。
            リングと違って指で隠れないので、迷ったらこちらを見る
          </li>
          <li>
            ⚖️ タイミングがジャストなら「Perfect」。早い・遅いと打球が横に流れ、ラインを割ると「アウトミス」
          </li>
          <li>
            🔰 最初の{WARMUP_RALLIES}球は練習球。ゆっくり真ん中に来て、
            外してもゲームは終わらない。ここで操作を覚えてから本番へ
          </li>
          <li>💨 ラリーが続くほどシャトルは速く、コースはネット前から奥までライン際に</li>
          <li>❌ 練習球を抜けたあとは、届かなければ「アウト」、外せば「空振り」、流れれば「アウトミス」でゲーム終了</li>
          <li>🏆 スコアは到達ラリー数。まずは10ラリー、目指せ{LEGEND_RALLY}ラリー！</li>
        </ul>
      </div>
    </>
  );
}

// ── 30秒ノック（?mode=knock / VITE_GAME_MODE=knock のときだけ） ──

function KnockPage({ locale }: { locale: string }) {
  const [serverBest, setServerBest] = useState<number | null>(null);
  const [recent, setRecent] = useState<KnockPlayRow[]>([]);
  // 未ログイン・RPC未適用でもベストは出す。ここが '—' のままだと、
  // リザルトが「ベスト 2本」と言っているのに右は空、という食い違いになる
  const [localBest, setLocalBest] = useState(0);

  useEffect(() => {
    setLocalBest(getKnockBestLocal());
  }, []);

  const best = resolveBest(serverBest, localBest);

  const refresh = useCallback(async () => {
    const snap = await fetchKnockScores();
    if (!snap) return;
    setServerBest(snap.best);
    setRecent(snap.recent);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 0本でも必ず記録する。旧ゲームで「0ラリーは記録すらされない」を作ってしまった反省。
  const handleEnd = useCallback(
    (r: KnockResult) => {
      setLocalBest(getKnockBestLocal());
      void recordKnockPlay(r.score, r.maxCombo).then((ok) => {
        if (ok) void refresh();
      });
    },
    [refresh],
  );

  return (
    <>
      {/* 左パネル: あそびかた（PCのみ） */}
      <aside className="hidden flex-1 lg:block">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Gamepad2 className="h-4 w-4 text-emerald-500" /> あそびかた
          </h2>
          <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
            <li>💡 コート手前の6点のうち、光ったところを触るだけ</li>
            <li>⏱️ {KNOCK_SECONDS}秒固定。取り逃してもゲームは終わりません</li>
            <li>📈 スコアは打った本数。前半1.2秒 → 後半0.7秒と、光っている時間だけが短くなります</li>
            <li>⌨️ PCは 1〜6 キーでも打てます（1=前左 … 6=後右）</li>
          </ul>
        </div>
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Trophy className="h-4 w-4 text-amber-500" /> ランク表
          </h2>
          <ul className="mt-3 space-y-1.5">
            {KNOCK_RANKS.map((r) => (
              <li
                key={r.min}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs odd:bg-slate-50"
              >
                <span className="font-bold text-slate-700">
                  {r.emoji} {r.label}
                </span>
                <span className="text-slate-400">{r.min}本〜</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* 中央: ゲーム本体 */}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center md:flex-none lg:w-[400px] lg:flex-initial">
        <KnockGame onGameEnd={handleEnd} serverBest={serverBest} />
      </div>

      {/* 右パネル: 自己ベスト・直近の記録（PCのみ） */}
      <aside className="hidden flex-1 lg:block">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm ring-1 ring-emerald-200">
          <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <Timer className="h-4 w-4" /> {KNOCK_SECONDS}秒ノック
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-emerald-900/80">
            実際のバド練習「6点ノック」をそのまま画面に。
            <span className="font-bold">負けはありません。</span>
            {KNOCK_SECONDS}秒のうちに何本打てたか、それだけです。
          </p>
        </div>
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Target className="h-4 w-4 text-blue-500" /> あなたの自己ベスト
          </h2>
          <p className="mt-2 text-3xl font-black text-slate-900">
            {best > 0 ? best : '—'}
            {best > 0 && <span className="ml-1 text-sm font-bold text-slate-400">本</span>}
          </p>
          {recent.length > 0 && (
            <>
              <p className="mt-4 text-xs font-bold text-slate-500">直近の記録</p>
              <ul className="mt-2 space-y-1">
                {recent.slice(0, 10).map((r, i) => (
                  <li
                    key={`${r.playedAt}-${i}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1 text-xs odd:bg-slate-50"
                  >
                    <span className="text-slate-500">
                      {r.playedAt ? new Date(r.playedAt).toLocaleDateString('ja-JP') : '—'}
                    </span>
                    <span className="font-bold text-slate-700">{r.score}本</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <a
            href={`/${locale}/mypage`}
            className="mt-3 inline-flex items-center text-xs font-bold text-blue-600 underline-offset-2 hover:underline"
          >
            クーポンはマイページで確認 <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </aside>
    </>
  );
}

function KnockHelp() {
  return (
    <>
      <div className="text-center">
        <p className="text-xs font-medium tracking-wide text-emerald-700">KAWABADO MINI GAME</p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-600">
          実際のバド練習「6点ノック」を画面に。コート手前の6点のうち光ったところを触るだけです。
          {KNOCK_SECONDS}秒で何本打てるか、ただそれだけ。
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 p-5 shadow-sm ring-1 ring-emerald-200">
        <h2 className="text-sm font-bold text-emerald-900">⏱️ 負けはありません</h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900/80">
          取り逃しても終わりません。{KNOCK_SECONDS}秒はまるごとあなたのものです。
          最後まで打ち切れば必ず結果が出ます。
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">あそびかた</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
          <li>💡 コート手前の6点のうち、光ったところを指で触る。それだけ</li>
          <li>⚡ 触ったら即座に次が光ります。止まっている時間はありません</li>
          <li>📈 スコアは打った本数。Perfect（早く反応できた本数）と最大コンボも記録されます</li>
          <li>
            🔥 光っている時間は前半1.2秒 → 中盤0.9秒 → 後半0.7秒。難しくなるのはここだけです
          </li>
          <li>🔁 結果画面はどこを触ってもすぐ次の{KNOCK_SECONDS}秒が始まります</li>
        </ul>
      </div>
    </>
  );
}
