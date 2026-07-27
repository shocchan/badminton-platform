// 語彙詳細→Decision Consoleの導線バッジ（Phase 2E-1.8 §6.2・labPreview限定・lazy chunk）。
// 未処理の判断事項がある語にだけ表示する。一般受講生の画面には出ない
// （ことば図鑑自体がlabPreview限定＋このコンポーネントはlazyでVocabularyHub本体チャンクへ混ぜない）。
import { useMemo } from 'react';
import type { AiCourseDict } from '../../../../locales/aiCourse';
import { buildDecisionQueue, decisionBadgeForWord } from '../../../../lib/aiLesson/course/vocabDecisionQueue';
import { createVocabDecisionRepository } from '../../../../lib/aiLesson/course/vocabDecisionStore';
import { DECISION_I18N } from './vocabReviewI18n';

interface Props { t: AiCourseDict; itemId: string; onOpen: () => void }

export default function VocabDecisionBadge({ t, itemId, onOpen }: Props) {
  const td = t.locale === 'zh' ? DECISION_I18N.zh : DECISION_I18N.ja;
  const badge = useMemo(() => {
    const repo = createVocabDecisionRepository(window.localStorage);
    const drafts = repo.getAll();
    return decisionBadgeForWord(itemId, (id) => drafts[id]?.status, buildDecisionQueue());
  }, [itemId]);
  if (badge.pending === 0 && badge.deferred === 0) return null;   // 未処理なしなら出さない（§6.2）
  const parts = [
    `${td.statuses.pending} ${badge.pending}`,
    ...(badge.p0 > 0 ? [`P0 ${badge.p0}`] : []),
    ...(badge.deferred > 0 ? [`${td.statuses.deferred} ${badge.deferred}`] : []),
  ];
  return (
    <button type="button" onClick={onOpen}
      className="w-full min-h-10 mb-2 px-3 py-2 text-left text-[11px] rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
      <span className="font-bold">{td.title}</span>: {parts.join('・')} →
    </button>
  );
}
