// 成長スナップショット（§16）。時系列で撮った「その時点の状態」を1枚のカードに。

import { Camera } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { GrowthSnapshot } from '../../lib/aiLesson/course/courseGrowth';

interface Props {
  t: AiCourseDict;
  snapshot: GrowthSnapshot;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

const triggerLabel = (trigger: string, tg: AiCourseDict['growth']): string => {
  if (trigger.startsWith('week')) return tg.snapshotWeek(Number(trigger.replace('week', '')));
  return tg.snapshotTriggers[trigger as keyof typeof tg.snapshotTriggers] ?? trigger;
};

export const GrowthSnapshotCard = ({ t, snapshot }: Props) => {
  const tg = t.growth;
  const m = snapshot.metrics;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-indigo-500" />{triggerLabel(snapshot.triggerKind, tg)}
        </p>
        <p className="text-[11px] text-gray-400">{snapshot.createdAtISO.slice(0, 10)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label={tg.metricIndependent} value={pct(m.independentRate)} />
        <Metric label={tg.metricRetained} value={String(m.retainedExpressions)} />
        <Metric label={tg.metricRoundtrips} value={m.avgRoundtrips ? m.avgRoundtrips.toFixed(1) : '—'} />
      </div>
      {snapshot.representativeUtterance && (
        <p className="text-xs text-gray-600 mt-3 bg-gray-50 rounded-lg p-2.5 leading-relaxed break-words">
          「{snapshot.representativeUtterance}」
        </p>
      )}
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-gray-50 rounded-lg py-2">
    <p className="text-base font-bold text-gray-900">{value}</p>
    <p className="text-[10px] text-gray-500">{label}</p>
  </div>
);
