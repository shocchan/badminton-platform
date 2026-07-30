// ミナモ列島マップ（FOREST FIRST §7 → 2026-07-30 CEO要望で主要ナビゲーションへ改修）。
// 既存IPの地図・意匠を参照しない。島・landmark・色はworldAtlasのデータから描く。
//
// 設計原則（§6-§12）:
// - 街Visual・名前・CTAをひとつのArea node（button）にまとめ、node全体がクリック領域。
//   透明な巨大クリック領域は作らない（nodeの見た目＝当たり判定）。
// - 「押せば入れる」が説明なしで分かる: 常時chevron CTA（mobile）＋hover/focusで浮き上がり・
//   影・輪郭・中国語gloss・学習テーマ・「この街へ」を表示（desktop）。
// - hoverだけに依存しない: focus-visibleで同等表示・Enter/Spaceで遷移（native button）。
// - 街名はhover外でも常時表示する（hover中だけ見える仕様にしない）。
// - prefers-reduced-motion: 浮遊・transitionを無効化し、輪郭・影・ラベルで操作可能性を示す。
// - 状態はread only導出（current/available/review_due/completed/locked）。学習状態を書き換えない。
// - lockedは現在存在しない（全エリア開放）が、UIは正直な解放条件表示に対応する。
import type { WorldArea } from '../../../lib/aiLesson/course/rpg/worldAtlas';
import type { AreaNodeState } from '../../../lib/aiLesson/course/rpg/worldProgress';
import type { AiCourseDict } from '../../../locales/aiCourse';

/** ノード幅（コンテナ幅比%）。最近接ノード間距離17%（4:3補正）未満に保ち重複させない */
export const AREA_NODE_WIDTH_PCT = 15;
/** タッチターゲット最小（px）。44px以上（§7） */
export const AREA_NODE_MIN_PX = 56;

/** landmarkごとの小さなpixel風glyph（すべて新規作図） */
const LandmarkGlyph = ({ kind, accent }: { kind: WorldArea['visual']['landmark']; accent: string }) => {
  switch (kind) {
    case 'harbor': return (<g>
      <rect x="1" y="6" width="8" height="2" fill={accent} />
      <rect x="4.4" y="1.5" width="1.2" height="4.5" fill={accent} />
      <polygon points="5,1.5 8,3.2 5,4.2" fill="#e63946" />
    </g>);
    case 'port': return (<g>
      <path d="M2,7.4 Q5,5.4 8,7.4" stroke={accent} strokeWidth="1" fill="none" />
      <rect x="4.5" y="2" width="1" height="4.4" fill={accent} />
      <circle cx="5" cy="1.6" r="0.9" fill="#ffd166" />
    </g>);
    case 'hill': return (<g>
      <path d="M1,8 Q5,2 9,8 Z" fill={accent} opacity="0.85" />
      <circle cx="7.4" cy="2.6" r="1.1" fill="#ffd166" />
    </g>);
    case 'road': return (<g>
      <path d="M2,8 C4,6 6,4 8,2" stroke={accent} strokeWidth="1.1" fill="none" strokeDasharray="1.4 0.9" />
      <rect x="7.2" y="1.2" width="1.6" height="1.6" fill={accent} />
    </g>);
    case 'market': return (<g>
      <rect x="2" y="4" width="6" height="3.4" fill={accent} opacity="0.9" />
      <path d="M1.6,4 L5,1.8 L8.4,4 Z" fill="#e07a9e" />
    </g>);
    case 'forest': return (<g>
      <circle cx="3.4" cy="4" r="1.7" fill={accent} />
      <circle cx="6.4" cy="3.2" r="1.9" fill={accent} opacity="0.85" />
      <rect x="3.1" y="5.4" width="0.7" height="2.4" fill="#8a5a2b" />
      <rect x="6.1" y="5" width="0.7" height="2.8" fill="#8a5a2b" />
    </g>);
    case 'office': return (<g>
      <rect x="2" y="3" width="2.2" height="5" fill={accent} />
      <rect x="4.8" y="1.8" width="2.4" height="6.2" fill={accent} opacity="0.85" />
      <rect x="5.4" y="2.6" width="0.7" height="0.7" fill="#ffd166" />
      <rect x="2.6" y="3.8" width="0.7" height="0.7" fill="#ffd166" />
    </g>);
    case 'ruins': return (<g>
      <rect x="2.2" y="4.4" width="1.4" height="3.6" fill={accent} />
      <rect x="4.4" y="3.4" width="1.4" height="4.6" fill={accent} opacity="0.9" />
      <rect x="6.6" y="4.8" width="1.4" height="3.2" fill={accent} opacity="0.8" />
      <rect x="2" y="8" width="6.4" height="0.7" fill={accent} opacity="0.6" />
    </g>);
    case 'tower': return (<g>
      <rect x="4" y="1.5" width="2" height="6.5" fill={accent} />
      <polygon points="3.6,1.5 6.4,1.5 5,0.3" fill="#e63946" />
      <rect x="3" y="7.5" width="4" height="1.2" fill={accent} opacity="0.8" />
      <rect x="4.5" y="2.4" width="1" height="1" fill="#ffd166" />
    </g>);
    case 'garden': return (<g>
      <circle cx="3" cy="3.4" r="1.2" fill="#e07a9e" />
      <circle cx="6.6" cy="2.8" r="1" fill="#ffd166" />
      <path d="M3,4.4 L3,8 M6.6,3.8 L6.6,8" stroke={accent} strokeWidth="0.9" />
      <ellipse cx="5" cy="8" rx="4" ry="1" fill={accent} opacity="0.5" />
    </g>);
  }
};

