// 冒険マップ（PRODUCT_CANON §5・原則11/12/16）。
//
// 旧コースの「成長」画面（12週の文字リスト）と V2 のルート表示が別々の進捗モデルとして
// 併存していたので、**ここ1枚へ統合**する。
//
// 守っていること:
// - 地図を豪華にして今日の行動を隠さない。**今日の冒険カードとPrimary CTAが常に手前**
// - 現在地は必ず1つ（`buildAdventureMap` が保証）
// - 世界観の名前だけにしない。地域名の下に必ず「何の力を鍛えるか」を出す
// - 色だけで状態を伝えない（霧・枠線・ラベル・aria-labelでも伝える）
// - prefers-reduced-motion ではアニメーションを止める
// - 地図が読めない/使えない人のために**一覧表示へ切り替えられる**
import { useMemo, useRef, useState } from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import {
  buildAdventureMap, availableRouteKinds, ROUTE_KIND_LABEL,
  type MapRegion, type MapRouteKind,
} from '../../../lib/aiLesson/course/adventure/advMapModel';
import type { AdventureV2Profile, AdvRoute, AdvTodayQuest } from '../../../lib/aiLesson/course/adventure/advTypes';
import { LandmarkIcon } from './AdvMapLandmarks';
import { TeacherAvatar } from '../TeacherAvatar';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  profile: AdventureV2Profile;
  route: AdvRoute | null;
  mastered: Set<string>;
  currentWeek: number;
  quest: AdvTodayQuest | null;
  /** 今日の冒険へ戻る（Primary CTA） */
  onStartToday: () => void;
  onBack: () => void;
}

/** 蛇行する道の座標。mobileは縦に長く、PCは横に広がる */
const layout = (count: number, wide: boolean) => {
  const colX = wide ? [16, 38, 62, 84] : [26, 50, 74];
  const stepY = wide ? 118 : 132;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / colX.length);
    const inRow = i % colX.length;
    const idx = row % 2 === 0 ? inRow : colX.length - 1 - inRow;
    pts.push({ x: colX[idx], y: 70 + row * stepY });
  }
  const height = 70 + Math.max(0, Math.ceil(count / colX.length) - 1) * stepY + 90;
  return { pts, height };
};

const STATE_LABEL: Record<MapRegion['state'], { ja: string; zh: string }> = {
  done: { ja: '攻略済み', zh: '已攻略' },
  current: { ja: '現在地', zh: '当前位置' },
  next: { ja: '次の目的地', zh: '下一个目的地' },
  locked: { ja: 'ことばの霧の中', zh: '在词语的迷雾中' },
};

