// RPG World Home Shell（§5・§7）。ログイン後のHome自体を「世界」にする。
//
// 設計原則:
// - 世界（Map）が主役。desktopで横幅を使い切り、巨大な空白を作らない。
// - RPG名だけで機能を隠さない。必ず一般機能名を併記する（記憶の書庫／ことばを学ぶ）。
// - 第一CTAは常に一つ。今日やることが世界の中の行き先として示される。
// - 学習stateはread only。ここから習得度・復習予定を書き換えない。
// - learner向け画面なので開発表示（試作・sandbox・検証用）は一切出さない。
import type { ReactNode } from 'react';
import type { WorldArea } from '../../../lib/aiLesson/course/rpg/worldAtlas';
import { IslandsMap } from './IslandsMap';

export interface WorldFacility {
  id: string;
  /** 世界の中の呼び名（仮称・human_review_candidate） */
  worldName: string;
  /** 一般機能名。RPG名だけで機能を隠さないために必須 */
  functionName: string;
  descriptionJa: string;
  /** 未読・期限などの件数バッジ（0なら非表示） */
  badge?: number;
  onOpen: () => void;
}

export interface WorldHomeShellProps {
  /** 章・エリア名（仮称） */
  areaName: string;
  /** 主人公の現在地 */
  locationName: string;
  /** 今日の第一行動。世界の言葉と学習内容の両方を出す */
  todayAction: {
    worldLead: string;      // 例: 会話の広場へ行く
    learningTitle: string;  // 例: 「〜てから」で順番を説明する
    learningDetail: string; // 例: 会話1回・約3分
    ctaLabel: string;
    onStart: () => void;
  } | null;
  /** 復習期限（オモイデ庭園の霧） */
  reviewsDue: number;
  onOpenReview: () => void;
  facilities: WorldFacility[];
  /** 冒険の記録（学習の実績を世界の言葉で要約） */
  record: { daysThisWeek: number; totalSessions: number; };
  /** この先の道（次に開く場所・学ぶこと）。desktop右カラムを埋め、先が気になる状態にする */
  upcoming: { label: string; detail: string; unlocked: boolean }[];
  /** 世界の見え方（学習の鮮度から導出したClarity）。書き戻しはしない */
  clarity: 'clear' | 'light_fog' | 'foggy';
  reducedMotion?: boolean;
  /** ミナモ列島の10エリア（worldAtlas）とルーティング（FOREST FIRST §7） */
  areas: WorldArea[];
  currentAreaId: string;
  onOpenArea: (areaId: string) => void;
  /** 既存Home（今日の学習・会話の旅など）をそのまま下に置く */
  children?: ReactNode;
}

const CLARITY_TEXT: Record<WorldHomeShellProps['clarity'], string> = {
  clear: '世界がはっきり見えています',
  light_fog: '少し霧がかかっています。復習で晴れます',
  foggy: '霧が濃くなっています。復習から始めましょう',
};

