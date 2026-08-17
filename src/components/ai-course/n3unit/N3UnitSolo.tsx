// 「単元のことばを学ぶ」を**単元だけ**で開く画面（今日の冒険 V2 専用・2026-08-18 監査P1）。
//
// これまでV2の vocab_new step は旧コースのエリア画面（N3AreaPanel）を開いていた。
// その画面には「ミナモ列島の地図へ」という戻り、「オモイデ庭園で復習する」、
// そして一番大きい緑ボタンに「次のエリアへ進む」があり、押すと旧エリア連鎖 →
// 旧N2文法攻略 → 確認なしで始まる有料AI会話まで行けてしまっていた。
//
// ここでは今日のstepが指す**その1単元だけ**を開く。エリアの紹介も、単元の選び直しも、
// 次エリアへの連鎖も出さない。出口は「今日の冒険へもどる」の一つだけ。
import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { N3_UNIT_SPECS } from '../../../lib/aiLesson/course/quality/n3UnitSpecs';
import { allVocabularyItems } from '../../../lib/aiLesson/course/foundationVocabBank';
import { createLocalUnitStorage } from '../../../lib/aiLesson/course/n3unit/localUnitStorage';
import type { StoragePort } from '../../../lib/aiLesson/course/n3unit/unitRuntime';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { N3UnitPanel } from './N3UnitPanel';

export interface N3UnitSoloProps {
  t: AiCourseDict;
  /** 今日のstepが指す単元ID（n3u-…） */
  unitId: string;
  /** 今日の冒険へ戻る */
  onExit: () => void;
  /** 進捗の保存先（AiCoursePageが同期つきstorageを渡す）。未指定なら端末内のみ */
  storage?: StoragePort;
}

const browserStore = typeof window === 'undefined' ? null : window.localStorage;

export const N3UnitSolo = ({ t, unitId, onExit, storage: injectedStorage }: N3UnitSoloProps) => {
  const spec = useMemo(() => N3_UNIT_SPECS.find((s) => s.unitId === unitId) ?? null, [unitId]);
  const pool = useMemo(() => allVocabularyItems(), []);
  const storage = useMemo(
    () => injectedStorage ?? (browserStore ? createLocalUnitStorage(browserStore)
      : { load: async () => null, save: async () => ({ ok: true as const }) }),
    [injectedStorage]);

  const backLabel = t.n3u.backToQuest;

  // 存在しない単元IDでも行き止まりにしない
  if (!spec) {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <p className="text-sm text-gray-600 mb-4">{t.n3a.unitNotFound}</p>
        <button type="button" onClick={onExit}
          className="min-h-11 px-6 bg-indigo-600 text-white rounded-2xl font-bold text-sm action-raised action-primary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          {backLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
      {/* 場面ミッション中はパネル内に出口が無いので、ここで常設する（行き止まりを作らない） */}
      <button type="button" onClick={onExit}
        className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg px-1 transition-colors active:bg-gray-100">
        <ArrowLeft className="w-4 h-4" aria-hidden />{backLabel}
      </button>
      <N3UnitPanel
        t={t} spec={spec} pool={pool} storage={storage}
        areaName={t.n3u.questFrameName}
        nextUnitTitleJa={null}
        onExit={onExit}
        questMode
      />
    </div>
  );
};

export default N3UnitSolo;
