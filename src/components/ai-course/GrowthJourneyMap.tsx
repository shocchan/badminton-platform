// 会話の旅マップ（§18-B/§19）。12週を縦の道として並べ、現在地と到達済みを示す。
// 大人向けに落ち着いたトーン。幼稚なゲーム感は避ける。アニメは prefers-reduced-motion を尊重。

import { MapPin, Check, Circle, Lock } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { JourneyPlace } from '../../lib/aiLesson/course/courseJourney';

interface Props {
  t: AiCourseDict;
  places: JourneyPlace[];
  /** true なら現在地の前後だけを小さく表示（ホームのミニ表示用） */
  compact?: boolean;
  currentWeek: number;
}

const nodeIcon = (state: JourneyPlace['state']) => {
  switch (state) {
    case 'done': return <Check className="w-3.5 h-3.5 text-white" />;
    case 'current': return <MapPin className="w-3.5 h-3.5 text-white" />;
    case 'locked': return <Lock className="w-3 h-3 text-gray-400" />;
    default: return <Circle className="w-3 h-3 text-gray-300" />;
  }
};
const nodeBg = (state: JourneyPlace['state']) =>
  state === 'done' ? 'bg-emerald-500' : state === 'current' ? 'bg-blue-600' : state === 'locked' ? 'bg-gray-100' : 'bg-white border-2 border-gray-200';

export const GrowthJourneyMap = ({ t, places, compact = false, currentWeek }: Props) => {
  const zh = t.locale === 'zh';
  const shown = compact
    ? places.filter((p) => p.week >= currentWeek - 1 && p.week <= currentWeek + 1)
    : places;

  return (
    <div className="relative">
      {shown.map((p, i) => {
        const isLast = i === shown.length - 1;
        const isCurrent = p.state === 'current';
        return (
          <div key={p.week} className="flex gap-3">
            {/* 縦の道＋ノード */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${nodeBg(p.state)} ${isCurrent ? 'ring-4 ring-blue-100' : ''}`}>
                {nodeIcon(p.state)}
              </div>
              {!isLast && <div className={`w-0.5 flex-1 min-h-[1.75rem] ${p.state === 'done' ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            </div>
            {/* 場所の情報。現在地だけ淡い枠で強調（一目で分かる） */}
            <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-4'} ${p.state === 'locked' ? 'opacity-50' : ''}`}>
              <div className={isCurrent ? '-mx-2 px-2 py-1.5 rounded-lg bg-blue-50/60 border border-blue-100' : ''}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400 tabular-nums">Week {p.week}</span>
                  <p className={`text-sm font-bold ${isCurrent ? 'text-blue-700' : 'text-gray-900'}`}>{zh ? p.nameZh : p.nameJa}</p>
                  {isCurrent && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white">{t.growth.currentLocation}</span>}
                  {/* 定着表現数は控えめな補助表示（星やアイコンで飾らない） */}
                  {p.retained > 0 && <span className="text-[10px] text-emerald-600">{t.growth.retainedShort(p.retained)}</span>}
                </div>
                <p className={`text-xs text-gray-500 mt-0.5 ${compact ? 'truncate' : ''}`}>{zh ? p.themeZh : p.themeJa}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
