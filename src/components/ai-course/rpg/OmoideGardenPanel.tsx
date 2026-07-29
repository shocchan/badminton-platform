// オモイデ庭園（FOREST FIRST §13）。復習の入口をここへ統合する。
// 語彙・文法・会話の復習が別々に散らばらないよう、期限と件数を1画面で見せて
// それぞれの実機能（quickreview / N3攻略 / ソラノ塔 / 会話ノート / 再会Quest）へつなぐ。
// ここは入口であり、学習状態の書き込みはしない（read only）。
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { n3ScheduledReviewCount, n2LearnedCount } from '../../../lib/aiLesson/course/rpg/gardenCounts';
import { createVocabSpacedReviewRepository } from '../../../lib/aiLesson/course/vocabSpacedReview';
import { defaultLearningClock } from '../../../lib/aiLesson/course/learningClock';

const browserStore = typeof window === 'undefined' ? null : window.localStorage;
const browserSession = typeof window === 'undefined' ? null : window.sessionStorage;

export interface OmoideGardenPanelProps {
  /** 会話ミッションの期限復習（progressから導出済みの値を受け取る） */
  conversationReviewsDue: number;
  onOpenVocabReview: () => void;
  onOpenConversationHistory: () => void;
  onOpenN3: () => void;
  onOpenN2: () => void;
  onOpenAdventure: () => void;
  onBack: () => void;
}

const Row = ({ title, detail, count, cta, onOpen }: {
  title: string; detail: string; count: number | null; cta: string; onOpen: () => void;
}) => (
  <button type="button" onClick={onOpen}
    className="w-full text-left p-3.5 bg-white border border-gray-200 rounded-2xl min-h-16 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-900">
          {title}
          {count !== null && count > 0 && (
            <span className="ml-2 inline-grid place-items-center min-w-5 h-5 px-1 text-[10px] font-bold text-white bg-violet-500 rounded-full align-middle">{count}</span>
          )}
        </span>
        <span className="block text-[11px] text-gray-500">{detail}</span>
        <span className="block text-[11px] font-bold text-violet-600 mt-0.5">{cta}</span>
      </span>
      <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" aria-hidden />
    </div>
  </button>
);

export const OmoideGardenPanel = ({
  conversationReviewsDue,
  onOpenVocabReview, onOpenConversationHistory, onOpenN3, onOpenN2, onOpenAdventure, onBack,
}: OmoideGardenPanelProps) => {
  const n3Scheduled = browserStore ? n3ScheduledReviewCount(browserStore) : 0;
  const n2Learned = browserStore ? n2LearnedCount(browserStore) : 0;
  // ことばの間隔反復はことば図鑑と同じsessionStorage previewを読む（書き込みはしない）
  const vocabReviewsDue = browserSession
    ? createVocabSpacedReviewRepository(browserSession, defaultLearningClock).getDue().length
    : 0;
  const totalDue = conversationReviewsDue + vocabReviewsDue;

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
      <button type="button" onClick={onBack}
        className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <ArrowLeft className="w-4 h-4" aria-hidden />ミナモ列島の地図へ
      </button>

      <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-4 mb-3">
        <p className="text-[11px] font-bold text-violet-600">ミナモ列島・第10エリア</p>
        <h2 className="text-lg font-bold text-gray-900">オモイデ庭園（記憶の庭）</h2>
        <p className="text-xs text-gray-600 mt-1">
          昔通った場所が姿を変えて再訪できる庭。忘れたころの再会が、ことばを長く残します。
        </p>
        <p className="text-xs mt-2 font-bold text-violet-700">
          {totalDue > 0 ? `今日の再会: ${totalDue}件が待っています` : '今日の期限の再会はありません。先に進んでも、読み直してもかまいません。'}
        </p>
      </div>

      <div className="space-y-2">
        <Row title="ことばとの再会" detail="期限が来た語をもう一度たしかめる"
          count={vocabReviewsDue} cta="3分復習を始める" onOpen={onOpenVocabReview} />
        <Row title="会話の思い出" detail="話したことの記録とノートを読み直す"
          count={conversationReviewsDue} cta="会話ノートへ" onOpen={onOpenConversationHistory} />
        <Row title="文法のことばと再会" detail="N3攻略で復習予定に入ったことば"
          count={n3Scheduled} cta="N3攻略へ" onOpen={onOpenN3} />
        <Row title="塔の文型を読み直す" detail={n2Learned > 0 ? `学んだ${n2Learned}文型を読み直せます` : 'ソラノ塔で学んだ文型を読み直す'}
          count={null} cta="ソラノ塔へ" onOpen={onOpenN2} />
        <Row title="再会クエスト" detail="はじまりの町で、学んだことばの人と再会する"
          count={null} cta="第1章へ" onOpen={onOpenAdventure} />
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        復習を終えるたびに、世界の霧が少し晴れます。
      </p>
    </div>
  );
};

export default OmoideGardenPanel;
