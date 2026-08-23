// 冒険旅の世界地図（AdvMapOverview の後継・2026-08-19 CEO評「スタンプカードみたい」への回答）。
//
// スタンプカード感が消える理由: 白地に蛇行ノード列（地形なし＝台紙）をやめ、
// **固定の1枚風景**（下=海と港ミナト → 中腹=平野・市場・森 → 上=遺跡 → 最上=ソラノ塔）を
// 常に描き、その地形の上に実データの道とノードを載せる。
//
// - buildAdventureMap() の実測値だけを描く**純表示コンポーネント**（原則13）:
//   状態の再計算はしない。regions[].state をそのまま描く。地形・雲・固定ランドマークは
//   「進捗を主張しない装飾」で、数字・達成のふりは一切しない
// - 目標レベルが上がるほど道は地図の上方へ物理的に伸びる（advWorldSpine.TARGET_END）。
//   「N5全クリ→N4で道が増える」が絵で伝わる
// - 現ルートの先は**雲海**で覆う＝「この先にまだ世界がある」。タップで説明の吹き出し
//   （目標を上げると道が伸びる・攻略済みは引き継がれる）を出す。地域カードへは飛ばさない
// - 会話レーンは湾をめぐる環状路（並走レーンという製品実態を絵にする）。
//   routeKind==='conversation' は同じ絵の海辺クロップ（山とJLPTの約束を見せない）
// - 文字はSVGに描かない（翻訳のため）・状態は色＋記号＋aria-labelで三重に伝える
// - ノードタップで親が該当地域カードへスクロールする（行き止まりにしない・原則15）
// - アニメはCSSのみ・motion-safe 経由（reduced-motion で自動静止）
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Star, Flag, ChevronDown, Lock } from 'lucide-react';
import { worldMapWindow, type MapRegion, type MapRouteKind } from '../../../lib/aiLesson/course/adventure/advMapModel';
import type { JlptLevel } from '../../../lib/aiLesson/course/adventure/advTypes';
import { layoutWorldNodes, type Pt, type RoadState } from '../../../lib/aiLesson/course/adventure/advWorldSpine';
import { WorldScenery, CloudSea, MiniLandmark, WORLD_PALETTE, groundBlobColor } from './AdvWorldMapScenery';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  /** map.regions をそのまま（並び＝旅の順） */
  regions: MapRegion[];
  currentRegionId: string | null;
  destinationJa: string;
  destinationZh: string;
  doneCount: number;
  totalCount: number;
  /** タップ→親が該当地域カードへスクロール */
  onSelectRegion: (id: string) => void;
  /** 目標レベル（道の終点と雲海の位置）。profile.targetJlpt をそのまま */
  targetJlpt: JlptLevel | null;
  /** 表示中ルート。conversation は海辺クロップ */
  routeKind: MapRouteKind;
  /** 全攻略時に地図直下へ出す枠（次の道カードが入る）。中身の出し分けは呼び出し側の実データ判定 */
  summitSlot?: ReactNode;

  // ── 画像差し替えの土台（2026-08-22）。AdvWorldMapImage だけが使う。既定は全部 undefined＝現行どおり ──
  /** 地図枠の最下層に敷く下敷き（画像版の <picture>）。絶対配置で枠いっぱいに広げる */
  backdrop?: ReactNode;
  /** 自作SVG風景（WorldScenery）を描かない。画像の読込完了後に true にして画像を見せる */
  hideScenery?: boolean;
  /**
   * 風景の上・道とノードの下に挟む SVG 要素（画像版のランドマークタイル <image>）。viewBox 座標で描く。
   * 関数を渡すと現在地の座標を受け取れる（現在地マーカーの絵をノードの足元に敷くため）。
   * 当たり判定・状態バッジ・aria は下の HTML ボタンが持ち続ける（絵は装飾）
   */
  tiles?: ReactNode | ((ctx: {
    current: Pt | null;
    /** 全ノードの viewBox 座標と状態（画像版が状態台座を敷くため。意味は HTML 側が持つ） */
    nodes: { id: string; x: number; y: number; state: MapRegion['state']; isCurrent: boolean }[];
  }) => ReactNode);
  /** 自作SVGのノードの絵（ミニランドマーク・地面ブロブ・完了グロー）を描かない。画像版が台座を敷くときに使う */
  hideNodeArt?: boolean;
  /** 表示方式（nav の data-map-variant に出す。検査・実機確認用） */
  variant?: 'svg' | 'image';
  /** 画像の読込状態（nav の data-map-image-state に出す） */
  imageState?: 'loading' | 'loaded' | 'error';
}

