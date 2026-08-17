// オモイデ庭園（FOREST FIRST §13）。復習の入口をここへ統合する。
// 語彙・文法・会話の復習が別々に散らばらないよう、期限と件数を1画面で見せて
// それぞれの実機能（quickreview / N3攻略 / ソラノ塔 / 会話ノート / 再会Quest）へつなぐ。
// ここは入口であり、学習状態の書き込みはしない（read only）。
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { n3ScheduledReviewCount, n2LearnedCount } from '../../../lib/aiLesson/course/rpg/gardenCounts';
import { createVocabSpacedReviewRepository } from '../../../lib/aiLesson/course/vocabSpacedReview';
import { defaultLearningClock } from '../../../lib/aiLesson/course/learningClock';

const browserStore = typeof window === 'undefined' ? null : window.localStorage;
const browserSession = typeof window === 'undefined' ? null : window.sessionStorage;

export interface OmoideGardenPanelProps {
  t: AiCourseDict;
  /** 会話ミッションの期限復習（progressから導出済みの値を受け取る） */
  conversationReviewsDue: number;
  onOpenVocabReview: () => void;
  /** 旧コース画面への入口。V2生徒には渡さない＝カード非表示（2026-08-17 監査P1:
   * 会話ノート→旧学習記録、再会Quest→旧第1章に抜けられていた） */
  onOpenConversationHistory?: () => void;
  onOpenN3: () => void;
  onOpenN2: () => void;
  onOpenAdventure?: () => void;
  onBack: () => void;
}

const Row = ({ title, detail, count, cta, onOpen }: {
  title: string; detail: string; count: number | null; cta: string; onOpen: () => void;
}) => (
  <button type="button" onClick={onOpen}
    className="card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent] w-full text-left p-3.5 bg-white border border-gray-200 rounded-2xl min-h-16 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
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
  t, conversationReviewsDue,
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
        className="transition-colors active:bg-gray-100 min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <ArrowLeft className="w-4 h-4" aria-hidden />{t.garden.backToMap}
      </button>

      <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-4 mb-3">
        <p className="text-[11px] font-bold text-violet-600">{t.garden.areaBadge}</p>
        <h2 className="text-lg font-bold text-gray-900">{t.garden.title}</h2>
        <p className="text-xs text-gray-600 mt-1">
          {t.garden.body}
        </p>
        <p className="text-xs mt-2 font-bold text-violet-700">
          {totalDue > 0 ? t.garden.dueToday(totalDue) : t.garden.dueNone}
        </p>
      </div>

      <div className="space-y-2">
        <Row title={t.garden.vocabTitle} detail={t.garden.vocabBody}
          count={vocabReviewsDue} cta={t.garden.vocabCta} onOpen={onOpenVocabReview} />
        {onOpenConversationHistory && (
          <Row title={t.garden.talkTitle} detail={t.garden.talkBody}
            count={conversationReviewsDue} cta={t.garden.talkCta} onOpen={onOpenConversationHistory} />
        )}
        <Row title={t.garden.n3Title} detail={t.garden.n3Body}
          count={n3Scheduled} cta={t.garden.n3Cta} onOpen={onOpenN3} />
        <Row title={t.garden.n2Title} detail={n2Learned > 0 ? t.garden.n2BodyCount(n2Learned) : t.garden.n2Body}
          count={null} cta={t.garden.n2Cta} onOpen={onOpenN2} />
        {onOpenAdventure && (
          <Row title={t.garden.questTitle} detail={t.garden.questBody}
            count={null} cta={t.garden.questCta} onOpen={onOpenAdventure} />
        )}
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        {t.garden.footer}
      </p>
    </div>
  );
};

export default OmoideGardenPanel;
