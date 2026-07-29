// エリア画面（FOREST FIRST §7-§8）。World Mapのエリア→単元一覧→N3UnitPanelの共通ループ。
// 全n3areaエリアがこの1コンポーネントで動く（エリアごとの特注UIを作らない）。
//
// エリアの最小ループ: Intro（役割・人物・今日の目的）→ 単元（語彙/文法→確認→使用練習→
// 場面ミッション→Result）→ Area Complete → World change → 次エリアへ。
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, MapPin } from 'lucide-react';
import type { WorldArea } from '../../../lib/aiLesson/course/rpg/worldAtlas';
import { unitSpecsForArea } from '../../../lib/aiLesson/course/rpg/worldAtlas';
import { areaProgress, unitCompletedLocally } from '../../../lib/aiLesson/course/rpg/worldProgress';
import { allVocabularyItems } from '../../../lib/aiLesson/course/foundationVocabBank';
import { createLocalUnitStorage } from '../../../lib/aiLesson/course/n3unit/localUnitStorage';
import type { StoragePort } from '../../../lib/aiLesson/course/n3unit/unitRuntime';
import type { AiCourseDict } from '../../../locales/aiCourse';
import { worldChangeFor } from '../../../lib/aiLesson/course/n3unit/unitRuntime';
import { N3UnitPanel } from './N3UnitPanel';
import { HeroSprite, ShokoSprite } from '../rpg/pixelAssets';

// SSR証拠harnessでも落ちないstore（windowなし環境ではnull＝全単元未完了として描画）
const browserStore = typeof window === 'undefined' ? null : window.localStorage;
const readStore: Pick<Storage, 'getItem'> = browserStore ?? { getItem: () => null };

export interface N3AreaPanelProps {
  t: AiCourseDict;
  area: WorldArea;
  onExit: () => void;
  /** エリア完了後に次エリアへ（World Mapのルーティングへ委譲） */
  onOpenArea: (areaId: string) => void;
  /** エリア1のみ: Chapter 1 冒険へ */
  onOpenAdventure?: () => void;
  /** 復習（オモイデ庭園）への導線 */
  onOpenReview: () => void;
  /**
   * 進捗の保存先の差し替え（H2準備）。
   * 未指定なら従来どおり端末内（localStorage）のみ。AiCoursePageが
   * ai_course_unit_progress の存在をprobeして同期つきstorageを渡す。
   */
  storage?: StoragePort;
}

