// 「次にできるようになること」カード（§20）。

import { TrendingUp } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  ability: { id: string; ja: string; zh: string } | null;
}

export const NextAbilityCard = ({ t, ability }: Props) => {
  if (!ability) return null;
  const zh = t.locale === 'zh';
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
        <TrendingUp className="w-4 h-4 text-blue-600" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500">{t.growth.nextAbilityTitle}</p>
        <p className="text-sm font-medium text-gray-800">{zh ? ability.zh : ability.ja}</p>
      </div>
    </div>
  );
};
