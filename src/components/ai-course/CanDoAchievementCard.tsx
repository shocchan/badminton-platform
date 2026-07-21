// 「できるようになったこと」カード（§14/§20）。数値ではなく、実際にできることを主役に。

import { CheckCircle2, Sparkles } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { AchievedCanDo } from '../../lib/aiLesson/course/courseCanDo';

interface Props {
  t: AiCourseDict;
  title: string;
  canDos: AchievedCanDo[];
  emptyHint?: string;
}

// 段階に応じた小さなアクセント（自力以上は緑、それ未満はグレー）
const stageStrong = (stage: AchievedCanDo['stage']) =>
  stage === 'practiced' || stage === 'withHint' ? false : true;

export const CanDoAchievementCard = ({ t, title, canDos, emptyHint }: Props) => {
  const zh = t.locale === 'zh';
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />{title}
      </p>
      {canDos.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyHint ?? t.growth.canDoEmpty}</p>
      ) : (
        <ul className="space-y-2.5">
          {canDos.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${stageStrong(c.stage) ? 'text-emerald-600' : 'text-gray-300'}`} />
              <div className="min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{zh ? c.zh : c.ja}</p>
                <p className="text-[11px] text-gray-400">{t.growth.stageBadges[c.stage]}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
