// 軽め2〜3分学習（§E-3）。API・Realtime・セッションRPC・XP・復習登録に一切触れない。
// 会話しない日の「入口」。完了しても通常会話の成果と誤認させない文言にする。

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Home } from 'lucide-react';
import { buildLightSession, buildMeaningChoices, judgeRecall } from '../../lib/aiLesson/course/courseLightPractice';
import { missionById } from '../../lib/aiLesson/course/courseEngine';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { ItemProgress } from '../../lib/aiLesson/course/types';

interface Props {
  t: AiCourseDict;
  progress: ItemProgress[];
  practiceAgainIds: string[];
  onExit: () => void;
}

export const CourseLightPractice = ({ t, progress, practiceAgainIds, onExit }: Props) => {
  const tl = t.light;
  const zh = t.locale === 'zh';
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const items = useMemo(() => buildLightSession(progress, practiceAgainIds, todayISO), [progress, practiceAgainIds, todayISO]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<'correct' | 'shown' | null>(null);

  const item = items[idx] ?? null;
  const mission = item ? missionById(item.missionId) : null;
  const done = items.length > 0 && idx >= items.length;

  const next = () => { setIdx((i) => i + 1); setInput(''); setPicked(null); setResult(null); };

  const checkRecall = () => {
    if (!mission || result) return;
    setResult(judgeRecall(input, mission) ? 'correct' : 'shown'); // 不正解でも責めず答えを見せて前へ
  };
  const pickMeaning = (i: number, correctIndex: number) => {
    if (result) return;
    setPicked(i);
    setResult(i === correctIndex ? 'correct' : 'shown');
  };

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <p className="text-sm text-gray-600 mb-4">{tl.empty}</p>
        <button type="button" onClick={onExit} className="min-h-11 px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl">{t.report.backHome}</button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3 check-pop" />
        <h1 className="text-lg font-bold text-gray-900">{tl.doneTitle}</h1>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{tl.doneBody}</p>
        <button type="button" onClick={onExit}
          className="w-full min-h-11 py-3 mt-6 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
          <Home className="w-4 h-4" />{t.report.backHome}
        </button>
      </div>
    );
  }

  const choices = item!.kind === 'meaning' && mission ? buildMeaningChoices(mission) : null;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={onExit} aria-label={t.roadmap.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-emerald-600" />{tl.title}</h1>
        <span className="text-xs font-mono text-gray-500 tabular-nums">{idx + 1} / {items.length}</span>
      </div>

      {mission && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-[11px] text-gray-400 mb-2">{zh ? mission.titleZh : mission.titleJa}</p>
          {item!.kind === 'recall' ? (
            <>
              <p className="text-sm text-gray-700 mb-1">{tl.recallPrompt}</p>
              <p className="text-base font-bold text-gray-900 mb-3">「{mission.meaningZh}」</p>
              {result === null && (
                <>
                  <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) checkRecall(); }}
                    placeholder={tl.placeholder}
                    className="w-full min-h-12 px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={checkRecall} disabled={!input.trim()}
                    className="w-full min-h-11 py-2.5 mt-2 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-40">{tl.check}</button>
                </>
              )}
            </>
          ) : choices && (
            <>
              <p className="text-sm text-gray-700 mb-1">{tl.meaningPrompt}</p>
              <p className="text-base font-bold text-gray-900 mb-3">{mission.targetExpression}</p>
              <div className="space-y-2">
                {choices.choices.map((c, i) => (
                  <button key={i} type="button" onClick={() => pickMeaning(i, choices.correctIndex)}
                    disabled={result !== null}
                    className={`w-full min-h-11 px-4 py-2.5 text-left text-sm rounded-xl border transition-colors ${
                      result !== null && i === choices.correctIndex ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                        : picked === i && result === 'shown' ? 'border-gray-300 bg-gray-100 text-gray-500'
                          : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 判定（責めない。正解でなくても答えを見て前へ進める） */}
          {result === 'correct' && (
            <p className="text-sm font-bold text-emerald-700 mt-3 flex items-center gap-1.5 check-pop" aria-live="polite">
              <CheckCircle2 className="w-4 h-4" />{tl.correct}
            </p>
          )}
          {result === 'shown' && (
            <p className="text-sm text-gray-700 mt-3" aria-live="polite">
              {tl.answerWas} <span className="font-bold text-blue-700">{mission.targetExpression}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{mission.simpleExample}</span>
            </p>
          )}
          {result !== null && (
            <button type="button" onClick={next}
              className="w-full min-h-11 py-2.5 mt-3 bg-blue-600 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5">
              {tl.next}<ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
