// バド対決ゲームのページ: /:lang/game
// ①ゲーム本体 → ②抽選（Supabase Edge Function）まで実装済み。
// ③（会員登録・当選引き継ぎ・活動申込での無料券利用）は今後追加予定。

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import RallyGame from '../components/RallyGame';
import RallyLotteryModal from '../components/RallyLotteryModal';
import { LEGEND_RALLY } from '../lib/rallyGame';
import {
  RALLIES_PER_DRAW,
  drawRallyLottery,
  type LotteryResult,
} from '../services/rallyLottery';
import { useLanguage } from '../contexts/LanguageContext';

/** リザルト画面を見せてから抽選モーダルを出すまでの間 */
const LOTTERY_DELAY_MS = 1400;

export default function RallyGamePage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const [lottery, setLottery] = useState<LotteryResult | null>(null);

  const handleGameEnd = (rallyCount: number) => {
    if (rallyCount < 1) return;
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
    <>
      <Helmet>
        <title>バド対決ゲーム | かわバド</title>
        <meta
          name="description"
          content="AIとバドミントンのラリー対決！タイミングよく打ち返してハイスコアを目指そう。15ラリーごとに抽選が回って、ごくまれに無料券が当たる！"
        />
      </Helmet>

      {/* ゲーム本体：画面の残り高さいっぱいに表示 */}
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        {/* 薄いヘッダー（常に固定表示） */}
        <div className="flex shrink-0 items-center justify-between px-4 py-2">
          <a
            href={`/${locale}/`}
            className="text-xs text-emerald-700 underline-offset-2 hover:underline"
          >
            ← かわバド トップへ
          </a>
          <h1 className="text-sm font-bold text-slate-900">バド対決ゲーム</h1>
        </div>

        {/* ゲーム本体: 残り高さいっぱいに表示、スクロール不要 */}
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
          <RallyGame onGameEnd={handleGameEnd} drawEveryRallies={RALLIES_PER_DRAW} />
        </div>
      </div>

      {/* 説明文・遊び方・抽選案内は、ゲームの下に別セクションとして */}
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="text-center">
          <p className="text-xs font-medium tracking-wide text-emerald-600">
            KAWABADO MINI GAME
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-600">
            AIが打ってくるシャトルをタイミングよく打ち返すリアクションゲーム。
            ラリーが続くほどスピードとコースが鋭くなります。
            {LEGEND_RALLY}ラリー続けばカンスト級の実力者！
          </p>
        </div>

        {/* 抽選の告知（確率・上限は非公表） */}
        <div className="mt-6 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm ring-1 ring-amber-200">
          <h2 className="text-sm font-bold text-amber-900">🎁 {RALLIES_PER_DRAW}ラリーごとに抽選チャンス！</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
            <span className="font-bold">{RALLIES_PER_DRAW}ラリー続けるごとに抽選が1回</span>
            回ります（{RALLIES_PER_DRAW * 2}ラリーなら2回！）。
            ごくまれに <span className="font-bold">🍜 ラーメン無料券</span> や{' '}
            <span className="font-bold">🏸 バド活動無料券</span> が当たるかも…！？
          </p>
        </div>

        <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">あそびかた</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
            <li>🏸 指（またはマウス）でラケットをコート全面に移動。前後左右どこでも動ける</li>
            <li>🎯 シャトルの落下点に緑のリングが縮んでくる。重なった瞬間にタップでスイング！</li>
            <li>⚖️ タイミングがジャストなら「Perfect」。早い・遅いと打球が横に流れ、ラインを割ると「アウトミス」</li>
            <li>💨 ラリーが続くほどシャトルは速く、コースはネット前から奥までライン際に</li>
            <li>❌ 届かなければ「アウト」、外せば「空振り」、流れれば「アウトミス」でゲーム終了</li>
            <li>🏆 スコアは到達ラリー数。まずは10ラリー、目指せ{LEGEND_RALLY}ラリー！</li>
          </ul>
        </div>
      </div>

      {lottery !== null && (
        <RallyLotteryModal result={lottery} onClose={() => setLottery(null)} />
      )}
    </>
  );
}
