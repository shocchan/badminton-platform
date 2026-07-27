// 学習Journeyのイラスト・可視化（Phase 2E-1.13 CEO指示: 見やすく・視線が動きやすく・イメージしやすく）。
// 方針:
//   - すべてインラインSVG（外部ライブラリ・画像リクエストなし＝bundleと通信を増やさない）
//   - 情報は必ずテキストでも読める（イラストは理解の補助であって唯一の情報源にしない）
//   - アニメーションは prefers-reduced-motion を尊重し、動きは 200-500ms の穏やかなものだけ
//   - 学習内容（語・結果）を歪めない。数値はpropsで受け取った実データのみを描く
import type { ReactNode } from 'react';

/** 動きを許可する環境だけでアニメーションを付ける（reduced motionでは静止画になる） */
const motionSafe = 'motion-safe:transition-all motion-safe:duration-300';

// ── ステップイラスト（4種・視線の起点を作る） ──────────────────────────

const Frame = ({ children, label }: { children: ReactNode; label: string }) => (
  <svg viewBox="0 0 96 72" role="img" aria-label={label} className="w-24 h-18 shrink-0">
    {children}
  </svg>
);

/** Step1 目的: 方位磁針（どこへ向かうか） */
export const GoalIllustration = ({ label }: { label: string }) => (
  <Frame label={label}>
    <circle cx="48" cy="36" r="26" fill="#EEF2FF" />
    <circle cx="48" cy="36" r="26" fill="none" stroke="#C7D2FE" strokeWidth="2" />
    <path d="M48 18 L54 34 L48 30 L42 34 Z" fill="#4F46E5" />
    <path d="M48 54 L42 38 L48 42 L54 38 Z" fill="#A5B4FC" />
    <circle cx="48" cy="36" r="3" fill="#312E81" />
  </Frame>
);

/** Step2 短い確認: カードと虫めがね（測るのではなく「見てみる」印象） */
export const CheckIllustration = ({ label }: { label: string }) => (
  <Frame label={label}>
    <rect x="18" y="20" width="34" height="26" rx="4" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="2" />
    <rect x="24" y="27" width="18" height="3" rx="1.5" fill="#A5B4FC" />
    <rect x="24" y="34" width="12" height="3" rx="1.5" fill="#C7D2FE" />
    <circle cx="60" cy="40" r="12" fill="#fff" stroke="#4F46E5" strokeWidth="3" />
    <path d="M69 49 L78 58" stroke="#4F46E5" strokeWidth="4" strokeLinecap="round" />
  </Frame>
);

/** Step3 最初の練習: 吹き出し（話す・使う） */
export const PracticeIllustration = ({ label }: { label: string }) => (
  <Frame label={label}>
    <path d="M14 18 h50 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-30 l-12 10 v-10 h-8 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z"
      fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="2" />
    <rect x="24" y="28" width="26" height="3.5" rx="1.75" fill="#818CF8" />
    <rect x="24" y="36" width="18" height="3.5" rx="1.75" fill="#C7D2FE" />
    <circle cx="76" cy="24" r="7" fill="#4F46E5" />
    <path d="M73 24 l2.4 2.4 L79.5 21.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

/** Step4 まとめ: カレンダーと次の点（また戻ってくることを絵で示す） */
export const DoneIllustration = ({ label }: { label: string }) => (
  <Frame label={label}>
    <rect x="16" y="18" width="40" height="38" rx="5" fill="#fff" stroke="#C7D2FE" strokeWidth="2" />
    <rect x="16" y="18" width="40" height="10" rx="5" fill="#4F46E5" />
    <path d="M26 40 l5 5 l11 -12" stroke="#10B981" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="68" cy="30" r="4" fill="#A5B4FC" />
    <circle cx="78" cy="40" r="3.5" fill="#C7D2FE" />
    <circle cx="86" cy="50" r="3" fill="#E0E7FF" />
    <path d="M62 34 L66 38 M72 34 L76 38 M82 44 L84 46" stroke="#E0E7FF" strokeWidth="1.5" strokeLinecap="round" />
  </Frame>
);

// ── 進捗ステッパー（視線が左→右に自然に流れる） ─────────────────────

export interface StepperStep { key: string; label: string }

/**
 * 4ステップの進捗表示。番号・ラベル・接続線で「今どこか」「あといくつか」を一目で示す。
 * 色だけに依存させず、済み=チェック／現在=塗り＋リング／未来=薄い丸 で形も変える。
 */
export const JourneyStepper = ({ steps, currentIndex, ariaLabel }: {
  steps: StepperStep[]; currentIndex: number; ariaLabel: string;
}) => (
  <ol className="flex items-start gap-0 mb-3" aria-label={ariaLabel}>
    {steps.map((s, i) => {
      const done = i < currentIndex;
      const current = i === currentIndex;
      return (
        <li key={s.key} className="flex-1 flex flex-col items-center relative"
          aria-current={current ? 'step' : undefined}>
          {/* 接続線（視線誘導）。最初の要素の左側は描かない */}
          {i > 0 && (
            <span aria-hidden
              className={`absolute top-3.5 right-1/2 w-full h-0.5 ${done || current ? 'bg-indigo-300' : 'bg-gray-200'}`} />
          )}
          <span aria-hidden
            className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${motionSafe} ${
              done ? 'bg-indigo-500 text-white'
                : current ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 scale-110'
                  : 'bg-gray-100 text-gray-400'}`}>
            {done ? '✓' : i + 1}
          </span>
          <span className={`mt-1 text-[10px] leading-tight text-center ${current ? 'font-bold text-indigo-700' : 'text-gray-500'}`}>
            {s.label}
          </span>
        </li>
      );
    })}
  </ol>
);

/**
 * 1語の中の3段階（見る→試す→ふりかえる）を示す小さな帯。
 * 「何問目か」だけでは今の一歩が見えないため、語の中の位置も同時に示す。
 * 進捗バーの直下に置き、視線が 進捗 → 今の段階 → 本文 と自然に降りるようにする。
 */
export const PhaseTrail = ({ phases, currentIndex, ariaLabel }: {
  phases: string[]; currentIndex: number; ariaLabel: string;
}) => (
  <ol className="flex items-center gap-1.5 mb-3" aria-label={ariaLabel}>
    {phases.map((label, i) => {
      const done = i < currentIndex;
      const current = i === currentIndex;
      return (
        <li key={label} aria-current={current ? 'step' : undefined}
          className={`flex items-center gap-1 text-[10px] ${motionSafe} ${
            current ? 'font-bold text-indigo-700' : done ? 'text-indigo-400' : 'text-gray-400'}`}>
          <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${
            current ? 'bg-indigo-600' : done ? 'bg-indigo-300' : 'bg-gray-200'}`} />
          {label}
          {i < phases.length - 1 && <span aria-hidden className="text-gray-300 ml-0.5">›</span>}
        </li>
      );
    })}
  </ol>
);