export const WorldHomeShell = ({
  areaName, locationName, todayAction, reviewsDue, onOpenReview,
  facilities, record, upcoming, clarity, reducedMotion, areas, currentAreaId, onOpenArea, children,
}: WorldHomeShellProps) => {
  return (
    <div className="w-full">
      {/* ── 世界のヘッダー（現在地・状態をテキストでも提供） ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">{areaName}</h1>
        <span className="text-xs text-gray-500">現在地: {locationName}</span>
        <span className="text-xs text-gray-400">{CLARITY_TEXT[clarity]}</span>
      </div>

      {/* ── World（desktop: 地図6割 + 行動4割 / mobile: 縦積み） ── */}
      <div className="lg:grid lg:grid-cols-5 lg:gap-4">
        <section className="lg:col-span-3" aria-label="ミナモ列島の地図">
          <IslandsMap areas={areas} currentAreaId={currentAreaId} clarity={clarity}
            reducedMotion={reducedMotion} onOpenArea={onOpenArea} />
        </section>

        <section className="lg:col-span-2 mt-3 lg:mt-0 flex flex-col" aria-label="今日の行動">
          {/* 第一CTA（常に一つ） */}
          {todayAction ? (
            <div className="bg-white border border-indigo-200 rounded-2xl p-4">
              <p className="text-[11px] font-bold text-indigo-500 mb-1">{todayAction.worldLead}</p>
              <p className="text-base font-bold text-gray-900 leading-snug">{todayAction.learningTitle}</p>
              <p className="text-xs text-gray-500 mt-1 mb-3">{todayAction.learningDetail}</p>
              <button type="button" onClick={todayAction.onStart}
                className="w-full min-h-12 bg-indigo-600 text-white rounded-2xl font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                {todayAction.ctaLabel}
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-sm font-bold text-gray-900 mb-1">今日の分は終わりました</p>
              <p className="text-xs text-gray-500 mb-3">世界の霧は晴れています。続けたいときは、ことばの復習から始められます。</p>
              <button type="button" onClick={onOpenReview}
                className="w-full min-h-12 bg-white border border-indigo-200 text-indigo-700 rounded-2xl font-bold text-sm">
                ことばを復習する
              </button>
            </div>
          )}

          {/* 復習（オモイデ庭園）。期限があるときだけ世界の変化として出す */}
          {reviewsDue > 0 && (
            <button type="button" onClick={onOpenReview}
              className="w-full text-left mt-3 p-3 bg-violet-50 border border-violet-200 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
              <p className="text-xs font-bold text-violet-800">オモイデ庭園に霧がかかっています</p>
              <p className="text-[11px] text-violet-700">復習する・{reviewsDue}語が待っています</p>
            </button>
          )}

          {/* この先の道（余白を埋め、次に何が開くかを示す） */}
          {upcoming.length > 0 && (
            <div className="mt-3 flex-1 min-h-0 p-3 bg-white border border-gray-100 rounded-2xl">
              <p className="text-xs font-bold text-gray-700 mb-2">この先の道</p>
              <ol className="space-y-1.5">
                {upcoming.map((u, i) => (
                  <li key={u.label} className="flex items-start gap-2">
                    <span aria-hidden className={`mt-0.5 w-4 h-4 shrink-0 grid place-items-center rounded-full text-[9px] font-bold ${u.unlocked ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                      {u.unlocked ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold ${u.unlocked ? 'text-gray-800' : 'text-gray-500'}`}>{u.label}</span>
                      <span className="block text-[10px] text-gray-400 leading-tight">{u.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 冒険の記録 */}
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-white border border-gray-100 rounded-xl">
              <dt className="text-[10px] text-gray-400">今週歩いた日</dt>
              <dd className="text-lg font-bold text-gray-900">{record.daysThisWeek}<span className="text-xs font-normal text-gray-400">日</span></dd>
            </div>
            <div className="p-2.5 bg-white border border-gray-100 rounded-xl">
              <dt className="text-[10px] text-gray-400">これまでの会話</dt>
              <dd className="text-lg font-bold text-gray-900">{record.totalSessions}<span className="text-xs font-normal text-gray-400">回</span></dd>
            </div>
          </dl>
        </section>
      </div>

      {/* ── 世界の施設（RPG名＋機能名を必ず併記） ── */}
      <nav className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-2" aria-label="世界の施設">
        {facilities.map(f => (
          <button key={f.id} type="button" onClick={f.onOpen}
            className="relative text-left p-3 min-h-[4.5rem] bg-white border border-gray-200 rounded-2xl hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            <p className="text-sm font-bold text-gray-900">{f.worldName}</p>
            <p className="text-[11px] text-indigo-600">{f.functionName}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{f.descriptionJa}</p>
            {!!f.badge && f.badge > 0 && (
              <span className="absolute top-2 right-2 min-w-5 h-5 px-1 grid place-items-center text-[10px] font-bold text-white bg-violet-500 rounded-full">
                {f.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── 既存Home（今日の学習・会話の旅・記録） ── */}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
};

export default WorldHomeShell;
