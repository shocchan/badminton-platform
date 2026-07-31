// ことば図鑑トップの正準ヘッダー（B: 目的・スコープ・進捗・ゴール・レベル別表示）。
//
// - 純表示コンポーネント（storage・window非依存）。集計はvocabCanonicalの値をpropsで受け取る。
//   → 実画面ハーネス（390px幅）で単体レンダリングできる。
// - スコープは正直に書く: コースのコア語彙であり、JLPT全語彙の網羅ではない（偽装禁止）。
// - 「覚えた」自己申告・本人レベルから習得を自動判定しない。定着候補は検証済み状態からのみ。
import type { AiCourseDict } from '../../../../locales/aiCourse';
import type { VocabCanonicalStats, VocabCompletionBreakdown, VocabLevelTier, LearnerWordState } from '../../../../lib/aiLesson/course/vocabCanonical';

export interface VocabularyHubHeaderProps {
  t: AiCourseDict;
  stats: VocabCanonicalStats;
  stateCounts: Record<LearnerWordState, number>;
  completion: VocabCompletionBreakdown;
  tier: VocabLevelTier;
}

export const VocabularyHubHeader = ({ t, stats, stateCounts, completion, tier }: VocabularyHubHeaderProps) => {
  const ts = t.vocabScope;
  const started = stats.total - stateCounts.unseen;
  const pct = stats.total ? Math.round((started / stats.total) * 100) : 0;
  const stateChips: { key: LearnerWordState; label: string; cls: string }[] = [
    { key: 'unseen', label: ts.stateUnseen, cls: 'bg-gray-100 text-gray-500' },
    { key: 'learning', label: ts.stateLearning, cls: 'bg-indigo-50 text-indigo-700' },
    { key: 'reviewing', label: ts.stateReviewing, cls: 'bg-violet-50 text-violet-700' },
    { key: 'retained_candidate', label: ts.stateRetained, cls: 'bg-emerald-50 text-emerald-700' },
  ];
  return (
    <div className="bg-white rounded-2xl border border-indigo-100 p-4 mb-3">
      {/* ⓪ 役割一文（ことば=材料。しくみとの違いを3秒で・2026-07-30 CEO UX指示） */}
      <p className="text-xs text-gray-700 leading-relaxed mb-2">{t.hubRoles.vocabRole}</p>
      <p className="text-[10px] text-gray-400 mb-2">{t.hubRoles.exampleHeading}: {t.hubRoles.vocabExample}／{t.hubRoles.vocabVsLab}</p>
      {/* ① タイトルとスコープ（何の図鑑か・どこまでか） */}
      <p className="text-[11px] font-bold text-indigo-500">{ts.scopeTitle}</p>
      <h2 className="text-base font-bold text-gray-900">{ts.scopeSub(stats.total)}</h2>
      <p className="text-[11px] text-gray-500 mt-0.5">{ts.breakdown(stats.foundation, stats.n3Prep)}</p>

      {/* ② 進捗（学習を始めた語）と状態内訳 */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-bold text-gray-500">{ts.startedLabel}</p>
          <p className="text-xs font-bold text-gray-900">{ts.started(started, stats.total)}</p>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1" role="img"
          aria-label={`${ts.startedLabel} ${ts.started(started, stats.total)}`}>
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {stateChips.map(c => (
            <span key={c.key} className={`text-[10px] px-1.5 py-0.5 rounded ${c.cls}`}>
              {c.label} {stateCounts[c.key]}
            </span>
          ))}
        </div>
      </div>

      {/* ③ 全部終えるとどうなるか（断定しない）＋「全部終えた」の定義 */}
      <details className="mt-3">
        <summary className="text-xs font-bold text-gray-700 cursor-pointer min-h-8 flex items-center">
          {ts.whatWhenDone}
        </summary>
        <p className="text-[11px] text-gray-600 mt-1">{ts.whatWhenDoneBody}</p>
        <p className="text-[11px] font-bold text-gray-500 mt-2">{ts.doneDefLabel}</p>
        <p className="text-[11px] text-gray-500">{ts.doneDefBody}</p>
        <ul className="text-[11px] text-gray-600 mt-1 space-y-0.5">
          <li>・{ts.doneDefConfirm(completion.requiredConfirmed, completion.requiredTotal)}</li>
          <li>・{ts.doneDefHighRisk(completion.highRiskConfirmed, completion.highRiskTotal)}</li>
          <li>・{ts.doneDefUse(completion.requiredUsed, completion.requiredTotal)}</li>
          <li>・{ts.doneDefReview(completion.requiredReviewConnected, completion.requiredTotal)}</li>
        </ul>
      </details>

      {/* ④ レベル別の案内（表示の切替のみ。習得扱いにはしない） */}
      {tier === 'advanced' && (
        <div className="mt-3 p-2.5 bg-slate-50 rounded-xl">
          <p className="text-[11px] font-bold text-slate-700">{ts.advancedNotice}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{ts.advancedLinks}</p>
        </div>
      )}
      {tier === 'n3' && (
        <p className="mt-3 text-[11px] text-gray-500">{ts.n3Notice}</p>
      )}

      {/* ⑤ 正直なスコープ注記（N3全語彙の網羅ではない）＋RPG上の位置 */}
      <p className="text-[10px] text-gray-400 mt-3">{ts.disclaimer(stats.total)}</p>
      <p className="text-[10px] text-gray-400 mt-1">{ts.libraryNote}</p>
    </div>
  );
};

export default VocabularyHubHeader;
