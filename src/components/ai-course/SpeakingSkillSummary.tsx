// 会話力スキルの要約（§18）。子ども向けレーダーではなく、落ち着いた横バーで6軸を示す。
// 根拠が無い軸は「分析中」にして、断定しない。

import type { AiCourseDict } from '../../locales/aiCourse';
import type { SpeakingSkill } from '../../lib/aiLesson/course/courseGrowth';

interface Props {
  t: AiCourseDict;
  skills: SpeakingSkill[];
}

export const SpeakingSkillSummary = ({ t, skills }: Props) => (
  <div className="space-y-2.5">
    {skills.map((s) => (
      <div key={s.key}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-700">{t.growth.skills[s.key]}</span>
          {!s.grounded && <span className="text-[10px] text-gray-400">{t.growth.analyzing}</span>}
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 motion-safe:transition-[width] motion-safe:duration-700"
            style={{ width: s.grounded ? `${Math.round(s.score * 100)}%` : '0%' }}
          />
        </div>
      </div>
    ))}
  </div>
);
