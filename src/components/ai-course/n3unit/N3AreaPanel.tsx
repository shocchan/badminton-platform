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
import { worldChangeFor } from '../../../lib/aiLesson/course/n3unit/unitRuntime';
import { N3UnitPanel } from './N3UnitPanel';
import { HeroSprite, ShokoSprite } from '../rpg/pixelAssets';

// SSR証拠harnessでも落ちないstore（windowなし環境ではnull＝全単元未完了として描画）
const browserStore = typeof window === 'undefined' ? null : window.localStorage;
const readStore: Pick<Storage, 'getItem'> = browserStore ?? { getItem: () => null };

export interface N3AreaPanelProps {
  area: WorldArea;
  onExit: () => void;
  /** エリア完了後に次エリアへ（World Mapのルーティングへ委譲） */
  onOpenArea: (areaId: string) => void;
  /** エリア1のみ: Chapter 1 冒険へ */
  onOpenAdventure?: () => void;
  /** 復習（オモイデ庭園）への導線 */
  onOpenReview: () => void;
}

export const N3AreaPanel = ({ area, onExit, onOpenArea, onOpenAdventure, onOpenReview }: N3AreaPanelProps) => {
  const pool = useMemo(() => allVocabularyItems(), []);
  const storage = useMemo(
    () => (browserStore ? createLocalUnitStorage(browserStore)
      : { load: async () => null, save: async () => ({ ok: true as const }) }),
    []);
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
          <p className="text-sm text-gray-600 mb-4">この単元は見つかりませんでした。</p>
          <button type="button" onClick={() => setActiveUnitId(null)}
            className="min-h-11 px-6 bg-indigo-600 text-white rounded-2xl font-bold text-sm">エリアへもどる</button>
        </div>
      );
    }
    const next = specs[idx + 1] ?? null;
    return (
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
        <N3UnitPanel
          spec={spec} pool={pool} storage={storage} areaName={area.nameJa}
          nextUnitTitleJa={next?.titleJa ?? null}
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
        <ArrowLeft className="w-4 h-4" aria-hidden />ミナモ列島の地図へ
      </button>

      {/* Area Intro（世界での役割＋今日の目的） */}
      <div className="rounded-2xl border p-4 mb-3"
        style={{ background: `linear-gradient(135deg, ${area.visual.base}22, #ffffff 60%)`, borderColor: `${area.visual.base}66` }}>
        <div className="flex items-start gap-2">
          <div className="w-8 shrink-0"><HeroSprite decorative /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold" style={{ color: area.visual.accent }}>
              <MapPin className="inline w-3 h-3 -mt-0.5" aria-hidden /> ミナモ列島・第{area.order}エリア
            </p>
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{area.nameJa}</h2>
            <p className="text-xs text-gray-600 mt-1">{area.storyPurposeJa}</p>
          </div>
          <div className="w-8 shrink-0"><ShokoSprite decorative pose="talk" /></div>
        </div>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
          <div className="bg-white/80 rounded-xl p-2">
            <dt className="text-gray-400">ここで学ぶこと</dt>
            <dd className="text-gray-800 font-bold">{area.learningThemeJa}</dd>
          </div>
          <div className="bg-white/80 rounded-xl p-2">
            <dt className="text-gray-400">ことばが必要になる相手</dt>
            <dd className="text-gray-800 font-bold">{area.characterJa}</dd>
          </div>
          <div className="bg-white/80 rounded-xl p-2">
            <dt className="text-gray-400">エリアの実用ミッション</dt>
            <dd className="text-gray-800 font-bold">{area.practicalMissionJa}</dd>
          </div>
        </dl>
      </div>

      {/* Chapter 1 冒険（エリア1のみ） */}
      {area.hasAdventure && onOpenAdventure && (
        <button type="button" onClick={onOpenAdventure}
          className="w-full text-left mb-3 p-4 bg-indigo-600 text-white rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
          <p className="text-[11px] font-bold text-indigo-200">ものがたり</p>
          <p className="text-base font-bold">第1章「霧の港町」を進める</p>
          <p className="text-[11px] text-indigo-100 mt-0.5">学んだことばで町の霧を晴らし、人と話せるようになる</p>
        </button>
      )}

      {/* 単元一覧（§8: 全エリア共通の学習ループ入口） */}
      <p className="text-xs font-bold text-gray-500 mb-2">このエリアの攻略（{progress.done}/{progress.total}）</p>
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
                  <span className="block text-sm font-bold text-gray-900">{spec.titleJa}</span>
                  <span className="block text-[11px] text-gray-500">
                    {done ? `完了・「${worldChangeFor(spec).unlockJa}」` : `場面ミッション: ${spec.practicalMission.titleJa}`}
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
          <p className="text-sm font-bold text-emerald-800 mb-1">このエリアの霧は晴れました</p>
          <p className="text-[11px] text-emerald-700 mb-3">
            学んだことばは忘れたころに「オモイデ庭園」で再会します。
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            {area.nextAreaId && (
              <button type="button" onClick={() => onOpenArea(area.nextAreaId!)}
                className="flex-1 min-h-12 bg-emerald-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                次のエリアへ進む
              </button>
            )}
            <button type="button" onClick={onOpenReview}
              className="flex-1 min-h-12 bg-white border border-emerald-300 text-emerald-700 rounded-2xl font-bold text-sm">
              オモイデ庭園で復習する
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">
          単元を完了すると世界が変わります。学習記録はこの端末に保存されます（正式な同期は公開前に有効になります）。
        </p>
      )}
    </div>
  );
};

export default N3AreaPanel;