export type AdvWorldMapProps = Props;

/** 状態ラベル（AdvAdventureMap の STATE_LABEL と同文言。aria-label 用） */
const STATE_LABEL: Record<MapRegion['state'], { ja: string; zh: string }> = {
  done: { ja: '攻略済み', zh: '已攻略' },
  current: { ja: '現在地・攻略中', zh: '当前位置・攻略中' },
  next: { ja: '次の目的地', zh: '下一个目的地' },
  locked: { ja: 'ことばの霧の中', zh: '在词语的迷雾中' },
};

/** 状態バッジの塗り（ミニランドマークの色に加えて、記号でも状態を伝える） */
const BADGE_FILL: Record<MapRegion['state'], string> = {
  done: 'bg-amber-500 shadow-sm',
  current: 'bg-blue-600 shadow-sm',
  next: 'bg-white border-2 border-amber-400',
  locked: 'bg-white/85 border border-gray-400',
};

/** 道の状態スタイル。現行の全体図と同じ色・太さ（連続性維持） */
const ROAD_STYLE: Record<RoadState, { stroke: string; width: number; dash?: string }> = {
  done: { stroke: WORLD_PALETTE.roadDone, width: 5 },
  current: { stroke: WORLD_PALETTE.roadCurrent, width: 4, dash: '2 7' },
  todo: { stroke: WORLD_PALETTE.roadTodo, width: 4, dash: '2 7' },
};