// ── 結果の可視化（数を「見て」わかる） ───────────────────────────

export interface ResultBar { label: string; count: number; tone: 'good' | 'support' | 'review' }

const TONE = {
  good: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  support: { bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-700' },
  review: { bar: 'bg-indigo-400', dot: 'bg-indigo-400', text: 'text-indigo-700' },
} as const;

/**
 * 結果の横棒グラフ。数値テキストを必ず併記し、棒は理解の補助に留める。
 * 0件の項目は棒を描かない（0を強調して落ち込ませない）。
 */
export const ResultBars = ({ bars, total }: { bars: ResultBar[]; total: number }) => {
  const max = Math.max(total, ...bars.map((b) => b.count), 1);
  return (
    <ul className="space-y-1.5">
      {bars.filter((b) => b.count > 0).map((b) => (
        <li key={b.label} className="flex items-center gap-2">
          <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${TONE[b.tone].dot}`} />
          <span className="text-xs text-gray-700 w-28 shrink-0">{b.label}</span>
          <span aria-hidden className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <span className={`block h-full rounded-full ${TONE[b.tone].bar} motion-safe:transition-[width] motion-safe:duration-500`}
              style={{ width: `${Math.round((b.count / max) * 100)}%` }} />
          </span>
          <span className={`text-xs font-bold tabular-nums ${TONE[b.tone].text}`}>{b.count}</span>
        </li>
      ))}
    </ul>
  );
};

// ── 復習予定タイムライン（「また戻ってくる」が絵でわかる） ──────────────

export interface TimelinePoint { label: string; count: number; emphasis?: boolean }

/**
 * 次回復習の時間軸。今日を起点に右へ伸びる線と点で「忘れかける頃に戻ってくる」を表す。
 * 件数は数字でも読める。0件の点は薄く描き、存在自体は示す（予定がないことも情報）。
 */
export const ReviewTimeline = ({ points, todayLabel }: { points: TimelinePoint[]; todayLabel: string }) => (
  <div className="mt-1">
    <div className="relative flex items-end justify-between pt-4">
      <span aria-hidden className="absolute left-2 right-2 top-6 h-0.5 bg-indigo-100 rounded-full" />
      <div className="relative z-10 flex flex-col items-center">
        <span aria-hidden className="w-3 h-3 rounded-full bg-indigo-600 ring-4 ring-indigo-100" />
        <span className="mt-1 text-[10px] font-bold text-indigo-700">{todayLabel}</span>
      </div>
      {points.map((p) => (
        <div key={p.label} className="relative z-10 flex flex-col items-center">
          <span aria-hidden
            className={`rounded-full ${motionSafe} ${p.count > 0
              ? (p.emphasis ? 'w-3 h-3 bg-indigo-500' : 'w-2.5 h-2.5 bg-indigo-300')
              : 'w-2 h-2 bg-gray-200'}`} />
          <span className={`mt-1 text-[10px] ${p.count > 0 ? 'text-gray-700' : 'text-gray-400'}`}>{p.label}</span>
          <span className={`text-[10px] font-bold tabular-nums ${p.count > 0 ? 'text-indigo-700' : 'text-gray-300'}`}>
            {p.count}
          </span>
        </div>
      ))}
    </div>
  </div>
);
