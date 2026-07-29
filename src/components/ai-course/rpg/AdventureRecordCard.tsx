// 冒険の記録カード（FOREST FIRST §14）。冒険の進みと日本語の力を「分けて」見せる。
// Adventure（エリア・単元・文型の進み）はゲーム内の進行度であり、JLPTレベルや
// Can-do（日本語の実力）とは別のもの。ここで混同させない。read only。
import { n3UnitsDoneCount, areasDoneCount, n2LearnedCount } from '../../../lib/aiLesson/course/rpg/gardenCounts';
import { N3_UNIT_SPECS } from '../../../lib/aiLesson/course/quality/n3UnitSpecs';
import { loadAdventureState } from '../../../lib/aiLesson/course/rpg/adventureState';
import { CHAPTER1_QUESTS } from '../../../lib/aiLesson/course/rpg/chapter1Data';
import type { AiCourseDict } from '../../../locales/aiCourse';

const browserStore = typeof window === 'undefined' ? null : window.localStorage;

export const AdventureRecordCard = ({ t }: { t: AiCourseDict }) => {
  const areas = browserStore ? areasDoneCount(browserStore) : { done: 0, total: 7 };
  const n3Done = browserStore ? n3UnitsDoneCount(browserStore) : 0;
  const n2Done = browserStore ? n2LearnedCount(browserStore) : 0;
  // 第1章クエスト（P2-8: 記録カードにも冒険の物語進行を出す。read only・時計は現在時刻でよい）
  const questsDone = browserStore
    ? loadAdventureState(Date.now(), browserStore).chapter.completedQuestIds.length : 0;

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-4">
      <div className="rounded-2xl border border-indigo-100 bg-white p-4">
        <p className="text-xs font-bold text-gray-700 mb-2">{t.advRec.heading}</p>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-indigo-50 rounded-xl">
            <dt className="text-[10px] text-gray-500">{t.advRec.ch1Quests}</dt>
            <dd className="text-lg font-bold text-gray-900">{questsDone}<span className="text-xs font-normal text-gray-400">/{CHAPTER1_QUESTS.length}</span></dd>
          </div>
          <div className="p-2 bg-indigo-50 rounded-xl">
            <dt className="text-[10px] text-gray-500">{t.advRec.clearedAreas}</dt>
            <dd className="text-lg font-bold text-gray-900">{areas.done}<span className="text-xs font-normal text-gray-400">/{areas.total}</span></dd>
          </div>
          <div className="p-2 bg-indigo-50 rounded-xl">
            <dt className="text-[10px] text-gray-500">{t.advRec.n3Units}</dt>
            <dd className="text-lg font-bold text-gray-900">{n3Done}<span className="text-xs font-normal text-gray-400">/{N3_UNIT_SPECS.length}</span></dd>
          </div>
          <div className="p-2 bg-indigo-50 rounded-xl">
            <dt className="text-[10px] text-gray-500">{t.advRec.n2Patterns}</dt>
            <dd className="text-lg font-bold text-gray-900">{n2Done}<span className="text-xs font-normal text-gray-400">/180</span></dd>
          </div>
        </dl>
        <p className="text-[11px] text-gray-400 mt-2">
          {t.advRec.note}
        </p>
      </div>
    </div>
  );
};

export default AdventureRecordCard;
