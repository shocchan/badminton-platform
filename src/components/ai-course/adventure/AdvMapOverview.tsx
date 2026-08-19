// 冒険マップの「全体見取り図」（2026-08-19 CEO要望「マップ全体も見えるといいな。今は街一つ一つって感じ」）。
//
// buildAdventureMap() の実測値だけを描く**純表示コンポーネント**（原則13）:
// - 状態の再計算は一切しない。regions[].state をそのまま描く（現在地1つは buildAdventureMap が保証）
// - 進捗の数字は新たに出さない（doneCount/totalCount はヒーロー帯に既出。ここでは道の色で示すだけ）
// - 文字を SVG 内に描かない（翻訳は HTML 側・AdvMapLandmarks と同じ理由）
// - タップすると親が該当地域カードへスクロールする（行き止まりにしない・原則15）
//
// レイアウト: 蛇行（serpentine）。始点=左下、終点=右上。最終ノードの真上に旗＋目的地ラベルを
// 置き、「どこまで登ってきたか」を1枚で見せる。件数は可変（試験≤8＋会話12・最大20）。
import { Star, Flag, ChevronDown, Lock } from 'lucide-react';
import type { MapRegion } from '../../../lib/aiLesson/course/adventure/advMapModel';

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
}

/** 状態ラベル（AdvAdventureMap の STATE_LABEL と同文言。aria-label 用） */
const STATE_LABEL: Record<MapRegion['state'], { ja: string; zh: string }> = {
  done: { ja: '攻略済み', zh: '已攻略' },
  current: { ja: '現在地・攻略中', zh: '当前位置・攻略中' },
  next: { ja: '次の目的地', zh: '下一个目的地' },
  locked: { ja: 'ことばの霧の中', zh: '在词语的迷雾中' },
};

/** ノードの塗り（色だけに頼らない: 記号＋形＋aria-label もセットで持つ） */
const NODE_FILL: Record<MapRegion['state'], string> = {
  done: 'bg-amber-400',
  current: 'bg-blue-600 shadow-md',
  next: 'bg-white border-[3px] border-amber-400',
  locked: 'bg-gray-200 border border-gray-400',
};

/* 論理座標系。幅360固定・4列・行高64。y は下から上（index 0 が最下行） */
const W = 360;
const COLS = 4;
const ROW_H = 64;
const MARGIN = 36;
/** 頂上の旗のための余白 */
const FLAG_H = 34;
/** 行またぎベジェの外側への膨らみ */
const BULGE = 44;