/** 主人公（現在地の島の上に立つ・SVG内で描く） */
const HeroMark = () => (
  <g aria-hidden>
    <rect x="-1.1" y="-2.6" width="2.2" height="1.9" fill="#2b2b2b" />
    <rect x="-0.85" y="-1.5" width="1.7" height="1" fill="#f2c9a0" />
    <rect x="-1.05" y="-0.5" width="2.1" height="1.9" fill="#3a6ea5" />
    <rect x="-0.75" y="1.4" width="0.66" height="1.1" fill="#2b2b2b" />
    <rect x="0.12" y="1.4" width="0.66" height="1.1" fill="#2b2b2b" />
  </g>
);

export interface IslandsMapProps {
  t: AiCourseDict;
  areas: WorldArea[];
  currentAreaId: string;
  clarity: 'clear' | 'light_fog' | 'foggy';
  reducedMotion?: boolean;
  onOpenArea: (areaId: string) => void;
  /** ノード状態の導出（read only）。未指定はcurrent以外available */
  stateOf?: (area: WorldArea) => AreaNodeState;
  /** lockedノードの正直な解放条件（lockedが無い現在は未使用） */
  unlockConditionOf?: (area: WorldArea) => string;
}

const CLARITY_OPACITY = { clear: 0, light_fog: 0.14, foggy: 0.26 } as const;

