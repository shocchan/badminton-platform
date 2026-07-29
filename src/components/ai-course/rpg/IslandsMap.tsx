// ミナモ列島の全体マップ（FOREST FIRST §7）。完全オリジナルのprocedural SVG。
// 既存IPの地図・意匠を参照しない。島・landmark・色はworldAtlasのデータから描く。
//
// 設計:
// - 情報はテキストでも必ず提供する（各エリアはHTMLボタン＝名前・テーマ付き）
// - RPG層はread only。クリックは onOpenArea を呼ぶだけ
// - 霧（clarity）は表示のみ。読みやすさを損なう濃度にしない
import type { WorldArea } from '../../../lib/aiLesson/course/rpg/worldAtlas';

/** landmarkごとの小さなpixel風glyph（すべて新規作図） */
const LandmarkGlyph = ({ kind, accent }: { kind: WorldArea['visual']['landmark']; accent: string }) => {
  switch (kind) {
    case 'harbor': return (<g>
      <rect x="1" y="6" width="8" height="2" fill={accent} />
      <polygon points="5,1 8,6 2,6" fill="#ffffff" opacity="0.9" />
      <rect x="4.6" y="1" width="0.8" height="5" fill={accent} />
    </g>);
    case 'hill': return (<g>
      <ellipse cx="3.5" cy="7" rx="3.2" ry="2.2" fill={accent} />
      <ellipse cx="7" cy="7.4" rx="2.6" ry="1.8" fill={accent} opacity="0.75" />
      <circle cx="8" cy="2" r="1.3" fill="#ffd166" />
    </g>);
    case 'road': return (<g>
      <path d="M1,8 C3,6 3,4 5,3 C7,2 7,2 9,1" stroke={accent} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="0.6" y="7.4" width="1.6" height="1.6" fill={accent} />
      <rect x="8" y="0.6" width="1.6" height="1.6" fill={accent} />
    </g>);
    case 'market': return (<g>
      <rect x="1.5" y="4" width="7" height="4" fill="#ffffff" opacity="0.85" />
      <rect x="1" y="2.6" width="8" height="1.8" fill={accent} />
      <rect x="2" y="5" width="2" height="3" fill={accent} opacity="0.6" />
    </g>);
    case 'forest': return (<g>
      <polygon points="3,7.5 1,7.5 2,4.5" fill={accent} />
      <polygon points="3.2,2.5 5.2,7.5 1.2,7.5" fill={accent} />
      <polygon points="7,3.5 9,8 5,8" fill={accent} opacity="0.8" />
      <rect x="2.7" y="7.5" width="1" height="1.3" fill="#6b4f2e" />
    </g>);
    case 'office': return (<g>
      <rect x="2" y="2" width="3" height="6.5" fill={accent} />
      <rect x="5.6" y="3.6" width="2.6" height="4.9" fill={accent} opacity="0.75" />
      <rect x="2.6" y="2.8" width="0.8" height="0.8" fill="#ffffff" />
      <rect x="3.8" y="2.8" width="0.8" height="0.8" fill="#ffffff" />
      <rect x="2.6" y="4.2" width="0.8" height="0.8" fill="#ffffff" />
    </g>);
    case 'ruins': return (<g>
      <rect x="1.6" y="3.5" width="1.4" height="5" fill={accent} />
      <rect x="4.3" y="2.5" width="1.4" height="6" fill={accent} opacity="0.85" />
      <rect x="7" y="4.5" width="1.4" height="4" fill={accent} opacity="0.7" />
      <rect x="1" y="2.6" width="5.4" height="1" fill={accent} />
    </g>);
    case 'tower': return (<g>
      <rect x="3.8" y="1" width="2.4" height="7.5" fill={accent} />
      <polygon points="3.4,1.2 6.6,1.2 5,0" fill={accent} />
      <rect x="4.4" y="2" width="1.2" height="1" fill="#ffffff" opacity="0.9" />
      <rect x="4.4" y="4" width="1.2" height="1" fill="#ffffff" opacity="0.9" />
    </g>);
    case 'port': return (<g>
      <rect x="4" y="1.5" width="2" height="6" fill={accent} />
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

export interface IslandsMapProps {
  areas: WorldArea[];
  /** 主人公が今いるエリア（学習の進み具合から導出・書き込みなし） */
  currentAreaId: string;
  clarity: 'clear' | 'light_fog' | 'foggy';
  reducedMotion?: boolean;
  onOpenArea: (areaId: string) => void;
}

const CLARITY_OPACITY = { clear: 0, light_fog: 0.14, foggy: 0.26 } as const;

export const IslandsMap = ({ areas, currentAreaId, clarity, reducedMotion, onOpenArea }: IslandsMapProps) => {
  const current = areas.find(a => a.areaId === currentAreaId) ?? areas[0];
  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200"
      style={{ aspectRatio: '4/3', minHeight: '46vh', background: 'linear-gradient(180deg,#bfe0ee 0%,#a8d2e6 55%,#98c6dd 100%)' }}>
      {/* 海と島（装飾レイヤー。情報は下のボタンが持つ） */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
        {/* 波（静かな世界観・動きは控えめ） */}
        {[22, 50, 78].map(y => (
          <path key={y} d={`M0,${y} Q10,${y - 1.2} 20,${y} T40,${y} T60,${y} T80,${y} T100,${y}`}
            stroke="#ffffff" strokeOpacity="0.25" strokeWidth="0.5" fill="none" />
        ))}
        {areas.map(a => (
          <g key={a.areaId} transform={`translate(${a.pos.x},${a.pos.y})`}>
            {/* 島影と島 */}
            <ellipse cx="0" cy="1.6" rx="9.5" ry="5.4" fill="#3a6b83" opacity="0.28" />
            <ellipse cx="0" cy="0" rx="9" ry="5" fill={a.visual.base} />
            <ellipse cx="0" cy="-0.8" rx="7" ry="3.6" fill="#ffffff" opacity="0.14" />
            <g transform="translate(-5,-4.6)">
              <LandmarkGlyph kind={a.visual.landmark} accent={a.visual.accent} />
            </g>
            {a.areaId === current.areaId && (
              <>
                <circle cx="0" cy="0" r="10.6" fill="none" stroke="#ffffff" strokeWidth="0.7"
                  strokeDasharray="2 1.4" opacity="0.9">
                  {!reducedMotion && (
                    <animate attributeName="stroke-dashoffset" from="0" to="3.4" dur="2.4s" repeatCount="indefinite" />
                  )}
                </circle>
                {/* 主人公（SVG内で描く: HTMLオーバーレイだとaspect比変化でずれるため） */}
                <g transform="translate(2.2,-5.2)" aria-hidden>
                  <rect x="-1.1" y="-2.6" width="2.2" height="1.9" fill="#2b2b2b" />
                  <rect x="-0.85" y="-1.5" width="1.7" height="1" fill="#f2c9a0" />
                  <rect x="-1.05" y="-0.5" width="2.1" height="1.9" fill="#3a6ea5" />
                  <rect x="-0.75" y="1.4" width="0.66" height="1.1" fill="#2b2b2b" />
                  <rect x="0.12" y="1.4" width="0.66" height="1.1" fill="#2b2b2b" />
                </g>
              </>
            )}
          </g>
        ))}
        {/* ことばの霧（表示のみ・読める濃度） */}
        {clarity !== 'clear' && (
          <rect x="0" y="0" width="100" height="100" fill="#eef3f6" opacity={CLARITY_OPACITY[clarity]} />
        )}
      </svg>

      {/* エリアボタン（テキスト情報＋クリック領域。地図の情報源はこちら） */}
      {areas.map(a => (
        <button key={a.areaId} type="button" onClick={() => onOpenArea(a.areaId)}
          aria-label={`${a.nameJa}へ行く（${a.learningThemeJa}）`}
          aria-current={a.areaId === current.areaId ? 'true' : undefined}
          className="absolute -translate-x-1/2 min-h-11 px-1.5 py-0.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          style={{ left: `${a.pos.x}%`, top: `calc(${a.pos.y}% + 4.5%)` }}>
          <span className="block whitespace-nowrap text-[10px] sm:text-[11px] font-bold leading-tight text-gray-800 bg-white/90 rounded px-1.5 py-0.5 shadow-sm">
            {a.nameJa.split('（')[0]}
          </span>
        </button>
      ))}
    </div>
  );
};

export default IslandsMap;
