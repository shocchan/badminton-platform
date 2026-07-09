// バド対決ゲームの抽選演出モーダル。
// 抽選結果（判定済み）を受け取り、演出のあと当落を表示する。
// 当選時は「受け取り登録」（会員登録/ログイン→クーポン引き継ぎ）までこのモーダル内で完結する。
// 15ラリー未満（抽選0回）のゲームではこのモーダル自体を出さない（親側で制御）。

import { useEffect, useState } from 'react';
import { type LotteryResult } from '../services/rallyLottery';
import { claimGuestCoupons } from '../services/coupons';
import { supabase } from '../services/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import ClaimAccountForm from './ClaimAccountForm';

const DRAWING_MS = 2600;

const PRIZE_INFO = {
  ramen: {
    emoji: '🍜',
    title: 'ラーメン無料券 GET!!',
    card: 'from-amber-400 via-orange-400 to-red-400',
  },
  badminton: {
    emoji: '🏸',
    title: 'バド活動 無料券 GET!!',
    card: 'from-emerald-400 via-teal-400 to-cyan-400',
  },
} as const;

interface Props {
  result: LotteryResult;
  onClose: () => void;
}

export default function RallyLotteryModal({ result, onClose }: Props) {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  // 上限到達の案内は演出なしですぐ表示、抽選があるときはドキドキ演出を挟む
  const [revealed, setRevealed] = useState(result.dailyLimited);
  const [claimView, setClaimView] = useState<'none' | 'form' | 'done'>('none');
  const [claimBusy, setClaimBusy] = useState(false);

  useEffect(() => {
    if (result.dailyLimited) return;
    const timer = window.setTimeout(() => setRevealed(true), DRAWING_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  // 「受け取り登録」: ログイン済みなら即引き継ぎ、未ログインなら登録フォームへ
  const handleClaimClick = async () => {
    if (claimBusy) return;
    setClaimBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await claimGuestCoupons();
        setClaimView('done');
      } else {
        setClaimView('form');
      }
    } catch {
      setClaimView('form');
    } finally {
      setClaimBusy(false);
    }
  };

  const handleFormDone = () => {
    setClaimView('done');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-slate-900 p-6 text-center shadow-2xl ring-1 ring-white/10">
        {!revealed && (
          <div className="py-6">
            <p className="text-xs font-medium tracking-wide text-emerald-400">
              LUCKY DRAW
            </p>
            <h3 className="mt-2 text-xl font-bold text-white">抽選タイム！</h3>
            <p className="mt-1 text-sm text-slate-300">
              ラリーで勝ち取った
              <span className="font-bold text-amber-300">
                抽選チャンス {result.drawCount}回
              </span>
              …！
            </p>
            <p className="mt-6 animate-spin text-6xl [animation-duration:0.8s]">🏸</p>
            <p className="mt-6 animate-pulse text-sm font-bold tracking-widest text-slate-400">
              抽選中…
            </p>
          </div>
        )}

        {/* 当選 → 受け取り導線 */}
        {revealed && result.isWinner && result.prizeType && claimView === 'none' && (
          <div className="py-4">
            <p className="animate-bounce text-5xl">🎉</p>
            <div
              className={`mt-4 rounded-xl bg-gradient-to-br ${PRIZE_INFO[result.prizeType].card} p-5 shadow-lg`}
            >
              <p className="text-5xl">{PRIZE_INFO[result.prizeType].emoji}</p>
              <p className="mt-2 text-xl font-black text-white drop-shadow">
                {PRIZE_INFO[result.prizeType].title}
              </p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              おめでとう！受け取りには会員登録（無料）が必要です。
              <br />
              登録するとマイページに無料券が保存されます。
            </p>
            <button
              type="button"
              onClick={handleClaimClick}
              disabled={claimBusy}
              className="mt-4 w-full rounded-full bg-amber-400 px-8 py-3 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {claimBusy ? '確認中…' : '🎁 受け取り登録する'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-full px-8 py-2 text-xs font-bold text-slate-400 transition hover:text-slate-200"
            >
              あとで（当選情報はこの端末に保持されます）
            </button>
          </div>
        )}

        {/* 登録/ログインフォーム */}
        {revealed && claimView === 'form' && (
          <div className="py-2">
            <h3 className="text-lg font-bold text-white">🎁 受け取り登録</h3>
            <p className="mt-1 text-xs text-slate-400">
              無料券をアカウントに紐付けて保存します
            </p>
            <div className="mt-4">
              <ClaimAccountForm onDone={handleFormDone} />
            </div>
          </div>
        )}

        {/* 受け取り完了 */}
        {revealed && claimView === 'done' && (
          <div className="py-4">
            <p className="text-5xl">✅</p>
            <h3 className="mt-3 text-lg font-bold text-white">受け取り完了！</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              無料券をアカウントに保存しました。
              <br />
              マイページからいつでも確認・提示できます。
            </p>
            <a
              href={`/${locale}/mypage`}
              className="mt-4 block w-full rounded-full bg-emerald-500 px-8 py-3 text-sm font-bold text-white transition hover:bg-emerald-400"
            >
              マイページを見る
            </a>
          </div>
        )}

        {/* はずれ / 上限 */}
        {revealed && !result.isWinner && (
          <div className="py-4">
            {result.dailyLimited ? (
              <>
                <p className="text-5xl">😴</p>
                <h3 className="mt-3 text-lg font-bold text-white">
                  今日の抽選チャンスは使い切ったよ
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  ゲームは何回でも遊べる！抽選はまた明日
                </p>
              </>
            ) : (
              <>
                <p className="text-5xl">💨</p>
                <h3 className="mt-3 text-lg font-bold text-white">はずれ…</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {result.drawCount}回のチャンスは実らず。
                  <br />
                  ラリーを伸ばして抽選回数を増やそう！
                </p>
              </>
            )}
          </div>
        )}

        {revealed && claimView !== 'form' && claimView !== 'done' && !result.isWinner && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-full bg-slate-700 px-8 py-2.5 text-sm font-bold text-white transition hover:bg-slate-600"
          >
            閉じる
          </button>
        )}
        {revealed && claimView === 'done' && (
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full rounded-full px-8 py-2 text-xs font-bold text-slate-400 transition hover:text-slate-200"
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  );
}