export const AdvMapOverview = ({
  lang, regions, currentRegionId, destinationJa, destinationZh,
  doneCount, totalCount, onSelectRegion,
}: Props) => {
  // ルート未生成なら全体図ごと出さない（空の枠を見せない）
  if (totalCount === 0 || regions.length === 0) return null;

  const rows = Math.ceil(regions.length / COLS);
  const H = MARGIN * 2 + (rows - 1) * ROW_H + FLAG_H;
  /** index → 論理座標。蛇行: 偶数行は左→右、奇数行は右→左。下の行から登る */
  const pos = regions.map((_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const xi = row % 2 === 0 ? col : COLS - 1 - col;
    return { x: 40 + (xi * (W - 80)) / (COLS - 1), y: H - MARGIN - row * ROW_H };
  });

  /** 区間の path d。同一行は直線、行またぎは折り返し外側へ膨らむ3次ベジェ */
  const segmentD = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (a.y === b.y) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const out = a.x > W / 2 ? BULGE : -BULGE;
    return `M ${a.x} ${a.y} C ${a.x + out} ${a.y}, ${b.x + out} ${b.y}, ${b.x} ${b.y}`;
  };

  const last = pos[pos.length - 1];
  /** 全攻略（実測）。旗が金の星に替わる */
  const allCleared = doneCount === totalCount;
  // 旗ラベルが右端/左端で見切れないよう、論理座標上でだけ内側へ寄せる（旗自体の意味は変わらない）
  const flagX = Math.min(Math.max(last.x, 56), W - 56);

  return (
    <nav aria-label={tx(lang, 'マップ全体図（タップでその地域へ移動）', '地图全景（点按前往该地区）')}
      className="mt-4">
      <p className="px-0.5 text-xs font-bold text-gray-700">
        {tx(lang, 'マップ全体図', '地图全景')}
      </p>
      <div className="relative mt-1.5 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-sky-50 via-white to-emerald-50">
        {/* 道と装飾だけを描く（文字・状態の意味は HTML 側のノードが持つ） */}
        <svg viewBox={`0 0 360 ${H}`} className="block h-auto w-full" aria-hidden focusable="false">
          {regions.slice(0, -1).map((_, i) => {
            const to = regions[i + 1];
            // 区間単位で判定する。総合ルートでは会話 next が途中に挟まり done が prefix にならない
            const style = to.state === 'done'
              ? { stroke: '#f59e0b', strokeWidth: 5, strokeDasharray: undefined }
              : to.state === 'current'
                ? { stroke: '#60a5fa', strokeWidth: 4, strokeDasharray: '2 7' }
                : { stroke: '#cbd5e1', strokeWidth: 4, strokeDasharray: '2 7' };
            return (
              <path key={regions[i].id} d={segmentD(pos[i], pos[i + 1])} fill="none"
                stroke={style.stroke} strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray} strokeLinecap="round" />
            );
          })}
        </svg>

        {/* ノードは HTML の button（タップ領域44px・見た目24px・DOM順＝旅の順） */}
        {regions.map((r, i) => {
          // 現在地は buildAdventureMap が id と state の両方で1つに保証済み（再計算しない）
          const isCurrent = r.id === currentRegionId;
          // 形でもレイヤーを区別する（会話=角丸四角、試験=円。色に依存しない）
          const shape = r.layer === 'conversation' ? 'rounded-md' : 'rounded-full';
          const ringShape = r.layer === 'conversation' ? 'rounded-lg' : 'rounded-full';
          return (
            <button key={r.id} type="button" onClick={() => onSelectRegion(r.id)}
              aria-label={`${tx(lang, r.nameJa, r.nameZh)}、${tx(lang, r.abilityJa, r.abilityZh)}、${tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}`}
              aria-current={isCurrent ? 'step' : undefined}
              className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center touch-manipulation [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 rounded-full"
              style={{ left: `${(pos[i].x / W) * 100}%`, top: `${(pos[i].y / H) * 100}%` }}>
              <span className={`relative flex h-6 w-6 items-center justify-center ${shape} ${NODE_FILL[r.state]}`}>
                {isCurrent && (
                  <>
                    {/* 静的リング（常時）: reduced-motion で ping が止まっても輪郭が残る */}
                    <span className={`pointer-events-none absolute -inset-1 ${ringShape} border-2 border-blue-400`} aria-hidden />
                    <span className={`pointer-events-none absolute -inset-1 ${ringShape} border-2 border-blue-400 motion-safe:animate-ping`} aria-hidden />
                  </>
                )}
                {r.state === 'done' && (
                  <Star className="h-3.5 w-3.5 text-white" fill="currentColor" strokeWidth={0} aria-hidden />
                )}
                {isCurrent && <Flag className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden />}
                {r.state === 'next' && (
                  <ChevronDown className="h-3.5 w-3.5 text-amber-600" strokeWidth={3} aria-hidden />
                )}
                {r.state === 'locked' && <Lock className="h-3 w-3 text-gray-500" aria-hidden />}
              </span>
            </button>
          );
        })}

        {/* 頂上の旗＋目的地（実データ destinationJa/Zh のみ）。全攻略なら金の星に替わる */}
        <span className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: `${(flagX / W) * 100}%`, top: `${((last.y - FLAG_H) / H) * 100}%` }}>
          {allCleared
            ? <Star className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden />
            : <Flag className="h-4 w-4 text-blue-600" aria-hidden />}
          <span className="max-w-[104px] truncate whitespace-nowrap text-[11px] font-bold text-gray-800">
            {tx(lang, destinationJa, destinationZh)}
          </span>
        </span>
      </div>
    </nav>
  );
};
