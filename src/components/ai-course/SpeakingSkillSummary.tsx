// 会話力スキルの要約（§3/§18）。子ども向けレーダーではなく、落ち着いた横バーで6軸を示す。
// スコア競争にしない: 「強み」「伸びている途中」「分析中」の3段階だけ。失敗という区分は作らない。

import { skillLevel } from '../../lib/aiLesson/course/courseGrowth';
import type { SpeakingSkill, SkillLevel } from '../../lib/aiLesson/course/courseGrowth';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  skills: SpeakingSkill[];
}

// レベルごとの控えめな色（強み=emerald / 伸び中=indigo / 分析中=gray）
const barClass: Record<SkillLevel, string> = {
  strength: 'bg-emerald-500',
  growing: 'bg-blue-400',
  analyzing: 'bg-gray-200',
};
const tagClass: Record<SkillLevel, string> = {
  strength: 'text-emerald-600',
  growing: 'text-blue-500',
  analyzing: 'text-gray-400',
};

export const SpeakingSkillSummary = ({ t, skills }: Props) => {
  const ts = t.growth.skillLevels;
  return (
    <div className="space-y-3">
      {skills.map((s) => {
        const level = skillLevel(s);
        return (
          <div key={s.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-800">{t.growth.skills[s.key]}</span>
              <span className={`text-[11px] font-medium ${tagClass[level]}`}>{ts[level]}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="img" aria-label={ts[level]}>
              <div
                className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 ${barClass[level]}`}
                style={{ width: level === 'analyzing' ? '18%' : `${Math.round(s.score * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-gray-400 leading-relaxed pt-1">{t.growth.skillNote}</p>
    </div>
  );
};