export const AdvWorldMap = ({
  lang, regions: regionsAll, currentRegionId, destinationJa, destinationZh,
  doneCount, totalCount, onSelectRegion, targetJlpt, routeKind, summitSlot,
  backdrop, hideScenery = false, tiles, hideNodeArt = false, variant = 'svg', imageState,
}: Props) => {
  // 会話レイヤーは第18週まであるが、環状路に置けるのは現在地を含む12地域まで
  // （18個置くと44pxのタップ領域が重なる・2026-08-23）。一覧は呼び出し側が全地域を出す
  const regions = useMemo(() => worldMapWindow(regionsAll, currentRegionId), [regionsAll, currentRegionId]);
  const uid = useId();
  /** 雲海タップの吹き出し。5秒で自動で閉じる・再タップでトグル */
  const [bubbleOpen, setBubbleOpen] = useState(false);
  useEffect(() => {
    if (!bubbleOpen) return;
    const t = window.setTimeout(() => setBubbleOpen(false), 5000);
    return () => window.clearTimeout(t);
  }, [bubbleOpen]);

  const layout = useMemo(
    () => layoutWorldNodes(regions, targetJlpt, routeKind),
    [regions, targetJlpt, routeKind],
  );

  // ルート未生成なら全体図ごと出さない（空の枠を見せない）
  if (totalCount === 0 || regions.length === 0) return null;

  // 会話ルートは同じ絵の海辺クロップ（湾と環状路だけを見せる）
  const vb = routeKind === 'conversation'
    ? { x: 0, y: 300, w: 360, h: 300 }
    : { x: 0, y: 0, w: 360, h: 600 };
  const px = (x: number) => ((x - vb.x) / vb.w) * 100;
  const py = (y: number) => ((y - vb.y) / vb.h) * 100;

  // 地域id → 位置。レイアウトはレーンごとに regions の並びを保っている
  const posOf = new Map<string, Pt>();
  {
    let e = 0;
    let c = 0;
    for (const r of regions) {
      posOf.set(r.id, r.layer === 'exam' ? layout.examPts[e++] : layout.convPts[c++]);
    }
  }

  /** 全攻略（実測）。旗が金の星に替わる */
  const allCleared = doneCount === totalCount;
  // 旗ラベルが左右で見切れないよう、論理座標上でだけ内側へ寄せる（旗の意味は変わらない）
  const flagX = Math.min(Math.max(layout.flagPt.x, 56), 304);

  return (
    <nav aria-label={tx(lang, 'マップ全体図（タップでその地域へ移動）', '地图全景（点按前往该地区）')}
      className="mt-4" data-map-variant={variant} data-map-image-state={imageState}>
      <p className="px-0.5 text-xs font-bold text-gray-700">
        {tx(lang, '冒険の世界地図', '冒险世界地图')}
      </p>
      <div className="relative mt-1.5 overflow-hidden rounded-2xl border border-gray-200 bg-sky-100">
        {/* 画像版の下敷き（絶対配置）。SVG は relative にして DOM 順どおり下敷きの上に描く */}
        {backdrop}
        {/* 風景・道・ノードの絵（文字と状態の意味は HTML 側が持つ）。枠の縦横比はこの SVG の viewBox が決める（画像が来る前から同じ高さ＝CLS なし） */}
        <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="relative block h-auto w-full"
          aria-hidden focusable="false">
          <defs>
            <radialGradient id={`${uid}-glow`}>
              <stop offset="0%" stopColor={WORLD_PALETTE.roadDoneGlow} stopOpacity="0.9" />
              <stop offset="100%" stopColor={WORLD_PALETTE.roadDoneGlow} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 自作SVG風景。画像版は読込完了まで描き続け（プレースホルダ兼フォールバック）、完了後に消して画像を見せる */}
          {!hideScenery && <WorldScenery uid={uid} />}
          {/* 画像版のランドマークタイル（背景画像の上・道の下）。SVG版では undefined */}
          {typeof tiles === 'function'
            ? tiles({
              current: (currentRegionId && posOf.get(currentRegionId)) || null,
              nodes: regions.flatMap((r) => {
                const p = posOf.get(r.id);
                return p ? [{ id: r.id, x: p.x, y: p.y, state: r.state, isCurrent: r.id === currentRegionId }] : [];
              }),
            })
            : tiles}

          {/* 会話環状路の下地（薄く一周。環状の道だと分かる） */}
          {layout.convRingD && (
            <path d={layout.convRingD} fill="none" stroke={WORLD_PALETTE.roadTodo}
              strokeWidth={3} opacity={0.35} strokeLinecap="round" />
          )}

          {/* 目標より先の未来の道（うっすら。目標を上げるとここが実ルートになる） */}
          {layout.futureD && (
            <path d={layout.futureD} fill="none" stroke={WORLD_PALETTE.roadFuture}
              strokeWidth={3} strokeDasharray="1 9" opacity={0.25} strokeLinecap="round" />
          )}

          {/* 実ルートの道。区間の色は「入る側ノード」の状態（現行と同じ判定） */}
          {layout.segments.map((s, i) => {
            const st = ROAD_STYLE[s.state];
            return (
              <path key={`seg-${i}`} d={s.d} fill="none" stroke={st.stroke}
                strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" />
            );
          })}

          {/* 攻略済みノードの暖色グロー */}
          {!hideNodeArt && regions.filter((r) => r.state === 'done').map((r) => {
            const p = posOf.get(r.id);
            if (!p) return null;
            return <circle key={`glow-${r.id}`} cx={p.x} cy={p.y - 8} r={14}
              fill={`url(#${uid}-glow)`} opacity={0.5} />;
          })}

          {/* ミニランドマーク（ノード）。足元に地形色の地面ブロブ */}
          {!hideNodeArt && regions.map((r) => {
            const p = posOf.get(r.id);
            if (!p) return null;
            return (
              <g key={`lm-${r.id}`}>
                <ellipse cx={p.x} cy={p.y} rx={13} ry={4} fill={groundBlobColor(p.y)} opacity={0.8} />
                <MiniLandmark kind={r.landmark} state={r.state} x={p.x} y={p.y} />
              </g>
            );
          })}

          {/* 未解放（locked）の霧パフ。doneになると描かれない＝実データ駆動で霧がめくれる */}
          {regions.filter((r) => r.state === 'locked').map((r) => {
            const p = posOf.get(r.id);
            if (!p) return null;
            return r.layer === 'exam' ? (
              <g key={`fog-${r.id}`} opacity={0.9} fill={WORLD_PALETTE.fogA}>
                <ellipse cx={p.x - 8} cy={p.y - 11} rx={23} ry={10} />
                <ellipse cx={p.x + 10} cy={p.y - 6} rx={23} ry={10} />
                <ellipse cx={p.x - 2} cy={p.y - 18} rx={23} ry={10} />
              </g>
            ) : (
              <ellipse key={`fog-${r.id}`} cx={p.x} cy={p.y - 8} rx={14} ry={5}
                fill={WORLD_PALETTE.fogA} opacity={0.6} />
            );
          })}

          {/* 雲海（目標より先の土地）。N2目標と会話クロップでは出ない */}
          {layout.fogEdgeY !== null && (
            <CloudSea uid={uid} edgeY={layout.fogEdgeY} veil={hideNodeArt ? 'mist' : 'solid'} />
          )}
        </svg>

        {/* 雲海のタップ領域（ノードbuttonより下・吹き出しのトグルだけ。カードへは飛ばさない） */}
        {layout.fogEdgeY !== null && (
          <button type="button" onClick={() => setBubbleOpen((v) => !v)}
            aria-label={tx(lang, 'この先の土地（目標を上げると開きます）', '前方的土地（提高目标后开启）')}
            className="absolute inset-x-0 top-0 [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
            style={{ height: `${py(layout.fogEdgeY)}%` }} />
        )}

        {/* ノードは HTML の button（タップ領域44px・DOM順＝旅の順） */}
        {regions.map((r) => {
          const p = posOf.get(r.id);
          if (!p) return null;
          // 現在地は buildAdventureMap が id と state の両方で1つに保証済み（再計算しない）
          const isCurrent = r.id === currentRegionId;
          // 形でもレーンを区別する（会話=角丸、試験=円。色に依存しない）
          const shape = r.layer === 'conversation' ? 'rounded-lg' : 'rounded-full';
          return (
            <button key={r.id} type="button" onClick={() => onSelectRegion(r.id)}
              aria-label={`${tx(lang, r.nameJa, r.nameZh)}、${tx(lang, r.abilityJa, r.abilityZh)}、${tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center touch-manipulation [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${shape}`}
              style={{ left: `${px(p.x)}%`, top: `${py(p.y - 9)}%` }}>
              {isCurrent && (
                <>
                  {/* 静的リング（常時）: reduced-motion で ping が止まっても輪郭が残る */}
                  <span className={`pointer-events-none absolute inset-1 ${shape} border-2 border-blue-400`} aria-hidden />
                  <span className={`pointer-events-none absolute inset-1 ${shape} border-2 border-blue-400 motion-safe:animate-ping`} aria-hidden />
                </>
              )}
              {/* 状態バッジ（ランドマークの色に加えて記号でも伝える） */}
              <span className={`pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] w-[18px] items-center justify-center ${r.layer === 'conversation' ? 'rounded-md' : 'rounded-full'} ${BADGE_FILL[r.state]}`}
                aria-hidden>
                {r.state === 'done' && (
                  <Star className="h-3 w-3 text-white" fill="currentColor" strokeWidth={0} />
                )}
                {isCurrent && <Flag className="h-3 w-3 text-white" strokeWidth={2.5} />}
                {r.state === 'next' && (
                  <ChevronDown className="h-3.5 w-3.5 text-amber-600" strokeWidth={3} />
                )}
                {r.state === 'locked' && <Lock className="h-2.5 w-2.5 text-gray-500" />}
              </span>
            </button>
          );
        })}

        {/* 目的地の旗＋ラベル（実データ destinationJa/Zh のみ）。全攻略なら金の星に替わる */}
        <span className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: `${px(flagX)}%`, top: `${py(layout.flagPt.y - 24)}%` }}>
          {allCleared
            ? <Star className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden />
            : <Flag className="h-4 w-4 text-blue-600" aria-hidden />}
          <span className="max-w-[112px] truncate whitespace-nowrap rounded-full bg-white/85 px-1.5 text-[11px] font-bold text-gray-800">
            {tx(lang, destinationJa, destinationZh)}
          </span>
        </span>

        {/* 雲海の説明の吹き出し（role=statusは常設し、開いたときだけ中身を出す） */}
        {layout.fogEdgeY !== null && (
          <div role="status" className="pointer-events-none absolute inset-x-3 top-2 z-20">
            {bubbleOpen && (
              <p className="rounded-xl bg-slate-800/90 p-3 text-xs leading-relaxed text-white shadow-lg">
                {tx(lang,
                  'この先は次の目標の土地です。目標を上げると道が伸びます。攻略済みの地域はそのまま引き継がれます',
                  '前方是下一个目标的土地。提高目标后，道路会继续延伸。已攻略的地区会原样保留')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 地図直下の枠（次の道カード）。中身の実データ判定は呼び出し側が行う */}
      {summitSlot != null && <div className="mt-2">{summitSlot}</div>}
    </nav>
  );
};