export const AdvAdventureMap = ({
  lang, profile, route, mastered, currentWeek, quest, onStartToday, onBack,
}: Props) => {
  const kinds = availableRouteKinds(profile.goalType);
  const [routeKind, setRouteKind] = useState<MapRouteKind>(kinds[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asList, setAsList] = useState(false);
  const currentRef = useRef<HTMLButtonElement>(null);

  const map = useMemo(
    () => buildAdventureMap(profile, route, mastered, currentWeek, routeKind),
    [profile, route, mastered, currentWeek, routeKind],
  );

  const wide = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches;
  const { pts, height } = layout(map.regions.length, !!wide);
  const selected = map.regions.find((r) => r.id === selectedId)
    ?? map.regions.find((r) => r.id === map.currentRegionId)
    ?? null;

  const regionAria = (r: MapRegion) =>
    `${tx(lang, r.nameJa, r.nameZh)}、${tx(lang, r.abilityJa, r.abilityZh)}、${tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}`;

  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-4xl px-4 py-6">
      {/* ── 見出し ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack}
            className="mb-1 min-h-[44px] text-sm text-gray-500 hover:text-gray-700">
            ← {tx(lang, '今日の冒険へ戻る', '回到今天的冒险')}
          </button>
          <h1 className="text-xl font-bold text-gray-900">{tx(lang, '冒険マップ', '冒险地图')}</h1>
          <p className="mt-0.5 text-sm text-gray-600">
            {tx(lang, 'ことばの霧を晴らしながら、目的地へ進もう', '一边驱散词语的迷雾，一边前往目的地')}
          </p>
        </div>
        <button type="button" onClick={() => setAsList((v) => !v)}
          className="shrink-0 flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700"
          aria-pressed={asList}>
          {asList ? <MapIcon className="h-4 w-4" aria-hidden /> : <List className="h-4 w-4" aria-hidden />}
          {asList ? tx(lang, '地図で見る', '用地图看') : tx(lang, '一覧で見る', '用列表看')}
        </button>
      </div>

      {/* ── 目的地と進み ── */}
      <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-3">
        <p className="text-sm font-semibold text-gray-900">
          {tx(lang, `目的地：${map.destinationJa}`, `目的地：${map.destinationZh}`)}
        </p>
        <p className="mt-0.5 text-xs text-gray-600">
          {tx(lang, `晴らした地域 ${map.doneCount} / ${map.totalCount}`, `已驱散迷雾 ${map.doneCount} / ${map.totalCount}`)}
        </p>
      </div>

      {/* ── ルート切り替え（1つしか選べないときは出さない） ── */}
      {kinds.length > 1 && (
        <div className="mt-3 flex gap-2" role="tablist" aria-label={tx(lang, 'ルート', '路线')}>
          {kinds.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={routeKind === k}
              onClick={() => { setRouteKind(k); setSelectedId(null); }}
              className={`min-h-[44px] flex-1 rounded-xl border px-3 text-sm font-semibold ${
                routeKind === k ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}>
              {tx(lang, ROUTE_KIND_LABEL[k].ja, ROUTE_KIND_LABEL[k].zh)}
            </button>
          ))}
        </div>
      )}

      {/* ── 地図 or 一覧 ── */}
      {asList ? (
        <ul className="mt-4 space-y-2">
          {map.regions.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSelectedId(r.id)}
                aria-label={regionAria(r)}
                className={`flex w-full min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2 text-left ${
                  r.state === 'current' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                <LandmarkIcon kind={r.landmark} size={32} muted={r.state === 'locked'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{tx(lang, r.nameJa, r.nameZh)}</span>
                  <span className="block text-xs text-gray-600">{tx(lang, r.abilityJa, r.abilityZh)}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-gray-500">
                  {tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-sky-50 to-emerald-50">
          <div className="relative w-full" style={{ height }}>
            {/* 道（曲線）。次の地域へ続く区間だけ光らせる */}
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`}
              preserveAspectRatio="none" aria-hidden focusable="false">
              {pts.slice(0, -1).map((p, i) => {
                const n = pts[i + 1];
                const midY = (p.y + n.y) / 2;
                const d = `M ${p.x} ${p.y} C ${p.x} ${midY}, ${n.x} ${midY}, ${n.x} ${n.y}`;
                const toNext = map.regions[i + 1]?.state === 'current' || map.regions[i + 1]?.state === 'next';
                return (
                  <path key={i} d={d} fill="none" vectorEffect="non-scaling-stroke"
                    stroke={toNext ? '#2563eb' : '#cbd5e1'} strokeWidth={toNext ? 4 : 3}
                    strokeLinecap="round" strokeDasharray={toNext ? '1 7' : undefined}
                    className={toNext ? 'motion-safe:animate-pulse' : undefined} />
                );
              })}
              {/* 試験ルートと会話ルートの合流点 */}
              {map.mergeIndex !== null && pts[map.mergeIndex] && (
                <circle cx={pts[map.mergeIndex].x} cy={pts[map.mergeIndex].y - 34} r="3" fill="#f59e0b" />
              )}
            </svg>

            {/* 地域 */}
            {map.regions.map((r, i) => {
              const p = pts[i];
              const isCurrent = r.state === 'current';
              return (
                <button
                  key={r.id} type="button"
                  ref={isCurrent ? currentRef : undefined}
                  onClick={() => setSelectedId(r.id)}
                  aria-label={regionAria(r)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 rounded-2xl p-1"
                  style={{ left: `${p.x}%`, top: p.y }}>
                  <span className={`relative flex h-14 w-14 items-center justify-center rounded-2xl border-2 bg-white/90 ${
                    isCurrent ? 'border-blue-600 shadow-lg' : r.state === 'done' ? 'border-emerald-400' : 'border-gray-300'}`}>
                    <LandmarkIcon kind={r.landmark} size={36} muted={r.state === 'locked'} />
                    {/* ことばの霧（未解放） */}
                    {r.state === 'locked' && (
                      <span className="absolute inset-0 rounded-2xl bg-slate-300/70 backdrop-blur-[2px]" aria-hidden />
                    )}
                    {/* 現在地の軽い脈動。reduced-motionでは止まる */}
                    {isCurrent && (
                      <span className="absolute -inset-1 rounded-2xl border-2 border-blue-400 motion-safe:animate-ping" aria-hidden />
                    )}
                    {/* 攻略済みは記号でも示す（色だけに依存しない） */}
                    {r.state === 'done' && (
                      <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white" aria-hidden>✓</span>
                    )}
                  </span>
                  <span className="mt-1 max-w-[92px] text-center text-[11px] font-semibold leading-tight text-gray-800">
                    {tx(lang, r.nameJa, r.nameZh)}
                  </span>
                  <span className="max-w-[92px] text-center text-[10px] leading-tight text-gray-500">
                    {tx(lang, r.abilityJa, r.abilityZh)}
                  </span>
                </button>
              );
            })}

            {/* 学習者アバターと先生（現在地の隣） */}
            {map.currentRegionId && (() => {
              const i = map.regions.findIndex((r) => r.id === map.currentRegionId);
              const p = pts[i];
              if (!p) return null;
              return (
                // 現在地の**真下**に置く。右隣に置くと次の地域のランドマークに重なる
                <div className="absolute -translate-x-1/2 flex items-center gap-1"
                  style={{ left: `${p.x}%`, top: p.y + 46 }} aria-hidden>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                    {tx(lang, '私', '我')}
                  </span>
                  <TeacherAvatar size={26} lang={lang} labeled={false} className="ring-2 ring-white" />
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── 選んだ地域のカード ── */}
      {selected && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <LandmarkIcon kind={selected.landmark} size={40} muted={selected.state === 'locked'} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-gray-900">{tx(lang, selected.nameJa, selected.nameZh)}</p>
              <p className="text-xs font-semibold text-indigo-800">
                {tx(lang, '鍛える力：', '锻炼的能力：')}{tx(lang, selected.abilityJa, selected.abilityZh)}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">
              {tx(lang, STATE_LABEL[selected.state].ja, STATE_LABEL[selected.state].zh)}
            </span>
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">{tx(lang, '定着', '巩固度')}</dt>
              <dd className="text-gray-800">
                {selected.masteryPct === null
                  ? tx(lang, '未判定', '尚未判定')
                  : `${selected.masteryPct}%`}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="shrink-0 text-gray-500">{tx(lang, 'ここまで', '到目前为止')}</dt>
              <dd className="text-right text-gray-800">{tx(lang, selected.doneJa, selected.doneZh)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="shrink-0 text-gray-500">{tx(lang, '次にすること', '接下来要做的')}</dt>
              <dd className="text-right text-gray-800">{tx(lang, selected.nextJa, selected.nextZh)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">{tx(lang, '目安の時間', '预计时间')}</dt>
              <dd className="text-gray-800">{tx(lang, `約${selected.estMinutes}分`, `约${selected.estMinutes}分钟`)}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* ── 今日の冒険カード＋Primary CTA（地図より手前に置かない代わりに、必ず最後に出す） ── */}
      <div className="mt-4 rounded-2xl border border-blue-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{tx(lang, '今日の冒険', '今天的冒险')}</p>
        <p className="mt-0.5 text-sm text-gray-700">
          {quest
            ? tx(lang, `${quest.steps.length}つ・約${quest.estimatedMinutes}分`, `${quest.steps.length}项・约${quest.estimatedMinutes}分钟`)
            : tx(lang, '今日の分を用意しています', '正在准备今天的内容')}
        </p>
        <button type="button" onClick={onStartToday}
          className="mt-3 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white">
          {tx(lang, '今日の冒険を始める', '开始今天的冒险')}
        </button>
      </div>
    </div>
  );
};