export const IslandsMap = ({
  t, areas, currentAreaId, clarity, reducedMotion, onOpenArea, stateOf, unlockConditionOf,
}: IslandsMapProps) => {
  const zh = t.locale === 'zh';
  const nodeState = (a: WorldArea): AreaNodeState =>
    stateOf ? stateOf(a) : (a.areaId === currentAreaId ? 'current' : 'available');

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200"
      style={{ aspectRatio: '4/3', minHeight: '46vh', maxHeight: '72vh', background: 'linear-gradient(180deg,#bfe0ee 0%,#a8d2e6 55%,#98c6dd 100%)' }}>
      {/* 海（装飾レイヤー） */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
        {[22, 50, 78].map(y => (
          <path key={y} d={`M0,${y} Q10,${y - 1.2} 20,${y} T40,${y} T60,${y} T80,${y} T100,${y}`}
            stroke="#ffffff" strokeOpacity="0.25" strokeWidth="0.5" fill="none" />
        ))}
      </svg>

      {/* ことばの霧（表示のみ・読める濃度）。hover/focusしたnodeは霧の上へ浮く */}
      {clarity !== 'clear' && (
        <div aria-hidden className="absolute inset-0 z-20 pointer-events-none"
          style={{ background: '#eef3f6', opacity: CLARITY_OPACITY[clarity] }} />
      )}

      {/* ── Area node（街Visual＋状態タグ＋名前＋CTA＝ひとつのbutton・§7） ── */}
      {areas.map(a => {
        const st = nodeState(a);
        const locked = st === 'locked';
        const nameShort = a.nameJa.split('（')[0];
        const theme = zh ? a.learningThemeZh : a.learningThemeJa;
        const isCurrent = st === 'current';
        const chip = locked ? 'bg-gray-200 text-gray-500'
          : isCurrent ? 'bg-indigo-600 text-white' : 'bg-white/95 text-gray-800';
        // hover/focusパネル: 下端の島は上へ・左右端は内側寄せ（Map外へclipさせない・§8）
        const panelPos = a.pos.y > 60 ? 'bottom-full mb-1' : 'top-full mt-1';
        const panelAlign = a.pos.x < 22 ? 'left-0' : a.pos.x > 78 ? 'right-0' : 'left-1/2 -translate-x-1/2';
        return (
          <div key={a.areaId} className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${a.pos.x}%`, top: `${a.pos.y}%`, width: `${AREA_NODE_WIDTH_PCT}%`, minWidth: AREA_NODE_MIN_PX }}>
            <button type="button"
              onClick={() => { if (!locked) onOpenArea(a.areaId); }}
              aria-label={locked
                ? t.world.lockedAria(nameShort, t.world.unlockCondition(unlockConditionOf?.(a) ?? ''))
                : t.world.goToAria(nameShort, theme)}
              aria-current={isCurrent ? 'true' : undefined}
              aria-disabled={locked || undefined}
              data-area-node={a.areaId}
              data-node-state={st}
              className={[
                'group relative block w-full min-h-11 rounded-2xl select-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                locked
                  ? 'cursor-not-allowed opacity-80'
                  : 'cursor-pointer hover:z-30 focus-visible:z-30 ' + (reducedMotion
                    ? ''
                    : 'motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1.5 motion-safe:hover:scale-[1.04] motion-safe:focus-visible:-translate-y-1.5 motion-safe:focus-visible:scale-[1.04] motion-safe:active:scale-[0.98]'),
              ].join(' ')}>
              {/* 島Visual（click領域と一致・§7）。hover/focusで影が強くなる（§8） */}
              <span className={locked ? 'block' : 'block group-hover:drop-shadow-xl group-focus-visible:drop-shadow-xl'}>
                <svg viewBox="0 0 24 15" className="w-full" aria-hidden>
                  <ellipse cx="12" cy="9.2" rx="11" ry="5.2" fill="#3a6b83" opacity="0.28" />
                  <ellipse cx="12" cy="7.6" rx="10.4" ry="4.8" fill={a.visual.base} />
                  <ellipse cx="12" cy="6.8" rx="8" ry="3.4" fill="#ffffff" opacity="0.14" />
                  <g transform="translate(7,1.4)">
                    <LandmarkGlyph kind={a.visual.landmark} accent={a.visual.accent} />
                  </g>
                  {isCurrent && (
                    <>
                      <ellipse cx="12" cy="7.6" rx="11.4" ry="5.6" fill="none" stroke="#ffffff"
                        strokeWidth="0.7" strokeDasharray="2 1.4" opacity="0.95">
                        {!reducedMotion && (
                          <animate attributeName="stroke-dashoffset" from="0" to="3.4" dur="2.4s" repeatCount="indefinite" />
                        )}
                      </ellipse>
                      <g transform="translate(14.6,2.2)"><HeroMark /></g>
                    </>
                  )}
                  {st === 'completed' && (
                    <g aria-hidden>
                      <circle cx="20.4" cy="3" r="2.4" fill="#059669" />
                      <path d="M19.2,3 L20,3.9 L21.6,2.1" stroke="#ffffff" strokeWidth="0.7" fill="none" />
                    </g>
                  )}
                  {st === 'review_due' && (
                    <g aria-hidden>
                      <circle cx="20.4" cy="3" r="2.4" fill="#7c3aed" />
                      <path d="M20.4,1.7 a1.1,1.1 0 0 1 1.1,1.1 v0.7 l0.4,0.6 h-3 l0.4,-0.6 v-0.7 a1.1,1.1 0 0 1 1.1,-1.1" fill="#ffffff" />
                    </g>
                  )}
                  {locked && (
                    <g aria-hidden>
                      <rect x="18.6" y="2.2" width="3.6" height="2.8" rx="0.6" fill="#4b5563" />
                      <path d="M19.5,2.2 v-0.6 a0.9,0.9 0 0 1 1.8,0 v0.6" stroke="#4b5563" strokeWidth="0.7" fill="none" />
                    </g>
                  )}
                </svg>
              </span>

              {/* 状態タグ（現在地・復習あり・完了・未開放・§11） */}
              {st !== 'available' && (
                <span className={`block mx-auto -mt-0.5 mb-0.5 w-fit text-[9px] leading-tight font-bold px-1 rounded ${
                  isCurrent ? 'bg-indigo-600 text-white'
                    : st === 'review_due' ? 'bg-violet-600 text-white'
                    : st === 'completed' ? 'bg-emerald-600 text-white'
                    : 'bg-gray-500 text-white'}`}>
                  {isCurrent ? t.world.currentLabel
                    : st === 'review_due' ? t.world.reviewAvailable
                    : st === 'completed' ? t.world.areaCompleted
                    : t.world.lockedArea}
                </span>
              )}

              {/* 街名（常時表示・§8）＋常時chevron（mobileでもhover無しで押せると分かる・§10） */}
              <span className={`flex items-center justify-center gap-0.5 w-fit max-w-full mx-auto px-1.5 py-0.5 rounded shadow-sm text-[10px] sm:text-[11px] font-bold leading-tight ${chip} ${locked ? '' : 'group-hover:bg-indigo-600 group-hover:text-white group-focus-visible:bg-indigo-600 group-focus-visible:text-white'}`}>
                <span className="truncate">{nameShort}</span>
                {!locked && <span aria-hidden className="shrink-0">›</span>}
              </span>

              {/* hover/focusパネル: 中国語gloss・学習テーマ・「この街へ」（§8・§9） */}
              <span className={`pointer-events-none absolute ${panelPos} ${panelAlign} z-40 hidden group-hover:block group-focus-visible:block w-max max-w-[180px] rounded-xl bg-white/95 border border-indigo-200 shadow-lg px-2.5 py-1.5 text-left`}>
                <span className="block text-[11px] font-bold text-gray-900">{nameShort}</span>
                {zh && <span className="block text-[10px] text-indigo-700">{a.nameZh.includes('（') ? a.nameZh.slice(a.nameZh.indexOf('（') + 1, -1) : a.nameZh}</span>}
                <span className="block text-[10px] text-gray-500">{theme}</span>
                <span className="block text-[10px] font-bold text-indigo-600 mt-0.5">
                  {locked ? t.world.unlockCondition(unlockConditionOf?.(a) ?? '') : `${t.world.enterArea} →`}
                </span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default IslandsMap;
