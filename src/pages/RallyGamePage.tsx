// バド対決ゲームのページ: /:lang/game
// ①ゲーム本体 → ②抽選（Supabase Edge Function）まで実装済み。
// スマホはフルスクリーン、PCは左右に遊び方・抽選パネルを置く3カラム。

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Gamepad2, Gift, Target, Trophy, ChevronRight } from 'lucide-react';
import RallyGame from '../components/RallyGame';
import RallyLotteryModal from '../components/RallyLotteryModal';
import { LEGEND_RALLY, RALLY_RANKS } from '../lib/rallyGame';
import { getRallyBest } from '../lib/rallyBest';
import {
  RALLIES_PER_DRAW,
  drawRallyLottery,
  startRallySession,
  type LotteryResult,
} from '../services/rallyLottery';
import { useLanguage } from '../contexts/LanguageContext';

/** リザルト画面を見せてから抽選モーダルを出すまでの間 */
const LOTTERY_DELAY_MS = 1400;

export default function RallyGamePage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const [lottery, setLottery] = useState<LotteryResult | null>(null);
  const best = getRallyBest();

  // SEO: /zh/game が日本語タイトルで表示されていた事故を修正。
  // ブランド表記は「kawabado」（英字ブランド名）＋「川口・蕨バドミントン交流会」（コミュニティ名）で統一。
  const seo = lang === 'zh'
    ? {
        title: '羽毛球对决游戏 | 川口・蕨羽毛球交流会（kawabado）',
        description: '与AI进行羽毛球对拉！掌握时机打出高分。每15次对拉自动参与抽奖，有极小概率获得免费参加券。',
        htmlLang: 'zh-CN',
        ogLocale: 'zh_CN',
      }
    : {
        title: 'バド対決ゲーム | 川口・蕨バドミントン交流会（kawabado）',
        description: 'AIとバドミントンのラリー対決！タイミングよく打ち返してハイスコアを目指そう。15ラリーごとに抽選が回って、ごくまれに無料券が当たる！',
        htmlLang: 'ja',
        ogLocale: 'ja_JP',
      };
  const gameUrl = `https://kawabado.com/${locale}/game`;

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
    <main>
      <Helmet>
        <html lang={seo.htmlLang} />
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        <meta property="og:url" content={gameUrl} />
        <meta property="og:locale" content={seo.ogLocale} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <link rel="canonical" href={gameUrl} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/game" />
        <link rel="alternate" hrefLang="zh-CN" href="https://kawabado.com/zh/game" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/game" />
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
          <h1 className="text-sm font-bold text-slate-900">バド対決ゲーム</h1>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-start gap-6 px-3 pb-3 md:flex-none md:px-6 md:py-8">
          {/* 左パネル: あそびかた（PCのみ） */}
          <aside className="hidden flex-1 lg:block">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Gamepad2 className="h-4 w-4 text-emerald-500" /> あそびかた
              </h2>
              <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
                <li>🏸 マウスでラケットをコート全面に移動（←→↑↓キーもOK）</li>
                <li>🎯 落下点に緑リングが縮んでくる。重なった瞬間にクリック / Space でスイング！</li>
                <li>⚖️ ジャストなら「Perfect」。早い・遅いは打球が横に流れてアウトミスの危険</li>
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
            <RallyGame onGameStart={startRallySession} onGameEnd={handleGameEnd} drawEveryRallies={RALLIES_PER_DRAW} />
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
        </div>
      </div>

      {/* 説明文・遊び方・抽選案内（モバイル/タブレットのみ。PCは左右パネルに集約） */}
      <div className="mx-auto max-w-2xl px-5 py-8 lg:hidden">
        <div className="text-center">
          <p className="text-xs font-medium tracking-wide text-emerald-700">
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
    </main>
  );
}