export const N3AreaPanel = ({ t, area, onExit, onOpenArea, onOpenAdventure, onOpenReview, storage: injectedStorage }: N3AreaPanelProps) => {
  const zh = t.locale === 'zh';
  const pool = useMemo(() => allVocabularyItems(), []);
  const storage = useMemo(
    () => injectedStorage ?? (browserStore ? createLocalUnitStorage(browserStore)
      : { load: async () => null, save: async () => ({ ok: true as const }) }),
    [injectedStorage]);
  const specs = useMemo(() => unitSpecsForArea(area), [area]);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const bump = () => setTick(v => v + 1);

  const progress = areaProgress(readStore, area);

  // ── 単元進行中 ──
  if (activeUnitId) {
    const idx = specs.findIndex(s => s.unitId === activeUnitId);
    const spec = specs[idx];
    if (!spec) {
      // 存在しない単元ID（URL改変等）でも行き止まりにしない
      return (
        <div className="max-w-md mx-auto px-4 py-10 text-center">
          <p className="text-sm text-gray-600 mb-4">{t.n3a.unitNotFound}</p>
          <button type="button" onClick={() => setActiveUnitId(null)}
            className="min-h-11 px-6 bg-indigo-600 text-white rounded-2xl font-bold text-sm">{t.n3a.backToArea}</button>
        </div>
      );
    }
    const next = specs[idx + 1] ?? null;
    return (
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
        <N3UnitPanel
          t={t} spec={spec} pool={pool} storage={storage} areaName={zh ? area.nameZh : area.nameJa}
          nextUnitTitleJa={next ? (zh ? next.titleZh : next.titleJa) : null}
          onExit={() => { setActiveUnitId(null); bump(); }}
          onOpenNextUnit={next ? () => { setActiveUnitId(next.unitId); bump(); } : undefined}
        />
      </div>
    );
  }

  // ── エリアIntro＋単元一覧 ──
  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
      <button type="button" onClick={onExit}
        className="min-h-11 flex items-center gap-1.5 text-sm text-gray-500 mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg px-1">
        <ArrowLeft className="w-4 h-4" aria-hidden />{t.n3a.backToMap}
      </button>

      {/* Area Intro（世界での役割＋今日の目的） */}
      <div className="rounded-2xl border p-4 mb-3"
        style={{ background: `linear-gradient(135deg, ${area.visual.base}22, #ffffff 60%)`, borderColor: `${area.visual.base}66` }}>
        <div className="flex items-start gap-2">
          <div className="w-8 shrink-0"><HeroSprite decorative /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold" style={{ color: area.visual.accent }}>
              <MapPin className="inline w-3 h-3 -mt-0.5" aria-hidden /> {t.n3a.areaBadge(area.order)}
            </p>
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{zh ? area.nameZh : area.nameJa}</h2>
            <p className="text-xs text-gray-600 mt-1">{zh ? area.storyPurposeZh : area.storyPurposeJa}</p>
          </div>
          <div className="w-8 shrink-0"><ShokoSprite decorative pose="talk" /></div>
        </div>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
          <div className="bg-white/80 rounded-xl p-2">
            <dt className="text-gray-400">{t.n3a.learnHere}</dt>
            <dd className="text-gray-800 font-bold">{zh ? area.learningThemeZh : area.learningThemeJa}</dd>
          </div>
          <div className="bg-white/80 rounded-xl p-2">
            <dt className="text-gray-400">{t.n3a.needWith}</dt>
            <dd className="text-gray-800 font-bold">{zh ? area.characterZh : area.characterJa}</dd>
          </div>
          <div className="bg-white/80 rounded-xl p-2">
            <dt className="text-gray-400">{t.n3a.areaMission}</dt>
            <dd className="text-gray-800 font-bold">{zh ? area.practicalMissionZh : area.practicalMissionJa}</dd>
          </div>
        </dl>
      </div>

      {/* Chapter 1 冒険（エリア1のみ） */}
      {area.hasAdventure && onOpenAdventure && (
        <button type="button" onClick={onOpenAdventure}
          className="w-full text-left mb-3 p-4 bg-indigo-600 text-white rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
          <p className="text-[11px] font-bold text-indigo-200">{t.n3a.story}</p>
          <p className="text-base font-bold">{t.n3a.ch1Enter}</p>
          <p className="text-[11px] text-indigo-100 mt-0.5">{t.n3a.ch1Body}</p>
        </button>
      )}

      {/* 単元一覧（§8: 全エリア共通の学習ループ入口） */}
      <p className="text-xs font-bold text-gray-500 mb-2">{t.n3a.conquer(progress.done, progress.total)}</p>
      <div className="space-y-2 mb-4">
        {specs.map((spec, i) => {
          const done = unitCompletedLocally(readStore, spec.unitId);
          return (
            <button key={spec.unitId} type="button" onClick={() => setActiveUnitId(spec.unitId)}
              className={`w-full text-left p-3.5 rounded-2xl border min-h-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
              <div className="flex items-center gap-3">
                <span aria-hidden className={`w-7 h-7 shrink-0 grid place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {done ? <Check className="w-4 h-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900">{zh ? spec.titleZh : spec.titleJa}</span>
                  <span className="block text-[11px] text-gray-500">
                    {done ? t.n3a.unitDoneLabel(zh ? worldChangeFor(spec).unlockZh : worldChangeFor(spec).unlockJa) : `${t.n3a.missionPrefix} ${zh ? spec.practicalMission.titleZh : spec.practicalMission.titleJa}`}
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" aria-hidden />
              </div>
            </button>
          );
        })}
      </div>

      {/* Area Complete → World change → 次エリア（行き止まりにしない・§8） */}
      {progress.complete ? (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <p className="text-sm font-bold text-emerald-800 mb-1">{t.n3a.areaCleared}</p>
          <p className="text-[11px] text-emerald-700 mb-3">
            {t.n3a.clearedBody}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            {area.nextAreaId && (
              <button type="button" onClick={() => onOpenArea(area.nextAreaId!)}
                className="flex-1 min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                {t.n3a.nextArea}
              </button>
            )}
            <button type="button" onClick={onOpenReview}
              className="flex-1 min-h-12 bg-white border border-emerald-300 text-emerald-700 rounded-2xl font-bold text-sm">
              {t.n3a.reviewInGarden}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">
          {t.n3a.footNote}
        </p>
      )}
    </div>
  );
};

export default N3AreaPanel;
