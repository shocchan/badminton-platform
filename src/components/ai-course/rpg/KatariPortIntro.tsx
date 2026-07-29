// 会話前の旅立ちカード（FOREST FIRST §12）。AI会話を「カタリ港での出来事」として始める。
// 会話エンジンには触れない（Presentation Layerのみ）。場所・相手・目的・目標表現・所要時間を
// 会話前に示し、learnerが何をしに行くのか分かる状態でスタートさせる。
import { ArrowLeft, Mic, PenLine } from 'lucide-react';
import { ShokoSprite } from './pixelAssets';

export interface KatariPortIntroProps {
  /** 今日の目的（ミッションのタイトル） */
  purposeJa: string;
  targetExpression: string;
  /** 目安時間（分） */
  estimatedMinutes: number;
  /** 今日あと何回話せるか */
  remainingToday: number;
  starting?: boolean;
  onStartVoice: () => void;
  onStartText: () => void;
  onBack: () => void;
}

export const KatariPortIntro = ({
  purposeJa, targetExpression, estimatedMinutes, remainingToday, starting,
  onStartVoice, onStartText, onBack,
}: KatariPortIntroProps) => (
  <div className="max-w-md mx-auto px-4 py-4">
    <button type="button" onClick={onBack}
      className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
      <ArrowLeft className="w-4 h-4" aria-hidden />ミナモ列島の地図へ
    </button>

    <div className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50 to-white p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-teal-600">ミナモ列島・第9エリア</p>
          <h2 className="text-lg font-bold text-gray-900">カタリ港（会話の港）</h2>
          <p className="text-xs text-gray-600 mt-1">声に出して確かめる場所。翔子先生が待っています。</p>
        </div>
        <div className="w-10 shrink-0"><ShokoSprite decorative pose="talk" /></div>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="bg-white/80 rounded-xl p-2.5">
          <dt className="text-[11px] text-gray-400">話す相手</dt>
          <dd className="text-gray-900 font-bold">翔子先生（ことばの案内人）</dd>
        </div>
        <div className="bg-white/80 rounded-xl p-2.5">
          <dt className="text-[11px] text-gray-400">今日の目的</dt>
          <dd className="text-gray-900 font-bold">{purposeJa}</dd>
        </div>
        <div className="bg-white/80 rounded-xl p-2.5">
          <dt className="text-[11px] text-gray-400">使ってみることば</dt>
          <dd className="text-gray-900 font-bold">「{targetExpression}」</dd>
        </div>
        <div className="bg-white/80 rounded-xl p-2.5 flex gap-4">
          <div><dt className="text-[11px] text-gray-400">所要時間</dt><dd className="text-gray-900 font-bold">約{estimatedMinutes}分</dd></div>
          <div><dt className="text-[11px] text-gray-400">今日あと</dt><dd className="text-gray-900 font-bold">{remainingToday}回</dd></div>
        </div>
      </dl>

      <button type="button" onClick={onStartVoice} disabled={starting}
        className="w-full min-h-12 mt-4 bg-teal-600 text-white rounded-2xl font-bold text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
        <Mic className="inline w-4 h-4 -mt-0.5 mr-1" aria-hidden />声で会話を始める
      </button>
      <button type="button" onClick={onStartText} disabled={starting}
        className="w-full min-h-11 mt-2 text-sm text-gray-600 disabled:opacity-50">
        <PenLine className="inline w-3.5 h-3.5 -mt-0.5 mr-1" aria-hidden />テキストで話す
      </button>
    </div>
  </div>
);

export default KatariPortIntro;
