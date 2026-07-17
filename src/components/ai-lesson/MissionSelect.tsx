// コース選択（3分のみ実装、7分・12分は準備中）＋ 今日のミッション表示

import { useState } from 'react';
import { Flag, Play, Clock } from 'lucide-react';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { LearningPlan } from '../../lib/aiLesson/types';

interface Props {
  t: AiLessonDict;
  plan: LearningPlan;
  onStart: (minutes: number) => void;
}

const COURSES = [
  { minutes: 3, available: true },
  { minutes: 7, available: false },
  { minutes: 12, available: false },
];

export const MissionSelect = ({ t, plan, onStart }: Props) => {
  const tm = t.mission;
  const [minutes, setMinutes] = useState(3);
  const themeLabel = t.plan.themes[plan.themeKey as keyof typeof t.plan.themes] ?? plan.themeKey;
  const missionText = tm.missionLine(themeLabel, plan.target.label);

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
          <Flag className="w-5 h-5 text-blue-600" />
          {tm.title}
        </h1>
      </div>

      {/* ミッションカード */}
      <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-sm p-5 text-white mb-5">
        <p className="font-bold text-base leading-relaxed">🎯 {missionText}</p>
      </div>

      {/* コース選択 */}
      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
        <Clock className="w-4 h-4 text-blue-600" />
        {tm.courseLabel}
      </p>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {COURSES.map((c) => (
          <button
            key={c.minutes}
            type="button"
            disabled={!c.available}
            onClick={() => setMinutes(c.minutes)}
            className={`min-h-11 py-4 rounded-xl border text-center transition-colors ${
              !c.available
                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                : minutes === c.minutes
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
            }`}
          >
            <span className="block font-bold text-lg">{tm.minutes(c.minutes)}</span>
            {!c.available && <span className="block text-[10px] mt-0.5">{tm.comingSoon}</span>}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onStart(minutes)}
        className="w-full min-h-11 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2"
      >
        <Play className="w-5 h-5" />
        {tm.start}
      </button>
      <p className="text-xs text-gray-500 text-center mt-3">{tm.note}</p>
    </div>
  );
};
